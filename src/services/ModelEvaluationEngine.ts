import * as fs from 'fs';
import * as path from 'path';
import { AgentService } from '@/agents/AgentService';
import { AgentConfig, AgentType, AIProvider, PermissionType } from '@/shared/types';
import { ModelDiscoveryService, AvailableModel } from './ModelDiscoveryService';
import { EvaluationScenarioService, EvaluationScenario, ConversationTurn } from './EvaluationScenarioService';

// Re-export for other services
export { AvailableModel } from './ModelDiscoveryService';

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  agentType: AgentType;
  successRate: number;
  averageLatency: number;
  taskExecutionSuccess: boolean;
  errors: string[];
  conversationLog: ConversationTurn[];
}

export interface EvaluationResult {
  modelId: string;
  modelName: string;
  overallMetrics: {
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
}

export interface ModelPerformanceMetrics {
  modelId: string;
  scenarioId: string;
  agentType: AgentType;
  
  // Timing metrics
  totalDuration: number; // milliseconds
  averageResponseTime: number; // milliseconds per turn
  firstResponseTime: number; // time to first response
  
  // Task execution metrics  
  tasksAttempted: number;
  tasksSuccessful: number;
  taskSuccessRate: number;
  syntaxErrorCount: number;
  fileOperationsSuccessful: number;
  
  // Response quality metrics
  responseLength: number; // average response length
  responseCompleteness: number; // 0-1 scale
  contextUnderstanding: number; // 0-1 scale (manual or AI-judged)
  technicalAccuracy: number; // 0-1 scale
  helpfulness: number; // 0-1 scale
  
  // Conversation flow metrics
  conversationTurns: number;
  conversationFlowScore: number; // 0-1 scale
  userSatisfactionEstimate: number; // 0-1 scale
  
  // Domain expertise metrics
  domainKnowledgeScore: number; // 0-1 scale
  bestPracticesFollowed: number; // 0-1 scale
  codeQuality: number; // 0-1 scale (for coding scenarios)
  
  // Error and reliability metrics
  errorCount: number;
  crashCount: number;
  timeoutCount: number;
  recoveryFromErrors: number; // 0-1 scale
  
  // Raw data
  fullConversation: ConversationTurn[];
  generatedFiles: Array<{ name: string; content: string }>;
  errors: string[];
  warnings: string[];
}

export interface EvaluationReport {
  timestamp: string;
  duration: number; // total evaluation time
  modelsEvaluated: string[];
  scenariosRun: string[];
  
  // Overall statistics
  totalTests: number;
  successfulTests: number;
  failedTests: number;
  
  // Per-model results
  modelResults: Map<string, ModelPerformanceMetrics[]>;
  
  // Per-scenario results
  scenarioResults: Map<string, ModelPerformanceMetrics[]>;
  
  // Cross-analysis
  bestModelPerScenario: Map<string, string>;
  bestModelOverall: string;
  recommendationMatrix: Map<AgentType, string[]>; // ordered by preference
  
  // Detailed findings
  strengths: Map<string, string[]>; // model -> strengths
  weaknesses: Map<string, string[]>; // model -> weaknesses  
  surprisingResults: string[];
  
  // Raw metrics for external analysis
  rawMetrics: ModelPerformanceMetrics[];
}

export class ModelEvaluationEngine {
  private agentService: AgentService;
  private modelDiscovery: ModelDiscoveryService;
  private scenarioService: EvaluationScenarioService;
  private evaluationResults: ModelPerformanceMetrics[] = [];
  
  constructor() {
    this.agentService = new AgentService();
    this.modelDiscovery = new ModelDiscoveryService();
    this.scenarioService = new EvaluationScenarioService();
  }

  /**
   * Evaluate a single model against scenarios and return results in format expected by report service
   */
  async evaluateModel(model: AvailableModel, scenarios: EvaluationScenario[]): Promise<EvaluationResult> {
    console.log(`🧪 Testing ${model.name} against ${scenarios.length} scenarios...`);
    
    const scenarioResults: ScenarioResult[] = [];
    const rawMetrics: ModelPerformanceMetrics[] = [];
    let totalDuration = 0;
    
    // Run each scenario
    for (let i = 0; i < scenarios.length; i++) {
      const scenario = scenarios[i];
      console.log(`   📋 Running scenario ${i + 1}/${scenarios.length}: ${scenario.name}`);
      
      try {
        const metrics = await this.runSingleEvaluation(model, scenario);
        rawMetrics.push(metrics);
        totalDuration += metrics.totalDuration;
        
        // Convert to ScenarioResult format
        const scenarioResult: ScenarioResult = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          agentType: scenario.agentType,
          successRate: metrics.taskSuccessRate,
          averageLatency: metrics.averageResponseTime,
          taskExecutionSuccess: metrics.taskSuccessRate > 0.5,
          errors: metrics.errors,
          conversationLog: metrics.fullConversation
        };
        scenarioResults.push(scenarioResult);
        
        console.log(`      ✅ Success rate: ${(metrics.taskSuccessRate * 100).toFixed(1)}%`);
      } catch (error) {
        console.error(`      ❌ Scenario failed: ${error instanceof Error ? error.message : String(error)}`);
        
        // Add failed scenario result
        const failedResult: ScenarioResult = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          agentType: scenario.agentType,
          successRate: 0,
          averageLatency: 0,
          taskExecutionSuccess: false,
          errors: [error instanceof Error ? error.message : String(error)],
          conversationLog: []
        };
        scenarioResults.push(failedResult);
      }
      
      // Small delay between scenarios
      await this.delay(1000);
    }
    
    // Calculate overall metrics from raw metrics
    const overallMetrics = this.calculateOverallMetricsFromRaw(rawMetrics);
    
    return {
      modelId: model.id,
      modelName: model.name,
      overallMetrics,
      scenarioResults,
      totalDuration
    };
  }

  /**
   * Calculate overall metrics from raw performance metrics
   */
  private calculateOverallMetricsFromRaw(rawMetrics: ModelPerformanceMetrics[]) {
    if (rawMetrics.length === 0) {
      return {
        taskSuccessRate: 0,
        technicalAccuracy: 0,
        contextUnderstanding: 0,
        responseCompleteness: 0,
        domainKnowledgeScore: 0,
        codeQualityScore: 0,
        userSatisfactionScore: 0,
        responseLatency: 0,
      };
    }
    
    const sum = rawMetrics.reduce((acc, metrics) => ({
      taskSuccessRate: acc.taskSuccessRate + metrics.taskSuccessRate,
      technicalAccuracy: acc.technicalAccuracy + metrics.technicalAccuracy,
      contextUnderstanding: acc.contextUnderstanding + metrics.contextUnderstanding,
      responseCompleteness: acc.responseCompleteness + metrics.responseCompleteness,
      domainKnowledgeScore: acc.domainKnowledgeScore + metrics.domainKnowledgeScore,
      codeQualityScore: acc.codeQualityScore + metrics.codeQuality,
      userSatisfactionScore: acc.userSatisfactionScore + metrics.userSatisfactionEstimate,
      responseLatency: acc.responseLatency + metrics.averageResponseTime,
    }), {
      taskSuccessRate: 0,
      technicalAccuracy: 0,
      contextUnderstanding: 0,
      responseCompleteness: 0,
      domainKnowledgeScore: 0,
      codeQualityScore: 0,
      userSatisfactionScore: 0,
      responseLatency: 0,
    });
    
    const count = rawMetrics.length;
    return {
      taskSuccessRate: sum.taskSuccessRate / count,
      technicalAccuracy: sum.technicalAccuracy / count,
      contextUnderstanding: sum.contextUnderstanding / count,
      responseCompleteness: sum.responseCompleteness / count,
      domainKnowledgeScore: sum.domainKnowledgeScore / count,
      codeQualityScore: sum.codeQualityScore / count,
      userSatisfactionScore: sum.userSatisfactionScore / count,
      responseLatency: sum.responseLatency / count,
    };
  }
  
  /**
   * Run comprehensive evaluation against all available local models
   */
  async runLocalModelEvaluation(): Promise<EvaluationReport> {
    const startTime = Date.now();
    
    console.log('🚀 Starting comprehensive local model evaluation...');
    
    // Discover available models
    const availableModels = await this.modelDiscovery.discoverLocalModels();
    const scenarios = this.scenarioService.getAllScenarios();
    
    console.log(`📊 Found ${availableModels.length} models and ${scenarios.length} scenarios`);
    console.log('Models:', availableModels.map(m => m.name).join(', '));
    console.log('Scenarios:', scenarios.map(s => s.name).join(', '));
    
    this.evaluationResults = [];
    
    // Run each scenario against each model
    for (const model of availableModels) {
      console.log(`\n🤖 Testing model: ${model.name} (${model.size})`);
      
      for (const scenario of scenarios) {
        console.log(`  📝 Running scenario: ${scenario.name} (${scenario.difficulty})`);
        
        try {
          const metrics = await this.runSingleEvaluation(model, scenario);
          this.evaluationResults.push(metrics);
          
          console.log(`  ✅ Completed - Success rate: ${(metrics.taskSuccessRate * 100).toFixed(1)}%`);
        } catch (error) {
          console.error(`  ❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          
          // Create failed metrics entry
          const failedMetrics: ModelPerformanceMetrics = {
            modelId: `ollama:${model.name}`,
            scenarioId: scenario.id,
            agentType: scenario.agentType,
            totalDuration: 0,
            averageResponseTime: 0,
            firstResponseTime: 0,
            tasksAttempted: 0,
            tasksSuccessful: 0,
            taskSuccessRate: 0,
            syntaxErrorCount: 0,
            fileOperationsSuccessful: 0,
            responseLength: 0,
            responseCompleteness: 0,
            contextUnderstanding: 0,
            technicalAccuracy: 0,
            helpfulness: 0,
            conversationTurns: 0,
            conversationFlowScore: 0,
            userSatisfactionEstimate: 0,
            domainKnowledgeScore: 0,
            bestPracticesFollowed: 0,
            codeQuality: 0,
            errorCount: 1,
            crashCount: 1,
            timeoutCount: 0,
            recoveryFromErrors: 0,
            fullConversation: [],
            generatedFiles: [],
            errors: [error instanceof Error ? error.message : 'Unknown error'],
            warnings: []
          };
          
          this.evaluationResults.push(failedMetrics);
        }
        
        // Small delay between tests to avoid overwhelming the system
        await this.delay(2000);
      }
      
      // Longer delay between models
      await this.delay(5000);
    }
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`\n🎉 Evaluation completed in ${(duration / 1000 / 60).toFixed(2)} minutes`);
    
    // Generate comprehensive report
    const report = this.generateEvaluationReport(duration, availableModels.map(m => `ollama:${m.name}`), scenarios.map(s => s.id));
    
    return report;
  }
  
  /**
   * Run a single evaluation scenario against a specific model
   */
  private async runSingleEvaluation(model: any, scenario: EvaluationScenario): Promise<ModelPerformanceMetrics> {
    const startTime = Date.now();
    const conversationLog: ConversationTurn[] = [];
    const generatedFiles: Array<{ name: string; content: string }> = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    
    let tasksAttempted = 0;
    let tasksSuccessful = 0;
    let syntaxErrorCount = 0;
    let fileOperationsSuccessful = 0;
    let responseTimes: number[] = [];
    let totalResponseLength = 0;
    
    // Create agent configuration for this test
    const agentConfig: AgentConfig = this.createTestAgentConfig(scenario.agentType, model);
    
    try {
      // Initialize agent service
      await this.agentService.initialize();
      
      // Create temporary workspace for this test
      const workspace = await this.createTemporaryWorkspace();
      
      // Setup context files if provided
      if (scenario.context.files) {
        for (const file of scenario.context.files) {
          const filePath = path.join(workspace, file.name);
          await fs.promises.writeFile(filePath, file.content);
        }
      }
      
      // Run conversation
      for (let i = 0; i < scenario.conversation.length; i++) {
        const turn = scenario.conversation[i];
        
        if (turn.role === 'user') {
          conversationLog.push({ ...turn, message: turn.message });
          
          // Send message to agent
          const turnStartTime = Date.now();
          let response = '';
          
          await this.agentService.processMessage(
            agentConfig,
            turn.message,
            (chunk: string, done: boolean) => {
              response += chunk;
              if (done) {
                const turnEndTime = Date.now();
                const responseTime = turnEndTime - turnStartTime;
                responseTimes.push(responseTime);
                totalResponseLength += response.length;
                
                // Log agent response
                conversationLog.push({
                  role: 'agent',
                  message: response
                });
                
                // Analyze response for task execution
                const taskAnalysis = this.analyzeTaskExecution(response, turn.expectedTaskTypes || [], turn.expectedFileOperations || []);
                tasksAttempted += taskAnalysis.tasksAttempted;
                tasksSuccessful += taskAnalysis.tasksSuccessful;
                syntaxErrorCount += taskAnalysis.syntaxErrors;
                fileOperationsSuccessful += taskAnalysis.fileOperationsSuccessful;
                
                // Check for generated files
                this.captureGeneratedFiles(workspace, generatedFiles);
              }
            }
          );
          
          // Small delay between turns
          await this.delay(1000);
        }
      }
      
      // Clean up workspace
      await this.cleanupWorkspace(workspace);
      
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
    
    const endTime = Date.now();
    const totalDuration = endTime - startTime;
    const averageResponseTime = responseTimes.length > 0 ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;
    const firstResponseTime = responseTimes.length > 0 ? responseTimes[0] : 0;
    
    // Calculate derived metrics
    const taskSuccessRate = tasksAttempted > 0 ? tasksSuccessful / tasksAttempted : 0;
    const averageResponseLength = conversationLog.filter(t => t.role === 'agent').length > 0 
      ? totalResponseLength / conversationLog.filter(t => t.role === 'agent').length : 0;
    
    // Quality metrics (simplified - in a real system these would be more sophisticated)
    const responseCompleteness = this.assessResponseCompleteness(conversationLog, scenario);
    const contextUnderstanding = this.assessContextUnderstanding(conversationLog, scenario);
    const technicalAccuracy = this.assessTechnicalAccuracy(conversationLog, scenario);
    const helpfulness = this.assessHelpfulness(conversationLog, scenario);
    const conversationFlowScore = this.assessConversationFlow(conversationLog);
    const domainKnowledgeScore = this.assessDomainKnowledge(conversationLog, scenario);
    const bestPracticesFollowed = this.assessBestPractices(conversationLog, scenario);
    const codeQuality = this.assessCodeQuality(generatedFiles, scenario);
    
    return {
      modelId: `ollama:${model.name}`,
      scenarioId: scenario.id,
      agentType: scenario.agentType,
      totalDuration,
      averageResponseTime,
      firstResponseTime,
      tasksAttempted,
      tasksSuccessful,
      taskSuccessRate,
      syntaxErrorCount,
      fileOperationsSuccessful,
      responseLength: averageResponseLength,
      responseCompleteness,
      contextUnderstanding,
      technicalAccuracy,
      helpfulness,
      conversationTurns: conversationLog.length,
      conversationFlowScore,
      userSatisfactionEstimate: (helpfulness + contextUnderstanding + responseCompleteness) / 3,
      domainKnowledgeScore,
      bestPracticesFollowed,
      codeQuality,
      errorCount: errors.length,
      crashCount: errors.filter(e => e.includes('crash') || e.includes('fatal')).length,
      timeoutCount: errors.filter(e => e.includes('timeout')).length,
      recoveryFromErrors: errors.length > 0 ? Math.max(0, 1 - (errors.length / conversationLog.length)) : 1,
      fullConversation: conversationLog,
      generatedFiles,
      errors,
      warnings
    };
  }
  
  /**
   * Create test agent configuration
   */
  private createTestAgentConfig(agentType: AgentType, model: any): AgentConfig {
    return {
      id: `test-agent-${Date.now()}`,
      name: `Test ${agentType} Agent`,
      avatar: '🤖',
      type: agentType,
      model: {
        provider: AIProvider.OLLAMA,
        modelName: model.name,
        temperature: 0.7,
        maxTokens: 2000
      },
      systemPrompt: this.getSystemPromptForAgentType(agentType),
      capabilities: [],
      permissions: [
        { type: PermissionType.READ_FILES, granted: true },
        { type: PermissionType.WRITE_FILES, granted: true },
        { type: PermissionType.EXECUTE_COMMANDS, granted: true },
        { type: PermissionType.GIT_OPERATIONS, granted: true }
      ],
      contextScope: {
        includeFiles: true,
        includeGit: true,
        includeWorkspace: true,
        filePatterns: ['**/*'],
        excludePatterns: ['node_modules/**', '.git/**']
      },
      memory: {
        maxConversations: 100,
        retentionDays: 30,
        enableLearning: true
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };
  }
  
  /**
   * Get appropriate system prompt for agent type
   */
  private getSystemPromptForAgentType(agentType: AgentType): string {
    const basePrompt = `You are an autonomous AI agent specialized in ${agentType.replace('_', ' ')}. Your role is to:

- PERFORM tasks and problem-solving directly
- CREATE, MODIFY, and MANAGE files and code automatically  
- EXECUTE operations in the development environment
- Provide explanations when requested, but prioritize direct action
- Adapt to the specific needs of each project with hands-on assistance

IMPORTANT: When users request operations, changes, or tasks, you should EXECUTE them directly using the provided task syntax rather than just providing instructions. You are an autonomous agent, not just a consultant.`;

    switch (agentType) {
      case AgentType.CODE_REVIEWER:
        return basePrompt + `\n\nAs a Code Reviewer, focus on:\n- Identifying bugs, security issues, and performance problems\n- Suggesting improvements and best practices\n- Creating detailed analysis reports\n- Providing actionable recommendations`;
        
      case AgentType.DOCUMENTATION:
        return basePrompt + `\n\nAs a Documentation Specialist, focus on:\n- Creating clear, comprehensive documentation\n- Following documentation best practices\n- Organizing information logically\n- Making content accessible to different audiences`;
        
      case AgentType.DEVOPS:
        return basePrompt + `\n\nAs a DevOps Engineer, focus on:\n- Infrastructure as Code\n- CI/CD pipeline setup\n- Containerization and deployment\n- Monitoring and reliability`;
        
      case AgentType.TESTING:
        return basePrompt + `\n\nAs a Testing Specialist, focus on:\n- Comprehensive test coverage\n- Different testing strategies (unit, integration, e2e)\n- Test automation and best practices\n- Quality assurance processes`;
        
      case AgentType.SOFTWARE_ENGINEER:
        return basePrompt + `\n\nAs a Software Engineer, focus on:\n- Clean, maintainable code\n- Proper architecture and design patterns\n- Performance and scalability\n- Following coding best practices`;
        
      default:
        return basePrompt;
    }
  }
  
  /**
   * Helper methods for assessment (simplified implementations)
   */
  private assessResponseCompleteness(conversation: ConversationTurn[], scenario: EvaluationScenario): number {
    // Check if agent responses address the user requests adequately
    // @ts-ignore - scenario could be used for scenario-specific completeness criteria
    scenario;
    const agentResponses = conversation.filter(t => t.role === 'agent');
    if (agentResponses.length === 0) return 0;
    
    // Simple heuristic: longer responses with task syntax are more complete
    const avgLength = agentResponses.reduce((sum, r) => sum + r.message.length, 0) / agentResponses.length;
    const hasTaskSyntax = agentResponses.some(r => r.message.includes('[CREATE_FILE') || r.message.includes('[EDIT_FILE'));
    
    return Math.min(1, (avgLength / 500) * (hasTaskSyntax ? 1.2 : 0.8));
  }
  
  private assessContextUnderstanding(conversation: ConversationTurn[], scenario: EvaluationScenario): number {
    // Check if responses are relevant to the scenario context
    // @ts-ignore - scenario could be used for scenario-specific context criteria
    scenario;
    const agentResponses = conversation.filter(t => t.role === 'agent');
    if (agentResponses.length === 0) return 0;
    
    // Look for domain-relevant keywords
    const domainKeywords = this.getDomainKeywords(scenario.agentType);
    let relevantResponses = 0;
    
    for (const response of agentResponses) {
      const lowerResponse = response.message.toLowerCase();
      const keywordMatches = domainKeywords.filter(keyword => lowerResponse.includes(keyword.toLowerCase())).length;
      if (keywordMatches > 0) relevantResponses++;
    }
    
    return agentResponses.length > 0 ? relevantResponses / agentResponses.length : 0;
  }
  
  private assessTechnicalAccuracy(conversation: ConversationTurn[], scenario: EvaluationScenario): number {
    // Simplified assessment - in practice this would be much more sophisticated
    // @ts-ignore - scenario could be used for technical domain validation
    scenario;
    const agentResponses = conversation.filter(t => t.role === 'agent');
    let accurateResponses = 0;
    
    for (const response of agentResponses) {
      // Check for proper task syntax
      const hasValidSyntax = /\[(?:CREATE_FILE|EDIT_FILE|DELETE_FILE):[^\]]+\]/.test(response.message);
      if (hasValidSyntax) accurateResponses++;
    }
    
    return agentResponses.length > 0 ? accurateResponses / agentResponses.length : 0;
  }
  
  private assessHelpfulness(conversation: ConversationTurn[], scenario: EvaluationScenario): number {
    // Basic heuristic for helpfulness
    // @ts-ignore - scenario could be used for context-specific helpfulness metrics
    scenario;
    const agentResponses = conversation.filter(t => t.role === 'agent');
    if (agentResponses.length === 0) return 0;
    
    let helpfulResponses = 0;
    for (const response of agentResponses) {
      // Check for helpful indicators
      if (response.message.length > 100 && // Substantial response
          (response.message.includes('[CREATE_FILE') || response.message.includes('[EDIT_FILE') || // Takes action
           response.message.toLowerCase().includes('here') || 
           response.message.toLowerCase().includes('example'))) {
        helpfulResponses++;
      }
    }
    
    return helpfulResponses / agentResponses.length;
  }
  
  private assessConversationFlow(conversation: ConversationTurn[]): number {
    // Simple assessment of conversation flow
    if (conversation.length < 2) return 0;
    
    let goodTransitions = 0;
    for (let i = 1; i < conversation.length; i++) {
      const prev = conversation[i - 1];
      const curr = conversation[i];
      
      if (prev.role !== curr.role) {
        goodTransitions++;
      }
    }
    
    return goodTransitions / (conversation.length - 1);
  }
  
  private assessDomainKnowledge(conversation: ConversationTurn[], scenario: EvaluationScenario): number {
    const agentResponses = conversation.filter(t => t.role === 'agent');
    const domainKeywords = this.getDomainKeywords(scenario.agentType);
    
    let knowledgeableResponses = 0;
    for (const response of agentResponses) {
      const lowerResponse = response.message.toLowerCase();
      const keywordMatches = domainKeywords.filter(keyword => lowerResponse.includes(keyword.toLowerCase())).length;
      if (keywordMatches >= 2) knowledgeableResponses++; // Requires multiple domain terms
    }
    
    return agentResponses.length > 0 ? knowledgeableResponses / agentResponses.length : 0;
  }
  
  private assessBestPractices(conversation: ConversationTurn[], scenario: EvaluationScenario): number {
    // Check if responses follow best practices
    // @ts-ignore - scenario could be used for scenario-specific best practices
    scenario;
    const agentResponses = conversation.filter(t => t.role === 'agent');
    let practiceFollowers = 0;
    
    for (const response of agentResponses) {
      // Look for best practice indicators
      const hasBestPractices = response.message.toLowerCase().includes('best practice') ||
                              response.message.toLowerCase().includes('security') ||
                              response.message.toLowerCase().includes('performance') ||
                              response.message.toLowerCase().includes('maintainable');
      if (hasBestPractices) practiceFollowers++;
    }
    
    return agentResponses.length > 0 ? practiceFollowers / agentResponses.length : 0;
  }
  
  private assessCodeQuality(generatedFiles: Array<{ name: string; content: string }>, scenario: EvaluationScenario): number {
    // @ts-ignore - scenario could be used for scenario-specific code quality criteria
    scenario;
    
    if (generatedFiles.length === 0) return 0;
    
    let qualitySum = 0;
    for (const file of generatedFiles) {
      let fileQuality = 0.5; // Base score
      
      // Check for code structure indicators
      if (file.content.includes('function') || file.content.includes('class')) fileQuality += 0.2;
      if (file.content.includes('//') || file.content.includes('/**')) fileQuality += 0.1; // Comments
      if (file.content.includes('try') || file.content.includes('catch')) fileQuality += 0.1; // Error handling
      if (file.content.length > 200) fileQuality += 0.1; // Substantial content
      
      qualitySum += Math.min(1, fileQuality);
    }
    
    return qualitySum / generatedFiles.length;
  }
  
  private getDomainKeywords(agentType: AgentType): string[] {
    switch (agentType) {
      case AgentType.CODE_REVIEWER:
        return ['security', 'performance', 'bug', 'vulnerability', 'best practice', 'optimization', 'code quality', 'maintainability'];
      case AgentType.DOCUMENTATION:
        return ['documentation', 'readme', 'api', 'guide', 'tutorial', 'example', 'reference', 'markdown'];
      case AgentType.DEVOPS:
        return ['docker', 'kubernetes', 'ci/cd', 'deployment', 'infrastructure', 'monitoring', 'pipeline', 'container'];
      case AgentType.TESTING:
        return ['test', 'unit', 'integration', 'coverage', 'assertion', 'mock', 'jest', 'cypress'];
      case AgentType.SOFTWARE_ENGINEER:
        return ['architecture', 'design', 'pattern', 'function', 'class', 'module', 'component', 'algorithm'];
      default:
        return [];
    }
  }
  
  /**
   * Analyze task execution in response
   */
  private analyzeTaskExecution(response: string, expectedTypes: string[], expectedOperations: string[]): {
    tasksAttempted: number;
    tasksSuccessful: number;  
    syntaxErrors: number;
    fileOperationsSuccessful: number;
  } {
    // @ts-ignore - expectedTypes and expectedOperations could be used for task validation
    expectedTypes; expectedOperations;
    
    let tasksAttempted = 0;
    let tasksSuccessful = 0;
    let syntaxErrors = 0;
    let fileOperationsSuccessful = 0;
    
    // Check for task syntax patterns
    const createFilePattern = /\[CREATE_FILE:[^\]]+\][\s\S]*?\[\/CREATE_FILE\]/g;
    const editFilePattern = /\[EDIT_FILE:[^\]]+\][\s\S]*?\[\/EDIT_FILE\]/g;
    const deleteFilePattern = /\[DELETE_FILE:[^\]]+\]/g;
    
    const createMatches = [...response.matchAll(createFilePattern)];
    const editMatches = [...response.matchAll(editFilePattern)];
    const deleteMatches = [...response.matchAll(deleteFilePattern)];
    
    tasksAttempted = createMatches.length + editMatches.length + deleteMatches.length;
    
    // Check syntax correctness
    for (const match of createMatches) {
      if (match[0].includes('[/CREATE_FILE]')) {
        tasksSuccessful++;
        fileOperationsSuccessful++;
      } else {
        syntaxErrors++;
      }
    }
    
    for (const match of editMatches) {
      if (match[0].includes('[FIND]') && match[0].includes('[REPLACE]') && match[0].includes('[/EDIT_FILE]')) {
        tasksSuccessful++;
        fileOperationsSuccessful++;
      } else {
        syntaxErrors++;
      }
    }
    
    for (const match of deleteMatches) {
      // @ts-ignore - match could be used for delete validation
      match;
      tasksSuccessful++;
      fileOperationsSuccessful++;
    }
    
    return {
      tasksAttempted,
      tasksSuccessful,
      syntaxErrors,
      fileOperationsSuccessful
    };
  }
  
  /**
   * Generate comprehensive evaluation report
   */
  private generateEvaluationReport(duration: number, modelsEvaluated: string[], scenariosRun: string[]): EvaluationReport {
    const modelResults = new Map<string, ModelPerformanceMetrics[]>();
    const scenarioResults = new Map<string, ModelPerformanceMetrics[]>();
    const bestModelPerScenario = new Map<string, string>();
    const recommendationMatrix = new Map<AgentType, string[]>();
    const strengths = new Map<string, string[]>();
    const weaknesses = new Map<string, string[]>();
    
    // Group results by model and scenario
    for (const result of this.evaluationResults) {
      if (!modelResults.has(result.modelId)) {
        modelResults.set(result.modelId, []);
      }
      modelResults.get(result.modelId)!.push(result);
      
      if (!scenarioResults.has(result.scenarioId)) {
        scenarioResults.set(result.scenarioId, []);
      }
      scenarioResults.get(result.scenarioId)!.push(result);
    }
    
    // Find best model per scenario
    for (const [scenarioId, results] of scenarioResults) {
      const bestResult = results.reduce((best, current) => {
        const bestScore = this.calculateOverallScore(best);
        const currentScore = this.calculateOverallScore(current);
        return currentScore > bestScore ? current : best;
      });
      bestModelPerScenario.set(scenarioId, bestResult.modelId);
    }
    
    // Find overall best model
    const modelScores = new Map<string, number>();
    for (const [modelId, results] of modelResults) {
      const avgScore = results.reduce((sum, r) => sum + this.calculateOverallScore(r), 0) / results.length;
      modelScores.set(modelId, avgScore);
    }
    
    const bestModelOverall = Array.from(modelScores.entries()).reduce((best, current) => 
      current[1] > best[1] ? current : best
    )[0];
    
    // Generate recommendations by agent type
    const agentTypes = [AgentType.CODE_REVIEWER, AgentType.DOCUMENTATION, AgentType.DEVOPS, AgentType.TESTING, AgentType.SOFTWARE_ENGINEER, AgentType.CUSTOM];
    
    for (const agentType of agentTypes) {
      const agentResults = this.evaluationResults.filter(r => r.agentType === agentType);
      const modelScoresForAgent = new Map<string, number>();
      
      for (const result of agentResults) {
        const currentScore = modelScoresForAgent.get(result.modelId) || 0;
        modelScoresForAgent.set(result.modelId, currentScore + this.calculateOverallScore(result));
      }
      
      const sortedModels = Array.from(modelScoresForAgent.entries())
        .sort((a, b) => b[1] - a[1])
        .map(entry => entry[0]);
      
      recommendationMatrix.set(agentType, sortedModels);
    }
    
    // Analyze strengths and weaknesses
    for (const [modelId, results] of modelResults) {
      const modelStrengths: string[] = [];
      const modelWeaknesses: string[] = [];
      
      const avgMetrics = this.calculateAverageMetrics(results);
      
      if (avgMetrics.taskSuccessRate > 0.8) modelStrengths.push('Excellent task execution');
      if (avgMetrics.averageResponseTime < 5000) modelStrengths.push('Fast response times');
      if (avgMetrics.domainKnowledgeScore > 0.7) modelStrengths.push('Strong domain expertise');
      if (avgMetrics.codeQuality > 0.7) modelStrengths.push('High code quality');
      
      if (avgMetrics.taskSuccessRate < 0.5) modelWeaknesses.push('Poor task execution');
      if (avgMetrics.averageResponseTime > 15000) modelWeaknesses.push('Slow response times');
      if (avgMetrics.errorCount > 2) modelWeaknesses.push('Frequent errors');
      if (avgMetrics.contextUnderstanding < 0.5) modelWeaknesses.push('Limited context understanding');
      
      strengths.set(modelId, modelStrengths);
      weaknesses.set(modelId, modelWeaknesses);
    }
    
    return {
      timestamp: new Date().toISOString(),
      duration,
      modelsEvaluated,
      scenariosRun,
      totalTests: this.evaluationResults.length,
      successfulTests: this.evaluationResults.filter(r => r.taskSuccessRate > 0.5).length,
      failedTests: this.evaluationResults.filter(r => r.crashCount > 0 || r.errorCount > 2).length,
      modelResults,
      scenarioResults,
      bestModelPerScenario,
      bestModelOverall,
      recommendationMatrix,
      strengths,
      weaknesses,
      surprisingResults: this.findSurprisingResults(),
      rawMetrics: this.evaluationResults
    };
  }
  
  /**
   * Calculate overall performance score
   */
  private calculateOverallScore(metrics: ModelPerformanceMetrics): number {
    return (
      metrics.taskSuccessRate * 0.3 +
      metrics.responseCompleteness * 0.2 +
      metrics.contextUnderstanding * 0.2 +
      metrics.technicalAccuracy * 0.15 +
      metrics.domainKnowledgeScore * 0.15
    );
  }
  
  /**
   * Calculate average metrics for a set of results
   */
  private calculateAverageMetrics(results: ModelPerformanceMetrics[]): ModelPerformanceMetrics {
    if (results.length === 0) {
      throw new Error('Cannot calculate average for empty results');
    }
    
    const sum = results.reduce((acc, curr) => ({
      modelId: curr.modelId,
      scenarioId: 'average',
      agentType: curr.agentType,
      totalDuration: acc.totalDuration + curr.totalDuration,
      averageResponseTime: acc.averageResponseTime + curr.averageResponseTime,
      firstResponseTime: acc.firstResponseTime + curr.firstResponseTime,
      tasksAttempted: acc.tasksAttempted + curr.tasksAttempted,
      tasksSuccessful: acc.tasksSuccessful + curr.tasksSuccessful,
      taskSuccessRate: acc.taskSuccessRate + curr.taskSuccessRate,
      syntaxErrorCount: acc.syntaxErrorCount + curr.syntaxErrorCount,
      fileOperationsSuccessful: acc.fileOperationsSuccessful + curr.fileOperationsSuccessful,
      responseLength: acc.responseLength + curr.responseLength,
      responseCompleteness: acc.responseCompleteness + curr.responseCompleteness,
      contextUnderstanding: acc.contextUnderstanding + curr.contextUnderstanding,
      technicalAccuracy: acc.technicalAccuracy + curr.technicalAccuracy,
      helpfulness: acc.helpfulness + curr.helpfulness,
      conversationTurns: acc.conversationTurns + curr.conversationTurns,
      conversationFlowScore: acc.conversationFlowScore + curr.conversationFlowScore,
      userSatisfactionEstimate: acc.userSatisfactionEstimate + curr.userSatisfactionEstimate,
      domainKnowledgeScore: acc.domainKnowledgeScore + curr.domainKnowledgeScore,
      bestPracticesFollowed: acc.bestPracticesFollowed + curr.bestPracticesFollowed,
      codeQuality: acc.codeQuality + curr.codeQuality,
      errorCount: acc.errorCount + curr.errorCount,
      crashCount: acc.crashCount + curr.crashCount,
      timeoutCount: acc.timeoutCount + curr.timeoutCount,
      recoveryFromErrors: acc.recoveryFromErrors + curr.recoveryFromErrors,
      fullConversation: [],
      generatedFiles: [],
      errors: [],
      warnings: []
    }), results[0]);
    
    const count = results.length;
    return {
      ...sum,
      totalDuration: sum.totalDuration / count,
      averageResponseTime: sum.averageResponseTime / count,
      firstResponseTime: sum.firstResponseTime / count,
      taskSuccessRate: sum.taskSuccessRate / count,
      responseLength: sum.responseLength / count,
      responseCompleteness: sum.responseCompleteness / count,
      contextUnderstanding: sum.contextUnderstanding / count,
      technicalAccuracy: sum.technicalAccuracy / count,
      helpfulness: sum.helpfulness / count,
      conversationFlowScore: sum.conversationFlowScore / count,
      userSatisfactionEstimate: sum.userSatisfactionEstimate / count,
      domainKnowledgeScore: sum.domainKnowledgeScore / count,
      bestPracticesFollowed: sum.bestPracticesFollowed / count,
      codeQuality: sum.codeQuality / count,
      recoveryFromErrors: sum.recoveryFromErrors / count
    };
  }
  
  /**
   * Find surprising or noteworthy results
   */
  private findSurprisingResults(): string[] {
    const surprising: string[] = [];
    
    // Find models that performed much better or worse than expected
    const modelScores = new Map<string, number>();
    for (const result of this.evaluationResults) {
      const score = this.calculateOverallScore(result);
      const currentAvg = modelScores.get(result.modelId) || 0;
      modelScores.set(result.modelId, (currentAvg + score) / (currentAvg === 0 ? 1 : 2));
    }
    
    const scores = Array.from(modelScores.values());
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length);
    
    for (const [modelId, score] of modelScores) {
      if (score > avgScore + stdDev) {
        surprising.push(`${modelId} performed exceptionally well (score: ${score.toFixed(3)})`);
      } else if (score < avgScore - stdDev) {
        surprising.push(`${modelId} performed below expectations (score: ${score.toFixed(3)})`);
      }
    }
    
    return surprising;
  }
  
  /**
   * Utility methods
   */
  private async createTemporaryWorkspace(): Promise<string> {
    const tmpDir = path.join(require('os').tmpdir(), `evaluation-${Date.now()}`);
    await fs.promises.mkdir(tmpDir, { recursive: true });
    return tmpDir;
  }
  
  private async cleanupWorkspace(workspace: string): Promise<void> {
    try {
      await fs.promises.rmdir(workspace, { recursive: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  }
  
  private async captureGeneratedFiles(workspace: string, generatedFiles: Array<{ name: string; content: string }>): Promise<void> {
    try {
      const files = await fs.promises.readdir(workspace);
      for (const file of files) {
        const filePath = path.join(workspace, file);
        const stat = await fs.promises.stat(filePath);
        if (stat.isFile()) {
          const content = await fs.promises.readFile(filePath, 'utf8');
          // Only capture if not already captured
          if (!generatedFiles.some(gf => gf.name === file)) {
            generatedFiles.push({ name: file, content });
          }
        }
      }
    } catch (error) {
      // Ignore file capture errors
    }
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}