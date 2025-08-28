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
    
    // Configure more lenient emergency brake settings for evaluation contexts
    // AI models during evaluation might legitimately generate longer, more detailed responses
    this.agentService.configureEmergencyBrake({
      maxChunks: 3000, // Tripled from default 1000
      maxContentLength: 300000 // 300KB (tripled from 100KB default)
    });
    
    // @ts-ignore - services used for future extensibility
    this.modelDiscovery; this.scenarioService;
  }

  // Main evaluation method with fail-safe operation
  async evaluateModels(
    selectedModels: AvailableModel[],
    selectedScenarios: EvaluationScenario[]
  ): Promise<ModelEvaluationResult[]> {
    const results: ModelEvaluationResult[] = [];
    
    // Create evaluation session first
    this.persistenceService.createSession(selectedModels, selectedScenarios, this.configuration);
    
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
        // Generate final report
        await this.generateFinalReport(results);
        
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

        // Only mark as successful if at least some scenarios succeeded
        result.success = successfulScenarios > 0;
        result.scenarioResults = scenarioResults;
        // Calculate more detailed metrics
        const detailedMetrics = this.calculateDetailedMetrics(scenarioResults, scenarios);
        
        result.overallMetrics = {
          taskSuccessRate: overallSuccessRate,
          technicalAccuracy: detailedMetrics.technicalAccuracy,
          contextUnderstanding: detailedMetrics.contextUnderstanding,
          responseCompleteness: detailedMetrics.responseCompleteness,
          domainKnowledgeScore: detailedMetrics.domainKnowledgeScore,
          codeQualityScore: detailedMetrics.codeQualityScore,
          userSatisfactionScore: detailedMetrics.userSatisfactionScore,
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

    let timeoutId: NodeJS.Timeout | undefined;

    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          timeout = true;
          reject(new Error(`Scenario timeout after ${this.configuration.timeout}ms`));
        }, this.configuration.timeout);
        
        this.activeTimeouts.add(timeoutId);
      });

      // Create evaluation promise
      const evaluationPromise = this.runScenarioEvaluation(model, scenario, conversationLog);

      // Race between evaluation and timeout
      await Promise.race([evaluationPromise, timeoutPromise]);

      // Clean up timeout
      if (timeoutId) {
        this.activeTimeouts.delete(timeoutId);
        clearTimeout(timeoutId);
      }

      // If we reach here, evaluation completed successfully
      result.conversationLog = conversationLog;
      result.averageLatency = Date.now() - startTime;
      result.taskExecutionSuccess = this.analyzeTaskSuccess(conversationLog);
      result.successRate = result.taskExecutionSuccess ? 1.0 : 0.5;

    } catch (error) {
      // Clean up timeout in case of error
      if (timeoutId) {
        this.activeTimeouts.delete(timeoutId);
        clearTimeout(timeoutId);
      }

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
      
      // Update live preview with partial conversation even on error/timeout
      if (this.configuration.enableLivePreview && conversationLog.length > 0) {
        this.persistenceService.updateLivePreview(
          conversationLog, 
          `❌ ${errorMessage.includes('timeout') ? 'Timeout' : 'Error'}: ${errorMessage}`, 
          false
        );
      }
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
        // Construct full message including scenario context files
        let fullMessage = turn.message;
        
        // Include scenario context files in the first user message
        if (scenario.context?.files && conversationLog.filter(t => t.role === 'user').length === 0) {
          fullMessage += '\n\n' + scenario.context.files.map(file => 
            `**${file.name}:**\n\`\`\`javascript\n${file.content}\n\`\`\``
          ).join('\n\n');
        }
        
        // Add user message to log (with full context)
        const userTurn: ConversationTurn = {
          role: 'user',
          message: fullMessage,
          context: turn.context
        };
        conversationLog.push(userTurn);
        
        // Update live preview
        if (this.configuration.enableLivePreview) {
          this.persistenceService.updateLivePreview(conversationLog, '', false);
        }

        // Get agent response with timeout
        // const responseStartTime = Date.now();
        
        try {
          const response = await this.getAgentResponseWithTimeout(
            agentConfig,
            fullMessage,
            this.configuration.timeout, // Use full timeout per turn instead of distributing
            conversationLog
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
    timeoutMs: number,
    conversationLog: ConversationTurn[]
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      let response = '';
      let completed = false;
      let stallTimeoutId: NodeJS.Timeout | null = null;
      let lastChunkTime = Date.now();
      
      // FIXED: Use a much more lenient stall timeout that only triggers on actual stalls
      const STALL_TIMEOUT_MS = 60000; // 60 seconds between chunks (doubled)
      const MAX_RESPONSE_TIME_MS = Math.max(timeoutMs * 3, 180000); // 3x timeout or 3 minutes, whichever is larger
      
      console.log(`🕒 Response timeout settings for ${agentConfig.model.modelName}:`, {
        stallTimeout: STALL_TIMEOUT_MS + 'ms',
        maxResponseTime: MAX_RESPONSE_TIME_MS + 'ms',
        configuredTimeout: timeoutMs + 'ms'
      });
      
      const resetStallTimeout = () => {
        lastChunkTime = Date.now();
        
        if (stallTimeoutId) {
          clearTimeout(stallTimeoutId);
          this.activeTimeouts.delete(stallTimeoutId);
        }
        
        stallTimeoutId = setTimeout(() => {
          if (!completed) {
            const timeSinceLastChunk = Date.now() - lastChunkTime;
            console.warn(`⏰ Model ${agentConfig.model.modelName} stalled - no chunks for ${timeSinceLastChunk}ms`);
            completed = true;
            reject(new Error(`Model stalled - no response chunks for ${STALL_TIMEOUT_MS}ms`));
          }
        }, STALL_TIMEOUT_MS);
        
        this.activeTimeouts.add(stallTimeoutId);
      };
      
      // Set maximum response timeout (only as safety net for extremely long responses)
      const maxTimeoutId = setTimeout(() => {
        if (!completed) {
          completed = true;
          if (stallTimeoutId) {
            clearTimeout(stallTimeoutId);
            this.activeTimeouts.delete(stallTimeoutId);
          }
          console.warn(`⏰ Model ${agentConfig.model.modelName} exceeded maximum response time of ${MAX_RESPONSE_TIME_MS}ms`);
          reject(new Error(`Maximum response time exceeded (${MAX_RESPONSE_TIME_MS}ms)`));
        }
      }, MAX_RESPONSE_TIME_MS);
      
      this.activeTimeouts.add(maxTimeoutId);
      
      // Set initial stall timeout
      resetStallTimeout();

      // Call AI provider directly for clean evaluation (bypass AgentService prompt pollution)
      this.generateCleanEvaluationResponse(
        agentConfig,
        message,
        (chunk: string, done: boolean) => {
          if (completed) return;
          
          // Reset stall timeout on each chunk - model is actively responding
          resetStallTimeout();
          
          response += chunk;
          
          // Update live preview with streaming response
          if (this.configuration.enableLivePreview) {
            this.persistenceService.updateLivePreview(
              conversationLog,
              response,
              !done // isStreaming
            );
          }
          
          if (done && !completed) {
            completed = true;
            if (stallTimeoutId) {
              clearTimeout(stallTimeoutId);
              this.activeTimeouts.delete(stallTimeoutId);
            }
            clearTimeout(maxTimeoutId);
            this.activeTimeouts.delete(maxTimeoutId);
            resolve(response);
          }
        },
        conversationLog // Pass conversation history for context
      ).catch((error) => {
        if (!completed) {
          completed = true;
          if (stallTimeoutId) {
            clearTimeout(stallTimeoutId);
            this.activeTimeouts.delete(stallTimeoutId);
          }
          clearTimeout(maxTimeoutId);
          this.activeTimeouts.delete(maxTimeoutId);
          reject(error);
        }
      });
    });
  }

  // Generate clean evaluation response bypassing AgentService prompt pollution
  private async generateCleanEvaluationResponse(
    agentConfig: AgentConfig,
    userMessage: string,
    onChunk: (chunk: string, done: boolean) => void,
    conversationLog?: ConversationTurn[]
  ): Promise<void> {
    const { AIProviderManager } = await import('../providers/AIProviderManager');
    const providerManager = new AIProviderManager();
    
    // Create clean message array with FULL conversation context
    const cleanSystemPrompt = this.getSystemPromptForAgentType(agentConfig.type);
    const messages: Array<{role: 'system' | 'user' | 'assistant', content: string}> = [
      {
        role: 'system',
        content: cleanSystemPrompt
      }
    ];

    // Add ALL previous conversation history to maintain context
    if (conversationLog) {
      for (const turn of conversationLog) {
        messages.push({
          role: turn.role === 'user' ? 'user' : 'assistant',
          content: turn.message
        });
      }
    }

    // Add the current user message
    messages.push({
      role: 'user',
      content: userMessage
    });

    // Generate response with clean prompts
    await providerManager.generateStreamingResponse(
      messages,
      agentConfig.model,
      (streamingResponse) => {
        // Convert StreamingResponse to the expected callback format
        onChunk(streamingResponse.content, streamingResponse.done);
      }
    );
  }

  // Check if a local model is available and responding
  private async checkModelAvailability(model: AvailableModel): Promise<boolean> {
    if (model.type !== 'local') return true; // Assume online models are available

    // Import debugLogger since it's not available in this context
    const { debugLogger } = await import('../utils/logger');
    
    try {
      debugLogger.log(`Testing availability for model: ${model.name} (${model.id})`);
      
      // First try a simple ollama command to check if the model exists
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      try {
        const { stdout } = await execAsync(`ollama show ${model.name}`, { timeout: 3000 });
        if (stdout.includes('Model')) {
          debugLogger.log(`Model ${model.name} exists in Ollama`);
        } else {
          debugLogger.log(`Model ${model.name} not found in Ollama`);
          return false;
        }
      } catch (cmdError) {
        debugLogger.log(`Ollama show command failed for ${model.name}: ${cmdError}`);
        return false;
      }
      
      // Simplified availability check - just verify Ollama is running
      // The previous complex streaming test was causing connection issues
      debugLogger.log(`Simplified availability check for ${model.name}`);
      
      try {
        const ollamaProvider = new (await import('../providers/OllamaProvider')).OllamaProvider();
        const isOnline = await ollamaProvider.isAvailable();
        if (!isOnline) {
          debugLogger.log(`❌ Ollama service not available`);
          return false;
        }
        debugLogger.log(`✅ Model ${model.name} is available (Ollama running + model exists)`);
        return true;
      } catch (error) {
        debugLogger.log(`❌ Ollama availability check failed for ${model.name}: ${error}`);
        return false;
      }
    } catch (error) {
      debugLogger.log(`Model ${model.name} availability check failed: ${error}`);
      console.error(`Model ${model.name} availability check failed:`, error);
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
        // NOTE: EXECUTE_COMMANDS disabled during evaluation for safety
        { type: PermissionType.EXECUTE_COMMANDS, granted: false },
        { type: PermissionType.NETWORK_ACCESS, granted: false }  // Also disable network access for security
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

    // Check for task syntax in responses (strict evaluation)
    let hasTaskSyntax = false;
    for (const response of agentResponses) {
      if (this.containsTaskSyntax(response.message)) {
        hasTaskSyntax = true;
        break;
      }
    }

    // If no task syntax found, check for meaningful response (more lenient evaluation)
    if (!hasTaskSyntax) {
      // Check if responses are substantive (not just errors or empty)
      const substantiveResponses = agentResponses.filter(response => 
        response.message.length > 10 && 
        !response.message.toLowerCase().includes('error') &&
        !response.message.toLowerCase().includes('failed') &&
        response.message.trim() !== ''
      );
      
      // Consider it partially successful if we got meaningful responses
      return substantiveResponses.length > 0;
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

  // Calculate detailed metrics based on scenario results
  private calculateDetailedMetrics(scenarioResults: ScenarioResult[], scenarios: EvaluationScenario[]): {
    technicalAccuracy: number;
    contextUnderstanding: number;
    responseCompleteness: number;
    domainKnowledgeScore: number;
    codeQualityScore: number;
    userSatisfactionScore: number;
  } {
    let totalTechnicalAccuracy = 0;
    let totalContextUnderstanding = 0;
    let totalResponseCompleteness = 0;
    let totalDomainKnowledge = 0;
    let totalCodeQuality = 0;
    let totalUserSatisfaction = 0;

    for (let i = 0; i < scenarioResults.length; i++) {
      const result = scenarioResults[i];
      const scenario = scenarios[i];
      
      // Technical Accuracy: Based on task success and response quality
      let technicalAccuracy = 0;
      if (result.taskExecutionSuccess) {
        technicalAccuracy = 0.8; // High score for task syntax
      } else if (result.conversationLog.some(turn => turn.role === 'agent' && turn.message.length > 20)) {
        technicalAccuracy = 0.4; // Moderate score for substantial response
      }
      
      // Context Understanding: Based on response relevance to scenario
      let contextUnderstanding = 0;
      const agentResponses = result.conversationLog.filter(turn => turn.role === 'agent');
      if (agentResponses.length > 0) {
        const hasRelevantKeywords = agentResponses.some(response => {
          const lowerResponse = response.message.toLowerCase();
          const scenarioName = scenario.name.toLowerCase();
          
          // Check if response mentions scenario-relevant terms
          if (scenarioName.includes('security') && (lowerResponse.includes('security') || lowerResponse.includes('vulnerability'))) return true;
          if (scenarioName.includes('performance') && (lowerResponse.includes('performance') || lowerResponse.includes('optimization'))) return true;
          if (scenarioName.includes('documentation') && (lowerResponse.includes('document') || lowerResponse.includes('comment'))) return true;
          
          return lowerResponse.length > 50; // Default to moderate score for substantial responses
        });
        
        contextUnderstanding = hasRelevantKeywords ? 0.7 : 0.3;
      }
      
      // Response Completeness: Based on response length and structure
      let responseCompleteness = 0;
      const totalResponseLength = agentResponses.reduce((sum, turn) => sum + turn.message.length, 0);
      if (totalResponseLength > 100) responseCompleteness = 0.8;
      else if (totalResponseLength > 20) responseCompleteness = 0.5;
      else if (totalResponseLength > 0) responseCompleteness = 0.2;
      
      // Domain Knowledge: Based on use of technical terms and concepts
      let domainKnowledge = 0;
      const technicalTerms = ['function', 'class', 'method', 'variable', 'error', 'code', 'file', 'system'];
      const hasTechnicalTerms = agentResponses.some(response => 
        technicalTerms.some(term => response.message.toLowerCase().includes(term))
      );
      domainKnowledge = hasTechnicalTerms ? 0.6 : 0.2;
      
      // Code Quality: Based on structured output and clarity
      let codeQuality = 0;
      const hasStructuredOutput = agentResponses.some(response => 
        response.message.includes('\n') || response.message.includes('```') || this.containsTaskSyntax(response.message)
      );
      codeQuality = hasStructuredOutput ? 0.7 : 0.3;
      
      // User Satisfaction: Composite score based on above metrics
      const userSatisfaction = (technicalAccuracy + contextUnderstanding + responseCompleteness) / 3;
      
      totalTechnicalAccuracy += technicalAccuracy;
      totalContextUnderstanding += contextUnderstanding;
      totalResponseCompleteness += responseCompleteness;
      totalDomainKnowledge += domainKnowledge;
      totalCodeQuality += codeQuality;
      totalUserSatisfaction += userSatisfaction;
    }

    const scenarioCount = scenarioResults.length;
    return {
      technicalAccuracy: totalTechnicalAccuracy / scenarioCount,
      contextUnderstanding: totalContextUnderstanding / scenarioCount,
      responseCompleteness: totalResponseCompleteness / scenarioCount,
      domainKnowledgeScore: totalDomainKnowledge / scenarioCount,
      codeQualityScore: totalCodeQuality / scenarioCount,
      userSatisfactionScore: totalUserSatisfaction / scenarioCount
    };
  }

  // Get system prompt for agent type (identical for all models for fair evaluation)
  private getSystemPromptForAgentType(agentType: AgentType): string {
    const baseInstructions = `
🚨 EXECUTE TASKS IMMEDIATELY - START WITH ACTION SYNTAX!

TASK EXECUTION FORMAT:
[CREATE_FILE: filename.ext]
your content here
[/CREATE_FILE]

CRITICAL RULES:
- START your response immediately with [CREATE_FILE: or [EDIT_FILE:
- NO explanations before task execution
- NO conversational text
- NO examples or demonstrations
- EXECUTE the requested task directly`;

    let basePrompt: string;
    
    switch (agentType) {
      case AgentType.CODE_REVIEWER:
        basePrompt = `You are a CODE REVIEWER AI assistant specializing in security, performance, and code quality analysis.
${baseInstructions}

Your specific focus:
- Identify security vulnerabilities (SQL injection, XSS, etc.)
- Suggest performance optimizations  
- Recommend code quality improvements
- Create analysis reports and secure code implementations
- Follow security best practices (OWASP guidelines)`;
        break;

      case AgentType.DOCUMENTATION:
        basePrompt = `You are a DOCUMENTATION AI assistant specializing in creating clear, comprehensive technical documentation.
${baseInstructions}

Your specific focus:
- Create README files, API documentation, and user guides
- Include installation instructions and usage examples
- Provide troubleshooting sections
- Use clear formatting with headings and code examples`;
        break;

      case AgentType.DEVOPS:
        basePrompt = `You are a DEVOPS AI assistant specializing in deployment, infrastructure, and operational tasks.
${baseInstructions}

Your specific focus:
- Create deployment scripts and configuration files
- Set up CI/CD pipelines
- Infrastructure as code
- Monitoring and logging setup`;
        break;

      case AgentType.TESTING:
        basePrompt = `You are a TESTING AI assistant specializing in test creation and quality assurance.
${baseInstructions}

Your specific focus:
- Create unit tests, integration tests, and test suites
- Ensure comprehensive test coverage
- Write clear test documentation
- Identify edge cases and test scenarios`;
        break;

      case AgentType.SOFTWARE_ENGINEER:
        basePrompt = `You are a SOFTWARE ENGINEER AI assistant specializing in software design and implementation.
${baseInstructions}

Your specific focus:
- Design and implement software solutions
- Create well-structured, maintainable code
- Follow architectural best practices
- Create technical specifications and implementation guides`;
        break;

      default:
        basePrompt = `You are an AI assistant. ${baseInstructions}`;
        break;
    }
    
    return basePrompt;
  }

  // Utility methods
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Generate final evaluation report
  private async generateFinalReport(results: ModelEvaluationResult[]): Promise<void> {
    const { debugLogger } = await import('../utils/logger');
    
    try {
      debugLogger.log('Generating final evaluation report');
      
      // Calculate summary statistics
      const totalModels = results.length;
      const successfulModels = results.filter(r => r.success).length;
      const failedModels = results.filter(r => !r.success && !r.skipped).length;
      const skippedModels = results.filter(r => r.skipped).length;
      
      const report = {
        timestamp: new Date().toISOString(),
        summary: {
          totalModels,
          successfulModels,
          failedModels,
          skippedModels,
          successRate: totalModels > 0 ? (successfulModels / totalModels * 100).toFixed(1) + '%' : '0%'
        },
        modelResults: results.map(result => ({
          modelId: result.modelId,
          modelName: result.modelName,
          success: result.success,
          skipped: result.skipped,
          skipReason: result.skipReason,
          error: result.error,
          totalDuration: result.totalDuration,
          retryCount: result.retryCount,
          scenarioCount: result.scenarioResults.length,
          overallMetrics: result.overallMetrics
        })),
        configuration: this.configuration
      };

      // Save report to session directory
      const sessionOutputDir = this.persistenceService.getSessionOutputDirectory();
      const reportFile = require('path').join(sessionOutputDir, 'evaluation_report.json');
      require('fs').writeFileSync(reportFile, JSON.stringify(report, null, 2));
      
      debugLogger.log(`Final evaluation report saved to: ${reportFile}`);
      
      // Update progress with report location - show user-friendly path
      const relativePath = require('path').relative(this.configuration.outputDirectory, reportFile);
      this.progressTracker.updateOutput(`📄 Report: ${relativePath}`);
      
      // Also create a simple text summary
      const summaryLines = [
        '=== AI Model Evaluation Report ===',
        `Generated: ${new Date().toLocaleString()}`,
        '',
        'SUMMARY:',
        `• Total Models Evaluated: ${totalModels}`,
        `• Successful: ${successfulModels}`,
        `• Failed: ${failedModels}`,
        `• Skipped: ${skippedModels}`,
        `• Success Rate: ${report.summary.successRate}`,
        '',
        'MODEL DETAILS:'
      ];
      
      results.forEach(result => {
        summaryLines.push(`• ${result.modelName}: ${result.success ? 'SUCCESS' : result.skipped ? 'SKIPPED' : 'FAILED'}`);
        if (result.skipReason) summaryLines.push(`  Reason: ${result.skipReason}`);
        if (result.error) summaryLines.push(`  Error: ${result.error}`);
      });
      
      const summaryFile = require('path').join(sessionOutputDir, 'evaluation_summary.txt');
      require('fs').writeFileSync(summaryFile, summaryLines.join('\n'));
      
      debugLogger.log(`Evaluation summary saved to: ${summaryFile}`);
      
      // Update progress with summary location - show user-friendly path
      const relativeSummaryPath = require('path').relative(this.configuration.outputDirectory, summaryFile);
      this.progressTracker.updateOutput(`📋 Summary: ${relativeSummaryPath}`);
      
      // Generate judge prompt for LLM analysis
      const judgePromptFile = this.generateJudgePrompt(report, sessionOutputDir);
      const relativeJudgePromptPath = require('path').relative(this.configuration.outputDirectory, judgePromptFile);
      this.progressTracker.updateOutput(`⚖️ Judge Prompt: ${relativeJudgePromptPath}`);
      
    } catch (error) {
      debugLogger.log('Failed to generate final report:', error);
      console.error('Failed to generate final report:', error);
    }
  }

  // Generate judge prompt for LLM analysis
  private generateJudgePrompt(report: any, outputDirectory: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const judgePromptFile = require('path').join(outputDirectory, `judge_analysis_prompt_${timestamp}.md`);
    
    // Calculate summary statistics
    const totalModels = report.summary.totalModels;
    const successfulModels = report.summary.successfulModels;
    const successRate = report.summary.successRate;
    
    // Create detailed model analysis
    const modelAnalysis = report.modelResults.map((result: any) => {
      if (result.skipped) {
        return `### ${result.modelName}
- **Status**: SKIPPED (${result.skipReason})
- **Duration**: ${(result.totalDuration / 1000).toFixed(1)}s`;
      }
      
      const metrics = result.overallMetrics;
      return `### ${result.modelName}
- **Status**: ${result.success ? 'SUCCESS' : 'FAILED'}
- **Overall Performance**: ${result.success ? 'Completed evaluation' : 'Failed to complete'}
- **Duration**: ${(result.totalDuration / 1000).toFixed(1)}s
- **Scenarios Tested**: ${result.scenarioCount}
- **Task Success Rate**: ${(metrics.taskSuccessRate * 100).toFixed(1)}%
- **Technical Accuracy**: ${(metrics.technicalAccuracy * 100).toFixed(1)}%
- **Context Understanding**: ${(metrics.contextUnderstanding * 100).toFixed(1)}%
- **Response Completeness**: ${(metrics.responseCompleteness * 100).toFixed(1)}%
- **Domain Knowledge**: ${(metrics.domainKnowledgeScore * 100).toFixed(1)}%
- **Code Quality**: ${(metrics.codeQualityScore * 100).toFixed(1)}%
- **User Satisfaction**: ${(metrics.userSatisfactionScore * 100).toFixed(1)}%
- **Avg Response Time**: ${metrics.responseLatency.toFixed(0)}ms`;
    }).join('\n\n');

    const judgePrompt = `# AI Model Evaluation Analysis Prompt

## Your Task
You are an expert AI model evaluator. Analyze the following evaluation results and provide comprehensive insights, recommendations, and comparative analysis.

## Evaluation Overview
- **Date**: ${new Date().toLocaleDateString()}
- **Total Models Evaluated**: ${totalModels}
- **Successful Models**: ${successfulModels}
- **Overall Success Rate**: ${successRate}
- **Evaluation Configuration**: 
  - Timeout: ${this.configuration.timeout / 1000}s per turn
  - Max Retries: ${this.configuration.maxRetries}
  - Include Online Models: ${this.configuration.includeOnlineModels}

## Model Performance Results

${modelAnalysis}

## Analysis Questions
Please provide detailed analysis for the following:

### 1. Overall Performance Assessment
- Which models performed best and why?
- What patterns do you see in the success/failure rates?
- Are there clear performance tiers among the models?

### 2. Technical Analysis
- Which models showed the strongest technical accuracy?
- How did context understanding vary between models?
- Which models produced the most complete responses?

### 3. Failure Analysis
- What were the common failure modes?
- Which models were skipped and why?
- Are there patterns in timeout/availability issues?

### 4. Domain Expertise Evaluation
- Which models demonstrated the best domain knowledge?
- How did code quality scores compare?
- Which models would be best for specific use cases?

### 5. Performance vs. Efficiency
- Which models provided the best balance of accuracy and speed?
- Are there models that are fast but inaccurate, or slow but thorough?

### 6. Recommendations
- Which models would you recommend for production use?
- What specific use cases would each successful model be best for?
- What improvements could be made to the evaluation process?

## Raw Data
\`\`\`json
${JSON.stringify(report, null, 2)}
\`\`\`

---
*Generated by Enhanced Model Evaluation Engine*
*Timestamp: ${new Date().toISOString()}*
`;

    require('fs').writeFileSync(judgePromptFile, judgePrompt);
    return judgePromptFile;
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