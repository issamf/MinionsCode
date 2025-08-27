import { AvailableModel } from './ModelDiscoveryService';
import { EvaluationScenario } from './EvaluationScenarioService';

export interface EvaluationProgress {
  // Global progress
  totalModels: number;
  completedModels: number;
  totalScenarios: number;
  globalProgress: number; // 0-100

  // Current status
  currentModel: AvailableModel | null;
  currentScenario: EvaluationScenario | null;
  currentModelProgress: number; // 0-100
  currentScenarioProgress: number; // 0-100

  // Real-time information
  status: 'initializing' | 'validating' | 'running' | 'generating-report' | 'completed' | 'error' | 'cancelled' | 'paused';
  currentActivity: string;
  lastOutput: string;
  elapsed: number; // seconds
  estimatedRemaining: number; // seconds

  // Cancellation support
  isCancellationRequested: boolean;
  canResume: boolean;

  // Statistics
  successfulModels: number;
  failedModels: number;
  skippedModels: number;
  errors: Array<{
    modelId: string;
    scenarioId?: string;
    error: string;
    timestamp: Date;
  }>;

  // Resume data
  resumeData?: {
    completedModelIds: string[];
    partialResults: any[];
    lastCompletedModel: string | null;
    lastCompletedScenario: string | null;
  };
}

export interface ProgressCallback {
  (progress: EvaluationProgress): void;
}

export class EvaluationProgressTracker {
  private progress: EvaluationProgress;
  private callbacks: ProgressCallback[] = [];
  private startTime: Date | null = null;
  private pausedTime: number = 0; // Total paused time in seconds
  private modelStartTimes: Map<string, Date> = new Map();
  private cancellationRequested: boolean = false;

  constructor() {
    this.progress = {
      totalModels: 0,
      completedModels: 0,
      totalScenarios: 0,
      globalProgress: 0,
      currentModel: null,
      currentScenario: null,
      currentModelProgress: 0,
      currentScenarioProgress: 0,
      status: 'initializing',
      currentActivity: 'Initializing evaluation system...',
      lastOutput: '',
      elapsed: 0,
      estimatedRemaining: 0,
      isCancellationRequested: false,
      canResume: false,
      successfulModels: 0,
      failedModels: 0,
      skippedModels: 0,
      errors: []
    };
  }

  onProgress(callback: ProgressCallback): void {
    this.callbacks.push(callback);
  }

  removeCallback(callback: ProgressCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  private notifyCallbacks(): void {
    // Update elapsed time (excluding paused time)
    if (this.startTime && this.progress.status !== 'paused') {
      this.progress.elapsed = Math.floor((Date.now() - this.startTime.getTime()) / 1000) - this.pausedTime;
    }

    // Estimate remaining time
    if (this.progress.completedModels > 0 && this.progress.elapsed > 0) {
      const avgTimePerModel = this.progress.elapsed / this.progress.completedModels;
      const remainingModels = this.progress.totalModels - this.progress.completedModels;
      this.progress.estimatedRemaining = Math.floor(avgTimePerModel * remainingModels);
    }

    // Update cancellation state
    this.progress.isCancellationRequested = this.cancellationRequested;

    this.callbacks.forEach(callback => {
      try {
        callback(this.progress);
      } catch (error) {
        console.error('Progress callback error:', error);
      }
    });
  }

  initialize(totalModels: number, totalScenarios: number): void {
    this.startTime = new Date();
    this.pausedTime = 0;
    this.cancellationRequested = false;
    
    this.progress.totalModels = totalModels;
    this.progress.totalScenarios = totalScenarios;
    this.progress.status = 'initializing';
    this.progress.currentActivity = 'Discovering available models and scenarios...';
    this.progress.canResume = true;
    this.notifyCallbacks();
  }

  // Resume from previous state
  resume(resumeData: EvaluationProgress['resumeData']): void {
    if (resumeData) {
      this.progress.resumeData = resumeData;
      this.progress.completedModels = resumeData.completedModelIds.length;
      this.progress.successfulModels = resumeData.partialResults.length;
      
      // Recalculate global progress
      this.progress.globalProgress = Math.floor((this.progress.completedModels / this.progress.totalModels) * 100);
      
      this.progress.currentActivity = `Resuming evaluation from ${resumeData.lastCompletedModel || 'beginning'}...`;
      this.progress.status = 'running';
    }
    
    this.cancellationRequested = false;
    this.startTime = new Date(); // Reset timer for resumed session
    this.notifyCallbacks();
  }

  setStatus(status: EvaluationProgress['status'], activity: string): void {
    this.progress.status = status;
    this.progress.currentActivity = activity;
    this.notifyCallbacks();
  }

  startModel(model: AvailableModel): void {
    // Check for cancellation before starting new model
    if (this.cancellationRequested) {
      this.cancel();
      return;
    }

    this.progress.currentModel = model;
    this.progress.currentModelProgress = 0;
    this.progress.currentScenario = null;
    this.progress.currentScenarioProgress = 0;
    this.progress.status = 'running';
    this.progress.currentActivity = `Starting evaluation of ${model.name}...`;
    
    this.modelStartTimes.set(model.id, new Date());
    this.notifyCallbacks();
  }

  startScenario(scenario: EvaluationScenario): void {
    // Check for cancellation before starting new scenario
    if (this.cancellationRequested) {
      this.cancel();
      return;
    }

    this.progress.currentScenario = scenario;
    this.progress.currentScenarioProgress = 0;
    this.progress.currentActivity = `Testing ${scenario.name} scenario...`;
    this.notifyCallbacks();
  }

  updateScenarioProgress(percent: number, activity?: string): void {
    this.progress.currentScenarioProgress = Math.min(100, percent);
    if (activity) {
      this.progress.currentActivity = activity;
    }
    this.notifyCallbacks();
  }

  updateModelProgress(percent: number): void {
    this.progress.currentModelProgress = Math.min(100, percent);
    
    // Update global progress
    const modelProgress = (this.progress.completedModels + (percent / 100)) / this.progress.totalModels;
    this.progress.globalProgress = Math.floor(modelProgress * 100);
    
    this.notifyCallbacks();
  }

  completeScenario(): void {
    this.progress.currentScenarioProgress = 100;
    this.progress.currentActivity = 'Scenario completed, analyzing results...';
    this.notifyCallbacks();
  }

  completeModel(success: boolean): void {
    this.progress.completedModels++;
    this.progress.currentModelProgress = 100;
    
    if (success) {
      this.progress.successfulModels++;
    } else {
      this.progress.failedModels++;
    }

    this.progress.globalProgress = Math.floor((this.progress.completedModels / this.progress.totalModels) * 100);
    
    // Update resume data
    if (this.progress.currentModel && this.progress.resumeData) {
      this.progress.resumeData.completedModelIds.push(this.progress.currentModel.id);
      this.progress.resumeData.lastCompletedModel = this.progress.currentModel.id;
    }
    
    this.progress.currentModel = null;
    this.progress.currentScenario = null;
    this.progress.currentActivity = `Model evaluation completed. ${this.progress.totalModels - this.progress.completedModels} remaining...`;
    
    this.notifyCallbacks();
  }

  skipModel(model: AvailableModel, reason: string): void {
    this.progress.skippedModels++;
    this.progress.completedModels++;
    
    this.addError(model.id, undefined, `Model skipped: ${reason}`);
    
    this.progress.globalProgress = Math.floor((this.progress.completedModels / this.progress.totalModels) * 100);
    this.progress.currentActivity = `Model ${model.name} skipped (${reason}). Continuing...`;
    
    // Update resume data
    if (this.progress.resumeData) {
      this.progress.resumeData.completedModelIds.push(model.id);
      this.progress.resumeData.lastCompletedModel = model.id;
    }
    
    this.notifyCallbacks();
  }

  addError(modelId: string, scenarioId?: string, error?: string): void {
    this.progress.errors.push({
      modelId,
      scenarioId,
      error: error || 'Unknown error',
      timestamp: new Date()
    });
    this.notifyCallbacks();
  }

  updateOutput(output: string): void {
    this.progress.lastOutput = output;
    this.notifyCallbacks();
  }

  complete(): void {
    this.progress.status = 'completed';
    this.progress.globalProgress = 100;
    this.progress.currentActivity = 'Evaluation completed! Generating final reports...';
    this.progress.currentModel = null;
    this.progress.currentScenario = null;
    this.progress.canResume = false; // No need to resume after completion
    this.notifyCallbacks();
  }

  error(error: string): void {
    this.progress.status = 'error';
    this.progress.currentActivity = `Error: ${error}`;
    this.progress.canResume = true; // Allow resuming after error
    this.notifyCallbacks();
  }

  // User requested cancellation
  requestCancellation(): void {
    this.cancellationRequested = true;
    this.progress.isCancellationRequested = true;
    this.progress.currentActivity = 'Cancellation requested... stopping after current operation...';
    this.notifyCallbacks();
  }

  // Actually cancel the operation
  cancel(): void {
    this.progress.status = 'cancelled';
    this.progress.currentActivity = 'Evaluation cancelled by user. Progress saved for resuming later.';
    this.progress.canResume = true;
    
    // Pause the timer
    if (this.startTime) {
      this.pausedTime += Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    }
    
    this.notifyCallbacks();
  }

  // Check if cancellation was requested
  isCancellationRequested(): boolean {
    return this.cancellationRequested;
  }

  getProgress(): EvaluationProgress {
    return { ...this.progress };
  }

  // Format time duration for display
  static formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${minutes}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  // Get a summary for display
  getSummary(): string {
    const p = this.progress;
    return `${p.completedModels}/${p.totalModels} models | ${p.successfulModels} successful | ${p.failedModels} failed | ${p.skippedModels} skipped`;
  }
}