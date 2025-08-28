import React, { useState, useEffect } from 'react';
import { AvailableModel } from '../../services/ModelDiscoveryService';
import { EvaluationScenario } from '../../services/EvaluationScenarioService';
import { EvaluationProgress } from '../../services/EvaluationProgressTracker';
import { LivePreviewUpdate } from '../../services/EvaluationPersistenceService';

interface EvaluationSession {
  sessionId: string;
  startTime: Date;
  lastUpdateTime: Date;
  status: string;
  totalModels: number;
  completedModels: number;
  canResume: boolean;
}

interface EvaluationDashboardProps {
  onStartEvaluation: (models: AvailableModel[], scenarios: EvaluationScenario[], config: EvaluationConfig) => void;
  onStopEvaluation: () => void;
  onResumeEvaluation: (sessionId: string) => void;
  availableModels: AvailableModel[];
  availableScenarios: EvaluationScenario[];
  availableSessions: EvaluationSession[];
  currentProgress?: EvaluationProgress;
  livePreview?: LivePreviewUpdate;
  isRunning: boolean;
}

interface EvaluationConfig {
  timeout: number;
  maxRetries: number;
  includeOnlineModels: boolean;
  enableLivePreview: boolean;
  enableFailsafeMode: boolean;
}

export const EvaluationDashboard: React.FC<EvaluationDashboardProps> = ({
  onStartEvaluation,
  onStopEvaluation,
  onResumeEvaluation,
  availableModels,
  availableScenarios,
  availableSessions,
  currentProgress,
  livePreview,
  isRunning
}) => {
  // State management
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [selectedScenarios, setSelectedScenarios] = useState<Set<string>>(new Set());
  // const [showLivePreview, setShowLivePreview] = useState(true);
  const [activeTab, setActiveTab] = useState<'setup' | 'progress' | 'preview' | 'sessions'>('setup');
  
  const [config, setConfig] = useState<EvaluationConfig>({
    timeout: 120000, // 2 minutes
    maxRetries: 2,
    includeOnlineModels: false,
    enableLivePreview: true,
    enableFailsafeMode: true
  });

  // Auto-switch to progress tab when evaluation starts
  useEffect(() => {
    if (isRunning && activeTab === 'setup') {
      setActiveTab('progress');
    }
  }, [isRunning, activeTab]);

  // Handle model selection
  const handleModelToggle = (modelId: string) => {
    const newSelected = new Set(selectedModels);
    if (newSelected.has(modelId)) {
      newSelected.delete(modelId);
    } else {
      newSelected.add(modelId);
    }
    setSelectedModels(newSelected);
  };

  // Handle scenario selection
  const handleScenarioToggle = (scenarioId: string) => {
    const newSelected = new Set(selectedScenarios);
    if (newSelected.has(scenarioId)) {
      newSelected.delete(scenarioId);
    } else {
      newSelected.add(scenarioId);
    }
    setSelectedScenarios(newSelected);
  };

  // Start evaluation
  const handleStart = () => {
    const selectedModelObjects = availableModels.filter(m => selectedModels.has(m.id));
    const selectedScenarioObjects = availableScenarios.filter(s => selectedScenarios.has(s.id));
    
    if (selectedModelObjects.length === 0) {
      alert('Please select at least one model');
      return;
    }
    if (selectedScenarioObjects.length === 0) {
      alert('Please select at least one scenario');
      return;
    }
    
    onStartEvaluation(selectedModelObjects, selectedScenarioObjects, config);
  };

  // Format time duration
  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  };

  // Format conversation for display
  // const formatConversation = (conversation: any[]): string => {
  //   return conversation.map(turn => 
  //     `${turn.role.toUpperCase()}: ${turn.message}`
  //   ).join('\n\n');
  // };

  return (
    <div className="evaluation-dashboard" style={{ 
      padding: '20px', 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      backgroundColor: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      minHeight: '100vh'
    }}>
      {/* Header */}
      <div style={{ marginBottom: '20px', borderBottom: '2px solid #333', paddingBottom: '10px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>
          🤖 AI Model Evaluation System
        </h1>
        <p style={{ margin: '5px 0 0 0', color: '#666', fontSize: '14px' }}>
          Comprehensive testing and benchmarking of AI models across different scenarios
        </p>
      </div>

      {/* Tab Navigation */}
      <div style={{ marginBottom: '20px' }}>
        {(['setup', 'progress', 'preview', 'sessions'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 20px',
              marginRight: '8px',
              border: '1px solid var(--vscode-panel-border)',
              background: activeTab === tab ? 'var(--vscode-button-background)' : 'var(--vscode-button-secondaryBackground)',
              color: activeTab === tab ? 'var(--vscode-button-foreground)' : 'var(--vscode-button-secondaryForeground)',
              cursor: 'pointer',
              textTransform: 'capitalize',
              borderRadius: '4px',
              fontSize: '14px',
              fontWeight: activeTab === tab ? 'bold' : 'normal'
            }}
          >
            {tab === 'setup' && '⚙️'} 
            {tab === 'progress' && '📊'} 
            {tab === 'preview' && '👁️'} 
            {tab === 'sessions' && '📁'} 
            {tab}
          </button>
        ))}
      </div>

      {/* Setup Tab */}
      {activeTab === 'setup' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20px' }}>
          {/* Model Selection */}
          <div style={{ border: '1px solid #333', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>🤖 Select Models</h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {availableModels.map(model => (
                <div key={model.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={model.id}
                    checked={selectedModels.has(model.id)}
                    onChange={() => handleModelToggle(model.id)}
                    disabled={isRunning}
                    style={{ marginRight: '8px' }}
                  />
                  <label htmlFor={model.id} style={{ flex: 1, fontSize: '12px' }}>
                    <strong>{model.name}</strong>
                    <br />
                    <span style={{ color: '#666' }}>
                      {model.type} • {model.specialization || 'general'}
                    </span>
                  </label>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              Selected: {selectedModels.size} / {availableModels.length}
            </div>
          </div>

          {/* Scenario Selection */}
          <div style={{ border: '1px solid #333', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>🎭 Select Scenarios</h3>
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
              {availableScenarios.map(scenario => (
                <div key={scenario.id} style={{ marginBottom: '8px', display: 'flex', alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    id={scenario.id}
                    checked={selectedScenarios.has(scenario.id)}
                    onChange={() => handleScenarioToggle(scenario.id)}
                    disabled={isRunning}
                    style={{ marginRight: '8px' }}
                  />
                  <label htmlFor={scenario.id} style={{ flex: 1, fontSize: '12px' }}>
                    <strong>{scenario.name}</strong>
                    <br />
                    <span style={{ color: '#666' }}>
                      {scenario.agentType} • {scenario.conversation.length} turns
                    </span>
                  </label>
                </div>
              ))}
            </div>
            <div style={{ marginTop: '10px', fontSize: '12px', color: '#666' }}>
              Selected: {selectedScenarios.size} / {availableScenarios.length}
            </div>
          </div>

          {/* Configuration */}
          <div style={{ border: '1px solid #333', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>⚙️ Configuration</h3>
            
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                Timeout (seconds)
              </label>
              <input
                type="number"
                value={config.timeout / 1000}
                onChange={(e) => setConfig({...config, timeout: parseInt(e.target.value) * 1000})}
                disabled={isRunning}
                style={{ width: '100%', padding: '4px', fontSize: '12px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '12px', marginBottom: '4px' }}>
                Max Retries
              </label>
              <input
                type="number"
                value={config.maxRetries}
                onChange={(e) => setConfig({...config, maxRetries: parseInt(e.target.value)})}
                disabled={isRunning}
                style={{ width: '100%', padding: '4px', fontSize: '12px' }}
              />
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.includeOnlineModels}
                  onChange={(e) => setConfig({...config, includeOnlineModels: e.target.checked})}
                  disabled={isRunning}
                  style={{ marginRight: '8px' }}
                />
                Include Online Models
              </label>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.enableLivePreview}
                  onChange={(e) => setConfig({...config, enableLivePreview: e.target.checked})}
                  disabled={isRunning}
                  style={{ marginRight: '8px' }}
                />
                Enable Live Preview
              </label>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                <input
                  type="checkbox"
                  checked={config.enableFailsafeMode}
                  onChange={(e) => setConfig({...config, enableFailsafeMode: e.target.checked})}
                  disabled={isRunning}
                  style={{ marginRight: '8px' }}
                />
                Enable Fail-safe Mode
              </label>
            </div>

            <button
              onClick={handleStart}
              disabled={isRunning || selectedModels.size === 0 || selectedScenarios.size === 0}
              style={{
                width: '100%',
                padding: '12px',
                fontSize: '14px',
                fontWeight: 'bold',
                background: isRunning ? '#666' : '#007acc',
                color: 'white',
                border: 'none',
                cursor: isRunning ? 'not-allowed' : 'pointer'
              }}
            >
              {isRunning ? '🔄 Running...' : '🚀 Start Evaluation'}
            </button>
          </div>
        </div>
      )}

      {/* Progress Tab */}
      {activeTab === 'progress' && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
          {/* Main Progress */}
          <div style={{ border: '1px solid #333', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>📊 Evaluation Progress</h3>
            
            {/* Global Progress Bar */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
                <span>Global Progress</span>
                <span>{currentProgress?.globalProgress}%</span>
              </div>
              <div style={{ background: '#eee', height: '20px', borderRadius: '4px', overflow: 'hidden' }}>
                <div 
                  style={{ 
                    background: currentProgress?.status === 'error' ? '#ff4444' : 
                                currentProgress?.status === 'cancelled' ? '#ff8800' : '#00aa44',
                    height: '100%', 
                    width: `${currentProgress?.globalProgress}%`,
                    transition: 'width 0.3s ease'
                  }}
                />
              </div>
            </div>

            {/* Current Status */}
            {currentProgress && (
              <div style={{ 
                marginBottom: '20px', 
                padding: '10px', 
                background: 'var(--vscode-textBlockQuote-background)', 
                border: '1px solid var(--vscode-panel-border)',
                borderRadius: '4px' 
              }}>
                <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px', color: 'var(--vscode-foreground)' }}>
                  Status: <span style={{ 
                    color: currentProgress.status === 'running' ? '#00aa44' : 
                           currentProgress.status === 'error' ? '#ff4444' : 
                           currentProgress.status === 'completed' ? '#00aa44' : 'var(--vscode-descriptionForeground)'
                  }}>
                    {currentProgress.status?.toUpperCase() || 'READY'}
                  </span>
                </div>
                <div style={{ fontSize: '12px', marginBottom: '5px', color: 'var(--vscode-foreground)' }}>
                  {currentProgress.currentActivity || 'No active evaluation'}
                </div>
                {currentProgress.lastOutput && (
                  <div style={{ fontSize: '11px', color: 'var(--vscode-descriptionForeground)', fontFamily: 'monospace' }}>
                    Last Output: {currentProgress.lastOutput}
                  </div>
                )}
              </div>
            )}

            {/* Current Model/Scenario */}
            {currentProgress?.currentModel && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Current Model</h4>
                <div style={{ padding: '10px', background: '#e8f4fd', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 'bold' }}>{currentProgress?.currentModel?.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Progress: {currentProgress?.currentModelProgress}%
                  </div>
                  <div style={{ background: '#ddd', height: '8px', borderRadius: '4px', marginTop: '5px' }}>
                    <div 
                      style={{ 
                        background: '#007acc', 
                        height: '100%', 
                        width: `${currentProgress?.currentModelProgress}%`,
                        borderRadius: '4px'
                      }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {currentProgress?.currentScenario && (
              <div style={{ marginBottom: '20px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '14px' }}>Current Scenario</h4>
                <div style={{ padding: '10px', background: '#fff2e8', borderRadius: '4px' }}>
                  <div style={{ fontWeight: 'bold' }}>{currentProgress?.currentScenario?.name}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>
                    Progress: {currentProgress?.currentScenarioProgress}%
                  </div>
                  <div style={{ background: '#ddd', height: '8px', borderRadius: '4px', marginTop: '5px' }}>
                    <div 
                      style={{ 
                        background: '#ff8800', 
                        height: '100%', 
                        width: `${currentProgress?.currentScenarioProgress}%`,
                        borderRadius: '4px'
                      }} 
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Control Buttons */}
            <div style={{ display: 'flex', gap: '10px' }}>
              {isRunning && (
                <button
                  onClick={onStopEvaluation}
                  style={{
                    padding: '10px 20px',
                    background: '#ff4444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    marginRight: '10px'
                  }}
                >
                  ⏹️ Stop Evaluation
                </button>
              )}
              
              {!isRunning && currentProgress?.status === 'cancelled' && (
                <div style={{
                  padding: '10px 20px',
                  background: 'var(--vscode-button-secondaryBackground)',
                  color: 'var(--vscode-foreground)',
                  border: '1px solid var(--vscode-panel-border)',
                  borderRadius: '4px',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  marginRight: '10px'
                }}>
                  ⏸️ Evaluation Stopped
                </div>
              )}
              
              {!isRunning && currentProgress?.status === 'completed' && (
                <div style={{ 
                  padding: '10px 20px',
                  background: '#00aa44',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  display: 'inline-block'
                }}>
                  ✅ Evaluation Completed
                </div>
              )}
              
              {!isRunning && currentProgress && currentProgress.status !== 'completed' && currentProgress.status !== 'cancelled' && (
                <div style={{ 
                  padding: '10px 20px',
                  background: '#444',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '14px',
                  display: 'inline-block'
                }}>
                  ⏸️ Evaluation Stopped
                </div>
              )}
              
              {currentProgress?.canResume && !isRunning && (
                <button
                  onClick={() => onResumeEvaluation('current')}
                  style={{
                    padding: '10px 20px',
                    background: '#00aa44',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 'bold'
                  }}
                >
                  ▶️ Resume Evaluation
                </button>
              )}
            </div>
          </div>

          {/* Statistics Sidebar */}
          <div style={{ border: '1px solid var(--vscode-panel-border)', padding: '15px' }}>
            <h3 style={{ margin: '0 0 15px 0' }}>📈 Statistics</h3>
            
            {currentProgress ? (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>Models</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    {currentProgress.completedModels || 0} / {currentProgress.totalModels || 0}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>Success Rate</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#00aa44' }}>
                    {currentProgress.successfulModels || 0}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>Failed</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff4444' }}>
                    {currentProgress.failedModels || 0}
                  </div>
                </div>

                <div style={{ marginBottom: '15px' }}>
                  <div style={{ fontSize: '12px', color: 'var(--vscode-descriptionForeground)' }}>Skipped</div>
                  <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#ff8800' }}>
                    {currentProgress.skippedModels || 0}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ fontSize: '14px', color: 'var(--vscode-descriptionForeground)', textAlign: 'center', padding: '20px' }}>
                No evaluation data yet.
                <br />
                Start an evaluation to see statistics.
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>Elapsed Time</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                {formatDuration(currentProgress?.elapsed || 0)}
              </div>
            </div>

            {(currentProgress?.estimatedRemaining || 0) > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '12px', color: '#666' }}>Est. Remaining</div>
                <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                  {formatDuration(currentProgress?.estimatedRemaining || 0)}
                </div>
              </div>
            )}

            {/* Recent Errors */}
            {(currentProgress?.errors?.length || 0) > 0 && (
              <div style={{ marginTop: '20px' }}>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  Recent Errors ({currentProgress?.errors?.length || 0})
                </div>
                <div style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '10px' }}>
                  {(currentProgress?.errors || []).slice(-5).map((error, index) => (
                    <div key={index} style={{ 
                      marginBottom: '5px', 
                      padding: '5px', 
                      background: '#ffe6e6', 
                      borderRadius: '3px' 
                    }}>
                      <div style={{ fontWeight: 'bold' }}>{error.modelId}</div>
                      <div>{error.error}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Live Preview Tab */}
      {activeTab === 'preview' && (
        <div style={{ 
          height: '600px', 
          border: '1px solid var(--vscode-panel-border)', 
          display: 'flex', 
          flexDirection: 'column',
          background: 'var(--vscode-editor-background)'
        }}>
          <div style={{ 
            padding: '15px', 
            borderBottom: '1px solid var(--vscode-panel-border)', 
            background: 'var(--vscode-sideBar-background)' 
          }}>
            <h3 style={{ margin: 0, color: 'var(--vscode-foreground)' }}>
              👁️ Live Conversation Preview
              {livePreview && (
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: 'normal', 
                  marginLeft: '10px',
                  color: 'var(--vscode-descriptionForeground)'
                }}>
                  {livePreview.modelName} • {livePreview.scenarioName}
                  {livePreview.isStreaming && <span style={{ color: '#00aa44' }}> • 🔄 Streaming...</span>}
                </span>
              )}
            </h3>
          </div>
          
          <div style={{ 
            flex: 1, 
            padding: '15px', 
            overflowY: 'auto', 
            fontFamily: 'var(--vscode-editor-font-family)', 
            fontSize: '12px',
            background: 'var(--vscode-editor-background)',
            color: 'var(--vscode-editor-foreground)'
          }}>
            {livePreview ? (
              <div>
                <div style={{ 
                  marginBottom: '20px', 
                  padding: '10px', 
                  background: 'var(--vscode-textBlockQuote-background)', 
                  borderRadius: '4px',
                  border: '1px solid var(--vscode-panel-border)'
                }}>
                  <strong style={{ color: 'var(--vscode-foreground)' }}>Model:</strong> <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{livePreview.modelName}</span><br />
                  <strong style={{ color: 'var(--vscode-foreground)' }}>Scenario:</strong> <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{livePreview.scenarioName}</span><br />
                  <strong style={{ color: 'var(--vscode-foreground)' }}>Updated:</strong> <span style={{ color: 'var(--vscode-descriptionForeground)' }}>{new Date(livePreview.timestamp).toLocaleTimeString()}</span>
                </div>
                
                <div style={{ 
                  background: 'var(--vscode-editor-background)', 
                  padding: '15px', 
                  borderRadius: '4px', 
                  whiteSpace: 'pre-wrap',
                  border: '1px solid var(--vscode-panel-border)'
                }}>
                  {livePreview.conversation.map((turn, index) => (
                    <div key={index} style={{ 
                      marginBottom: '15px',
                      padding: '10px',
                      background: turn.role === 'user' 
                        ? 'var(--vscode-diffEditor-insertedTextBackground)' 
                        : 'var(--vscode-diffEditor-removedTextBackground)',
                      borderRadius: '4px',
                      borderLeft: `4px solid ${turn.role === 'user' ? 'var(--vscode-charts-blue)' : 'var(--vscode-charts-green)'}`,
                      color: 'var(--vscode-foreground)'
                    }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        marginBottom: '5px', 
                        textTransform: 'uppercase',
                        color: 'var(--vscode-foreground)'
                      }}>
                        {turn.role === 'user' ? '👤 USER' : '🤖 AGENT'}
                      </div>
                      <div style={{ 
                        color: 'var(--vscode-foreground)',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-word',
                        maxHeight: '300px',
                        overflowY: 'auto',
                        fontFamily: turn.message.includes('```') ? 'var(--vscode-editor-font-family)' : 'inherit'
                      }}>
                        {turn.message}
                      </div>
                    </div>
                  ))}
                  
                  {livePreview.currentResponse && (
                    <div style={{ 
                      marginTop: '15px',
                      padding: '10px',
                      background: 'var(--vscode-diffEditor-removedTextBackground)',
                      borderRadius: '4px',
                      borderLeft: '4px solid var(--vscode-charts-green)',
                      color: 'var(--vscode-foreground)'
                    }}>
                      <div style={{ fontWeight: 'bold', marginBottom: '5px', color: 'var(--vscode-foreground)' }}>
                        🤖 AGENT {livePreview.isStreaming && <span style={{ color: 'var(--vscode-charts-green)' }}>(Streaming...)</span>}
                      </div>
                      <div style={{ color: 'var(--vscode-foreground)' }}>{livePreview.currentResponse}</div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#666', marginTop: '50px' }}>
                <div style={{ fontSize: '48px', marginBottom: '20px' }}>👁️</div>
                <div>Live conversation preview will appear here when evaluation is running</div>
                <div style={{ marginTop: '10px', fontSize: '12px' }}>
                  Enable live preview in configuration to see real-time model interactions
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions Tab */}
      {activeTab === 'sessions' && (
        <div>
          <h3 style={{ margin: '0 0 20px 0' }}>📁 Previous Sessions</h3>
          
          {availableSessions.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#666', padding: '40px' }}>
              <div style={{ fontSize: '48px', marginBottom: '20px' }}>📂</div>
              <div>No previous sessions found</div>
              <div style={{ marginTop: '10px', fontSize: '12px' }}>
                Completed or paused evaluation sessions will appear here for resuming
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {availableSessions.map(session => (
                <div key={session.sessionId} style={{ 
                  border: '1px solid #333', 
                  padding: '15px', 
                  borderRadius: '4px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}>
                  <div>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>
                      Session {session.sessionId.split('_')[1]}
                    </div>
                    <div style={{ fontSize: '12px', color: '#666' }}>
                      Started: {new Date(session.startTime).toLocaleString()}<br />
                      Last Update: {new Date(session.lastUpdateTime).toLocaleString()}<br />
                      Status: <span style={{ 
                        color: session.status === 'completed' ? '#00aa44' : 
                              session.status === 'error' ? '#ff4444' : '#ff8800'
                      }}>
                        {session.status.toUpperCase()}
                      </span><br />
                      Progress: {session.completedModels} / {session.totalModels} models
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {session.canResume && !isRunning && (
                      <button
                        onClick={() => onResumeEvaluation(session.sessionId)}
                        style={{
                          padding: '8px 16px',
                          background: '#00aa44',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        ▶️ Resume
                      </button>
                    )}
                    
                    <button
                      style={{
                        padding: '8px 16px',
                        background: 'transparent',
                        color: '#666',
                        border: '1px solid #666',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                    >
                      📊 View Results
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};