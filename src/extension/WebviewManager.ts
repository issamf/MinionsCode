import * as vscode from 'vscode';
import { AgentManager } from './AgentManager';
import { ContextProvider } from './ContextProvider';
import { AgentConfig } from '@/shared/types';

export class WebviewManager {
  private context: vscode.ExtensionContext;
  private agentManager: AgentManager;
  private contextProvider: ContextProvider;
  private panel: vscode.WebviewPanel | null = null;

  constructor(
    context: vscode.ExtensionContext,
    agentManager: AgentManager,
    contextProvider: ContextProvider
  ) {
    this.context = context;
    this.agentManager = agentManager;
    this.contextProvider = contextProvider;
  }

  public showPanel(): void {
    const columnToShowIn = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (this.panel) {
      this.panel.reveal(columnToShowIn);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'aiAgents',
      'AI Agents',
      columnToShowIn || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
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
      // TODO: Implement actual message sending to AI provider
      // For now, just echo back a response
      setTimeout(() => {
        this.panel?.webview.postMessage({
          type: 'messageResponse',
          data: {
            agentId: data.agentId,
            response: `Echo: ${data.message}`,
            timestamp: new Date().toISOString()
          }
        });
      }, 1000);
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to send message',
          operation: 'sendMessage'
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
      this.panel.webview.postMessage({
        type: 'fileDropped',
        data: { filePath }
      });
    }
  }

  public async sendSelectionToAgent(selectedText: string, fileName: string): Promise<void> {
    this.showPanel();
    
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'selectionSent',
        data: { selectedText, fileName }
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