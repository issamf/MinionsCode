import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { AgentConfig } from '@/shared/types';
import { AIProviderManager } from '@/providers/AIProviderManager';
import { AIMessage } from '@/providers/AIProviderInterface';

interface AgentMemory {
  agentId: string;
  conversations: AIMessage[];
  sharedFiles: string[];
  textSnippets: Array<{ content: string; fileName?: string }>;
  lastInteraction: Date;
}

export class AgentService {
  private providerManager: AIProviderManager;
  private agentMemories: Map<string, AgentMemory> = new Map();
  private activeStreams: Map<string, boolean> = new Map();

  constructor() {
    this.providerManager = new AIProviderManager();
  }

  public async initialize(): Promise<void> {
    await this.providerManager.detectAvailableProviders();
  }

  public async processMessage(
    agent: AgentConfig,
    userMessage: string,
    onResponse: (chunk: string, done: boolean) => void
  ): Promise<void> {
    try {
      // Get or create agent memory
      let memory = this.agentMemories.get(agent.id);
      if (!memory) {
        memory = {
          agentId: agent.id,
          conversations: [],
          sharedFiles: [],
          textSnippets: [],
          lastInteraction: new Date()
        };
        this.agentMemories.set(agent.id, memory);
      }

      // Check if the message contains task requests
      const taskAnalysis = this.analyzeForTasks(userMessage, agent.type);
      
      // Create contextual messages
      const messages = this.providerManager.createContextualMessages(
        userMessage,
        agent.systemPrompt,
        memory.sharedFiles,
        memory.textSnippets,
        memory.conversations.slice(-10) // Keep last 10 messages for context
      );

      // Enhance system prompt based on agent capabilities and available tasks
      if (taskAnalysis.hasTasks) {
        const taskInstructions = this.getTaskInstructions(agent, taskAnalysis.tasks);
        messages[0].content += `\n\n${taskInstructions}`;
      }

      // Mark this stream as active
      this.activeStreams.set(agent.id, true);

      // Generate streaming response
      await this.providerManager.generateStreamingResponse(
        messages,
        agent.model,
        (chunk) => {
          if (!this.activeStreams.get(agent.id)) {
            return; // Stream was cancelled
          }
          
          onResponse(chunk.content, chunk.done);
          
          if (chunk.done) {
            // Update memory with the conversation
            memory!.conversations.push(
              { role: 'user', content: userMessage },
              { role: 'assistant', content: chunk.content }
            );
            memory!.lastInteraction = new Date();
            this.activeStreams.delete(agent.id);
            
            // Execute any tasks if the response contains task commands
            this.executeTasksFromResponse(agent, chunk.content);
          }
        }
      );

    } catch (error) {
      console.error('Error processing message:', error);
      onResponse(`I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`, true);
      this.activeStreams.delete(agent.id);
    }
  }

  public addSharedFile(agentId: string, filePath: string): void {
    const memory = this.getOrCreateMemory(agentId);
    if (!memory.sharedFiles.includes(filePath)) {
      memory.sharedFiles.push(filePath);
    }
  }

  public addTextSnippet(agentId: string, content: string, fileName?: string): void {
    const memory = this.getOrCreateMemory(agentId);
    memory.textSnippets.push({ content, fileName });
  }

  public removeSharedFile(agentId: string, filePath: string): void {
    const memory = this.agentMemories.get(agentId);
    if (memory) {
      memory.sharedFiles = memory.sharedFiles.filter(f => f !== filePath);
    }
  }

  public removeTextSnippet(agentId: string, index: number): void {
    const memory = this.agentMemories.get(agentId);
    if (memory && memory.textSnippets[index]) {
      memory.textSnippets.splice(index, 1);
    }
  }

  public getSharedContext(agentId: string): { files: string[]; textSnippets: Array<{ content: string; fileName?: string }> } {
    const memory = this.agentMemories.get(agentId);
    if (!memory) {
      return { files: [], textSnippets: [] };
    }
    return {
      files: [...memory.sharedFiles],
      textSnippets: [...memory.textSnippets]
    };
  }

  public clearMemory(agentId: string): void {
    this.agentMemories.delete(agentId);
  }

  public cancelStream(agentId: string): void {
    this.activeStreams.set(agentId, false);
  }

  private getOrCreateMemory(agentId: string): AgentMemory {
    let memory = this.agentMemories.get(agentId);
    if (!memory) {
      memory = {
        agentId,
        conversations: [],
        sharedFiles: [],
        textSnippets: [],
        lastInteraction: new Date()
      };
      this.agentMemories.set(agentId, memory);
    }
    return memory;
  }

  private analyzeForTasks(message: string, _agentType: string): { hasTasks: boolean; tasks: string[] } {
    const taskKeywords = {
      file_operations: ['create file', 'write file', 'save to file', 'generate file'],
      git_operations: ['git commit', 'commit changes', 'push to git', 'create branch'],
      command_execution: ['run command', 'execute', 'npm install', 'npm run', 'docker'],
      code_analysis: ['analyze code', 'review code', 'check for bugs', 'lint code']
    };

    const detectedTasks: string[] = [];
    const lowerMessage = message.toLowerCase();

    Object.entries(taskKeywords).forEach(([taskType, keywords]) => {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        detectedTasks.push(taskType);
      }
    });

    return {
      hasTasks: detectedTasks.length > 0,
      tasks: detectedTasks
    };
  }

  private getTaskInstructions(_agent: AgentConfig, tasks: string[]): string {
    let instructions = '\nTask Execution Capabilities:\n';
    
    if (tasks.includes('file_operations')) {
      instructions += '- You can create, modify, or save files by using the format: `[CREATE_FILE: filename.ext]\\n[content here]\\n[/CREATE_FILE]`\n';
    }
    
    if (tasks.includes('git_operations')) {
      instructions += '- You can perform git operations using: `[GIT_COMMAND: git status]` or `[GIT_COMMIT: commit message]`\n';
    }
    
    if (tasks.includes('command_execution')) {
      instructions += '- You can execute shell commands using: `[RUN_COMMAND: npm install]`\n';
    }

    instructions += '\nWhen the user asks you to perform these tasks, use the appropriate format in your response and I will execute them for you.';
    
    return instructions;
  }

  private async executeTasksFromResponse(_agent: AgentConfig, response: string): Promise<void> {
    // Parse task commands from AI response
    const fileCreateRegex = /\[CREATE_FILE:\s*([^\]]+)\]\n([\s\S]*?)\[\/CREATE_FILE\]/g;
    const gitCommandRegex = /\[GIT_COMMAND:\s*([^\]]+)\]/g;
    const gitCommitRegex = /\[GIT_COMMIT:\s*([^\]]+)\]/g;
    const runCommandRegex = /\[RUN_COMMAND:\s*([^\]]+)\]/g;

    // Execute file creation tasks
    let match;
    while ((match = fileCreateRegex.exec(response)) !== null) {
      const fileName = match[1].trim();
      const content = match[2].trim();
      await this.createFile(fileName, content);
    }

    // Execute git commands
    while ((match = gitCommandRegex.exec(response)) !== null) {
      const command = match[1].trim();
      await this.executeGitCommand(command);
    }

    // Execute git commits
    while ((match = gitCommitRegex.exec(response)) !== null) {
      const commitMessage = match[1].trim();
      await this.executeGitCommit(commitMessage);
    }

    // Execute shell commands
    while ((match = runCommandRegex.exec(response)) !== null) {
      const command = match[1].trim();
      await this.executeShellCommand(command);
    }
  }

  private async createFile(fileName: string, content: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      const dirPath = path.dirname(filePath);

      // Create directories if they don't exist
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }

      // Write file
      fs.writeFileSync(filePath, content, 'utf8');
      
      vscode.window.showInformationMessage(`File created: ${fileName}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeGitCommand(command: string): Promise<void> {
    try {
      const terminal = vscode.window.createTerminal('AI Agent Git');
      terminal.sendText(command);
      terminal.show();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute git command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeGitCommit(message: string): Promise<void> {
    try {
      const terminal = vscode.window.createTerminal('AI Agent Git');
      terminal.sendText(`git add -A && git commit -m "${message}"`);
      terminal.show();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to commit: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async executeShellCommand(command: string): Promise<void> {
    try {
      const terminal = vscode.window.createTerminal('AI Agent Command');
      terminal.sendText(command);
      terminal.show();
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to execute command: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}