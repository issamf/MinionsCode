import axios, { AxiosInstance } from 'axios';
import { AIProvider } from '@/shared/types';
import { IAIProvider, AIMessage, AIResponse, AIProviderConfig, StreamingResponse } from './AIProviderInterface';

export class OpenAIProvider implements IAIProvider {
  public readonly provider = AIProvider.OPENAI;
  public readonly supportedModels = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-16k'
  ];

  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      const apiKey = process.env.OPENAI_API_KEY;
      return !!apiKey && apiKey.trim().length > 0;
    } catch {
      return false;
    }
  }

  async validateConfig(config: AIProviderConfig): Promise<boolean> {
    try {
      const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
      if (!apiKey) {
        return false;
      }

      // Test with a simple request
      const response = await this.client.post('/chat/completions', {
        model: config.modelName,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Hi' }]
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      return response.status === 200;
    } catch {
      return false;
    }
  }

  async generateResponse(messages: AIMessage[], config: AIProviderConfig): Promise<AIResponse> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.client.post('/chat/completions', {
        model: config.modelName,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        }))
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const data = response.data;
      const choice = data.choices[0];

      return {
        content: choice.message.content || '',
        model: config.modelName,
        usage: {
          inputTokens: data.usage?.prompt_tokens || 0,
          outputTokens: data.usage?.completion_tokens || 0,
          totalTokens: data.usage?.total_tokens || 0
        },
        finishReason: choice.finish_reason
      };
    } catch (error: any) {
      console.error('OpenAI API error:', error.response?.data || error.message);
      throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  async generateStreamingResponse(
    messages: AIMessage[],
    config: AIProviderConfig,
    onChunk: (chunk: StreamingResponse) => void
  ): Promise<void> {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    try {
      const response = await this.client.post('/chat/completions', {
        model: config.modelName,
        max_tokens: config.maxTokens,
        temperature: config.temperature,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content
        })),
        stream: true
      }, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
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
              const delta = parsed.choices?.[0]?.delta;
              
              if (delta?.content) {
                accumulatedContent += delta.content;
                onChunk({
                  content: accumulatedContent,
                  done: false
                });
              } else if (parsed.choices?.[0]?.finish_reason) {
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
      console.error('OpenAI streaming error:', error);
      throw new Error(`OpenAI streaming error: ${error.message}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return this.supportedModels;
    }

    try {
      const response = await this.client.get('/models', {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      const models = response.data.data
        .filter((model: any) => model.id.includes('gpt'))
        .map((model: any) => model.id)
        .sort();

      return models.length > 0 ? models : this.supportedModels;
    } catch {
      return this.supportedModels;
    }
  }

  estimateTokens(messages: AIMessage[]): number {
    // OpenAI's rough estimation: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }
}