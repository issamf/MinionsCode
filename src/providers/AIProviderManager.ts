import { AIProvider } from '@/shared/types';
import { IAIProvider, AIMessage, AIResponse, AIProviderConfig, StreamingResponse } from './AIProviderInterface';
import { AnthropicProvider } from './AnthropicProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { OllamaProvider } from './OllamaProvider';

export class AIProviderManager {
  private providers: Map<AIProvider, IAIProvider> = new Map();
  private availableProviders: AIProvider[] = [];

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Register all providers
    this.providers.set(AIProvider.ANTHROPIC, new AnthropicProvider());
    this.providers.set(AIProvider.OPENAI, new OpenAIProvider());
    this.providers.set(AIProvider.OLLAMA, new OllamaProvider());
  }

  public async detectAvailableProviders(): Promise<AIProvider[]> {
    const available: AIProvider[] = [];

    // Check providers in preferred order: Ollama (local) → Anthropic → OpenAI
    const checkOrder = [AIProvider.OLLAMA, AIProvider.ANTHROPIC, AIProvider.OPENAI];

    for (const providerType of checkOrder) {
      const provider = this.providers.get(providerType);
      if (provider && await provider.isAvailable()) {
        available.push(providerType);
      }
    }

    this.availableProviders = available;
    return available;
  }

  public async generateResponse(
    messages: AIMessage[],
    config: AIProviderConfig
  ): Promise<AIResponse> {
    const provider = this.providers.get(config.provider);
    if (!provider) {
      throw new Error(`Provider ${config.provider} not found`);
    }

    // Validate configuration
    const isValid = await provider.validateConfig(config);
    if (!isValid) {
      throw new Error(`Invalid configuration for ${config.provider}`);
    }

    return await provider.generateResponse(messages, config);
  }

  public async generateStreamingResponse(
    messages: AIMessage[],
    config: AIProviderConfig,
    onChunk: (chunk: StreamingResponse) => void
  ): Promise<void> {
    const provider = this.providers.get(config.provider);
    if (!provider) {
      throw new Error(`Provider ${config.provider} not found`);
    }

    const isValid = await provider.validateConfig(config);
    if (!isValid) {
      throw new Error(`Invalid configuration for ${config.provider}`);
    }

    return await provider.generateStreamingResponse(messages, config, onChunk);
  }

  public async getAvailableModels(providerType: AIProvider): Promise<string[]> {
    const provider = this.providers.get(providerType);
    if (!provider) {
      return [];
    }

    try {
      return await provider.getAvailableModels();
    } catch {
      return provider.supportedModels;
    }
  }

  public getProvider(providerType: AIProvider): IAIProvider | undefined {
    return this.providers.get(providerType);
  }

  public getAvailableProviders(): AIProvider[] {
    return [...this.availableProviders];
  }

  public estimateTokens(messages: AIMessage[], providerType: AIProvider): number {
    const provider = this.providers.get(providerType);
    if (!provider) {
      // Fallback estimation
      const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
      return Math.ceil(totalChars / 4);
    }

    return provider.estimateTokens(messages);
  }

  public async validateProviderConfig(config: AIProviderConfig): Promise<boolean> {
    const provider = this.providers.get(config.provider);
    if (!provider) {
      return false;
    }

    try {
      return await provider.validateConfig(config);
    } catch {
      return false;
    }
  }

  /**
   * Get the best available provider based on preferences and availability
   */
  public async getBestAvailableProvider(): Promise<AIProvider | null> {
    const available = await this.detectAvailableProviders();
    
    if (available.length === 0) {
      return null;
    }

    // Prefer Ollama for privacy, then Anthropic for quality, then OpenAI
    const preferenceOrder = [AIProvider.OLLAMA, AIProvider.ANTHROPIC, AIProvider.OPENAI];
    
    for (const preferred of preferenceOrder) {
      if (available.includes(preferred)) {
        return preferred;
      }
    }

    return available[0];
  }

  /**
   * Create a complete AI message with context
   */
  public createContextualMessages(
    userMessage: string,
    systemPrompt: string,
    sharedFiles: string[] = [],
    textSnippets: Array<{ content: string; fileName?: string }> = [],
    conversationHistory: AIMessage[] = []
  ): AIMessage[] {
    const messages: AIMessage[] = [];

    // Add system message with context
    let enhancedSystemPrompt = systemPrompt;
    
    if (sharedFiles.length > 0) {
      enhancedSystemPrompt += `\n\nShared Files Context:\nThe user has shared the following files with you:\n${sharedFiles.map(file => `- ${file}`).join('\n')}\n`;
    }
    
    if (textSnippets.length > 0) {
      enhancedSystemPrompt += `\n\nShared Text Snippets:\n${textSnippets.map((snippet, idx) => {
        const source = snippet.fileName ? ` (from ${snippet.fileName})` : '';
        return `${idx + 1}. ${source}\n\`\`\`\n${snippet.content}\n\`\`\``;
      }).join('\n\n')}\n`;
    }

    messages.push({
      role: 'system',
      content: enhancedSystemPrompt
    });

    // Add conversation history (excluding system messages)
    messages.push(...conversationHistory.filter(m => m.role !== 'system'));

    // Add the current user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    return messages;
  }
}