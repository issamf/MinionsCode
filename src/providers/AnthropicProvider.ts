import axios, { AxiosInstance } from 'axios';
import { AIProvider } from '@/shared/types';
import { IAIProvider, AIMessage, AIResponse, AIProviderConfig, StreamingResponse } from './AIProviderInterface';

export class AnthropicProvider implements IAIProvider {
  public readonly provider = AIProvider.ANTHROPIC;
  public readonly supportedModels = [
    'claude-3-5-sonnet-20241022',
    'claude-3-5-haiku-20241022',
    'claude-3-haiku-20240307',
    'claude-3-sonnet-20240229',
    'claude-3-opus-20240229'
  ];

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.anthropic.com/v1',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      }
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if we have an API key available
      const apiKey = process.env.ANTHROPIC_API_KEY;
      return !!apiKey && apiKey.trim().length > 0;
    } catch {
      return false;
    }
  }

  async validateConfig(config: AIProviderConfig): Promise<boolean> {
    try {
      const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        return false;
      }

      // Test with a simple request
      const response = await this.client.post('/messages', {
        model: config.modelName,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      }, {
        headers: {
          'x-api-key': apiKey
        }
      });

      return response.status === 200;
    } catch {
      return false;
    }
  }

  async generateResponse(messages: AIMessage[], config: AIProviderConfig): Promise<AIResponse> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      // Convert messages to Anthropic format
      const anthropicMessages = this.convertMessages(messages);
      const systemMessage = messages.find(m => m.role === 'system')?.content;

      const requestBody: any = {
        model: config.modelName,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: anthropicMessages
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      const response = await this.client.post('/messages', requestBody, {
        headers: {
          'x-api-key': apiKey
        }
      });

      const data = response.data;
      return {
        content: data.content[0]?.text || '',
        model: config.modelName,
        usage: {
          inputTokens: data.usage?.input_tokens || 0,
          outputTokens: data.usage?.output_tokens || 0,
          totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
        },
        finishReason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason
      };
    } catch (error: any) {
      console.error('Anthropic API error:', error.response?.data || error.message);
      throw new Error(`Anthropic API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async generateStreamingResponse(
    messages: AIMessage[],
    config: AIProviderConfig,
    onChunk: (chunk: StreamingResponse) => void
  ): Promise<void> {
    const apiKey = config.apiKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('Anthropic API key not configured');
    }

    try {
      const anthropicMessages = this.convertMessages(messages);
      const systemMessage = messages.find(m => m.role === 'system')?.content;

      const requestBody: any = {
        model: config.modelName,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: anthropicMessages,
        stream: true
      };

      if (systemMessage) {
        requestBody.system = systemMessage;
      }

      const response = await this.client.post('/messages', requestBody, {
        headers: {
          'x-api-key': apiKey
        },
        responseType: 'stream'
      });

      let accumulatedContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              onChunk({
                content: accumulatedContent,
                done: true,
                usage
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                accumulatedContent += parsed.delta.text;
                onChunk({
                  content: accumulatedContent,
                  done: false
                });
              } else if (parsed.type === 'message_stop') {
                onChunk({
                  content: accumulatedContent,
                  done: true,
                  usage
                });
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      });

    } catch (error: any) {
      console.error('Anthropic streaming error:', error);
      throw new Error(`Anthropic streaming error: ${error.message}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    return this.supportedModels;
  }

  estimateTokens(messages: AIMessage[]): number {
    // Rough estimation: ~4 characters per token for English text
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  private convertMessages(messages: AIMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));
  }
}