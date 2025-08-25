import React, { useState, useEffect, useCallback } from 'react';
import { AgentConfig, AIProvider } from '@/shared/types';
import { AgentWidget } from './components/AgentWidget';
import { CreateAgentDialog } from './components/CreateAgentDialog';
import { AgentSettingsDialog } from './components/AgentSettingsDialog';
import { GlobalSettings } from './components/GlobalSettings';
import { webviewLogger } from './utils/webviewLogger';

interface AppState {
  agents: AgentConfig[];
  showCreateDialog: boolean;
  showSettingsDialog: boolean;
  showGlobalSettings: boolean;
  selectedAgentForSettings: string | null;
  pendingProviderConfig: string | null;
  pendingAgentCreation: Partial<AgentConfig> | null;
  loading: boolean;
  errorMessage: string | null;
}

export const App: React.FC = () => {
  // Test logging FIRST - before any React hooks
  console.log('=== AI AGENTS APP COMPONENT STARTING ===');
  console.log('Window object available:', typeof window);
  console.log('VSCode API available:', !!(window as any).vscode);
  
  const [state, setState] = useState<AppState>({
    agents: [],
    showCreateDialog: false,
    showSettingsDialog: false,
    showGlobalSettings: false,
    selectedAgentForSettings: null,
    pendingProviderConfig: null,
    pendingAgentCreation: null,
    loading: true,
    errorMessage: null
  });

  // Get VSCode API
  const vscode = (window as any).vscode;
  
  // Test logging immediately on component load
  console.log('=== AI AGENTS WEBVIEW LOADED ===');
  console.log('VSCode API available:', !!vscode);

  // Handle messages from extension
  useEffect(() => {
    // Send ready message to extension when webview loads
    console.log('Webview loaded, sending ready message');
    console.log('VSCode API available:', !!vscode);
    webviewLogger.log('Webview initializing', { hasVscodeApi: !!vscode });
    
    // Test message to ensure communication works
    console.log('Testing vscode.postMessage...');
    try {
      vscode.postMessage({ type: 'ready' });
      console.log('Ready message sent successfully');
      webviewLogger.log('Ready message sent to extension');
    } catch (error) {
      console.error('Failed to send ready message:', error);
      webviewLogger.log('Failed to send ready message', error);
    }
    
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      console.log('=== WEBVIEW RECEIVED MESSAGE ===', message);
      webviewLogger.log('Webview received message', { type: message.type, hasData: !!message.data });

      switch (message.type) {
        case 'init':
          console.log('Received init message with agents:', message.data.agents);
          setState(prev => ({
            ...prev,
            agents: message.data.agents || [],
            loading: false
          }));
          break;

        case 'agentCreated':
          setState(prev => ({
            ...prev,
            agents: [...prev.agents, message.data],
            showCreateDialog: false
          }));
          break;

        case 'agentDestroyed':
          setState(prev => ({
            ...prev,
            agents: prev.agents.filter(agent => agent.id !== message.data.agentId)
          }));
          break;

        case 'agentUpdated':
          setState(prev => ({
            ...prev,
            agents: prev.agents.map(agent =>
              agent.id === message.data.id ? message.data : agent
            )
          }));
          break;

        case 'showCreateAgentDialog':
          setState(prev => ({ ...prev, showCreateDialog: true }));
          break;

        case 'error':
          console.log('=== RECEIVED ERROR MESSAGE ===', message.data);
          console.error('Extension error:', message.data);
          webviewLogger.log('Received error message from extension', message.data);
          setState(prev => ({
            ...prev,
            errorMessage: message.data.message || 'An unknown error occurred'
          }));
          webviewLogger.log('Error message set in state', { message: message.data.message });
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    };

    console.log('Adding message event listener');
    webviewLogger.log('Adding message event listener to window');
    window.addEventListener('message', messageHandler);
    
    return () => {
      console.log('Removing message event listener');
      webviewLogger.log('Removing message event listener from window');
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  const handleCreateAgent = useCallback((agentData: Partial<AgentConfig>) => {
    console.log('=== WEBVIEW handleCreateAgent CALLED ===', agentData);
    webviewLogger.log('handleCreateAgent called', agentData);
    
    try {
      console.log('Sending createAgent message to extension...');
      vscode.postMessage({
        type: 'createAgent',
        data: agentData
      });
      console.log('createAgent message sent successfully');
      webviewLogger.log('createAgent message sent to extension');
    } catch (error) {
      console.error('Failed to send createAgent message:', error);
      webviewLogger.log('Failed to send createAgent message', error);
    }
  }, [vscode]);

  const handleDestroyAgent = useCallback((agentId: string) => {
    webviewLogger.log('handleDestroyAgent called', { agentId });
    vscode.postMessage({
      type: 'destroyAgent',
      data: { agentId }
    });
    webviewLogger.log('destroyAgent message sent to extension');
  }, [vscode]);

  const handleSendMessage = useCallback((agentId: string, message: string) => {
    vscode.postMessage({
      type: 'sendMessage',
      data: { agentId, message }
    });
  }, [vscode]);

  const handleShowSettings = useCallback((agentId: string) => {
    setState(prev => ({ 
      ...prev, 
      showSettingsDialog: true,
      selectedAgentForSettings: agentId
    }));
  }, []);

  const handleSaveAgentSettings = useCallback((agentId: string, updates: Partial<AgentConfig>) => {
    vscode.postMessage({
      type: 'updateAgent',
      data: { agentId, updates }
    });
  }, [vscode]);

  const handleCloseSettings = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      showSettingsDialog: false,
      selectedAgentForSettings: null
    }));
  }, []);

  const showCreateDialog = () => {
    setState(prev => ({ ...prev, showCreateDialog: true }));
  };

  const hideCreateDialog = () => {
    setState(prev => ({ ...prev, showCreateDialog: false }));
  };

  const showGlobalSettings = (providerToConfig?: AIProvider, agentData?: Partial<AgentConfig>) => {
    setState(prev => ({ 
      ...prev, 
      showGlobalSettings: true,
      pendingProviderConfig: providerToConfig || null,
      pendingAgentCreation: agentData || null
    }));
  };

  const hideGlobalSettings = () => {
    setState(prev => ({ 
      ...prev, 
      showGlobalSettings: false,
      pendingProviderConfig: null
    }));
  };

  const dismissError = () => {
    setState(prev => ({ ...prev, errorMessage: null }));
  };

  const handleProviderConfigured = useCallback((_provider: AIProvider) => {
    // If we have a pending agent creation, complete it now
    if (state.pendingAgentCreation) {
      handleCreateAgent(state.pendingAgentCreation);
      setState(prev => ({ 
        ...prev, 
        showGlobalSettings: false,
        pendingProviderConfig: null,
        pendingAgentCreation: null
      }));
    }
  }, [state.pendingAgentCreation]);

  if (state.loading) {
    return (
      <div className="app">
        <div className="empty-state">
          <div className="loading-spinner-small"></div>
          <div>Loading AI Agents...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app fade-in">
      {state.errorMessage && (
        <div className="error-banner">
          <div className="error-content">
            <span className="error-icon">⚠️</span>
            <span className="error-text">{state.errorMessage}</span>
            <button className="error-dismiss" onClick={dismissError}>✕</button>
          </div>
        </div>
      )}
      
      <header className="app-header">
        <h1 className="app-title">AI Agents</h1>
        <div className="header-actions">
          <button className="btn btn-primary" onClick={showCreateDialog}>
            + Create Agent
          </button>
          <button className="btn btn-secondary" onClick={() => showGlobalSettings()}>
            ⚙️ Settings
          </button>
          <button className="btn btn-secondary" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      </header>

      <main className="agents-container">
        {state.agents.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🤖</div>
            <h2 className="empty-state-title">No AI Agents Yet</h2>
            <p className="empty-state-description">
              Create your first AI agent to start collaborating with specialized assistants
              for your development workflow.
            </p>
            <button className="btn btn-primary" onClick={showCreateDialog}>
              Create Your First Agent
            </button>
          </div>
        ) : (
          <div className="agents-grid">
            {(() => {
              console.log('Rendering agents:', state.agents.length);
              webviewLogger.log('Rendering agents', { count: state.agents.length, agentIds: state.agents.map(a => a.id) });
              return null;
            })()}
            {state.agents.map((agent, index) => (
              <AgentWidget
                key={agent.id}
                agent={agent}
                onSendMessage={handleSendMessage}
                onDestroy={handleDestroyAgent}
                onShowSettings={handleShowSettings}
                initialPosition={{
                  x: (index % 3) * 420 + 20,
                  y: Math.floor(index / 3) * 320 + 20
                }}
              />
            ))}
          </div>
        )}
      </main>

      {state.showCreateDialog && (
        <CreateAgentDialog
          onClose={hideCreateDialog}
          onCreate={handleCreateAgent}
          onShowGlobalSettings={showGlobalSettings}
        />
      )}

      {state.showSettingsDialog && state.selectedAgentForSettings && (
        <AgentSettingsDialog
          agent={state.agents.find(a => a.id === state.selectedAgentForSettings)!}
          isOpen={state.showSettingsDialog}
          onClose={handleCloseSettings}
          onSave={handleSaveAgentSettings}
        />
      )}

      {state.showGlobalSettings && (
        <GlobalSettings
          isOpen={state.showGlobalSettings}
          onClose={hideGlobalSettings}
          initialProvider={state.pendingProviderConfig as AIProvider}
          onProviderConfigured={handleProviderConfigured}
        />
      )}
    </div>
  );
};