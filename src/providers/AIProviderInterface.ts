import { AIProvider } from '@/shared/types';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: 'stop' | 'length' | 'tool_calls';
}

export interface AIProviderConfig {
  provider: AIProvider;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  temperature: number;
  maxTokens: number;
}

export interface StreamingResponse {
  content: string;
  done: boolean;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface IAIProvider {
  readonly provider: AIProvider;
  readonly supportedModels: string[];
  
  /**
   * Check if the provider is available and configured
   */
  isAvailable(): Promise<boolean>;
  
  /**
   * Validate configuration and test connection
   */
  validateConfig(config: AIProviderConfig): Promise<boolean>;
  
  /**
   * Generate a single response
   */
  generateResponse(
    messages: AIMessage[],
    config: AIProviderConfig
  ): Promise<AIResponse>;
  
  /**
   * Generate streaming response
   */
  generateStreamingResponse(
    messages: AIMessage[],
    config: AIProviderConfig,
    onChunk: (chunk: StreamingResponse) => void
  ): Promise<void>;
  
  /**
   * Get available models for this provider
   */
  getAvailableModels(): Promise<string[]>;
  
  /**
   * Estimate token count for messages
   */
  estimateTokens(messages: AIMessage[]): number;
}