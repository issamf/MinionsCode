import React, { useState, useEffect } from 'react';
import { EvaluationDashboard } from './EvaluationDashboard';
import type { EvaluationProgress } from '../../services/EvaluationProgressTracker';
import type { LivePreviewUpdate } from '../../services/EvaluationPersistenceService';

export const EvaluationDashboardWrapper: React.FC = () => {
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [availableScenarios, setAvailableScenarios] = useState<any[]>([]);
  const [availableSessions, setAvailableSessions] = useState<any[]>([]);
  const [currentProgress, setCurrentProgress] = useState<EvaluationProgress | undefined>();
  const [livePreview, setLivePreview] = useState<LivePreviewUpdate | undefined>();
  const [isRunning, setIsRunning] = useState(false);

  // Get VSCode API
  const vscode = (window as any).vscode;

  useEffect(() => {
    console.log('EvaluationDashboardWrapper mounted');
    
    // Request initial data
    if (vscode) {
      vscode.postMessage({ type: 'getAvailableModels' });
      vscode.postMessage({ type: 'getAvailableScenarios' });
      vscode.postMessage({ type: 'getAvailableSessions' });
    }

    // Listen for messages from extension
    const messageListener = (event: MessageEvent) => {
      const message = event.data;
      console.log('Received message:', message);
      
      switch (message.type) {
        case 'availableModels':
          setAvailableModels(message.data || []);
          break;
        case 'availableScenarios':
          setAvailableScenarios(message.data || []);
          break;
        case 'availableSessions':
          setAvailableSessions(message.data || []);
          break;
        case 'evaluationStarted':
          setIsRunning(true);
          console.log('Evaluation started:', message.data);
          break;
        case 'evaluationStopped':
          setIsRunning(false);
          console.log('Evaluation stopped:', message.data);
          break;
        case 'evaluationProgress':
          setCurrentProgress(message.data);
          break;
        case 'evaluationCompleted':
          setIsRunning(false);
          console.log('Evaluation completed:', message.data);
          break;
        case 'evaluationError':
          setIsRunning(false);
          console.error('Evaluation error:', message.data);
          break;
        case 'livePreview':
          setLivePreview(message.data);
          break;
        case 'error':
          console.error('Extension error:', message.data);
          break;
      }
    };

    window.addEventListener('message', messageListener);
    
    return () => {
      window.removeEventListener('message', messageListener);
    };
  }, [vscode]);

  const handleStartEvaluation = (selectedModels: any[], selectedScenarios: any[]) => {
    console.log('Starting evaluation with:', { selectedModels, selectedScenarios });
    setIsRunning(true);
    
    if (vscode) {
      vscode.postMessage({
        type: 'startEvaluation',
        data: { selectedModels, selectedScenarios }
      });
    }
  };

  const handleStopEvaluation = () => {
    console.log('Stopping evaluation');
    setIsRunning(false);
    
    if (vscode) {
      vscode.postMessage({ type: 'stopEvaluation' });
    }
  };

  const handleResumeEvaluation = (sessionId: string) => {
    console.log('Resuming evaluation:', sessionId);
    setIsRunning(true);
    
    if (vscode) {
      vscode.postMessage({
        type: 'resumeEvaluation',
        data: { sessionId }
      });
    }
  };

  return (
    <EvaluationDashboard
      onStartEvaluation={handleStartEvaluation}
      onStopEvaluation={handleStopEvaluation}
      onResumeEvaluation={handleResumeEvaluation}
      availableModels={availableModels}
      availableScenarios={availableScenarios}
      availableSessions={availableSessions}
      currentProgress={currentProgress}
      livePreview={livePreview}
      isRunning={isRunning}
    />
  );
};