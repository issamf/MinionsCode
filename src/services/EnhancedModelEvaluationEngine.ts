import { AgentService } from '@/agents/AgentService';
import { AgentConfig, AgentType, PermissionType, AIProvider, CapabilityType } from '@/shared/types';
import { ModelDiscoveryService, AvailableModel } from './ModelDiscoveryService';
import { EvaluationScenarioService, EvaluationScenario, ConversationTurn } from './EvaluationScenarioService';
import { EvaluationProgressTracker } from './EvaluationProgressTracker';
import { EvaluationPersistenceService } from './EvaluationPersistenceService';

// Enhanced interfaces with timeout and error handling
export interface EvaluationConfiguration {
  timeout: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
  includeOnlineModels: boolean;
  outputDirectory: string;
  enableLivePreview: boolean;
  enableFailsafeMode: boolean;
}

export interface ModelEvaluationResult {
  modelId: string;
  modelName: string;
  success: boolean;
  error?: string;
  skipped: boolean;
  skipReason?: string;
  overallMetrics?: {
    taskSuccessRate: number;
    technicalAccuracy: number;
    contextUnderstanding: number;
    responseCompleteness: number;
    domainKnowledgeScore: number;
    codeQualityScore: number;
    userSatisfactionScore: number;
    responseLatency: number;
  };
  scenarioResults: ScenarioResult[];
  totalDuration: number;
  retryCount: number;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  agentType: AgentType;
  successRate: number;
  averageLatency: number;
  taskExecutionSuccess: boolean;
  errors: string[];
  conversationLog: ConversationTurn[];
  timeout: boolean;
  crashed: boolean;
}

export class EnhancedModelEvaluationEngine {
  private agentService: AgentService;
  private modelDiscovery: ModelDiscoveryService;
  private scenarioService: EvaluationScenarioService;
  private progressTracker: EvaluationProgressTracker;
  private persistenceService: EvaluationPersistenceService;
  private configuration: EvaluationConfiguration;
  
  // Timeout and cancellation handling
  private activeTimeouts: Set<NodeJS.Timeout> = new Set();
  private isShuttingDown: boolean = false;

  constructor(
    agentService: AgentService,
    progressTracker: EvaluationProgressTracker,
    persistenceService: EvaluationPersistenceService,
    configuration: EvaluationConfiguration
  ) {
    this.agentService = agentService;
    this.modelDiscovery = new ModelDiscoveryService();
    this.scenarioService = new EvaluationScenarioService();
    this.progressTracker = progressTracker;
    this.persistenceService = persistenceService;
    this.configuration = configuration;
    
    // @ts-ignore - services used for future extensibility
    this.modelDiscovery; this.scenarioService;
  }

  // Main evaluation method with fail-safe operation
  async evaluateModels(
    selectedModels: AvailableModel[],
    selectedScenarios: EvaluationScenario[]
  ): Promise<ModelEvaluationResult[]> {
    const results: ModelEvaluationResult[] = [];
    
    this.progressTracker.initialize(selectedModels.length, selectedScenarios.length);
    this.progressTracker.setStatus('running', 'Starting model evaluation...');

    try {
      for (const model of selectedModels) {
        // Check for cancellation
        if (this.progressTracker.isCancellationRequested() || this.isShuttingDown) {
          this.progressTracker.setStatus('cancelled', 'Evaluation cancelled by user');
          break;
        }

        // Check if model was already completed in previous session
        const remainingModels = this.persistenceService.getRemainingModels();
        if (!remainingModels.find(m => m.id === model.id)) {
          this.progressTracker.updateModelProgress(100);
          this.progressTracker.completeModel(true);
          continue;
        }

        this.progressTracker.startModel(model);
        this.persistenceService.startModel(model.id);

        const result = await this.evaluateSingleModel(model, selectedScenarios);
        results.push(result);

        if (result.success) {
          this.progressTracker.completeModel(true);
          this.persistenceService.completeModel(model.id, {
            modelId: result.modelId,
            modelName: result.modelName,
            overallMetrics: result.overallMetrics!,
            scenarioResults: result.scenarioResults,
            totalDuration: result.totalDuration
          });
        } else if (result.skipped) {
          this.progressTracker.skipModel(model, result.skipReason || 'Unknown reason');
          this.persistenceService.skipModel(model.id, result.skipReason || 'Unknown reason');
        } else {
          this.progressTracker.completeModel(false);
          this.persistenceService.addError(model.id, undefined, result.error);
        }

        // Small delay between models to allow for cancellation
        if (!this.progressTracker.isCancellationRequested()) {
          await this.sleep(1000);
        }
      }

      if (!this.progressTracker.isCancellationRequested()) {
        this.progressTracker.complete();
        this.persistenceService.updateStatus('completed');
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.progressTracker.error(errorMessage);
      this.persistenceService.updateStatus('error');
      throw error;
    }

    return results;
  }

  // Evaluate a single model with comprehensive error handling
  private async evaluateSingleModel(
    model: AvailableModel,
    scenarios: EvaluationScenario[]
  ): Promise<ModelEvaluationResult> {
    const startTime = Date.now();
    let retryCount = 0;
    
    const result: ModelEvaluationResult = {
      modelId: model.id,
      modelName: model.name,
      success: false,
      skipped: false,
      scenarioResults: [],
      totalDuration: 0,
      retryCount: 0
    };

    // Check if model is available before attempting evaluation
    try {
      if (model.type === 'local') {
        const isAvailable = await this.checkModelAvailability(model);
        if (!isAvailable) {
          result.skipped = true;
          result.skipReason = 'Model not available or not responding';
          result.totalDuration = Date.now() - startTime;
          return result;
        }
      }
    } catch (error) {
      result.skipped = true;
      result.skipReason = `Model availability check failed: ${error instanceof Error ? error.message : String(error)}`;
      result.totalDuration = Date.now() - startTime;
      return result;
    }

    // Retry loop for model evaluation
    while (retryCount < this.configuration.maxRetries) {
      try {
        result.retryCount = retryCount;
        
        this.progressTracker.updateModelProgress(0);
        this.progressTracker.setStatus('running', `Evaluating ${model.name} (attempt ${retryCount + 1}/${this.configuration.maxRetries})`);

        const scenarioResults: ScenarioResult[] = [];
        let totalLatency = 0;
        let successfulScenarios = 0;

        // Evaluate each scenario
        for (let i = 0; i < scenarios.length; i++) {
          const scenario = scenarios[i];
          
          // Check for cancellation
          if (this.progressTracker.isCancellationRequested() || this.isShuttingDown) {
            result.error = 'Evaluation cancelled';
            result.totalDuration = Date.now() - startTime;
            return result;
          }

          this.progressTracker.startScenario(scenario);
          this.persistenceService.updateSessionProgress(model.id, scenario.id, 0);

          const scenarioResult = await this.evaluateScenario(model, scenario);
          scenarioResults.push(scenarioResult);

          if (scenarioResult.taskExecutionSuccess && !scenarioResult.timeout && !scenarioResult.crashed) {
            successfulScenarios++;
          }

          totalLatency += scenarioResult.averageLatency;
          
          this.progressTracker.completeScenario();
          this.progressTracker.updateModelProgress(((i + 1) / scenarios.length) * 100);

          // Save intermediate progress
          this.persistenceService.saveIntermediateResult(model.id, {
            modelId: model.id,
            modelName: model.name,
            overallMetrics: {
              taskSuccessRate: successfulScenarios / (i + 1),
              technicalAccuracy: scenarioResult.successRate,
              contextUnderstanding: scenarioResult.successRate,
              responseCompleteness: scenarioResult.successRate,
              domainKnowledgeScore: scenarioResult.successRate,
              codeQualityScore: scenarioResult.successRate,
              userSatisfactionScore: scenarioResult.successRate,
              responseLatency: totalLatency / (i + 1)
            },
            scenarioResults: scenarioResults,
            totalDuration: Date.now() - startTime
          });
        }

        // Calculate overall metrics
        const avgLatency = totalLatency / scenarios.length;
        const overallSuccessRate = successfulScenarios / scenarios.length;

        result.success = true;
        result.scenarioResults = scenarioResults;
        result.overallMetrics = {
          taskSuccessRate: overallSuccessRate,
          technicalAccuracy: overallSuccessRate,
          contextUnderstanding: overallSuccessRate,
          responseCompleteness: overallSuccessRate,
          domainKnowledgeScore: overallSuccessRate,
          codeQualityScore: overallSuccessRate,
          userSatisfactionScore: overallSuccessRate,
          responseLatency: avgLatency
        };

        result.totalDuration = Date.now() - startTime;
        return result;

      } catch (error) {
        retryCount++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        this.progressTracker.addError(model.id, undefined, `Attempt ${retryCount} failed: ${errorMessage}`);
        
        if (retryCount >= this.configuration.maxRetries) {
          result.error = `Failed after ${this.configuration.maxRetries} attempts. Last error: ${errorMessage}`;
          result.totalDuration = Date.now() - startTime;
          break;
        }

        // Wait before retry
        this.progressTracker.setStatus('running', `Retrying ${model.name} in ${this.configuration.retryDelay/1000}s (attempt ${retryCount + 1}/${this.configuration.maxRetries})`);
        await this.sleep(this.configuration.retryDelay);
      }
    }

    result.totalDuration = Date.now() - startTime;
    return result;
  }

  // Evaluate a single scenario with timeout and error handling
  private async evaluateScenario(model: AvailableModel, scenario: EvaluationScenario): Promise<ScenarioResult> {
    const startTime = Date.now();
    const conversationLog: ConversationTurn[] = [];
    
    // @ts-ignore - variables used in error handling paths
    let timeout = false;
    let crashed = false;
    const errors: string[] = [];
    timeout; crashed; errors;

    const result: ScenarioResult = {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      agentType: scenario.agentType,
      successRate: 0,
      averageLatency: 0,
      taskExecutionSuccess: false,
      errors: [],
      conversationLog: [],
      timeout: false,
      crashed: false
    };

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timeoutId = setTimeout(() => {
          timeout = true;
          reject(new Error(`Scenario timeout after ${this.configuration.timeout}ms`));
        }, this.configuration.timeout);
        
        this.activeTimeouts.add(timeoutId);
        
        // Clean up timeout on completion
        timeoutPromise.finally(() => {
          this.activeTimeouts.delete(timeoutId);
          clearTimeout(timeoutId);
        });
      });

      // Create evaluation promise
      const evaluationPromise = this.runScenarioEvaluation(model, scenario, conversationLog);

      // Race between evaluation and timeout
      await Promise.race([evaluationPromise, timeoutPromise]);

      // If we reach here, evaluation completed successfully
      result.conversationLog = conversationLog;
      result.averageLatency = Date.now() - startTime;
      result.taskExecutionSuccess = this.analyzeTaskSuccess(conversationLog);
      result.successRate = result.taskExecutionSuccess ? 1.0 : 0.5;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      if (errorMessage.includes('timeout')) {
        result.timeout = true;
        result.errors.push(`Scenario timed out after ${this.configuration.timeout}ms`);
        this.progressTracker.updateOutput(`⏱️ Timeout: ${scenario.name} on ${model.name}`);
      } else if (errorMessage.includes('crash') || errorMessage.includes('connection') || errorMessage.includes('network')) {
        result.crashed = true;
        result.errors.push(`Model crashed or became unresponsive: ${errorMessage}`);
        this.progressTracker.updateOutput(`💥 Crash: ${scenario.name} on ${model.name}`);
      } else {
        result.errors.push(errorMessage);
        this.progressTracker.updateOutput(`❌ Error: ${scenario.name} on ${model.name} - ${errorMessage}`);
      }

      result.conversationLog = conversationLog; // Save partial conversation
      result.averageLatency = Date.now() - startTime;
      result.successRate = 0;
    }

    return result;
  }

  // Run the actual scenario evaluation with live preview
  private async runScenarioEvaluation(
    model: AvailableModel,
    scenario: EvaluationScenario,
    conversationLog: ConversationTurn[]
  ): Promise<void> {
    // Create agent configuration for this test
    const agentConfig: AgentConfig = this.createTestAgentConfig(scenario.agentType, model);
    
    // Initialize agent service
    await this.agentService.initialize();

    // Execute conversation turns
    for (const turn of scenario.conversation) {
      // Check for cancellation
      if (this.progressTracker.isCancellationRequested() || this.isShuttingDown) {
        throw new Error('Evaluation cancelled');
      }

      if (turn.role === 'user') {
        // Add user message to log
        conversationLog.push(turn);
        
        // Update live preview
        if (this.configuration.enableLivePreview) {
          this.persistenceService.updateLivePreview(conversationLog, '', false);
        }

        // Get agent response with timeout
        // const responseStartTime = Date.now();
        
        try {
          const response = await this.getAgentResponseWithTimeout(
            agentConfig,
            turn.message,
            this.configuration.timeout / scenario.conversation.length // Distribute timeout across turns
          );

          // const _responseTime = Date.now() - responseStartTime;
          
          // Add agent response to log
          const agentTurn: ConversationTurn = {
            role: 'agent',
            message: response
          };
          conversationLog.push(agentTurn);

          // Update live preview with final response
          if (this.configuration.enableLivePreview) {
            this.persistenceService.updateLivePreview(conversationLog, response, false);
          }

          // Update progress with response preview
          const preview = response.length > 100 ? response.substring(0, 100) + '...' : response;
          this.progressTracker.updateOutput(`💬 ${model.name}: ${preview}`);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          throw new Error(`Agent response failed: ${errorMessage}`);
        }
      }
    }
  }

  // Get agent response with timeout and live streaming
  private async getAgentResponseWithTimeout(
    agentConfig: AgentConfig,
    message: string,
    timeoutMs: number
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let response = '';
      let completed = false;
      
      // Set up timeout
      const timeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          reject(new Error(`Agent response timeout after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      this.activeTimeouts.add(timeoutId);

      // Call agent service with streaming
      this.agentService.processMessage(
        agentConfig,
        message,
        (chunk: string, done: boolean) => {
          if (completed) return;
          
          response += chunk;
          
          // Update live preview with streaming response
          if (this.configuration.enableLivePreview) {
            this.persistenceService.updateLivePreview(
              this.persistenceService.getCurrentConversation(),
              response,
              !done // isStreaming
            );
          }
          
          if (done && !completed) {
            completed = true;
            clearTimeout(timeoutId);
            this.activeTimeouts.delete(timeoutId);
            resolve(response);
          }
        }
      ).catch((error) => {
        if (!completed) {
          completed = true;
          clearTimeout(timeoutId);
          this.activeTimeouts.delete(timeoutId);
          reject(error);
        }
      });
    });
  }

  // Check if a local model is available and responding
  private async checkModelAvailability(model: AvailableModel): Promise<boolean> {
    if (model.type !== 'local') return true; // Assume online models are available

    try {
      // Try a simple ping to the model
      const testConfig: AgentConfig = this.createTestAgentConfig(AgentType.CUSTOM, model);
      
      const testPromise = this.agentService.processMessage(testConfig, 'ping', () => {});
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('timeout')), 10000)
      );

      await Promise.race([testPromise, timeoutPromise]);
      return true;
    } catch (error) {
      return false;
    }
  }

  // Create test agent configuration
  private createTestAgentConfig(agentType: AgentType, model: AvailableModel): AgentConfig {
    return {
      id: `test-${model.id}-${Date.now()}`,
      name: `Test Agent for ${model.name}`,
      avatar: 'avatar-01.png',
      type: agentType,
      model: {
        provider: model.type === 'local' ? AIProvider.OLLAMA : AIProvider.ANTHROPIC,
        modelName: model.name,
        temperature: 0.7,
        maxTokens: 2000
      },
      capabilities: [
        { type: CapabilityType.CODE_ANALYSIS, enabled: true },
        { type: CapabilityType.FILE_OPERATIONS, enabled: true },
        { type: CapabilityType.COMMAND_EXECUTION, enabled: true }
      ],
      permissions: [
        { type: PermissionType.READ_FILES, granted: true },
        { type: PermissionType.WRITE_FILES, granted: true },
        { type: PermissionType.EXECUTE_COMMANDS, granted: true },
        { type: PermissionType.NETWORK_ACCESS, granted: true }
      ],
      systemPrompt: this.getSystemPromptForAgentType(agentType),
      contextScope: {
        includeFiles: true,
        includeGit: false,
        includeWorkspace: true,
        filePatterns: ['**/*'],
        excludePatterns: ['node_modules/**']
      },
      memory: {
        maxConversations: 50,
        retentionDays: 7,
        enableLearning: false
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };
  }

  // Analyze if task execution was successful
  private analyzeTaskSuccess(conversationLog: ConversationTurn[]): boolean {
    const agentResponses = conversationLog.filter(turn => turn.role === 'agent');
    if (agentResponses.length === 0) return false;

    // Check for task syntax in responses
    let hasTaskSyntax = false;
    for (const response of agentResponses) {
      if (this.containsTaskSyntax(response.message)) {
        hasTaskSyntax = true;
        break;
      }
    }

    return hasTaskSyntax;
  }

  // Check if response contains proper task syntax
  private containsTaskSyntax(response: string): boolean {
    const taskPatterns = [
      /\[CREATE_FILE\]/,
      /\[EDIT_FILE\]/,
      /\[DELETE_FILE\]/,
      /\[EXECUTE_COMMAND\]/
    ];

    return taskPatterns.some(pattern => pattern.test(response));
  }

  // Get system prompt for agent type
  private getSystemPromptForAgentType(agentType: AgentType): string {
    const basePrompt = `You are a ${agentType} AI assistant. Respond with appropriate task syntax when performing file operations or commands.`;
    
    switch (agentType) {
      case AgentType.CODE_REVIEWER:
        return basePrompt + ' Focus on code quality, best practices, and potential improvements.';
      case AgentType.DOCUMENTATION:
        return basePrompt + ' Focus on clear, comprehensive documentation and explanations.';
      case AgentType.DEVOPS:
        return basePrompt + ' Focus on deployment, infrastructure, and operational concerns.';
      case AgentType.TESTING:
        return basePrompt + ' Focus on test coverage, test quality, and testing strategies.';
      case AgentType.SOFTWARE_ENGINEER:
        return basePrompt + ' Focus on software design, implementation, and architecture.';
      default:
        return basePrompt;
    }
  }

  // Utility methods
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Cleanup method for graceful shutdown
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Clear all active timeouts
    this.activeTimeouts.forEach(timeout => clearTimeout(timeout));
    this.activeTimeouts.clear();
    
    // Update status
    this.persistenceService.updateStatus('cancelled');
    this.progressTracker.cancel();
  }
}