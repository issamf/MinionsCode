import * as vscode from 'vscode';
import { ExtensionSettings, AIProvider } from '@/shared/types';

export class SettingsManager {
  private context: vscode.ExtensionContext;
  private settings: ExtensionSettings;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.settings = this.loadSettings();
  }

  private loadSettings(): ExtensionSettings {
    const config = vscode.workspace.getConfiguration('aiAgents');
    
    return {
      maxConcurrentAgents: config.get<number>('maxConcurrentAgents', 5),
      defaultProvider: config.get<AIProvider>('defaultProvider', AIProvider.ANTHROPIC),
      panelPosition: config.get<'top' | 'right' | 'bottom'>('panelPosition', 'top'),
      gridColumns: config.get<number>('gridColumns', 12),
      enableAnimations: config.get<boolean>('enableAnimations', true),
      theme: config.get<'auto' | 'light' | 'dark'>('theme', 'auto'),
      memoryLimitMB: config.get<number>('memoryLimitMB', 250),
      responseTimeoutMs: config.get<number>('responseTimeoutMs', 30000),
      enableCaching: config.get<boolean>('enableCaching', true),
      logLevel: config.get<'none' | 'error' | 'warn' | 'info' | 'debug'>('logLevel', 'info'),
      dataRetentionDays: config.get<number>('dataRetentionDays', 30),
      requireConfirmation: config.get<boolean>('requireConfirmation', true),
      allowTelemetry: config.get<boolean>('allowTelemetry', false)
    };
  }

  public reload(): void {
    this.settings = this.loadSettings();
  }

  public getSettings(): ExtensionSettings {
    return { ...this.settings };
  }

  public async updateSetting<K extends keyof ExtensionSettings>(
    key: K,
    value: ExtensionSettings[K],
    scope: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('aiAgents');
    await config.update(key, value, scope);
    this.settings[key] = value;
  }

  public async getApiKey(provider: AIProvider): Promise<string | undefined> {
    const key = `${provider.toUpperCase()}_API_KEY`;
    
    // Try environment variables first
    const envKey = process.env[key];
    if (envKey) {
      return envKey;
    }

    // Try VSCode secret storage
    const secretKey = `aiAgents.apiKey.${provider}`;
    return await this.context.secrets.get(secretKey);
  }

  public async setApiKey(provider: AIProvider, apiKey: string): Promise<void> {
    const secretKey = `aiAgents.apiKey.${provider}`;
    await this.context.secrets.store(secretKey, apiKey);
  }

  public async removeApiKey(provider: AIProvider): Promise<void> {
    const secretKey = `aiAgents.apiKey.${provider}`;
    await this.context.secrets.delete(secretKey);
  }

  public async hasApiKey(provider: AIProvider): Promise<boolean> {
    const apiKey = await this.getApiKey(provider);
    return !!apiKey && apiKey.trim().length > 0;
  }

  public getWorkspaceSettings(): any {
    const workspaceConfig = vscode.workspace.getConfiguration('aiAgents');
    return {
      workspaceAgents: workspaceConfig.get('workspaceAgents', []),
      sharedContext: workspaceConfig.get('sharedContext', {
        includeGitStatus: true,
        watchPatterns: ['src/**/*.ts', '*.md'],
        excludePatterns: ['node_modules/**', 'dist/**']
      })
    };
  }

  public async updateWorkspaceSetting(key: string, value: any): Promise<void> {
    const config = vscode.workspace.getConfiguration('aiAgents');
    await config.update(key, value, vscode.ConfigurationTarget.Workspace);
  }

  public getLogLevel(): string {
    return this.settings.logLevel;
  }

  public shouldRequireConfirmation(): boolean {
    return this.settings.requireConfirmation;
  }

  public isAnimationEnabled(): boolean {
    return this.settings.enableAnimations;
  }

  public getMemoryLimit(): number {
    return this.settings.memoryLimitMB;
  }

  public getResponseTimeout(): number {
    return this.settings.responseTimeoutMs;
  }

  public isCachingEnabled(): boolean {
    return this.settings.enableCaching;
  }

  public getMaxConcurrentAgents(): number {
    return this.settings.maxConcurrentAgents;
  }

  public getDefaultProvider(): AIProvider {
    return this.settings.defaultProvider;
  }
}