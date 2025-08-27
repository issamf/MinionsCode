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
  learningData: {
    commonTopics: { [topic: string]: number };
    preferredApproaches: string[];
    successfulPatterns: string[];
    interactionCount: number;
  };
  contextSummary?: string; // Compressed context when window is full
  totalTokensUsed: number;
  sessionCount: number;
}

export class AgentService {
  private providerManager: AIProviderManager;
  private agentMemories: Map<string, AgentMemory> = new Map();
  private activeStreams: Map<string, boolean> = new Map();
  private context: vscode.ExtensionContext | null = null;

  constructor() {
    this.providerManager = new AIProviderManager();
  }

  public setContext(context: vscode.ExtensionContext): void {
    this.context = context;
    this.loadPersistedMemories();
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
          lastInteraction: new Date(),
          learningData: {
            commonTopics: {},
            preferredApproaches: [],
            successfulPatterns: [],
            interactionCount: 0
          },
          totalTokensUsed: 0,
          sessionCount: 1
        };
        this.agentMemories.set(agent.id, memory);
      }

      // Check if the message contains task requests
      const taskAnalysis = this.analyzeForTasks(userMessage, agent.type);
      if (taskAnalysis.hasTasks) {
        console.log('🤖 TASK DETECTION:', { 
          message: userMessage, 
          detectedTasks: taskAnalysis.tasks,
          agentId: agent.id,
          agentName: agent.name
        });
      }
      
      // Handle context window management
      await this.manageContextWindow(memory, agent.model.maxTokens);
      
      // Create contextual messages with appropriate conversation history
      const conversationHistory = this.getOptimalConversationHistory(memory, agent.model.maxTokens);
      const messages = this.providerManager.createContextualMessages(
        userMessage,
        agent.systemPrompt,
        memory.sharedFiles,
        memory.textSnippets,
        conversationHistory
      );

      // Enhance system prompt with specialized behaviors
      const enhancedPrompt = this.enhanceSystemPromptWithBehaviors(agent, memory, userMessage);
      messages[0].content = enhancedPrompt;
      
      // Enhance system prompt based on agent capabilities and available tasks
      if (taskAnalysis.hasTasks) {
        const taskInstructions = this.getTaskInstructions(agent, taskAnalysis.tasks);
        messages[0].content += `\n\n${taskInstructions}`;
        console.log('🤖 TASK INSTRUCTIONS ADDED:', {
          agentId: agent.id,
          taskInstructions: taskInstructions.substring(0, 200) + '...'
        });
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
            console.log('🤖 CHECKING RESPONSE FOR TASKS:', {
              agentId: agent.id,
              responseLength: chunk.content.length,
              responsePreview: chunk.content.substring(0, 500) + '...'
            });
            
            // Execute any tasks found in the AI response (fire and forget to avoid blocking)
            this.executeTasksFromResponse(agent, chunk.content).catch(error => {
              console.error('Error executing tasks from response:', error);
              vscode.window.showErrorMessage(`Task execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            });
            
            // Update memory with the conversation
            memory!.conversations.push(
              { role: 'user', content: userMessage },
              { role: 'assistant', content: chunk.content }
            );
            memory!.lastInteraction = new Date();
            memory!.learningData.interactionCount++;
            
            // Learn from the interaction
            if (memory) {
              this.learnFromInteraction(memory, userMessage, chunk.content);
            }
            
            this.activeStreams.delete(agent.id);
            
            // Persist memory after conversation update
            this.persistMemories();
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
      this.persistMemories();
    }
  }

  public addTextSnippet(agentId: string, content: string, fileName?: string): void {
    const memory = this.getOrCreateMemory(agentId);
    memory.textSnippets.push({ content, fileName });
    this.persistMemories();
  }

  public removeSharedFile(agentId: string, filePath: string): void {
    const memory = this.agentMemories.get(agentId);
    if (memory) {
      memory.sharedFiles = memory.sharedFiles.filter(f => f !== filePath);
      this.persistMemories();
    }
  }

  public removeTextSnippet(agentId: string, index: number): void {
    const memory = this.agentMemories.get(agentId);
    if (memory && memory.textSnippets[index]) {
      memory.textSnippets.splice(index, 1);
      this.persistMemories();
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
    this.persistMemories();
  }

  public cancelStream(agentId: string): void {
    this.activeStreams.set(agentId, false);
  }

  private async loadPersistedMemories(): Promise<void> {
    if (!this.context) return;
    
    try {
      const persistedMemories = this.context.globalState.get<{ [agentId: string]: AgentMemory }>('agentMemories', {});
      
      for (const [agentId, memory] of Object.entries(persistedMemories)) {
        // Convert date strings back to Date objects and ensure learning data exists
        const processedMemory: AgentMemory = {
          ...memory,
          lastInteraction: new Date(memory.lastInteraction),
          conversations: memory.conversations.map(conv => ({
            ...conv,
            // Ensure conversations have the expected structure
          })),
          learningData: memory.learningData || {
            commonTopics: {},
            preferredApproaches: [],
            successfulPatterns: [],
            interactionCount: 0
          }
        };
        
        this.agentMemories.set(agentId, processedMemory);
      }
      
      console.log(`Loaded persisted memories for ${Object.keys(persistedMemories).length} agents`);
    } catch (error) {
      console.error('Error loading persisted memories:', error);
    }
  }

  private async persistMemories(): Promise<void> {
    if (!this.context) return;
    
    try {
      const memoriesToPersist: { [agentId: string]: AgentMemory } = {};
      
      for (const [agentId, memory] of this.agentMemories.entries()) {
        memoriesToPersist[agentId] = {
          ...memory,
          // Limit conversation history to prevent storage bloat
          conversations: memory.conversations.slice(-50) // Keep last 50 messages
        };
      }
      
      await this.context.globalState.update('agentMemories', memoriesToPersist);
      console.log(`Persisted memories for ${Object.keys(memoriesToPersist).length} agents`);
    } catch (error) {
      console.error('Error persisting memories:', error);
    }
  }

  public async clearPersistedMemory(agentId: string): Promise<void> {
    this.agentMemories.delete(agentId);
    await this.persistMemories();
  }

  public async clearAllPersistedMemories(): Promise<void> {
    this.agentMemories.clear();
    await this.persistMemories();
  }

  private learnFromInteraction(memory: AgentMemory, userMessage: string, response: string): void {
    // Extract topics from user message
    const topics = this.extractTopics(userMessage);
    topics.forEach(topic => {
      memory.learningData.commonTopics[topic] = (memory.learningData.commonTopics[topic] || 0) + 1;
    });

    // Identify successful patterns (simple heuristic - responses that contain code or structured content)
    if (this.isSuccessfulResponse(response)) {
      const pattern = this.extractPattern(userMessage, response);
      if (pattern && !memory.learningData.successfulPatterns.includes(pattern)) {
        memory.learningData.successfulPatterns.push(pattern);
        // Keep only the most recent 10 patterns
        if (memory.learningData.successfulPatterns.length > 10) {
          memory.learningData.successfulPatterns.shift();
        }
      }
    }

    // Track preferred approaches based on task types
    const approach = this.identifyApproach(userMessage, response);
    if (approach && !memory.learningData.preferredApproaches.includes(approach)) {
      memory.learningData.preferredApproaches.push(approach);
      // Keep only the most recent 5 approaches
      if (memory.learningData.preferredApproaches.length > 5) {
        memory.learningData.preferredApproaches.shift();
      }
    }
  }

  private extractTopics(message: string): string[] {
    const topics: string[] = [];
    const topicKeywords = {
      'coding': ['code', 'function', 'class', 'variable', 'programming', 'development'],
      'debugging': ['bug', 'error', 'issue', 'problem', 'fix', 'debug'],
      'documentation': ['document', 'readme', 'comment', 'explain', 'describe'],
      'testing': ['test', 'unit test', 'integration', 'testing'],
      'deployment': ['deploy', 'build', 'production', 'release'],
      'database': ['database', 'sql', 'query', 'data', 'schema'],
      'api': ['api', 'endpoint', 'rest', 'graphql', 'service'],
      'ui': ['ui', 'interface', 'component', 'frontend', 'react', 'vue']
    };

    const lowerMessage = message.toLowerCase();
    Object.entries(topicKeywords).forEach(([topic, keywords]) => {
      if (keywords.some(keyword => lowerMessage.includes(keyword))) {
        topics.push(topic);
      }
    });

    return topics;
  }

  private isSuccessfulResponse(response: string): boolean {
    // Simple heuristics for successful responses
    return response.includes('```') || // Contains code blocks
           response.length > 100 || // Substantial response
           response.includes('step') || // Contains instructions
           response.includes('example'); // Contains examples
  }

  private extractPattern(userMessage: string, response: string): string | null {
    if (userMessage.toLowerCase().includes('how to') || userMessage.includes('?')) {
      if (response.includes('```')) {
        return 'code_explanation';
      } else if (response.includes('1.') || response.includes('•')) {
        return 'step_by_step';
      }
    }
    
    if (userMessage.toLowerCase().includes('create') || userMessage.toLowerCase().includes('generate')) {
      return 'creation_task';
    }
    
    if (userMessage.toLowerCase().includes('fix') || userMessage.toLowerCase().includes('debug')) {
      return 'debugging_task';
    }
    
    return null;
  }

  private identifyApproach(_userMessage: string, response: string): string | null {
    if (response.includes('```')) {
      return 'code_first';
    } else if (response.includes('1.') || response.includes('step')) {
      return 'step_by_step';
    } else if (response.includes('example')) {
      return 'example_driven';
    }
    
    return null;
  }

  public getAgentLearningInsights(agentId: string): any {
    const memory = this.agentMemories.get(agentId);
    if (!memory) return null;

    return {
      interactionCount: memory.learningData.interactionCount,
      topTopics: Object.entries(memory.learningData.commonTopics)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),
      preferredApproaches: memory.learningData.preferredApproaches,
      successfulPatterns: memory.learningData.successfulPatterns
    };
  }

  private enhanceSystemPromptWithBehaviors(agent: AgentConfig, memory: AgentMemory, userMessage: string): string {
    let enhancedPrompt = agent.systemPrompt;
    
    // CRITICAL: Always add autonomous action emphasis
    enhancedPrompt += `\n\n🚨 AUTONOMOUS ACTION MODE: You are an autonomous agent. When users request file operations, code changes, or development tasks, you must EXECUTE them directly using the provided task syntax. Never provide shell commands or instructions - use the task execution system!`;
    
    // Add learning-based context
    if (memory.learningData.interactionCount > 5) {
      enhancedPrompt += this.generateLearningContext(memory);
    }
    
    // Add template-specific behaviors
    enhancedPrompt += this.getTemplateSpecificBehaviors(agent.type, userMessage, memory);
    
    // Add interaction history context for better continuity
    if (memory.conversations.length > 0) {
      enhancedPrompt += this.generateContinuityContext(memory);
    }
    
    return enhancedPrompt;
  }

  private generateLearningContext(memory: AgentMemory): string {
    const topTopics = Object.entries(memory.learningData.commonTopics)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([topic]) => topic);
    
    let context = `\n\nLearning Context:
- You have had ${memory.learningData.interactionCount} interactions with this user
- Common topics: ${topTopics.join(', ')}
- Preferred approaches: ${memory.learningData.preferredApproaches.join(', ')}`;
    
    if (memory.learningData.successfulPatterns.length > 0) {
      context += `\n- Successful patterns used: ${memory.learningData.successfulPatterns.join(', ')}`;
    }
    
    return context + '\n\nAdapt your response style based on these learned preferences.';
  }

  private getTemplateSpecificBehaviors(agentType: string, userMessage: string, memory: AgentMemory): string {
    const lowerMessage = userMessage.toLowerCase();
    
    switch (agentType) {
      case 'code_reviewer':
        return this.getCodeReviewerBehavior(lowerMessage, memory);
      case 'documentation':
        return this.getDocumentationBehavior(lowerMessage, memory);
      case 'devops':
        return this.getDevOpsBehavior(lowerMessage, memory);
      case 'testing':
        return this.getTestingBehavior(lowerMessage, memory);
      case 'custom':
        return this.getCustomBehavior(lowerMessage, memory);
      default:
        return '';
    }
  }

  private getCodeReviewerBehavior(message: string, memory: AgentMemory): string {
    let behavior = `\n\nSpecialized Code Review Behaviors:`;
    
    if (message.includes('review') || message.includes('check')) {
      behavior += `\n- Focus on security vulnerabilities, performance bottlenecks, and maintainability
- Provide specific line-by-line feedback with suggestions
- Rate the code quality and explain your reasoning
- Suggest refactoring opportunities if applicable`;
    }
    
    if (message.includes('bug') || message.includes('error')) {
      behavior += `\n- Analyze the code for common bug patterns
- Look for edge cases and error handling issues
- Suggest defensive programming techniques`;
    }
    
    // Adapt based on learning data
    if (memory.learningData.commonTopics['debugging']) {
      behavior += `\n- Pay extra attention to debugging aspects based on previous interactions`;
    }
    
    return behavior;
  }

  private getDocumentationBehavior(message: string, memory: AgentMemory): string {
    let behavior = `\n\nSpecialized Documentation Behaviors:`;
    
    if (message.includes('document') || message.includes('readme')) {
      behavior += `\n- Create structured documentation with clear headings
- Include usage examples and code snippets
- Add installation and setup instructions
- Provide troubleshooting section if relevant`;
    }
    
    if (message.includes('api') || message.includes('function')) {
      behavior += `\n- Document all parameters, return values, and exceptions
- Provide practical usage examples
- Include type information and constraints`;
    }
    
    // Adapt based on previous successful patterns
    if (memory.learningData.successfulPatterns.includes('step_by_step')) {
      behavior += `\n- Use step-by-step format which worked well in previous interactions`;
    }
    
    return behavior;
  }

  private getDevOpsBehavior(message: string, _memory: AgentMemory): string {
    let behavior = `\n\nSpecialized DevOps Behaviors:`;
    
    if (message.includes('docker') || message.includes('container')) {
      behavior += `\n- Provide complete Dockerfile examples with best practices
- Include multi-stage builds and security considerations
- Suggest appropriate base images and optimization techniques`;
    }
    
    if (message.includes('deploy') || message.includes('ci/cd')) {
      behavior += `\n- Focus on automation and reliability
- Provide YAML configuration examples
- Include rollback strategies and monitoring setup`;
    }
    
    if (message.includes('kubernetes') || message.includes('k8s')) {
      behavior += `\n- Provide complete manifests with resource limits
- Include health checks and scaling configurations
- Suggest security policies and networking setup`;
    }
    
    return behavior;
  }

  private getTestingBehavior(message: string, memory: AgentMemory): string {
    let behavior = `\n\nSpecialized Testing Behaviors:`;
    
    if (message.includes('test') || message.includes('testing')) {
      behavior += `\n- Provide complete test suites with setup and teardown
- Include edge cases and negative test scenarios
- Suggest appropriate testing frameworks and patterns
- Focus on test maintainability and readability`;
    }
    
    if (message.includes('unit') || message.includes('integration')) {
      behavior += `\n- Create isolated, fast-running tests
- Mock external dependencies appropriately
- Ensure good test coverage of critical paths`;
    }
    
    // Adapt based on common topics
    if (memory.learningData.commonTopics['api']) {
      behavior += `\n- Include API testing strategies based on previous API discussions`;
    }
    
    return behavior;
  }

  private getCustomBehavior(message: string, memory: AgentMemory): string {
    let behavior = `\n\nAdaptive Behaviors:`;
    
    // Adapt based on learned topics
    const topTopics = Object.entries(memory.learningData.commonTopics)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 2)
      .map(([topic]) => topic);
    
    if (topTopics.includes('coding') && message.includes('code')) {
      behavior += `\n- Provide practical code examples with explanations
- Focus on best practices and clean code principles`;
    }
    
    if (topTopics.includes('debugging') && (message.includes('error') || message.includes('bug'))) {
      behavior += `\n- Use systematic debugging approach
- Provide step-by-step troubleshooting guidance`;
    }
    
    // Adapt based on preferred approaches
    if (memory.learningData.preferredApproaches.includes('code_first')) {
      behavior += `\n- Start with code examples, then provide explanations`;
    } else if (memory.learningData.preferredApproaches.includes('step_by_step')) {
      behavior += `\n- Use numbered steps and structured explanations`;
    }
    
    return behavior;
  }

  private generateContinuityContext(memory: AgentMemory): string {
    if (memory.conversations.length === 0) return '';
    
    const recentConversations = memory.conversations.slice(-3);
    const recentTopics = recentConversations
      .map(conv => this.extractTopics(conv.content))
      .flat()
      .filter((topic, index, arr) => arr.indexOf(topic) === index);
    
    if (recentTopics.length === 0) return '';
    
    return `\n\nContinuity Context:
- Recent conversation topics: ${recentTopics.join(', ')}
- Build upon previous discussions and maintain context consistency`;
  }

  private getOrCreateMemory(agentId: string): AgentMemory {
    let memory = this.agentMemories.get(agentId);
    if (!memory) {
      memory = {
        agentId,
        conversations: [],
        sharedFiles: [],
        textSnippets: [],
        lastInteraction: new Date(),
        learningData: {
          commonTopics: {},
          preferredApproaches: [],
          successfulPatterns: [],
          interactionCount: 0
        },
        totalTokensUsed: 0,
        sessionCount: 1
      };
      this.agentMemories.set(agentId, memory);
    }
    return memory;
  }

  private analyzeForTasks(message: string, _agentType: string): { hasTasks: boolean; tasks: string[] } {
    const taskKeywords = {
      file_operations: [
        'create file', 'write file', 'save to file', 'generate file', 'make file',
        'create a file', 'write a file', 'save a file', 'make a file',
        'create text', 'write text', 'save text', 'generate text',
        'create .txt', 'write .js', 'make .py', 'save .md',
        'new file', 'add file', 'build file',
        'edit file', 'modify file', 'change file', 'update file',
        'edit the file', 'modify the file', 'change the file', 'update the file',
        'change content', 'update content', 'modify content', 'edit content',
        'change the content', 'update the content', 'modify the content',
        'replace content', 'replace text', 'find and replace'
      ],
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
      instructions += `
**File Operations:**
- Create new files: \`[CREATE_FILE: path/filename.ext]\\ncontent here\\n[/CREATE_FILE]\`
- Edit existing files: \`[EDIT_FILE: path/filename.ext]\\n[FIND]old content[/FIND]\\n[REPLACE]new content[/REPLACE]\\n[/EDIT_FILE]\`
- Read files: \`[READ_file: path/filename.ext]\`
- Search in files: \`[GREP: pattern, path/glob/pattern]\`
- Find files: \`[FIND_FILES: filename_pattern]\`
- Delete files: \`[DELETE_FILE: path/filename.ext]\`

**Code Operations:**
- Insert code at specific location: \`[INSERT_CODE: filename.ext:line_number]\\ncode here\\n[/INSERT_CODE]\`
- Replace code section: \`[REPLACE_CODE: filename.ext]\\n[FIND]old code[/FIND]\\n[REPLACE]new code[/REPLACE]\\n[/REPLACE_CODE]\`
- Open file in editor: \`[OPEN_EDITOR: path/filename.ext]\`
- Format/organize imports: \`[FORMAT_FILE: path/filename.ext]\`
`;
    }
    
    if (tasks.includes('git_operations')) {
      instructions += '- Git operations: `[GIT_COMMAND: git status]` or `[GIT_COMMIT: commit message]`\n';
    }
    
    if (tasks.includes('command_execution')) {
      instructions += '- Execute commands: `[RUN_COMMAND: npm install]`\n';
    }

    instructions += `

🚨 **CRITICAL - MANDATORY TASK EXECUTION**: 
For ALL file operations, code changes, or development tasks, you MUST use the provided task syntax.

🚨 **NEVER use shell commands, simulated outputs, or explanations instead of execution!** 

❌ DO NOT respond with instructions or simulated commands like "echo 'Hello' > file.txt"
✅ DO use the task syntax: [CREATE_FILE: filename.ext]\\ncontent\\n[/CREATE_FILE]

**Critical Examples:**

**File Creation:** "create a file test.txt with Hello World"
✅ Correct: \`[CREATE_FILE: test.txt]\\nHello World\\n[/CREATE_FILE]\`
❌ Wrong: "I'll create a file: \`echo "Hello World" > test.txt\`"

**File Editing:** "change the contents of test.txt to second try"
✅ Correct: \`[EDIT_FILE: test.txt]\\n[FIND]Hello World[/FIND]\\n[REPLACE]second try[/REPLACE]\\n[/EDIT_FILE]\`
❌ Wrong: \`echo "second try" > test.txt\` or \`[UPDATE_FILE: test.txt]\`

**File Updates:** "update the file to contain new content"
✅ Correct: Use EDIT_FILE syntax above
❌ Wrong: Any shell commands or non-existent syntax

I WILL EXECUTE these tasks automatically. ALWAYS use the exact syntax above!`;
    
    return instructions;
  }

  private async executeTasksFromResponse(_agent: AgentConfig, response: string): Promise<void> {
    console.log('🤖 EXECUTING TASKS FROM RESPONSE:', {
      agentId: _agent.id,
      responseLength: response.length,
      responseSnippet: response.substring(0, 300)
    });
    
    // Parse all task commands from AI response
    const patterns = {
      fileCreate: /\[CREATE_FILE:\s*([^\]]+)\]\n([\s\S]*?)\[\/CREATE_FILE\]/g,
      fileEdit: /\[EDIT_FILE:\s*([^\]]+)\]\n\[FIND\]([\s\S]*?)\[\/FIND\]\n\[REPLACE\]([\s\S]*?)\[\/REPLACE\]\n\[\/EDIT_FILE\]/g,
      readFile: /\[READ_file:\s*([^\]]+)\]/g,
      grep: /\[GREP:\s*([^,]+),\s*([^\]]+)\]/g,
      findFiles: /\[FIND_FILES:\s*([^\]]+)\]/g,
      deleteFile: /\[DELETE_FILE:\s*([^\]]+)\]/g,
      insertCode: /\[INSERT_CODE:\s*([^:]+):(\d+)\]\n([\s\S]*?)\[\/INSERT_CODE\]/g,
      replaceCode: /\[REPLACE_CODE:\s*([^\]]+)\]\n\[FIND\]([\s\S]*?)\[\/FIND\]\n\[REPLACE\]([\s\S]*?)\[\/REPLACE\]\n\[\/REPLACE_CODE\]/g,
      openEditor: /\[OPEN_EDITOR:\s*([^\]]+)\]/g,
      formatFile: /\[FORMAT_FILE:\s*([^\]]+)\]/g,
      gitCommand: /\[GIT_COMMAND:\s*([^\]]+)\]/g,
      gitCommit: /\[GIT_COMMIT:\s*([^\]]+)\]/g,
      runCommand: /\[RUN_COMMAND:\s*([^\]]+)\]/g
    };

    let match;
    let executionResults: string[] = [];

    // Execute file creation tasks
    while ((match = patterns.fileCreate.exec(response)) !== null) {
      const fileName = match[1].trim();
      const content = match[2].trim();
      await this.createFile(fileName, content);
      executionResults.push(`Created file: ${fileName}`);
    }

    // Execute file editing tasks
    while ((match = patterns.fileEdit.exec(response)) !== null) {
      const fileName = match[1].trim();
      const findText = match[2].trim();
      const replaceText = match[3].trim();
      await this.editFile(fileName, findText, replaceText);
      executionResults.push(`Edited file: ${fileName}`);
    }

    // Execute file reading tasks
    while ((match = patterns.readFile.exec(response)) !== null) {
      const fileName = match[1].trim();
      const content = await this.readFile(fileName);
      executionResults.push(`Read file: ${fileName} (${content.length} characters)`);
    }

    // Execute grep searches
    while ((match = patterns.grep.exec(response)) !== null) {
      const pattern = match[1].trim();
      const pathPattern = match[2].trim();
      const results = await this.grepFiles(pattern, pathPattern);
      executionResults.push(`Searched for "${pattern}" in ${pathPattern}: ${results.length} matches`);
    }

    // Execute find files
    while ((match = patterns.findFiles.exec(response)) !== null) {
      const filePattern = match[1].trim();
      const files = await this.findFiles(filePattern);
      executionResults.push(`Found ${files.length} files matching: ${filePattern}`);
    }

    // Execute delete files
    while ((match = patterns.deleteFile.exec(response)) !== null) {
      const fileName = match[1].trim();
      await this.deleteFile(fileName);
      executionResults.push(`Deleted file: ${fileName}`);
    }

    // Execute code insertion
    while ((match = patterns.insertCode.exec(response)) !== null) {
      const fileName = match[1].trim();
      const lineNumber = parseInt(match[2].trim());
      const code = match[3].trim();
      await this.insertCodeAtLine(fileName, lineNumber, code);
      executionResults.push(`Inserted code in ${fileName} at line ${lineNumber}`);
    }

    // Execute code replacement
    while ((match = patterns.replaceCode.exec(response)) !== null) {
      const fileName = match[1].trim();
      const findCode = match[2].trim();
      const replaceCode = match[3].trim();
      await this.replaceCodeSection(fileName, findCode, replaceCode);
      executionResults.push(`Replaced code section in ${fileName}`);
    }

    // Execute open editor
    while ((match = patterns.openEditor.exec(response)) !== null) {
      const fileName = match[1].trim();
      await this.openInEditor(fileName);
      executionResults.push(`Opened in editor: ${fileName}`);
    }

    // Execute file formatting
    while ((match = patterns.formatFile.exec(response)) !== null) {
      const fileName = match[1].trim();
      await this.formatFile(fileName);
      executionResults.push(`Formatted file: ${fileName}`);
    }

    // Execute git commands
    while ((match = patterns.gitCommand.exec(response)) !== null) {
      const command = match[1].trim();
      await this.executeGitCommand(command);
      executionResults.push(`Executed git: ${command}`);
    }

    // Execute git commits
    while ((match = patterns.gitCommit.exec(response)) !== null) {
      const commitMessage = match[1].trim();
      await this.executeGitCommit(commitMessage);
      executionResults.push(`Git commit: ${commitMessage}`);
    }

    // Execute shell commands
    while ((match = patterns.runCommand.exec(response)) !== null) {
      const command = match[1].trim();
      await this.executeShellCommand(command);
      executionResults.push(`Executed command: ${command}`);
    }

    // Show summary of executed tasks
    console.log('🤖 TASK EXECUTION COMPLETE:', {
      agentId: _agent.id,
      tasksFound: executionResults.length,
      tasks: executionResults
    });
    
    if (executionResults.length > 0) {
      vscode.window.showInformationMessage(
        `Agent executed ${executionResults.length} task(s):\n${executionResults.join('\n')}`
      );
    } else {
      console.log('🤖 NO TASKS FOUND IN RESPONSE - Agent may have responded conversationally instead of using task syntax');
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

  // Advanced file and code manipulation methods
  private async editFile(fileName: string, findText: string, replaceText: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      let content = fs.readFileSync(filePath, 'utf8');
      
      // Perform find and replace
      if (content.includes(findText)) {
        content = content.replace(new RegExp(this.escapeRegExp(findText), 'g'), replaceText);
        fs.writeFileSync(filePath, content, 'utf8');
        vscode.window.showInformationMessage(`Updated file: ${fileName}`);
      } else {
        vscode.window.showWarningMessage(`Text not found in ${fileName}: "${findText.substring(0, 50)}..."`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to edit file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async readFile(fileName: string): Promise<string> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return '';
    }
  }

  private async grepFiles(pattern: string, pathPattern: string): Promise<Array<{file: string, line: number, content: string}>> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const results: Array<{file: string, line: number, content: string}> = [];
      const glob = require('glob');
      const searchPath = path.join(workspaceFolder.uri.fsPath, pathPattern);
      
      const files = glob.sync(searchPath, { nodir: true });
      const regex = new RegExp(pattern, 'gi');

      for (const filePath of files) {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        
        lines.forEach((line, index) => {
          if (regex.test(line)) {
            results.push({
              file: path.relative(workspaceFolder.uri.fsPath, filePath),
              line: index + 1,
              content: line.trim()
            });
          }
        });
      }

      // Show results in output channel
      if (results.length > 0) {
        const outputChannel = vscode.window.createOutputChannel(`Agent Search: ${pattern}`);
        outputChannel.appendLine(`Found ${results.length} matches for "${pattern}" in ${pathPattern}:\n`);
        results.forEach(result => {
          outputChannel.appendLine(`${result.file}:${result.line}: ${result.content}`);
        });
        outputChannel.show();
      }

      return results;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to search files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private async findFiles(filePattern: string): Promise<string[]> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const glob = require('glob');
      const searchPath = path.join(workspaceFolder.uri.fsPath, filePattern);
      const files = glob.sync(searchPath, { nodir: true });
      
      const relativeFiles = files.map((file: string) => 
        path.relative(workspaceFolder.uri.fsPath, file)
      );

      if (relativeFiles.length > 0) {
        const outputChannel = vscode.window.createOutputChannel(`Agent Find: ${filePattern}`);
        outputChannel.appendLine(`Found ${relativeFiles.length} files matching "${filePattern}":\n`);
        relativeFiles.forEach((file: string) => outputChannel.appendLine(file));
        outputChannel.show();
      }

      return relativeFiles;
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to find files: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private async deleteFile(fileName: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      fs.unlinkSync(filePath);
      vscode.window.showInformationMessage(`Deleted file: ${fileName}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async insertCodeAtLine(fileName: string, lineNumber: number, code: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      // Insert code at specified line (1-indexed)
      lines.splice(lineNumber - 1, 0, code);
      
      fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
      vscode.window.showInformationMessage(`Inserted code in ${fileName} at line ${lineNumber}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to insert code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async replaceCodeSection(fileName: string, findCode: string, replaceCode: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${fileName}`);
      }

      let content = fs.readFileSync(filePath, 'utf8');
      
      if (content.includes(findCode)) {
        content = content.replace(findCode, replaceCode);
        fs.writeFileSync(filePath, content, 'utf8');
        vscode.window.showInformationMessage(`Replaced code section in ${fileName}`);
      } else {
        vscode.window.showWarningMessage(`Code section not found in ${fileName}`);
      }
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to replace code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async openInEditor(fileName: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      const uri = vscode.Uri.file(filePath);
      
      await vscode.window.showTextDocument(uri);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open file in editor: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async formatFile(fileName: string): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('No workspace folder open');
      }

      const filePath = path.join(workspaceFolder.uri.fsPath, fileName);
      const uri = vscode.Uri.file(filePath);
      
      // Open document and format it
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document);
      
      // Execute format document command
      await vscode.commands.executeCommand('editor.action.formatDocument');
      
      // Execute organize imports if available
      try {
        await vscode.commands.executeCommand('editor.action.organizeImports');
      } catch {
        // Organize imports might not be available for all file types
      }
      
      vscode.window.showInformationMessage(`Formatted file: ${fileName}`);
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to format file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Context window management methods
  private estimateTokenCount(text: string): number {
    // Rough estimation: ~4 characters per token for most models
    return Math.ceil(text.length / 4);
  }

  private async manageContextWindow(memory: AgentMemory, maxTokens: number): Promise<void> {
    const targetTokens = Math.floor(maxTokens * 0.7); // Use 70% of available tokens
    const currentTokens = this.calculateCurrentTokenUsage(memory);
    
    if (currentTokens > targetTokens) {
      await this.compressContext(memory, targetTokens);
    }
  }

  private calculateCurrentTokenUsage(memory: AgentMemory): number {
    let totalTokens = 0;
    
    // Count conversation tokens
    memory.conversations.forEach(msg => {
      totalTokens += this.estimateTokenCount(msg.content);
    });
    
    // Count shared files tokens
    memory.sharedFiles.forEach(filePath => {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        totalTokens += this.estimateTokenCount(content);
      } catch {
        // File might not exist anymore
      }
    });
    
    // Count text snippets tokens
    memory.textSnippets.forEach(snippet => {
      totalTokens += this.estimateTokenCount(snippet.content);
    });
    
    // Add context summary if it exists
    if (memory.contextSummary) {
      totalTokens += this.estimateTokenCount(memory.contextSummary);
    }
    
    return totalTokens;
  }

  private async compressContext(memory: AgentMemory, targetTokens: number): Promise<void> {
    console.log(`Compressing context for agent ${memory.agentId}, session ${memory.sessionCount + 1}`);
    
    // Step 1: Create summary of older conversations
    const oldConversations = memory.conversations.slice(0, -5); // Keep last 5 conversations
    const recentConversations = memory.conversations.slice(-5);
    
    if (oldConversations.length > 0) {
      const summary = this.generateConversationSummary(oldConversations, memory);
      memory.contextSummary = summary;
      memory.conversations = recentConversations;
      memory.sessionCount++;
      memory.totalTokensUsed = this.calculateCurrentTokenUsage(memory);
    }
    
    // Step 2: If still too large, trim shared files and snippets
    if (this.calculateCurrentTokenUsage(memory) > targetTokens) {
      // Keep only most recent files and snippets
      memory.sharedFiles = memory.sharedFiles.slice(-3);
      memory.textSnippets = memory.textSnippets.slice(-5);
    }
    
    console.log(`Context compressed. New session: ${memory.sessionCount}, tokens: ${memory.totalTokensUsed}`);
  }

  private generateConversationSummary(conversations: AIMessage[], memory: AgentMemory): string {
    const topics = new Set<string>();
    const keyActions: string[] = [];
    const userRequests: string[] = [];
    
    conversations.forEach(msg => {
      if (msg.role === 'user') {
        // Extract user requests and intentions
        const content = msg.content.toLowerCase();
        if (content.includes('create') || content.includes('make') || content.includes('build')) {
          userRequests.push('creation tasks');
        }
        if (content.includes('fix') || content.includes('debug') || content.includes('error')) {
          userRequests.push('bug fixing');
        }
        if (content.includes('explain') || content.includes('how') || content.includes('what')) {
          userRequests.push('explanations');
        }
        if (content.includes('test') || content.includes('verify')) {
          userRequests.push('testing');
        }
      } else {
        // Extract actions taken by agent
        if (msg.content.includes('[CREATE_FILE')) {
          keyActions.push('created files');
        }
        if (msg.content.includes('[EDIT_FILE') || msg.content.includes('[REPLACE_CODE')) {
          keyActions.push('modified code');
        }
        if (msg.content.includes('[RUN_COMMAND')) {
          keyActions.push('executed commands');
        }
        if (msg.content.includes('[GIT_')) {
          keyActions.push('git operations');
        }
      }
      
      // Extract topics from learning data
      Object.keys(memory.learningData.commonTopics).forEach(topic => {
        if (msg.content.toLowerCase().includes(topic)) {
          topics.add(topic);
        }
      });
    });
    
    const summary = `## Previous Session Summary (Session ${memory.sessionCount})

**Discussion Topics**: ${Array.from(topics).join(', ') || 'general development'}
**User Requests**: ${[...new Set(userRequests)].join(', ') || 'various tasks'}
**Actions Performed**: ${[...new Set(keyActions)].join(', ') || 'consultations'}
**Interaction Count**: ${conversations.length} exchanges

**Key Context**: This agent has been working on ${Array.from(topics).join(' and ')} related tasks, with focus on ${userRequests[0] || 'development assistance'}. Previous session involved ${keyActions.length} types of actions.

---

*Continuing from previous session...*`;
    
    return summary;
  }

  private getOptimalConversationHistory(memory: AgentMemory, maxTokens: number): AIMessage[] {
    const targetTokens = Math.floor(maxTokens * 0.3); // Use 30% for conversation history
    let currentTokens = 0;
    const history: AIMessage[] = [];
    
    // Add context summary first if it exists
    const contextPrefix: AIMessage[] = [];
    if (memory.contextSummary) {
      contextPrefix.push({
        role: 'assistant',
        content: memory.contextSummary
      });
      currentTokens += this.estimateTokenCount(memory.contextSummary);
    }
    
    // Add recent conversations (newest first, then reverse)
    const conversations = [...memory.conversations].reverse();
    
    for (const msg of conversations) {
      const msgTokens = this.estimateTokenCount(msg.content);
      if (currentTokens + msgTokens > targetTokens && history.length > 0) {
        break;
      }
      history.unshift(msg);
      currentTokens += msgTokens;
    }
    
    return [...contextPrefix, ...history];
  }

  public async getConversationHistory(agentId: string): Promise<AIMessage[]> {
    const memory = this.agentMemories.get(agentId);
    return memory ? memory.conversations : [];
  }
}