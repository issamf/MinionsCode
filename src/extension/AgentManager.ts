import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { AgentConfig, AgentType, AIProvider, AgentEvent, AgentEventType } from '@/shared/types';
import { SettingsManager } from './SettingsManager';

export class AgentManager {
  private context: vscode.ExtensionContext;
  private settingsManager: SettingsManager;
  private agents: Map<string, AgentConfig> = new Map();
  private eventEmitter = new vscode.EventEmitter<AgentEvent>();
  
  public readonly onAgentEvent = this.eventEmitter.event;

  constructor(context: vscode.ExtensionContext, settingsManager: SettingsManager) {
    this.context = context;
    this.settingsManager = settingsManager;
    this.loadPersistedAgents();
  }

  public async createAgent(config: Partial<AgentConfig>): Promise<AgentConfig> {
    const agentId = uuidv4();
    const now = new Date();
    
    const defaultConfig: AgentConfig = {
      id: agentId,
      name: config.name || `Agent ${this.agents.size + 1}`,
      avatar: config.avatar || this.getDefaultAvatar(config.type || AgentType.CUSTOM),
      type: config.type || AgentType.CUSTOM,
      model: config.model || {
        provider: this.settingsManager.getDefaultProvider(),
        modelName: this.getDefaultModelName(this.settingsManager.getDefaultProvider()),
        temperature: 0.7,
        maxTokens: 2000
      },
      capabilities: config.capabilities || [],
      permissions: config.permissions || [],
      systemPrompt: config.systemPrompt || this.getDefaultSystemPrompt(config.type || AgentType.CUSTOM),
      contextScope: config.contextScope || {
        includeFiles: true,
        includeGit: true,
        includeWorkspace: true,
        filePatterns: ['**/*.ts', '**/*.js', '**/*.py', '**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/dist/**']
      },
      memory: config.memory || {
        maxConversations: 100,
        retentionDays: this.settingsManager.getSettings().dataRetentionDays,
        enableLearning: true
      },
      createdAt: now,
      updatedAt: now,
      isActive: true
    };

    // Check if we're at the max concurrent agents limit
    const activeAgents = Array.from(this.agents.values()).filter(a => a.isActive);
    const maxAgents = this.settingsManager.getMaxConcurrentAgents();
    
    if (activeAgents.length >= maxAgents) {
      throw new Error(`Maximum number of concurrent agents (${maxAgents}) reached`);
    }

    this.agents.set(agentId, defaultConfig);
    await this.persistAgents();

    this.emitEvent(AgentEventType.CREATED, agentId);
    
    return defaultConfig;
  }

  public async destroyAgent(agentId: string): Promise<void> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with id ${agentId} not found`);
    }

    this.agents.delete(agentId);
    await this.persistAgents();

    this.emitEvent(AgentEventType.DESTROYED, agentId);
  }

  public listAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  public getAgent(agentId: string): AgentConfig | null {
    return this.agents.get(agentId) || null;
  }

  public async updateAgent(agentId: string, updates: Partial<AgentConfig>): Promise<AgentConfig> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with id ${agentId} not found`);
    }

    const updatedAgent = {
      ...agent,
      ...updates,
      id: agentId, // Prevent ID changes
      updatedAt: new Date()
    };

    this.agents.set(agentId, updatedAgent);
    await this.persistAgents();

    return updatedAgent;
  }

  public async pauseAgent(agentId: string): Promise<void> {
    await this.updateAgent(agentId, { isActive: false });
  }

  public async resumeAgent(agentId: string): Promise<void> {
    await this.updateAgent(agentId, { isActive: true });
  }

  public async cloneAgent(agentId: string, newName: string): Promise<AgentConfig> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent with id ${agentId} not found`);
    }

    const clonedConfig = {
      ...agent,
      name: newName,
      id: undefined // Will be generated in createAgent
    };

    return await this.createAgent(clonedConfig);
  }

  private async loadPersistedAgents(): Promise<void> {
    try {
      const persistedAgents = this.context.globalState.get<AgentConfig[]>('agents', []);
      
      for (const agent of persistedAgents) {
        this.agents.set(agent.id, agent);
      }
    } catch (error) {
      console.error('Error loading persisted agents:', error);
    }
  }

  private async persistAgents(): Promise<void> {
    try {
      const agentsList = Array.from(this.agents.values());
      await this.context.globalState.update('agents', agentsList);
    } catch (error) {
      console.error('Error persisting agents:', error);
    }
  }

  private getDefaultAvatar(type: AgentType): string {
    const avatars = {
      [AgentType.CODE_REVIEWER]: '👨‍💻',
      [AgentType.DOCUMENTATION]: '📝',
      [AgentType.DEVOPS]: '🚀',
      [AgentType.TESTING]: '🧪',
      [AgentType.CUSTOM]: '🤖'
    };
    
    return avatars[type] || avatars[AgentType.CUSTOM];
  }

  private getDefaultModelName(provider: AIProvider): string {
    const models = {
      [AIProvider.ANTHROPIC]: 'claude-3-5-sonnet-20241022',
      [AIProvider.OPENAI]: 'gpt-4o',
      [AIProvider.GOOGLE]: 'gemini-pro',
      [AIProvider.OLLAMA]: 'llama3.1',
      [AIProvider.LM_STUDIO]: 'local-model'
    };
    
    return models[provider] || models[AIProvider.ANTHROPIC];
  }

  private getDefaultSystemPrompt(type: AgentType): string {
    const prompts = {
      [AgentType.CODE_REVIEWER]: `You are a senior code reviewer with expertise in software engineering best practices. Your role is to:

- Review code for bugs, security vulnerabilities, and performance issues
- Suggest improvements for readability and maintainability
- Ensure adherence to coding standards and conventions
- Provide constructive feedback with specific examples
- Recommend refactoring opportunities when appropriate

Always be thorough but constructive in your feedback.`,

      [AgentType.DOCUMENTATION]: `You are a technical documentation specialist. Your role is to:

- Create clear, comprehensive documentation for code and projects
- Write user guides, API documentation, and technical specifications
- Ensure documentation is up-to-date and accurate
- Use appropriate formatting and structure
- Make complex technical concepts accessible

Focus on clarity and usability in all documentation.`,

      [AgentType.DEVOPS]: `You are a DevOps engineer with expertise in deployment, infrastructure, and automation. Your role is to:

- Help with Docker, Kubernetes, and containerization
- Assist with CI/CD pipeline setup and optimization
- Provide guidance on infrastructure as code
- Help troubleshoot deployment and environment issues
- Recommend best practices for scalability and reliability

Focus on automation, reliability, and best practices.`,

      [AgentType.TESTING]: `You are a quality assurance specialist focused on testing and test automation. Your role is to:

- Write comprehensive test cases and test plans
- Create unit tests, integration tests, and end-to-end tests
- Identify edge cases and potential failure points
- Recommend testing strategies and frameworks
- Help with test automation and continuous testing

Focus on thorough coverage and maintainable test code.`,

      [AgentType.CUSTOM]: `You are a helpful AI assistant specialized in software development. Your role is to:

- Assist with coding tasks and problem-solving
- Provide explanations and guidance on technical concepts
- Help with debugging and troubleshooting
- Suggest best practices and improvements
- Adapt to the specific needs of each project

Be helpful, accurate, and focused on the task at hand.`
    };

    return prompts[type] || prompts[AgentType.CUSTOM];
  }

  private emitEvent(type: AgentEventType, agentId: string, data?: any): void {
    const event: AgentEvent = {
      type,
      agentId,
      data,
      timestamp: new Date()
    };

    this.eventEmitter.fire(event);
  }

  public dispose(): void {
    this.eventEmitter.dispose();
  }
}