import React, { useState, useEffect, useCallback } from 'react';
import { AgentConfig, AIProvider } from '@/shared/types';
import { AgentWidget } from './components/AgentWidget';
import { CreateAgentDialog } from './components/CreateAgentDialog';
import { AgentSettingsDialog } from './components/AgentSettingsDialog';
import { GlobalSettings } from './components/GlobalSettings';

interface AppState {
  agents: AgentConfig[];
  showCreateDialog: boolean;
  showSettingsDialog: boolean;
  showGlobalSettings: boolean;
  selectedAgentForSettings: string | null;
  pendingProviderConfig: string | null;
  loading: boolean;
}

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    agents: [],
    showCreateDialog: false,
    showSettingsDialog: false,
    showGlobalSettings: false,
    selectedAgentForSettings: null,
    pendingProviderConfig: null,
    loading: true
  });

  // Get VSCode API
  const vscode = (window as any).vscode;

  // Handle messages from extension
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      switch (message.type) {
        case 'init':
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
          console.error('Extension error:', message.data);
          // TODO: Show error notification
          break;

        default:
          console.warn('Unknown message type:', message.type);
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, []);

  const handleCreateAgent = useCallback((agentData: Partial<AgentConfig>) => {
    vscode.postMessage({
      type: 'createAgent',
      data: agentData
    });
  }, [vscode]);

  const handleDestroyAgent = useCallback((agentId: string) => {
    vscode.postMessage({
      type: 'destroyAgent',
      data: { agentId }
    });
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

  const showGlobalSettings = (providerToConfig?: string) => {
    setState(prev => ({ 
      ...prev, 
      showGlobalSettings: true,
      pendingProviderConfig: providerToConfig || null
    }));
  };

  const hideGlobalSettings = () => {
    setState(prev => ({ 
      ...prev, 
      showGlobalSettings: false,
      pendingProviderConfig: null
    }));
  };

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
        />
      )}
    </div>
  );
};