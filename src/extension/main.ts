import * as vscode from 'vscode';
import { AgentManager } from './AgentManager';
import { WebviewManager } from './WebviewManager';
import { ContextProvider } from './ContextProvider';
import { SettingsManager } from './SettingsManager';

let agentManager: AgentManager;
let webviewManager: WebviewManager;
let contextProvider: ContextProvider;
let settingsManager: SettingsManager;

export function activate(context: vscode.ExtensionContext) {
  console.log('AI Agents extension is being activated');

  // Initialize managers
  settingsManager = new SettingsManager(context);
  contextProvider = new ContextProvider();
  agentManager = new AgentManager(context, settingsManager);
  webviewManager = new WebviewManager(context, agentManager, contextProvider);

  // Register commands
  const showPanelCommand = vscode.commands.registerCommand(
    'aiAgents.showPanel',
    () => {
      webviewManager.showPanel();
    }
  );

  const createAgentCommand = vscode.commands.registerCommand(
    'aiAgents.createAgent',
    async () => {
      await webviewManager.showCreateAgentDialog();
    }
  );

  const quickChatCommand = vscode.commands.registerCommand(
    'aiAgents.quickChat',
    async () => {
      // Get current editor and selection
      const editor = vscode.window.activeTextEditor;
      let context: string | undefined;
      
      if (editor && !editor.selection.isEmpty) {
        context = editor.document.getText(editor.selection);
      }
      
      await webviewManager.showQuickChat(context);
    }
  );

  const sendToAgentCommand = vscode.commands.registerCommand(
    'aiAgents.sendToAgent',
    async (uri: vscode.Uri) => {
      if (uri && uri.fsPath) {
        await webviewManager.sendFileToAgent(uri.fsPath);
      }
    }
  );

  const sendSelectionToAgentCommand = vscode.commands.registerCommand(
    'aiAgents.sendSelectionToAgent',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && editor.selection && !editor.selection.isEmpty) {
        const selectedText = editor.document.getText(editor.selection);
        const fileName = editor.document.fileName;
        await webviewManager.sendSelectionToAgent(selectedText, fileName);
      }
    }
  );

  // Add commands to context
  context.subscriptions.push(
    showPanelCommand,
    createAgentCommand,
    quickChatCommand,
    sendToAgentCommand,
    sendSelectionToAgentCommand
  );

  // Initialize watchers
  const configWatcher = vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('aiAgents')) {
      settingsManager.reload();
    }
  });

  const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    contextProvider.refreshWorkspaceContext();
  });

  context.subscriptions.push(configWatcher, workspaceWatcher);

  // Auto-show panel if configured
  const config = vscode.workspace.getConfiguration('aiAgents');
  const autoShow = config.get<boolean>('autoShowPanel', false);
  if (autoShow) {
    webviewManager.showPanel();
  }

  console.log('AI Agents extension activated successfully');
}

export function deactivate() {
  console.log('AI Agents extension is being deactivated');
  
  if (agentManager) {
    agentManager.dispose();
  }
  
  if (webviewManager) {
    webviewManager.dispose();
  }

  console.log('AI Agents extension deactivated');
}