import axios, { AxiosInstance } from 'axios';
import { AIProvider } from '@/shared/types';
import { IAIProvider, AIMessage, AIResponse, AIProviderConfig, StreamingResponse } from './AIProviderInterface';

export class OllamaProvider implements IAIProvider {
  public readonly provider = AIProvider.OLLAMA;
  public readonly supportedModels = [
    'llama3.1',
    'llama3.1:8b',
    'llama3.1:70b',
    'llama2',
    'codellama',
    'mistral',
    'mixtral',
    'qwen2.5',
    'gemma2'
  ];

  private client: AxiosInstance;
  private baseUrl: string;

  constructor(baseUrl = 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.client = axios.create({
      baseURL: baseUrl,
      timeout: 120000, // Longer timeout for local models
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if Ollama is running
      const response = await this.client.get('/api/tags', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }

  async validateConfig(config: AIProviderConfig): Promise<boolean> {
    try {
      // Check if the specific model is available
      const models = await this.getAvailableModels();
      return models.includes(config.modelName);
    } catch {
      return false;
    }
  }

  async generateResponse(messages: AIMessage[], config: AIProviderConfig): Promise<AIResponse> {
    try {
      // Convert messages to Ollama format
      const ollamaMessages = this.convertMessages(messages);
      const systemMessage = messages.find(m => m.role === 'system')?.content;

      const requestBody: any = {
        model: config.modelName,
        messages: ollamaMessages,
        stream: false,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens
        }
      };

      if (systemMessage) {
        // For Ollama, we can include system message as the first message
        requestBody.messages = [
          { role: 'system', content: systemMessage },
          ...ollamaMessages.filter(m => m.role !== 'system')
        ];
      }

      const response = await this.client.post('/api/chat', requestBody);

      const data = response.data;
      return {
        content: data.message?.content || '',
        model: config.modelName,
        usage: {
          inputTokens: data.prompt_eval_count || 0,
          outputTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
        },
        finishReason: data.done ? 'stop' : 'length'
      };
    } catch (error: any) {
      console.error('Ollama API error:', error.response?.data || error.message);
      throw new Error(`Ollama API error: ${error.response?.data?.error || error.message}`);
    }
  }

  async generateStreamingResponse(
    messages: AIMessage[],
    config: AIProviderConfig,
    onChunk: (chunk: StreamingResponse) => void
  ): Promise<void> {
    try {
      const ollamaMessages = this.convertMessages(messages);
      const systemMessage = messages.find(m => m.role === 'system')?.content;

      const requestBody: any = {
        model: config.modelName,
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: config.temperature,
          num_predict: config.maxTokens
        }
      };

      if (systemMessage) {
        requestBody.messages = [
          { role: 'system', content: systemMessage },
          ...ollamaMessages.filter(m => m.role !== 'system')
        ];
      }

      const response = await this.client.post('/api/chat', requestBody, {
        responseType: 'stream'
      });

      let accumulatedContent = '';
      let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');
        
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              
              if (parsed.message?.content) {
                const incrementalContent = parsed.message.content;
                accumulatedContent += incrementalContent;
                onChunk({
                  content: incrementalContent, // Send only the incremental content, not the accumulated
                  done: false
                });
              }
              
              if (parsed.done) {
                usage = {
                  inputTokens: parsed.prompt_eval_count || 0,
                  outputTokens: parsed.eval_count || 0,
                  totalTokens: (parsed.prompt_eval_count || 0) + (parsed.eval_count || 0)
                };
                
                onChunk({
                  content: accumulatedContent,
                  done: true,
                  usage
                });
                return;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      });

    } catch (error: any) {
      console.error('Ollama streaming error:', error);
      throw new Error(`Ollama streaming error: ${error.message}`);
    }
  }

  async getAvailableModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');
      const models = response.data.models?.map((model: any) => model.name) || [];
      console.log(`Detected ${models.length} local Ollama models:`, models);
      
      if (models.length === 0) {
        console.log('No local Ollama models found. User needs to pull models first.');
        return [];
      }
      
      return models;
    } catch (error) {
      console.log('Ollama not available or no models installed:', error);
      return [];
    }
  }

  async getRunningModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/ps');
      const runningModels = response.data.models?.map((model: any) => model.name) || [];
      console.log(`Found ${runningModels.length} running Ollama models:`, runningModels);
      return runningModels;
    } catch (error) {
      console.log('Could not get running models:', error);
      return [];
    }
  }

  async isModelLoaded(modelName: string): Promise<boolean> {
    try {
      const runningModels = await this.getRunningModels();
      return runningModels.includes(modelName);
    } catch {
      return false;
    }
  }

  estimateTokens(messages: AIMessage[]): number {
    // Rough estimation for most models: ~4 characters per token
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  private convertMessages(messages: AIMessage[]): Array<{ role: string; content: string }> {
    return messages.map(m => ({
      role: m.role,
      content: m.content
    }));
  }

  // Ollama-specific methods
  async pullModel(modelName: string): Promise<void> {
    try {
      await this.client.post('/api/pull', { name: modelName });
    } catch (error: any) {
      throw new Error(`Failed to pull model ${modelName}: ${error.message}`);
    }
  }

  async deleteModel(modelName: string): Promise<void> {
    try {
      await this.client.delete('/api/delete', { data: { name: modelName } });
    } catch (error: any) {
      throw new Error(`Failed to delete model ${modelName}: ${error.message}`);
    }
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
}