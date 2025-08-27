import * as fs from 'fs';
import * as path from 'path';
import { EvaluationResult, AvailableModel } from './ModelEvaluationEngine';
import { EvaluationScenario, ConversationTurn } from './EvaluationScenarioService';
// import { EvaluationProgress } from './EvaluationProgressTracker';

export interface EvaluationSession {
  sessionId: string;
  startTime: Date;
  lastUpdateTime: Date;
  status: 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  
  // Configuration
  selectedModels: AvailableModel[];
  selectedScenarios: EvaluationScenario[];
  configuration: {
    timeout: number;
    maxRetries: number;
    retryDelay: number;
    includeOnlineModels: boolean;
    outputDirectory: string;
  };
  
  // Progress state
  totalModels: number;
  completedModels: string[]; // Model IDs that have been completed
  currentModel: string | null;
  currentScenario: string | null;
  
  // Live preview data
  currentConversation: ConversationTurn[];
  currentModelResponse: string;
  
  // Results
  partialResults: EvaluationResult[];
  errors: Array<{
    modelId: string;
    scenarioId?: string;
    error: string;
    timestamp: Date;
  }>;
  
  // Timing
  elapsedTime: number; // seconds
  modelTimings: Record<string, { start: Date; end?: Date; duration?: number }>;
}

// Live preview update interface
export interface LivePreviewUpdate {
  sessionId: string;
  modelId: string;
  modelName: string;
  scenarioId: string;
  scenarioName: string;
  conversation: ConversationTurn[];
  currentResponse: string;
  isStreaming: boolean;
  timestamp: Date;
}

export interface LivePreviewCallback {
  (update: LivePreviewUpdate): void;
}

export class EvaluationPersistenceService {
  private sessionDirectory: string;
  private currentSession: EvaluationSession | null = null;
  private livePreviewCallbacks: LivePreviewCallback[] = [];

  constructor(baseOutputDirectory: string) {
    this.sessionDirectory = path.join(baseOutputDirectory, '.evaluation-sessions');
    this.ensureDirectoryExists(this.sessionDirectory);
  }

  // Live preview subscription
  onLivePreviewUpdate(callback: LivePreviewCallback): void {
    this.livePreviewCallbacks.push(callback);
  }

  removeLivePreviewCallback(callback: LivePreviewCallback): void {
    const index = this.livePreviewCallbacks.indexOf(callback);
    if (index > -1) {
      this.livePreviewCallbacks.splice(index, 1);
    }
  }

  // Update live preview data
  updateLivePreview(
    conversation: ConversationTurn[],
    currentResponse: string = '',
    isStreaming: boolean = false
  ): void {
    if (!this.currentSession || !this.currentSession.currentModel || !this.currentSession.currentScenario) {
      return;
    }

    // Update session data
    this.currentSession.currentConversation = conversation;
    this.currentSession.currentModelResponse = currentResponse;

    // Find current model and scenario details
    const currentModel = this.currentSession.selectedModels.find(m => m.id === this.currentSession!.currentModel);
    const currentScenario = this.currentSession.selectedScenarios.find(s => s.id === this.currentSession!.currentScenario);

    if (currentModel && currentScenario) {
      const update: LivePreviewUpdate = {
        sessionId: this.currentSession.sessionId,
        modelId: currentModel.id,
        modelName: currentModel.name,
        scenarioId: currentScenario.id,
        scenarioName: currentScenario.name,
        conversation: [...conversation],
        currentResponse,
        isStreaming,
        timestamp: new Date()
      };

      // Notify all callbacks
      this.livePreviewCallbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error('Live preview callback error:', error);
        }
      });
    }

    // Save conversation to file for persistence
    this.saveConversationSnapshot(conversation, currentResponse);
  }

  // Create a new evaluation session
  createSession(
    selectedModels: AvailableModel[],
    selectedScenarios: EvaluationScenario[],
    configuration: EvaluationSession['configuration']
  ): EvaluationSession {
    const sessionId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    
    this.currentSession = {
      sessionId,
      startTime: new Date(),
      lastUpdateTime: new Date(),
      status: 'running',
      selectedModels,
      selectedScenarios,
      configuration,
      totalModels: selectedModels.length,
      completedModels: [],
      currentModel: null,
      currentScenario: null,
      currentConversation: [],
      currentModelResponse: '',
      partialResults: [],
      errors: [],
      elapsedTime: 0,
      modelTimings: {}
    };

    this.saveSession();
    return this.currentSession;
  }

  // Load an existing session for resuming
  loadSession(sessionId: string): EvaluationSession | null {
    try {
      const sessionFile = path.join(this.sessionDirectory, `${sessionId}.json`);
      if (!fs.existsSync(sessionFile)) {
        return null;
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
      
      // Convert date strings back to Date objects
      sessionData.startTime = new Date(sessionData.startTime);
      sessionData.lastUpdateTime = new Date(sessionData.lastUpdateTime);
      sessionData.errors = sessionData.errors.map((error: any) => ({
        ...error,
        timestamp: new Date(error.timestamp)
      }));
      
      // Convert model timing dates
      Object.keys(sessionData.modelTimings).forEach(modelId => {
        const timing = sessionData.modelTimings[modelId];
        timing.start = new Date(timing.start);
        if (timing.end) {
          timing.end = new Date(timing.end);
        }
      });

      this.currentSession = sessionData;
      return sessionData;
    } catch (error) {
      console.error(`Failed to load session ${sessionId}:`, error);
      return null;
    }
  }

  // Get list of available sessions for resuming
  getAvailableSessions(): Array<{
    sessionId: string;
    startTime: Date;
    lastUpdateTime: Date;
    status: string;
    totalModels: number;
    completedModels: number;
    canResume: boolean;
  }> {
    try {
      const sessions: any[] = [];
      const sessionFiles = fs.readdirSync(this.sessionDirectory)
        .filter(file => file.endsWith('.json'));

      for (const file of sessionFiles) {
        try {
          const sessionData = JSON.parse(fs.readFileSync(
            path.join(this.sessionDirectory, file), 'utf8'
          ));
          
          sessions.push({
            sessionId: sessionData.sessionId,
            startTime: new Date(sessionData.startTime),
            lastUpdateTime: new Date(sessionData.lastUpdateTime),
            status: sessionData.status,
            totalModels: sessionData.totalModels,
            completedModels: sessionData.completedModels.length,
            canResume: sessionData.status !== 'completed' && sessionData.completedModels.length < sessionData.totalModels
          });
        } catch (error) {
          console.error(`Failed to parse session file ${file}:`, error);
        }
      }

      // Sort by last update time (most recent first)
      return sessions.sort((a, b) => b.lastUpdateTime.getTime() - a.lastUpdateTime.getTime());
    } catch (error) {
      console.error('Failed to get available sessions:', error);
      return [];
    }
  }

  // Update current session with progress
  updateSessionProgress(
    currentModel: string | null,
    currentScenario: string | null,
    elapsedTime: number
  ): void {
    if (!this.currentSession) return;

    this.currentSession.currentModel = currentModel;
    this.currentSession.currentScenario = currentScenario;
    this.currentSession.elapsedTime = elapsedTime;
    this.currentSession.lastUpdateTime = new Date();

    this.saveSession();
  }

  // Mark model as started
  startModel(modelId: string): void {
    if (!this.currentSession) return;

    this.currentSession.modelTimings[modelId] = {
      start: new Date()
    };

    this.updateSessionProgress(modelId, null, this.currentSession.elapsedTime);
  }

  // Mark model as completed
  completeModel(modelId: string, result: EvaluationResult): void {
    if (!this.currentSession) return;

    // Add to completed models if not already there
    if (!this.currentSession.completedModels.includes(modelId)) {
      this.currentSession.completedModels.push(modelId);
    }

    // Update timing
    if (this.currentSession.modelTimings[modelId]) {
      this.currentSession.modelTimings[modelId].end = new Date();
      const start = this.currentSession.modelTimings[modelId].start;
      const end = this.currentSession.modelTimings[modelId].end!;
      this.currentSession.modelTimings[modelId].duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    }

    // Add result
    this.currentSession.partialResults.push(result);

    // Clear current conversation after completion
    this.currentSession.currentConversation = [];
    this.currentSession.currentModelResponse = '';

    this.saveSession();
  }

  // Skip a model with reason
  skipModel(modelId: string, reason: string): void {
    if (!this.currentSession) return;

    // Add to completed models (so it won't be retried)
    if (!this.currentSession.completedModels.includes(modelId)) {
      this.currentSession.completedModels.push(modelId);
    }

    // Add error record
    this.addError(modelId, undefined, `Model skipped: ${reason}`);

    this.saveSession();
  }

  // Add an error to the session
  addError(modelId: string, scenarioId?: string, error?: string): void {
    if (!this.currentSession) return;

    this.currentSession.errors.push({
      modelId,
      scenarioId,
      error: error || 'Unknown error',
      timestamp: new Date()
    });

    this.saveSession();
  }

  // Update session status
  updateStatus(status: EvaluationSession['status']): void {
    if (!this.currentSession) return;

    this.currentSession.status = status;
    this.currentSession.lastUpdateTime = new Date();
    this.saveSession();
  }

  // Get models that still need to be processed
  getRemainingModels(): AvailableModel[] {
    if (!this.currentSession) return [];

    return this.currentSession.selectedModels.filter(
      model => !this.currentSession!.completedModels.includes(model.id)
    );
  }

  // Get all completed results
  getPartialResults(): EvaluationResult[] {
    return this.currentSession?.partialResults || [];
  }

  // Get current session
  getCurrentSession(): EvaluationSession | null {
    return this.currentSession;
  }

  // Get current conversation for live preview
  getCurrentConversation(): ConversationTurn[] {
    return this.currentSession?.currentConversation || [];
  }

  // Save session to disk
  private saveSession(): void {
    if (!this.currentSession) return;

    try {
      const sessionFile = path.join(this.sessionDirectory, `${this.currentSession.sessionId}.json`);
      fs.writeFileSync(sessionFile, JSON.stringify(this.currentSession, null, 2));
    } catch (error) {
      console.error('Failed to save session:', error);
    }
  }

  // Save conversation snapshot for debugging/analysis
  private saveConversationSnapshot(conversation: ConversationTurn[], currentResponse: string): void {
    if (!this.currentSession) return;

    try {
      const sessionOutputDir = this.getSessionOutputDirectory();
      const snapshotDir = path.join(sessionOutputDir, 'conversation-snapshots');
      this.ensureDirectoryExists(snapshotDir);

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshotFile = path.join(
        snapshotDir,
        `${this.currentSession.currentModel}_${this.currentSession.currentScenario}_${timestamp}.json`
      );

      const snapshot = {
        modelId: this.currentSession.currentModel,
        scenarioId: this.currentSession.currentScenario,
        timestamp: new Date(),
        conversation,
        currentResponse,
        isComplete: currentResponse === '' // Empty response usually means conversation is complete
      };

      fs.writeFileSync(snapshotFile, JSON.stringify(snapshot, null, 2));
    } catch (error) {
      console.error('Failed to save conversation snapshot:', error);
    }
  }

  // Create session-specific output directory
  getSessionOutputDirectory(): string {
    if (!this.currentSession) {
      throw new Error('No active session');
    }

    const sessionOutputDir = path.join(
      this.currentSession.configuration.outputDirectory,
      this.currentSession.sessionId
    );

    this.ensureDirectoryExists(sessionOutputDir);
    return sessionOutputDir;
  }

  // Save intermediate results to session directory
  saveIntermediateResult(modelId: string, result: EvaluationResult): void {
    try {
      const sessionOutputDir = this.getSessionOutputDirectory();
      const resultFile = path.join(sessionOutputDir, `${modelId}_result.json`);
      fs.writeFileSync(resultFile, JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(`Failed to save intermediate result for ${modelId}:`, error);
    }
  }

  // Load all intermediate results from session directory
  loadIntermediateResults(): EvaluationResult[] {
    try {
      const sessionOutputDir = this.getSessionOutputDirectory();
      if (!fs.existsSync(sessionOutputDir)) return [];

      const results: EvaluationResult[] = [];
      const resultFiles = fs.readdirSync(sessionOutputDir)
        .filter(file => file.endsWith('_result.json'));

      for (const file of resultFiles) {
        try {
          const result = JSON.parse(fs.readFileSync(
            path.join(sessionOutputDir, file), 'utf8'
          ));
          results.push(result);
        } catch (error) {
          console.error(`Failed to load result file ${file}:`, error);
        }
      }

      return results;
    } catch (error) {
      console.error('Failed to load intermediate results:', error);
      return [];
    }
  }

  // Get conversation history for a specific model/scenario combination
  getConversationHistory(modelId: string, scenarioId: string): ConversationTurn[] {
    try {
      const sessionOutputDir = this.getSessionOutputDirectory();
      const snapshotDir = path.join(sessionOutputDir, 'conversation-snapshots');
      
      if (!fs.existsSync(snapshotDir)) return [];

      const snapshotFiles = fs.readdirSync(snapshotDir)
        .filter(file => file.startsWith(`${modelId}_${scenarioId}_`) && file.endsWith('.json'))
        .sort(); // Sort by timestamp

      if (snapshotFiles.length === 0) return [];

      // Get the latest snapshot
      const latestSnapshot = snapshotFiles[snapshotFiles.length - 1];
      const snapshot = JSON.parse(fs.readFileSync(
        path.join(snapshotDir, latestSnapshot), 'utf8'
      ));

      return snapshot.conversation || [];
    } catch (error) {
      console.error(`Failed to get conversation history for ${modelId}/${scenarioId}:`, error);
      return [];
    }
  }

  // Clean up old sessions (optional)
  cleanupOldSessions(maxAge: number = 30 * 24 * 60 * 60 * 1000): void { // 30 days default
    try {
      const sessionFiles = fs.readdirSync(this.sessionDirectory)
        .filter(file => file.endsWith('.json'));

      const now = Date.now();

      for (const file of sessionFiles) {
        try {
          const sessionData = JSON.parse(fs.readFileSync(
            path.join(this.sessionDirectory, file), 'utf8'
          ));

          const lastUpdate = new Date(sessionData.lastUpdateTime).getTime();
          if (now - lastUpdate > maxAge && sessionData.status === 'completed') {
            fs.unlinkSync(path.join(this.sessionDirectory, file));
            console.log(`Cleaned up old session: ${sessionData.sessionId}`);
          }
        } catch (error) {
          console.error(`Failed to process session file ${file} for cleanup:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old sessions:', error);
    }
  }

  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  // Delete a specific session
  deleteSession(sessionId: string): void {
    try {
      const sessionFile = path.join(this.sessionDirectory, `${sessionId}.json`);
      if (fs.existsSync(sessionFile)) {
        fs.unlinkSync(sessionFile);
      }

      // Also delete session output directory
      const sessionOutputDir = path.join(this.sessionDirectory, '..', sessionId);
      if (fs.existsSync(sessionOutputDir)) {
        fs.rmSync(sessionOutputDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.error(`Failed to delete session ${sessionId}:`, error);
    }
  }
}