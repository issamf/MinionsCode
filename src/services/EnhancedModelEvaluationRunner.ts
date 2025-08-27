// import * as path from 'path'; // Removed unused import
import { AgentService } from '@/agents/AgentService';
import { SettingsManager } from '@/extension/SettingsManager';
import { ModelDiscoveryService, AvailableModel } from './ModelDiscoveryService';
import { EvaluationScenarioService, EvaluationScenario } from './EvaluationScenarioService';
import { EnhancedModelEvaluationEngine, EvaluationConfiguration, ModelEvaluationResult } from './EnhancedModelEvaluationEngine';
import { EvaluationResult } from './ModelEvaluationEngine';
import { EvaluationReportService } from './EvaluationReportService';
import { EvaluationProgressTracker, ProgressCallback } from './EvaluationProgressTracker';
import { EvaluationPersistenceService, LivePreviewCallback } from './EvaluationPersistenceService';

export interface EvaluationRunnerConfiguration {
  outputDirectory?: string;
  timeout?: number;
  maxRetries?: number;
  retryDelay?: number;
  includeOnlineModels?: boolean;
  enableLivePreview?: boolean;
  enableFailsafeMode?: boolean;
}

export interface EvaluationRunResults {
  success: boolean;
  message: string;
  sessionId?: string;
  evaluationSummary: {
    modelsEvaluated: number;
    scenariosRun: number;
    totalDuration: number;
    successRate: number;
    topModel: string;
    avgSuccessRate: number;
  };
  reportFiles: {
    json?: string;
    markdown?: string;
    judgePrompt?: string;
  };
  partialResults?: ModelEvaluationResult[];
}

export interface ValidationResult {
  valid: boolean;
  issues: string[];
  availableModels: number;
  availableScenarios: number;
}

export class EnhancedModelEvaluationRunner {
  private configuration: EvaluationRunnerConfiguration;
  private agentService: AgentService;
  // private _settingsManager: SettingsManager; // Currently unused but may be needed for future features
  private modelDiscovery: ModelDiscoveryService;
  private scenarioService: EvaluationScenarioService;
  private progressTracker: EvaluationProgressTracker;
  private persistenceService: EvaluationPersistenceService;
  private evaluationEngine?: EnhancedModelEvaluationEngine;
  private reportService: EvaluationReportService;

  // Event callbacks
  private progressCallbacks: ProgressCallback[] = [];
  private livePreviewCallbacks: LivePreviewCallback[] = [];

  constructor(
    agentService: AgentService,
    _settingsManager: SettingsManager,
    configuration: EvaluationRunnerConfiguration = {}
  ) {
    this.agentService = agentService;
    // this._settingsManager = settingsManager; // Commented out with property above
    this.configuration = {
      outputDirectory: configuration.outputDirectory || './model-evaluation-results',
      timeout: configuration.timeout || 120000, // 2 minutes
      maxRetries: configuration.maxRetries || 2,
      retryDelay: configuration.retryDelay || 1000,
      includeOnlineModels: configuration.includeOnlineModels || false,
      enableLivePreview: configuration.enableLivePreview ?? true,
      enableFailsafeMode: configuration.enableFailsafeMode ?? true
    };

    // Initialize services
    this.modelDiscovery = new ModelDiscoveryService();
    this.scenarioService = new EvaluationScenarioService();
    this.progressTracker = new EvaluationProgressTracker();
    this.persistenceService = new EvaluationPersistenceService(this.configuration.outputDirectory!);
    this.reportService = new EvaluationReportService({
      outputDirectory: this.configuration.outputDirectory!,
      includeCharts: true,
      includeDetailedLogs: true
    });

    // Set up callbacks
    this.progressTracker.onProgress(this.handleProgressUpdate.bind(this));
    this.persistenceService.onLivePreviewUpdate(this.handleLivePreviewUpdate.bind(this));
  }

  // Event subscription methods
  onProgress(callback: ProgressCallback): void {
    this.progressCallbacks.push(callback);
  }

  onLivePreview(callback: LivePreviewCallback): void {
    this.livePreviewCallbacks.push(callback);
  }

  removeProgressCallback(callback: ProgressCallback): void {
    const index = this.progressCallbacks.indexOf(callback);
    if (index > -1) {
      this.progressCallbacks.splice(index, 1);
    }
  }

  removeLivePreviewCallback(callback: LivePreviewCallback): void {
    const index = this.livePreviewCallbacks.indexOf(callback);
    if (index > -1) {
      this.livePreviewCallbacks.splice(index, 1);
    }
  }

  // Handle progress updates
  private handleProgressUpdate(progress: any): void {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }

  // Handle live preview updates
  private handleLivePreviewUpdate(update: any): void {
    this.livePreviewCallbacks.forEach(callback => {
      try {
        callback(update);
      } catch (error) {
        console.error('Live preview callback error:', error);
      }
    });
  }

  // Validate setup and configuration
  async validateSetup(): Promise<ValidationResult> {
    const issues: string[] = [];
    let availableModels = 0;
    let availableScenarios = 0;

    try {
      // Check model availability
      const models = await this.modelDiscovery.discoverLocalModels();
      availableModels = models.length;
      
      if (models.length === 0) {
        issues.push('No local models found. Please install ollama and pull some models.');
      }

      // Check scenarios
      const scenarios = this.scenarioService.getAllScenarios();
      availableScenarios = scenarios.length;
      
      if (scenarios.length === 0) {
        issues.push('No evaluation scenarios found.');
      }

      // Check output directory
      try {
        const fs = require('fs');
        if (!fs.existsSync(this.configuration.outputDirectory)) {
          fs.mkdirSync(this.configuration.outputDirectory, { recursive: true });
        }
      } catch (error) {
        issues.push(`Cannot create output directory: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Check agent service
      if (!this.agentService) {
        issues.push('Agent service not available.');
      }

    } catch (error) {
      issues.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      valid: issues.length === 0,
      issues,
      availableModels,
      availableScenarios
    };
  }

  // Get available models for selection
  async getAvailableModels(): Promise<AvailableModel[]> {
    if (this.configuration.includeOnlineModels) {
      // Use getAllAvailableModels which includes both local and online
      return await this.modelDiscovery.getAllAvailableModels();
    } else {
      // Convert LocalModel[] to AvailableModel[] for local only
      const localModels = await this.modelDiscovery.discoverLocalModels();
      return localModels.map(model => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        type: 'local' as const,
        specialization: model.specialization || 'general',
        size: model.size,
        estimatedSpeed: 'medium' as const
      }));
    }
  }

  // Get available scenarios for selection
  getAvailableScenarios(): EvaluationScenario[] {
    return this.scenarioService.getAllScenarios();
  }

  // Get available sessions for resuming
  getAvailableSessions() {
    return this.persistenceService.getAvailableSessions();
  }

  // Start a new evaluation with selected models and scenarios
  async startEvaluation(
    selectedModels: AvailableModel[],
    selectedScenarios: EvaluationScenario[],
    customConfig?: Partial<EvaluationConfiguration>
  ): Promise<EvaluationRunResults> {
    
    const evaluationConfig: EvaluationConfiguration = {
      timeout: customConfig?.timeout || this.configuration.timeout!,
      maxRetries: customConfig?.maxRetries || this.configuration.maxRetries!,
      retryDelay: customConfig?.retryDelay || this.configuration.retryDelay!,
      includeOnlineModels: customConfig?.includeOnlineModels ?? this.configuration.includeOnlineModels!,
      enableLivePreview: customConfig?.enableLivePreview ?? this.configuration.enableLivePreview!,
      enableFailsafeMode: customConfig?.enableFailsafeMode ?? this.configuration.enableFailsafeMode!,
      outputDirectory: this.configuration.outputDirectory!
    };

    // Create new session
    const session = this.persistenceService.createSession(
      selectedModels,
      selectedScenarios,
      {
        timeout: evaluationConfig.timeout,
        maxRetries: evaluationConfig.maxRetries,
        retryDelay: evaluationConfig.retryDelay,
        includeOnlineModels: evaluationConfig.includeOnlineModels,
        outputDirectory: evaluationConfig.outputDirectory
      }
    );

    // Initialize evaluation engine
    this.evaluationEngine = new EnhancedModelEvaluationEngine(
      this.agentService,
      this.progressTracker,
      this.persistenceService,
      evaluationConfig
    );

    try {
      this.progressTracker.setStatus('running', 'Starting model evaluation...');
      
      // Run evaluation
      const results = await this.evaluationEngine.evaluateModels(selectedModels, selectedScenarios);
      
      // Generate reports
      this.progressTracker.setStatus('generating-report', 'Generating evaluation reports...');
      const reportFiles = await this.generateReports(results, session.sessionId);
      
      // Calculate summary
      const summary = this.calculateSummary(results, selectedScenarios.length);
      
      this.progressTracker.complete();
      this.persistenceService.updateStatus('completed');

      return {
        success: true,
        message: 'Evaluation completed successfully',
        sessionId: session.sessionId,
        evaluationSummary: summary,
        reportFiles,
        partialResults: results
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.progressTracker.error(errorMessage);
      this.persistenceService.updateStatus('error');

      // Still try to generate partial reports
      const partialResults = this.persistenceService.getPartialResults();
      let reportFiles = {};
      
      if (partialResults.length > 0) {
        try {
          reportFiles = await this.generateReports(partialResults.map(r => ({
            modelId: r.modelId,
            modelName: r.modelName,
            success: true,
            skipped: false,
            scenarioResults: r.scenarioResults.map(scenario => ({
              ...scenario,
              timeout: false, // Add missing Enhanced properties
              crashed: false
            })),
            totalDuration: r.totalDuration,
            retryCount: 0,
            overallMetrics: r.overallMetrics
          })), session.sessionId);
        } catch (reportError) {
          console.error('Failed to generate partial reports:', reportError);
        }
      }

      return {
        success: false,
        message: `Evaluation failed: ${errorMessage}`,
        sessionId: session.sessionId,
        evaluationSummary: {
          modelsEvaluated: 0,
          scenariosRun: 0,
          totalDuration: 0,
          successRate: 0,
          topModel: 'None',
          avgSuccessRate: 0
        },
        reportFiles,
        partialResults: partialResults.map(r => ({
          modelId: r.modelId,
          modelName: r.modelName,
          success: true,
          skipped: false,
          scenarioResults: r.scenarioResults.map(scenario => ({
            ...scenario,
            timeout: false, // Add missing Enhanced properties
            crashed: false
          })),
          totalDuration: r.totalDuration,
          retryCount: 0,
          overallMetrics: r.overallMetrics
        }))
      };
    }
  }

  // Resume evaluation from a previous session
  async resumeEvaluation(sessionId: string): Promise<EvaluationRunResults> {
    // Load session
    const session = this.persistenceService.loadSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Get remaining models to evaluate
    const remainingModels = this.persistenceService.getRemainingModels();
    if (remainingModels.length === 0) {
      return {
        success: true,
        message: 'Session already completed',
        sessionId,
        evaluationSummary: {
          modelsEvaluated: session.totalModels,
          scenariosRun: session.selectedScenarios.length,
          totalDuration: session.elapsedTime,
          successRate: 1,
          topModel: 'Completed',
          avgSuccessRate: 1
        },
        reportFiles: {}
      };
    }

    // Resume with remaining models
    const evaluationConfig: EvaluationConfiguration = {
      timeout: session.configuration.timeout,
      maxRetries: session.configuration.maxRetries,
      retryDelay: session.configuration.retryDelay || 1000,
      includeOnlineModels: session.configuration.includeOnlineModels,
      enableLivePreview: true,
      enableFailsafeMode: true,
      outputDirectory: session.configuration.outputDirectory
    };

    // Initialize evaluation engine
    this.evaluationEngine = new EnhancedModelEvaluationEngine(
      this.agentService,
      this.progressTracker,
      this.persistenceService,
      evaluationConfig
    );

    // Resume progress tracking
    this.progressTracker.resume({
      completedModelIds: session.completedModels,
      partialResults: session.partialResults,
      lastCompletedModel: session.completedModels[session.completedModels.length - 1] || null,
      lastCompletedScenario: session.currentScenario
    });

    // Continue evaluation with remaining models
    return this.startEvaluation(remainingModels, session.selectedScenarios, evaluationConfig);
  }

  // Stop current evaluation
  async stopEvaluation(): Promise<void> {
    if (this.evaluationEngine) {
      await this.evaluationEngine.shutdown();
    }
    
    this.progressTracker.requestCancellation();
    this.persistenceService.updateStatus('paused');
  }

  // Generate comprehensive reports
  private async generateReports(
    results: ModelEvaluationResult[],
_sessionId: string
  ): Promise<{ json?: string; markdown?: string; judgePrompt?: string }> {
    const reportFiles: { json?: string; markdown?: string; judgePrompt?: string } = {};
    
    try {
      // const _sessionOutputDir = this.persistenceService.getSessionOutputDirectory(); // Currently unused
      
      // Convert to format expected by report service
      const evaluationResults = results
        .filter(r => r.success && r.overallMetrics)
        .map(r => ({
          modelId: r.modelId,
          modelName: r.modelName,
          overallMetrics: r.overallMetrics!,
          scenarioResults: r.scenarioResults,
          totalDuration: r.totalDuration
        }));

      if (evaluationResults.length === 0) {
        console.warn('No successful results to generate reports from');
        return reportFiles;
      }

      // Get available models for report context
      const availableModels = await this.getAvailableModels();
      
      // Convert ModelEvaluationResult[] to EvaluationResult[] for report generation
      const convertedResults: EvaluationResult[] = evaluationResults.map(result => ({
        modelId: result.modelId,
        modelName: result.modelName,
        overallMetrics: result.overallMetrics,
        scenarioResults: result.scenarioResults.map(scenario => ({
          scenarioId: scenario.scenarioId,
          scenarioName: scenario.scenarioName,
          agentType: scenario.agentType,
          successRate: scenario.successRate,
          averageLatency: scenario.averageLatency,
          taskExecutionSuccess: scenario.taskExecutionSuccess,
          errors: scenario.errors,
          conversationLog: scenario.conversationLog
          // Note: timeout and crashed properties are excluded as they don't exist in the original interface
        })),
        totalDuration: result.totalDuration
        // Note: retryCount, success, and skipped properties are excluded as they don't exist in the original interface
      }));
      
      // Generate comprehensive report
      const report = await this.reportService.generateReport(
        convertedResults,
        availableModels
      );

      // Save JSON report
      const savedJsonPath = await this.reportService.saveJsonReport(report);
      reportFiles.json = savedJsonPath;

      // Save Markdown report
      const savedMdPath = await this.reportService.saveMarkdownReport(report);
      reportFiles.markdown = savedMdPath;

      // Generate judge prompt
      const judgePromptPath = await this.reportService.generateJudgeLLMPrompt(report);
      reportFiles.judgePrompt = judgePromptPath;

      console.log('Reports generated successfully:', reportFiles);
      
    } catch (error) {
      console.error('Failed to generate reports:', error);
    }
    
    return reportFiles;
  }

  // Calculate evaluation summary
  private calculateSummary(results: ModelEvaluationResult[], totalScenarios: number) {
    const successfulResults = results.filter(r => r.success && r.overallMetrics);
    
    if (successfulResults.length === 0) {
      return {
        modelsEvaluated: results.length,
        scenariosRun: totalScenarios,
        totalDuration: results.reduce((sum, r) => sum + r.totalDuration, 0),
        successRate: 0,
        topModel: 'None',
        avgSuccessRate: 0
      };
    }

    // Find top performing model
    const topModel = successfulResults.reduce((best, current) => {
      const bestScore = best.overallMetrics?.taskSuccessRate || 0;
      const currentScore = current.overallMetrics?.taskSuccessRate || 0;
      return currentScore > bestScore ? current : best;
    });

    // Calculate average success rate
    const avgSuccessRate = successfulResults.reduce((sum, r) => 
      sum + (r.overallMetrics?.taskSuccessRate || 0), 0
    ) / successfulResults.length;

    return {
      modelsEvaluated: results.length,
      scenariosRun: totalScenarios,
      totalDuration: results.reduce((sum, r) => sum + r.totalDuration, 0),
      successRate: successfulResults.length / results.length,
      topModel: topModel.modelName,
      avgSuccessRate
    };
  }

  // Get current progress
  getCurrentProgress() {
    return this.progressTracker.getProgress();
  }

  // Get current session
  getCurrentSession() {
    return this.persistenceService.getCurrentSession();
  }

  // Clean up resources
  async cleanup(): Promise<void> {
    if (this.evaluationEngine) {
      await this.evaluationEngine.shutdown();
    }
    
    // Clean up old sessions
    this.persistenceService.cleanupOldSessions();
  }
}