import * as vscode from 'vscode';
import { AgentManager } from './AgentManager';
import { WebviewManager } from './WebviewManager';
import { ContextProvider } from './ContextProvider';
import { SettingsManager } from './SettingsManager';
import { ModelEvaluationRunner } from '../services/ModelEvaluationRunner';

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

  const runModelEvaluationCommand = vscode.commands.registerCommand(
    'aiAgents.runModelEvaluation',
    async () => {
      // Show progress notification
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Running AI Model Evaluation',
          cancellable: false
        },
        async (progress) => {
          try {
            progress.report({ increment: 10, message: 'Initializing evaluation system...' });
            
            const evaluationRunner = new ModelEvaluationRunner({
              outputDirectory: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath 
                ? `${vscode.workspace.workspaceFolders[0].uri.fsPath}/model-evaluation-results`
                : undefined
            });
            
            progress.report({ increment: 20, message: 'Validating setup...' });
            
            // Validate setup first
            const validation = await evaluationRunner.validateSetup();
            if (!validation.valid) {
              throw new Error(`Setup validation failed:\n${validation.issues.join('\n')}`);
            }
            
            progress.report({ increment: 30, message: 'Running model evaluation...' });
            
            // Run the evaluation
            const results = await evaluationRunner.runEvaluation();
            
            progress.report({ increment: 100, message: 'Evaluation complete!' });
            
            if (results.success) {
              const message = `✅ Model evaluation completed successfully!\n\n` +
                `📊 Models evaluated: ${results.evaluationSummary.modelsEvaluated}\n` +
                `📋 Scenarios run: ${results.evaluationSummary.scenariosRun}\n` +
                `🏆 Top performer: ${results.evaluationSummary.topModel}\n` +
                `📈 Average success rate: ${(results.evaluationSummary.avgSuccessRate * 100).toFixed(1)}%\n\n` +
                `Reports generated:\n` +
                `${results.reportFiles.json ? `• JSON: ${results.reportFiles.json}\n` : ''}` +
                `${results.reportFiles.markdown ? `• Markdown: ${results.reportFiles.markdown}\n` : ''}` +
                `${results.reportFiles.judgePrompt ? `• Judge Prompt: ${results.reportFiles.judgePrompt}` : ''}`;

              const action = await vscode.window.showInformationMessage(
                message,
                'Open Reports Folder',
                'Open Markdown Report'
              );

              if (action === 'Open Reports Folder' && results.reportFiles.json) {
                const folderPath = require('path').dirname(results.reportFiles.json);
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), true);
              } else if (action === 'Open Markdown Report' && results.reportFiles.markdown) {
                const document = await vscode.workspace.openTextDocument(results.reportFiles.markdown);
                await vscode.window.showTextDocument(document);
              }
            } else {
              throw new Error(results.message);
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Model evaluation failed: ${errorMessage}`);
          }
        }
      );
    }
  );

  // Add commands to context
  context.subscriptions.push(
    showPanelCommand,
    createAgentCommand,
    quickChatCommand,
    sendToAgentCommand,
    sendSelectionToAgentCommand,
    runModelEvaluationCommand
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