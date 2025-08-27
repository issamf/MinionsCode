import * as vscode from 'vscode';
import { AgentManager } from './AgentManager';
import { ContextProvider } from './ContextProvider';
import { AgentService } from '@/agents/AgentService';
import { AgentConfig } from '@/shared/types';
import { debugLogger } from '@/utils/logger';

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
    debugLogger.log('WebviewManager initialized', { logPath: debugLogger.getLogPath() });
    this.initializeAgentService();
  }

  private async initializeAgentService(): Promise<void> {
    try {
      this.agentService.setContext(this.context);
      this.agentManager.setAgentService(this.agentService);
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

    const panelPosition = this.getPanelPosition();
    
    this.panel = vscode.window.createWebviewPanel(
      'aiAgents',
      'AI Agents',
      panelPosition,
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
        debugLogger.log('Webview panel disposed');
        this.panel = null;
      },
      null,
      this.context.subscriptions
    );

    // Handle webview visibility changes and refreshes
    this.panel.onDidChangeViewState(
      (e) => {
        if (e.webviewPanel.visible && e.webviewPanel.active) {
          debugLogger.log('Panel became visible, sending data');
          // When panel becomes visible, ensure webview has latest data
          setTimeout(() => {
            this.sendInitialData();
          }, 100); // Small delay to ensure webview is ready
        }
      },
      null,
      this.context.subscriptions
    );

    // Send initial data to webview
    this.sendInitialData();
    
    // Handle webview reloads by listening for specific messages
    // The webview will send a 'ready' message when it loads
  }

  private getWebviewContent(): string {
    if (!this.panel) {
      return '';
    }

    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'webview', 'webview.js')
    );

    const cspSource = this.panel.webview.cspSource;
    
    debugLogger.log('Generating webview content', { 
      webviewUri: webviewUri.toString(), 
      cspSource, 
      extensionUri: this.context.extensionUri.toString() 
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; img-src ${cspSource} https: data:;">
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
      debugLogger.log('sendInitialData: No panel available');
      return;
    }

    // Add delay to ensure webview is fully loaded after reload
    await new Promise(resolve => setTimeout(resolve, 50));
    
    debugLogger.log('sendInitialData: Starting data send process');

    try {
      const agents = this.agentManager.listAgents();
      const projectContext = await this.contextProvider.getProjectContext();
      
      debugLogger.log(`sendInitialData: Sending ${agents.length} agents to webview`);
      
      // Process all agent avatars for webview display
      debugLogger.log('Processing avatars for agents', { agentCount: agents.length, agentIds: agents.map(a => a.id) });
      let processedAgents;
      try {
        processedAgents = agents.map(agent => {
          debugLogger.log('Processing avatar for agent', { agentId: agent.id, avatar: agent.avatar });
          const processed = this.processAgentAvatars(agent);
          debugLogger.log('Avatar processed successfully', { agentId: agent.id, originalAvatar: agent.avatar, processedAvatar: processed.avatar });
          return processed;
        });
        debugLogger.log('All avatars processed successfully');
      } catch (error) {
        debugLogger.log('ERROR: Avatar processing failed', error);
        // Fallback: send agents without avatar processing
        processedAgents = agents;
      }

      if (this.panel) { // Double-check panel still exists
        this.panel.webview.postMessage({
          type: 'init',
          data: {
            agents: processedAgents,
            projectContext,
            settings: {
              // Add relevant settings for the UI
            }
          }
        });
        
        debugLogger.log('sendInitialData: Initial data sent to webview successfully');
      } else {
        debugLogger.log('sendInitialData: Panel was disposed during data preparation');
      }
    } catch (error) {
      debugLogger.log('ERROR in sendInitialData', error);
      // Send error to webview if something goes wrong and panel still exists
      if (this.panel) {
        try {
          this.panel.webview.postMessage({
            type: 'error',
            data: {
              message: 'Failed to load panel data',
              operation: 'sendInitialData'
            }
          });
        } catch (sendError) {
          debugLogger.log('Failed to send error message to webview', sendError);
        }
      }
    }
  }

  private async handleWebviewMessage(message: any): Promise<void> {
    debugLogger.log('Received message from webview', { type: message.type, data: message.data });
    
    switch (message.type) {
      case 'ready':
        debugLogger.log('Webview ready event received, sending initial data');
        debugLogger.log('Panel state', { 
          panelExists: !!this.panel, 
          panelVisible: this.panel?.visible, 
          panelActive: this.panel?.active 
        });
        // Clear any potential loading state in the webview and send fresh data
        await this.sendInitialData();
        break;

      case 'getConversationHistory':
        await this.handleGetConversationHistory(message.data);
        break;
        
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
        
      case 'webviewLog':
        debugLogger.log(`WEBVIEW: ${message.data.message}`, message.data.data);
        break;
        
      case 'reactLoading':
        debugLogger.log('React bundle is executing successfully', message.data);
        break;
        
      case 'quickChatMessage':
        await this.handleQuickChatMessage(message.data);
        break;
      
      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private async handleCreateAgent(data: Partial<AgentConfig>): Promise<void> {
    try {
      debugLogger.log('handleCreateAgent called', data);
      const agent = await this.agentManager.createAgent(data);
      debugLogger.log('Agent created successfully', agent);
      
      // Convert avatar to webview URI if it's an avatar file
      const processedAgent = this.processAgentAvatars(agent);
      
      this.panel?.webview.postMessage({
        type: 'agentCreated',
        data: processedAgent
      });
      debugLogger.log('agentCreated message sent to webview');
    } catch (error) {
      debugLogger.log('handleCreateAgent error occurred', error);
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to create agent',
          operation: 'createAgent'
        }
      });
      debugLogger.log('Error message sent to webview');
    }
  }

  private async handleDestroyAgent(data: { agentId: string }): Promise<void> {
    try {
      debugLogger.log('handleDestroyAgent called', data);
      await this.agentManager.destroyAgent(data.agentId);
      debugLogger.log('Agent destroyed successfully', data.agentId);
      
      this.panel?.webview.postMessage({
        type: 'agentDestroyed',
        data: { agentId: data.agentId }
      });
      debugLogger.log('agentDestroyed message sent to webview');
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
      
      // Process avatar for webview if needed
      const processedAgent = this.processAgentAvatars(updatedAgent);
      
      this.panel?.webview.postMessage({
        type: 'agentUpdated',
        data: processedAgent
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
    await this.sendMessageToAgent(data.agentId, data.message, 'privateChat');
  }

  private async sendMessageToAgent(
    agentId: string, 
    message: string, 
    source: 'privateChat' | 'sharedChat'
  ): Promise<void> {
    // 🚨 WEBVIEW LOOP DETECTION: Check if we're already sending to this agent
    const sendingKey = `webview-${agentId}-${source}`;
    if ((this as any)[sendingKey]) {
      debugLogger.log('🚨 WEBVIEW LOOP DETECTED: Already sending message to agent!', {
        agentId,
        source,
        messagePreview: message.substring(0, 100)
      });
      return;
    }

    // Mark as sending
    (this as any)[sendingKey] = true;
    debugLogger.log('🔄 WEBVIEW SENDING MESSAGE:', {
      agentId,
      source,
      messageLength: message.length,
      messagePreview: message.substring(0, 150),
      timestamp: new Date().toISOString()
    });

    try {
      const agent = this.agentManager.getAgent(agentId);
      if (!agent) {
        throw new Error(`Agent with id ${agentId} not found`);
      }

      // Send initial response to show agent is thinking
      this.panel?.webview.postMessage({
        type: 'messageThinking',
        data: {
          agentId: agentId,
          thinking: true,
          source: source
        }
      });

      // Track streaming to detect infinite loops
      let chunkCount = 0;
      let lastChunk = '';
      let duplicateChunkCount = 0;
      let accumulatedResponse = ''; // Track full response for task execution
      const MAX_CHUNKS = 1000;
      const MAX_DUPLICATE_CHUNKS = 10;

      // Process message with AI service
      await this.agentService.processMessage(
        agent,
        message,
        (chunk: string, done: boolean) => {
          chunkCount++;
          accumulatedResponse += chunk; // Accumulate response for task execution
          
          // Debug logging for loop detection
          debugLogger.log('Streaming chunk received', { 
            agentId, 
            chunkCount, 
            chunkLength: chunk.length, 
            done,
            chunkPreview: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : '')
          });

          // Check for runaway streaming
          if (chunkCount > MAX_CHUNKS) {
            debugLogger.log('🚨 EMERGENCY STOP: Excessive chunks detected', { 
              agentId, 
              chunkCount, 
              maxChunks: MAX_CHUNKS 
            });
            return; // Stop processing
          }

          // Check for duplicate chunks (possible loop)
          if (chunk === lastChunk && chunk.length > 0) {
            duplicateChunkCount++;
            debugLogger.log('⚠️ Duplicate chunk detected', { 
              agentId, 
              duplicateCount: duplicateChunkCount, 
              chunkPreview: chunk.substring(0, 50) + (chunk.length > 50 ? '...' : '')
            });
            
            if (duplicateChunkCount > MAX_DUPLICATE_CHUNKS) {
              debugLogger.log('🚨 EMERGENCY STOP: Too many duplicate chunks', { 
                agentId, 
                duplicateCount: duplicateChunkCount 
              });
              return; // Stop processing
            }
          } else {
            duplicateChunkCount = 0; // Reset counter if chunk is different
          }
          lastChunk = chunk;

          const responseData = {
            agentId: agentId,
            response: chunk,
            done: done,
            timestamp: new Date().toISOString(),
            source: source,
            agentName: agent.name // Include agent name for shared chat prefixing
          };

          // Send to private chat (always)
          this.panel?.webview.postMessage({
            type: 'messageResponse',
            data: responseData
          });

          // If this originated from shared chat, also send to shared chat with agent name prefix
          if (source === 'sharedChat') {
            this.panel?.webview.postMessage({
              type: 'sharedChatResponse',
              data: {
                ...responseData,
                response: done && chunk ? `**${agent.name}**: ${chunk}` : chunk // Prefix completed responses
              }
            });
          }

          // Log completion and trigger task execution
          if (done) {
            debugLogger.log('Streaming completed', { 
              agentId, 
              totalChunks: chunkCount, 
              finalChunkLength: chunk.length,
              accumulatedResponseLength: accumulatedResponse.length
            });
            
            // CRITICAL FIX: Execute tasks from the complete accumulated response
            debugLogger.log('WebviewManager: About to trigger task execution', {
              agentId,
              responseLength: accumulatedResponse.length,
              responsePreview: accumulatedResponse.substring(0, 200) + '...'
            });
            
            // Post-process response to convert display text to task syntax if needed
            const processedResponse = this.postProcessResponseForTasks(accumulatedResponse, message);
            
            debugLogger.log('WebviewManager: About to call executeTasksFromResponse', {
              agentId,
              originalResponseLength: accumulatedResponse.length,
              processedResponseLength: processedResponse.length,
              processedResponsePreview: processedResponse.substring(0, 300) + '...'
            });
            
            // Execute tasks from the processed response
            this.agentService.executeTasksFromResponse(agent, processedResponse).catch(error => {
              debugLogger.log('WebviewManager: Task execution failed', { agentId, error });
            });
          }
        }
      );

    } catch (error) {
      console.error('Error in sendMessageToAgent:', error);
      const errorResponse = `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}. Please check that your AI provider is configured correctly.`;
      
      // Send error to private chat
      this.panel?.webview.postMessage({
        type: 'messageResponse',
        data: {
          agentId: agentId,
          response: errorResponse,
          done: true,
          timestamp: new Date().toISOString(),
          source: source
        }
      });

      // Also send to shared chat if needed
      if (source === 'sharedChat') {
        const agent = this.agentManager.getAgent(agentId);
        this.panel?.webview.postMessage({
          type: 'sharedChatResponse',
          data: {
            agentId: agentId,
            response: `**${agent?.name || 'Agent'}**: ${errorResponse}`,
            done: true,
            timestamp: new Date().toISOString(),
            source: source,
            agentName: agent?.name || 'Agent'
          }
        });
      }
    } finally {
      // Always clean up the sending flag
      delete (this as any)[sendingKey];
      debugLogger.log('✅ WEBVIEW SENDING COMPLETE:', {
        agentId,
        source,
        timestamp: new Date().toISOString()
      });
    }
  }

  private postProcessResponseForTasks(response: string, originalMessage: string): string {
    // Check for complete, valid task syntax patterns, not just markers
    const hasValidTaskSyntax = /\[(?:CREATE_FILE|EDIT_FILE|DELETE_FILE):[^\]]+\][\s\S]*?\[\/(?:CREATE_FILE|EDIT_FILE|DELETE_FILE)\]/.test(response);
    
    if (hasValidTaskSyntax) {
      debugLogger.log('Response already contains complete task syntax, no post-processing needed');
      return response;
    }
    
    // Check if response contains incomplete task syntax markers (indicating corruption/streaming issues)
    const hasIncompleteMarkers = response.includes('[CREATE_FILE:') || response.includes('[EDIT_FILE:') || response.includes('[DELETE_FILE:');
    if (hasIncompleteMarkers && !hasValidTaskSyntax) {
      debugLogger.log('Response contains incomplete task syntax markers, will post-process', {
        responseLength: response.length,
        responsePreview: response.substring(0, 200) + '...'
      });
    }

    // Detect note-taking intent from original message
    const noteTakingPhrases = ['get this', 'capture this', 'write this down', 'note this', 'log this', 'add this', 'remember this', 'save this', 'record this'];
    const isNoteTaking = noteTakingPhrases.some(phrase => originalMessage.toLowerCase().includes(phrase));
    
    if (!isNoteTaking) {
      debugLogger.log('No note-taking intent detected, returning original response');
      return response;
    }

    // Extract the actual content the user wants to log
    const contentMatch = originalMessage.match(/(?:get this|capture this|write this down|note this|log this|add this|remember this|save this|record this)(?:\s*[:\-]?\s*)(.+)/i);
    const userContent = contentMatch ? contentMatch[1].trim() : originalMessage;

    // Check if response looks like file display (markdown headers, file content preview)
    const isDisplayText = response.includes('**thought_log.txt**') || 
                         response.includes('# Thought Log') ||
                         response.includes('## Entries') ||
                         (response.includes('**') && response.length > 1000);

    if (isDisplayText) {
      debugLogger.log('Detected display text response, converting to task syntax', {
        originalLength: response.length,
        userContent: userContent,
        isDisplayText: true
      });

      // Create context for AI to reason about the note-taking task

      // Let the AI reason about the file structure instead of hardcoding assumptions
      // Create a context-aware request that allows the AI to analyze and adapt
      const contextAwareRequest = `The user wants to add this note: "${userContent}"
      
Please analyze the current structure of thought_log.txt and append this entry appropriately. If the file doesn't exist or has an unexpected structure, use your reasoning to either:
1. Adapt to the existing structure, or 
2. Ask the user how they'd prefer to proceed, or
3. Create/modify the structure as needed

Use the appropriate task syntax based on what you find.`;

      debugLogger.log('Generated context-aware request for AI reasoning', {
        contextAwareRequest: contextAwareRequest,
        originalResponsePreview: response.substring(0, 200) + '...'
      });

      return contextAwareRequest;
    }

    debugLogger.log('Response does not appear to be display text, returning original');
    return response;
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

  public async showQuickChat(selectedText?: string): Promise<void> {
    this.showPanel();
    
    if (this.panel) {
      this.panel.webview.postMessage({
        type: 'showQuickChat',
        data: { selectedText }
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

  private processAgentAvatars(agent: AgentConfig): AgentConfig {
    try {
      if (agent.avatar.startsWith('avatar:')) {
        debugLogger.log('Processing avatar file', { agentId: agent.id, avatarValue: agent.avatar });
        const filename = agent.avatar.replace('avatar:', '');
        debugLogger.log('Extracted filename', { filename });
        
        const avatarService = this.agentManager.getAvatarService();
        debugLogger.log('Got avatar service');
        
        if (!this.panel) {
          debugLogger.log('ERROR: No panel available for webview URI generation');
          return agent;
        }
        
        const webviewUri = avatarService.getWebviewUri(this.panel.webview, filename);
        debugLogger.log('Generated webview URI', { uri: webviewUri.toString() });
        
        return {
          ...agent,
          avatar: webviewUri.toString()
        };
      }
      
      debugLogger.log('Avatar not a file, returning as-is', { avatar: agent.avatar });
      return agent;
    } catch (error) {
      debugLogger.log('ERROR in processAgentAvatars', { agentId: agent.id, error });
      // Return agent with original avatar on error
      return agent;
    }
  }

  private getPanelPosition(): vscode.ViewColumn {
    const config = vscode.workspace.getConfiguration('aiAgents');
    const position = config.get<string>('panelPosition', 'right');
    
    switch (position) {
      case 'top':
        // For top positioning, we'll need to manipulate editor layout
        vscode.commands.executeCommand('workbench.action.editorLayoutTwoRows').then(() => {
          vscode.commands.executeCommand('workbench.action.focusFirstEditorGroup');
        });
        return vscode.ViewColumn.Two;
      case 'bottom':
        // For bottom positioning, we'll manipulate editor layout
        vscode.commands.executeCommand('workbench.action.editorLayoutTwoRows').then(() => {
          vscode.commands.executeCommand('workbench.action.focusSecondEditorGroup');
        });
        return vscode.ViewColumn.Two;
      case 'right':
      default:
        return vscode.ViewColumn.Beside;
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

  private async handleGetConversationHistory(data: { agentId: string }): Promise<void> {
    try {
      const conversationHistory = await this.agentService.getConversationHistory(data.agentId);
      
      this.panel?.webview.postMessage({
        type: 'conversationHistory',
        data: {
          agentId: data.agentId,
          messages: conversationHistory
        }
      });
    } catch (error) {
      debugLogger.log('Error getting conversation history', { agentId: data.agentId, error });
      this.panel?.webview.postMessage({
        type: 'conversationHistory',
        data: {
          agentId: data.agentId,
          messages: []
        }
      });
    }
  }

  private async handleQuickChatMessage(data: { message: string; targetAgent?: string }): Promise<void> {
    try {
      debugLogger.log('handleQuickChatMessage called', data);
      
      const agents = this.agentManager.listAgents();
      const activeAgents = agents.filter(agent => agent.isActive);
      
      if (activeAgents.length === 0) {
        this.panel?.webview.postMessage({
          type: 'error',
          data: {
            message: 'No active agents found. Please create an agent first.',
            operation: 'quickChatMessage'
          }
        });
        return;
      }
      
      let targetAgents: string[] = [];
      
      // Check for @everyone mention
      if (data.message.includes('@everyone')) {
        targetAgents = activeAgents.map(agent => agent.id);
        debugLogger.log('Sending message to all agents via @everyone', { count: targetAgents.length });
      } 
      // Check for specific agent mention
      else if (data.message.includes('@')) {
        const atMentionMatch = data.message.match(/@(\w+)/);
        if (atMentionMatch) {
          const mentionedAgentName = atMentionMatch[1];
          const mentionedAgent = activeAgents.find(agent => 
            agent.name.toLowerCase().includes(mentionedAgentName.toLowerCase())
          );
          if (mentionedAgent) {
            targetAgents = [mentionedAgent.id];
            debugLogger.log('Found mentioned agent', { agentName: mentionedAgent.name });
          }
        }
      }
      // Use specifically selected target agent
      else if (data.targetAgent) {
        const targetAgent = activeAgents.find(agent => agent.id === data.targetAgent);
        if (targetAgent) {
          targetAgents = [data.targetAgent];
          debugLogger.log('Using specifically selected agent', { agentName: targetAgent.name });
        }
      }
      
      // If no specific targeting, use context-based selection (pick first active agent for now)
      if (targetAgents.length === 0) {
        targetAgents = [activeAgents[0].id];
        debugLogger.log('No specific targeting, using first active agent', { agentName: activeAgents[0].name });
      }
      
      // Send message to each target agent
      for (const agentId of targetAgents) {
        const agent = activeAgents.find(a => a.id === agentId);
        if (agent) {
          debugLogger.log('Routing message to agent', { 
            agentName: agent.name, 
            message: data.message 
          });
          
          // 1. Send message to agent's private chat
          await this.sendMessageToAgent(agentId, data.message, 'sharedChat');
        }
      }
      
      // Show success message
      vscode.window.showInformationMessage(
        `Message sent to ${targetAgents.length === 1 ? 
          activeAgents.find(a => a.id === targetAgents[0])?.name : 
          `${targetAgents.length} agents`}`
      );
      
    } catch (error) {
      debugLogger.log('handleQuickChatMessage error occurred', error);
      this.panel?.webview.postMessage({
        type: 'error',
        data: {
          message: error instanceof Error ? error.message : 'Failed to send message',
          operation: 'quickChatMessage'
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