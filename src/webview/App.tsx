import React, { useState, useEffect, useCallback } from 'react';
import { AgentConfig } from '@/shared/types';
import { AgentWidget } from './components/AgentWidget';
import { CreateAgentDialog } from './components/CreateAgentDialog';

interface AppState {
  agents: AgentConfig[];
  showCreateDialog: boolean;
  loading: boolean;
}

export const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    agents: [],
    showCreateDialog: false,
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
    vscode.postMessage({
      type: 'showAgentSettings',
      data: { agentId }
    });
  }, [vscode]);

  const showCreateDialog = () => {
    setState(prev => ({ ...prev, showCreateDialog: true }));
  };

  const hideCreateDialog = () => {
    setState(prev => ({ ...prev, showCreateDialog: false }));
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
            {state.agents.map((agent) => (
              <AgentWidget
                key={agent.id}
                agent={agent}
                onSendMessage={handleSendMessage}
                onDestroy={handleDestroyAgent}
                onShowSettings={handleShowSettings}
              />
            ))}
          </div>
        )}
      </main>

      {state.showCreateDialog && (
        <CreateAgentDialog
          onClose={hideCreateDialog}
          onCreate={handleCreateAgent}
        />
      )}
    </div>
  );
};