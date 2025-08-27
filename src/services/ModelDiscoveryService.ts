import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface LocalModel {
  name: string;
  id: string;
  size: string;
  modified: string;
  provider: 'ollama';
  specialization?: 'coding' | 'general' | 'reasoning';
  parameters?: string;
}

export interface OnlineModel {
  name: string;
  provider: 'anthropic' | 'openai' | 'google';
  specialization?: 'coding' | 'general' | 'reasoning' | 'fast' | 'powerful';
  contextLength?: number;
  pricing?: {
    input: number;
    output: number;
  };
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  type: 'local' | 'online';
  specialization: string;
  size?: string;
  contextLength?: number;
  estimatedSpeed?: 'fast' | 'medium' | 'slow';
}

export class ModelDiscoveryService {
  
  /**
   * Discover all available local ollama models
   */
  async discoverLocalModels(): Promise<LocalModel[]> {
    try {
      const { stdout } = await execAsync('ollama list');
      const lines = stdout.trim().split('\n');
      
      // Skip header line
      const modelLines = lines.slice(1);
      
      const models: LocalModel[] = modelLines.map(line => {
        const parts = line.trim().split(/\s+/);
        const name = parts[0];
        const id = parts[1];
        const size = parts[2] + ' ' + parts[3]; // "3.8 GB"
        const modified = parts.slice(4).join(' '); // "About an hour ago"
        
        // Determine specialization based on model name
        let specialization: 'coding' | 'general' | 'reasoning' = 'general';
        if (name.includes('coder') || name.includes('code')) {
          specialization = 'coding';
        } else if (name.includes('reasoning') || name.includes('think')) {
          specialization = 'reasoning';
        }
        
        // Extract parameter count from name
        const paramMatch = name.match(/(\d+(?:\.\d+)?)[bk]$/i);
        const parameters = paramMatch ? paramMatch[1] + (paramMatch[0].toLowerCase().endsWith('b') ? 'B' : 'K') : undefined;
        
        return {
          name,
          id,
          size,
          modified,
          provider: 'ollama',
          specialization,
          parameters
        };
      });
      
      return models;
    } catch (error) {
      console.error('Error discovering local models:', error);
      return [];
    }
  }
  
  /**
   * Get predefined online models that are available
   */
  getAvailableOnlineModels(): OnlineModel[] {
    return [
      // Anthropic Models
      {
        name: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        specialization: 'general',
        contextLength: 200000,
        pricing: { input: 3.00, output: 15.00 }
      },
      {
        name: 'claude-3-haiku-20240307',
        provider: 'anthropic',
        specialization: 'fast',
        contextLength: 200000,
        pricing: { input: 0.25, output: 1.25 }
      },
      
      // OpenAI Models  
      {
        name: 'gpt-4o',
        provider: 'openai',
        specialization: 'general',
        contextLength: 128000,
        pricing: { input: 5.00, output: 15.00 }
      },
      {
        name: 'gpt-4o-mini',
        provider: 'openai', 
        specialization: 'fast',
        contextLength: 128000,
        pricing: { input: 0.15, output: 0.60 }
      },
      {
        name: 'gpt-4-turbo',
        provider: 'openai',
        specialization: 'powerful',
        contextLength: 128000,
        pricing: { input: 10.00, output: 30.00 }
      },
      
      // Google Models
      {
        name: 'gemini-1.5-pro',
        provider: 'google',
        specialization: 'general',
        contextLength: 1000000,
        pricing: { input: 2.50, output: 10.00 }
      },
      {
        name: 'gemini-1.5-flash',
        provider: 'google',
        specialization: 'fast',
        contextLength: 1000000,
        pricing: { input: 0.075, output: 0.30 }
      }
    ];
  }
  
  /**
   * Get all available models (local + online) in unified format
   */
  async getAllAvailableModels(): Promise<AvailableModel[]> {
    const localModels = await this.discoverLocalModels();
    const onlineModels = this.getAvailableOnlineModels();
    
    const unified: AvailableModel[] = [];
    
    // Add local models
    localModels.forEach(model => {
      const size = model.size;
      let estimatedSpeed: 'fast' | 'medium' | 'slow' = 'medium';
      
      // Estimate speed based on size
      const sizeMatch = size.match(/(\d+(?:\.\d+)?)\s*GB/);
      if (sizeMatch) {
        const sizeGB = parseFloat(sizeMatch[1]);
        if (sizeGB < 4) estimatedSpeed = 'fast';
        else if (sizeGB > 8) estimatedSpeed = 'slow';
      }
      
      unified.push({
        id: `ollama:${model.name}`,
        name: model.name,
        provider: 'ollama',
        type: 'local',
        specialization: model.specialization || 'general',
        size: model.size,
        estimatedSpeed
      });
    });
    
    // Add online models
    onlineModels.forEach(model => {
      let estimatedSpeed: 'fast' | 'medium' | 'slow' = 'medium';
      if (model.specialization === 'fast') estimatedSpeed = 'fast';
      else if (model.specialization === 'powerful') estimatedSpeed = 'slow';
      
      unified.push({
        id: `${model.provider}:${model.name}`,
        name: model.name,
        provider: model.provider,
        type: 'online',
        specialization: model.specialization || 'general',
        contextLength: model.contextLength,
        estimatedSpeed
      });
    });
    
    return unified;
  }
  
  /**
   * Check if a specific model is available
   */
  async isModelAvailable(modelId: string): Promise<boolean> {
    const availableModels = await this.getAllAvailableModels();
    return availableModels.some(model => model.id === modelId || model.name === modelId);
  }
  
  /**
   * Get recommended models for testing based on variety and capabilities
   */
  async getRecommendedTestModels(): Promise<AvailableModel[]> {
    const allModels = await this.getAllAvailableModels();
    
    // Select a good variety for testing
    const recommended = allModels.filter(model => {
      // Include all local models
      if (model.type === 'local') return true;
      
      // Include key online models for comparison
      const keyOnlineModels = [
        'claude-3-5-sonnet-20241022',
        'gpt-4o',
        'gpt-4o-mini',
        'gemini-1.5-flash'
      ];
      
      return keyOnlineModels.includes(model.name);
    });
    
    return recommended;
  }
}