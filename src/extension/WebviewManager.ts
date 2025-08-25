import * as vscode from 'vscode';
import { AgentManager } from './AgentManager';
import { ContextProvider } from './ContextProvider';
import { AgentService } from '@/agents/AgentService';
import { AgentConfig } from '@/shared/types';

export class WebviewManager {
  private context: vscode.ExtensionContext;
  private agentManager: AgentManager;
  private contextProvider: ContextProvider;
  private agentService: AgentService;
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    context: vscode.ExtensionContext,
    agentManager: AgentManager,
    contextProvider: ContextProvider
  ) {
    this.context = context;
    this.agentManager = agentManager;
    this.contextProvider = contextProvider;
    this.agentService = new AgentService();
    this.initializeAgentService();
  }

  private async initializeAgentService(): Promise<void> {
    try {
      await this.agentService.initialize();
    } catch (error) {
      console.error('Failed to initialize agent service:', error);
    }
  }

  public showPanel(): void {
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.Beside);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiAgents',
      'AI Agents',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableFindWidget: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview'),
          vscode.Uri.joinPath(this.context.extensionUri, 'resources')
        ]
      }
    );

    this.panel.webview.html = this.getWebviewContent();

    // Handle messages from the webview
    this.panel.webview.onDidReceiveMessage(
      (message) => this.handleWebviewMessage(message),
      undefined,
      this.context.subscriptions
    );

    // Handle panel disposal
    this.panel.onDidDispose(
      () => {
        this.panel = null;
      },
      null,
      this.context.subscriptions
    );

    // Send initial data to webview
    this.sendInitialData();
  }

  private getWebviewContent(): string {
    if (!this.panel) {
      return '';
    }

    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'webview.js')
    );

    const cspSource = this.panel.webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline';">
    <title>AI Agents</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            height: 100vh;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
        }
        
        .loading {
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
        }
        
        .loading-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid var(--vscode-progressBar-background);
            border-top: 2px solid var(--vscode-button-background);
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        #root {
            height: 100vh;
            overflow: hidden;
        }
    </style>
</head>
<body>
    <div id="root">
        <div class="loading">
            <div class="loading-spinner"></div>
        </div>
    </div>
    <script src="${webviewUri}"></script>
</body>
</html>`;
  }

  private async sendInitialData(): Promise<void> {
    if (!this.panel) {
      return;
    }

    const agents = this.agentManager.listAgents();
    const projectContext = await this.contextProvider.getProjectContext();

    this.panel.webview.postMessage({
      type: 'init',
      data: {
        agents,
        projectContext,
        settings: {
          // Add relevant settings for the UI
        }
      }
    });
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    switch (message.type) {
      case 'createAgent':
        await this.handleCreateAgent(message.data);
        break;
      
      case 'destroyAgent':
        await this.handleDestroyAgent(message.data);
        break;
      
      case 'updateAgent':
        await this.handleUpdateAgent(message.data);
        break;
      
      case 'sendMessage':
        await this.handleSendMessage(message.data);
        break;
      
      case 'getProjectContext':
        await this.handleGetProjectContext();
        break;
      
      case 'showAgentSettings':
        await this.handleShowAgentSettings(message.data);
        break;
      
      case 'shareFile':
        await this.handleShareFile(message.data);
        break;
      
      case 'getAvailableModels':
        await this.handleGetAvailableModels(message.data);
        break;
      
      case 'checkModelStatus':
        await this.handleCheckModelStatus(message.data);
        break;
      
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private async handleCreateAgent(data: Partial<AgentConfig>): Promise<void> {
    try {
      const agent = await this.agentManager.createAgent(data);
      
      this.panel?.webview.postMessage({
        type: 'agentCreated',
        data: agent
      });
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to create agent',
          operation: 'createAgent'
        }
      });
    }
  }

  private async handleDestroyAgent(data: { agentId: string }): Promise<void> {
    try {
      await this.agentManager.destroyAgent(data.agentId);
      
      this.panel?.webview.postMessage({
        type: 'agentDestroyed',
        data: { agentId: data.agentId }
      });
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to destroy agent',
          operation: 'destroyAgent'
        }
      });
    }
  }

  private async handleUpdateAgent(data: { agentId: string; updates: Partial<AgentConfig> }): Promise<void> {
    try {
      const updatedAgent = await this.agentManager.updateAgent(data.agentId, data.updates);
      
      this.panel?.webview.postMessage({
        type: 'agentUpdated',
        data: updatedAgent
      });
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to update agent',
          operation: 'updateAgent'
        }
      });
    }
  }

  private async handleSendMessage(data: { agentId: string; message: string; context?: any }): Promise<void> {
    try {
      const agent = this.agentManager.getAgent(data.agentId);
      if (!agent) {
        throw new Error(`Agent with id ${data.agentId} not found`);
      }

      // Send initial response to show agent is thinking
      this.panel?.webview.postMessage({
        type: 'messageThinking',
        data: {
          agentId: data.agentId,
          thinking: true
        }
      });

      // Process message with AI service
      await this.agentService.processMessage(
        agent,
        data.message,
        (chunk: string, done: boolean) => {
          this.panel?.webview.postMessage({
            type: 'messageResponse',
            data: {
              agentId: data.agentId,
              response: chunk,
              done: done,
              timestamp: new Date().toISOString()
            }
          });
        }
      );

    } catch (error) {
      console.error('Error in handleSendMessage:', error);
      this.panel?.webview.postMessage({
        type: 'messageResponse',
        data: {
          agentId: data.agentId,
          response: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check that your AI provider is configured correctly.`,
          done: true,
          timestamp: new Date().toISOString()
        }
      });
    }
  }

  private async handleGetProjectContext(): Promise<void> {
    try {
      const projectContext = await this.contextProvider.getProjectContext();
      
      this.panel?.webview.postMessage({
        type: 'projectContext',
        data: projectContext
      });
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to get project context',
          operation: 'getProjectContext'
        }
      });
    }
  }

  private async handleShowAgentSettings(data: { agentId: string }): Promise<void> {
    try {
      const agent = this.agentManager.getAgent(data.agentId);
      if (!agent) {
        throw new Error(`Agent with id ${data.agentId} not found`);
      }

      // For now, just show a notification. Later we'll implement a proper settings dialog
      vscode.window.showInformationMessage(
        `Settings for ${agent.name}`,
        'Edit Model',
        'Edit Prompt',
        'Edit Permissions'
      ).then(selection => {
        if (selection === 'Edit Model') {
          vscode.window.showInformationMessage('Model editing coming soon!');
        } else if (selection === 'Edit Prompt') {
          vscode.window.showInformationMessage('Prompt editing coming soon!');
        } else if (selection === 'Edit Permissions') {
          vscode.window.showInformationMessage('Permission editing coming soon!');
        }
      });
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to show agent settings',
          operation: 'showAgentSettings'
        }
      });
    }
  }

  private async handleShareFile(data: { agentId: string; filePath: string }): Promise<void> {
    try {
      // Add file to agent's shared context
      this.agentService.addSharedFile(data.agentId, data.filePath);
      
      // Send confirmation back to webview
      this.panel?.webview.postMessage({
        type: 'fileDropped',
        data: { filePath: data.filePath, agentId: data.agentId }
      });
    } catch (error) {
      console.error('Error sharing file:', error);
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to share file',
          operation: 'shareFile'
        }
      });
    }
  }

  public async showCreateAgentDialog(): Promise<void> {
    this.showPanel();
    
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'showCreateAgentDialog'
      });
    }
  }

  public async showQuickChat(): Promise<void> {
    this.showPanel();
    
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'showQuickChat'
      });
    }
  }

  public async sendFileToAgent(filePath: string): Promise<void> {
    this.showPanel();
    
    if (this.panel) {
      // Get the first active agent or prompt user to select
      const agents = this.agentManager.listAgents();
      if (agents.length === 0) {
        vscode.window.showWarningMessage('No agents available. Create an agent first.');
        return;
      }
      
      if (agents.length === 1) {
        // Add file to agent's shared context
        this.agentService.addSharedFile(agents[0].id, filePath);
        
        this.panel.webview.postMessage({
          type: 'fileDropped',
          data: { filePath, agentId: agents[0].id }
        });
      } else {
        // Multiple agents - let user choose or send to all active agents
        const agentNames = agents.map(a => a.name);
        const selected = await vscode.window.showQuickPick(
          [...agentNames, 'All Agents'],
          { placeHolder: 'Send file to which agent?' }
        );
        
        if (selected === 'All Agents') {
          agents.forEach(agent => {
            this.agentService.addSharedFile(agent.id, filePath);
            this.panel!.webview.postMessage({
              type: 'fileDropped',
              data: { filePath, agentId: agent.id }
            });
          });
        } else if (selected) {
          const agent = agents.find(a => a.name === selected);
          if (agent) {
            this.agentService.addSharedFile(agent.id, filePath);
            this.panel.webview.postMessage({
              type: 'fileDropped',
              data: { filePath, agentId: agent.id }
            });
          }
        }
      }
    }
  }

  public async sendSelectionToAgent(selectedText: string, fileName: string): Promise<void> {
    this.showPanel();
    
    if (this.panel) {
      // Get the first active agent or prompt user to select
      const agents = this.agentManager.listAgents();
      if (agents.length === 0) {
        vscode.window.showWarningMessage('No agents available. Create an agent first.');
        return;
      }
      
      if (agents.length === 1) {
        // Add text snippet to agent's shared context
        this.agentService.addTextSnippet(agents[0].id, selectedText, fileName);
        
        this.panel.webview.postMessage({
          type: 'selectionSent',
          data: { selectedText, fileName, agentId: agents[0].id }
        });
      } else {
        // Multiple agents - let user choose
        const agentNames = agents.map(a => a.name);
        const selected = await vscode.window.showQuickPick(
          [...agentNames, 'All Agents'],
          { placeHolder: 'Send selection to which agent?' }
        );
        
        if (selected === 'All Agents') {
          agents.forEach(agent => {
            this.agentService.addTextSnippet(agent.id, selectedText, fileName);
            this.panel!.webview.postMessage({
              type: 'selectionSent',
              data: { selectedText, fileName, agentId: agent.id }
            });
          });
        } else if (selected) {
          const agent = agents.find(a => a.name === selected);
          if (agent) {
            this.agentService.addTextSnippet(agent.id, selectedText, fileName);
            this.panel.webview.postMessage({
              type: 'selectionSent',
              data: { selectedText, fileName, agentId: agent.id }
            });
          }
        }
      }
    }
  }

  private async handleGetAvailableModels(data: { provider: string }): Promise<void> {
    try {
      let models: string[] = [];
      
      if (data.provider === 'ollama') {
        // Get available Ollama models
        const { OllamaProvider } = await import('@/providers/OllamaProvider');
        const ollamaProvider = new OllamaProvider();
        
        if (await ollamaProvider.isAvailable()) {
          models = await ollamaProvider.getAvailableModels();
          console.log(`Found ${models.length} Ollama models:`, models);
        } else {
          console.log('Ollama is not available');
          models = [];
        }
      } else if (data.provider === 'anthropic') {
        models = ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'];
      } else if (data.provider === 'openai') {
        models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      }
      
      this.panel?.webview.postMessage({
        type: 'availableModels',
        data: {
          provider: data.provider,
          models: models,
          message: models.length === 0 && data.provider === 'ollama' 
            ? 'No local models are running' 
            : undefined
        }
      });
    } catch (error) {
      console.error('Failed to get available models:', error);
      this.panel?.webview.postMessage({
        type: 'availableModels',
        data: {
          provider: data.provider,
          models: [],
          error: error instanceof Error ? error.message : 'Failed to fetch models'
        }
      });
    }
  }

  private async handleCheckModelStatus(data: { provider: string; modelName: string }): Promise<void> {
    try {
      let isAvailable = false;
      let isLoaded = false;
      
      if (data.provider === 'ollama') {
        const { OllamaProvider } = await import('@/providers/OllamaProvider');
        const ollamaProvider = new OllamaProvider();
        
        if (await ollamaProvider.isAvailable()) {
          const availableModels = await ollamaProvider.getAvailableModels();
          isAvailable = availableModels.includes(data.modelName);
          isLoaded = await ollamaProvider.isModelLoaded(data.modelName);
        }
      } else {
        // For cloud providers, assume they're available if API keys are configured
        isAvailable = true;
        isLoaded = true;
      }
      
      this.panel?.webview.postMessage({
        type: 'modelStatus',
        data: {
          provider: data.provider,
          modelName: data.modelName,
          isAvailable,
          isLoaded,
          needsAttention: isAvailable && !isLoaded
        }
      });
    } catch (error) {
      console.error('Failed to check model status:', error);
      this.panel?.webview.postMessage({
        type: 'modelStatus',
        data: {
          provider: data.provider,
          modelName: data.modelName,
          isAvailable: false,
          isLoaded: false,
          needsAttention: true,
          error: error instanceof Error ? error.message : 'Failed to check model status'
        }
      });
    }
  }

  public dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }
}