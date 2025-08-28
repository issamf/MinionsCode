import React, { useState, useEffect, useCallback } from 'react';
import { AgentConfig, AIProvider } from '@/shared/types';
import { AgentWidget } from './components/AgentWidget';
import { CreateAgentDialog } from './components/CreateAgentDialog';
import { AgentSettingsDialog } from './components/AgentSettingsDialog';
import { GlobalSettings } from './components/GlobalSettings';
import { QuickChatDialog } from './components/QuickChatDialog';
import { EvaluationDashboardWrapper } from './components/EvaluationDashboardWrapper';
import { webviewLogger } from './utils/webviewLogger';

interface AppState {
  agents: AgentConfig[];
  showCreateDialog: boolean;
  showSettingsDialog: boolean;
  showGlobalSettings: boolean;
  showQuickChat: boolean;
  selectedAgentForSettings: string | null;
  pendingProviderConfig: string | null;
  pendingAgentCreation: Partial<AgentConfig> | null;
  quickChatContext: string | null;
  loading: boolean;
  errorMessage: string | null;
}

export const App: React.FC = () => {
  // Test logging FIRST - before any React hooks
  console.log('=== AI AGENTS APP COMPONENT STARTING ===');
  console.log('Window object available:', typeof window);
  console.log('VSCode API available:', !!(window as any).vscode);
  
  // Check if we should render the evaluation dashboard
  const rootElement = document.getElementById('root');
  const viewType = rootElement?.getAttribute('data-view');
  console.log('View type detected:', viewType);
  
  if (viewType === 'evaluation') {
    console.log('Rendering Evaluation Dashboard');
    return <EvaluationDashboardWrapper />;
  }
  
  const [state, setState] = useState<AppState>({
    agents: [],
    showCreateDialog: false,
    showSettingsDialog: false,
    showGlobalSettings: false,
    showQuickChat: false,
    selectedAgentForSettings: null,
    pendingProviderConfig: null,
    pendingAgentCreation: null,
    quickChatContext: null,
    loading: true,
    errorMessage: null
  });

  // Get VSCode API
  const vscode = (window as any).vscode;
  
  // Test logging immediately on component load
  console.log('=== AI AGENTS WEBVIEW LOADED ===');
  console.log('VSCode API available:', !!vscode);

  // Handle window reload events and ensure proper reinitialization
  useEffect(() => {
    // Handle page visibility changes (when webview becomes visible again after reload)
    const handleVisibilityChange = () => {
      if (!document.hidden && state.loading) {
        console.log('Webview became visible while loading, resending ready message');
        webviewLogger.log('Visibility change detected, ensuring ready message is sent');
        vscode.postMessage({ type: 'ready' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [state.loading, vscode]);

  // Handle messages from extension and initial load
  useEffect(() => {
    // Send ready message to extension when webview loads/reloads
    console.log('Webview initializing, sending ready message');
    console.log('VSCode API available:', !!vscode);
    webviewLogger.log('Webview initializing', { hasVscodeApi: !!vscode, timestamp: Date.now() });
    
    const sendReadyMessage = () => {
      try {
        vscode.postMessage({ type: 'ready' });
        console.log('Ready message sent successfully');
        webviewLogger.log('Ready message sent to extension');
        return true;
      } catch (error) {
        console.error('Failed to send ready message:', error);
        webviewLogger.log('Failed to send ready message', error);
        return false;
      }
    };
    
    // Send ready message immediately and set up retry mechanism
    let initReceived = false;
    let retryCount = 0;
    const maxRetries = 5;
    
    const sendWithRetry = () => {
      if (sendReadyMessage() && !initReceived && retryCount < maxRetries) {
        retryCount++;
        console.log(`Ready message retry ${retryCount}/${maxRetries}`);
        setTimeout(sendWithRetry, 500 * retryCount); // Exponential backoff
      }
    };
    
    sendWithRetry();
    
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      console.log('=== WEBVIEW RECEIVED MESSAGE ===', message);
      webviewLogger.log('Webview received message', { type: message.type, hasData: !!message.data });

      // 🚨 CRITICAL: Check for message forwarding loops
      const messageKey = `${message.type}-${message.data?.agentId}-${message.data?.done}-${message.data?.response?.substring(0, 50)}`;
      const appRecentMessages = (window as any).appRecentMessages = (window as any).appRecentMessages || [];
      
      if (appRecentMessages.includes(messageKey)) {
        console.error('🚨 APP COMPONENT DUPLICATE MESSAGE DETECTED!', {
          messageType: message.type,
          messageKey: messageKey.substring(0, 100),
          recentCount: appRecentMessages.length,
          agentId: message.data?.agentId
        });
        // Don't process duplicate messages - this is likely the infinite loop source!
        return;
      }
      
      // Store message key for duplicate detection (keep last 20)
      appRecentMessages.push(messageKey);
      if (appRecentMessages.length > 20) {
        appRecentMessages.shift();
      }

      switch (message.type) {
        case 'init':
          initReceived = true; // Mark that we received init response
          console.log('Received init message with agents:', message.data.agents);
          webviewLogger.log('Init message received, updating state', {
            agentCount: message.data.agents?.length || 0,
            wasLoading: state.loading
          });
          setState(prev => ({
            ...prev,
            agents: message.data.agents || [],
            loading: false,
            errorMessage: null // Clear any errors on successful init
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

        case 'showQuickChat':
          setState(prev => ({ 
            ...prev, 
            showQuickChat: true,
            quickChatContext: message.data?.selectedText 
          }));
          break;

        case 'messageResponse':
          console.log('=== RECEIVED MESSAGE RESPONSE ===', message.data);
          webviewLogger.log('Received message response from agent', { agentId: message.data?.agentId });
          // Forward to agent widgets using the same message type they expect
          if (message.data?.agentId) {
            console.log('🔄 FORWARDING MESSAGE RESPONSE TO WIDGETS:', {
              agentId: message.data.agentId,
              done: message.data.done,
              responseLength: message.data.response?.length,
              responsePreview: message.data.response?.substring(0, 100),
              timestamp: new Date().toISOString()
            });
            window.postMessage({
              type: 'messageResponse',
              data: message.data
            }, '*');
          }
          break;

        case 'messageThinking':
          console.log('=== RECEIVED THINKING STATE ===', message.data);
          webviewLogger.log('Received thinking state from agent', { agentId: message.data?.agentId });
          // Forward to agent widgets using the same message type they expect
          if (message.data?.agentId) {
            console.log('🔄 FORWARDING THINKING STATE TO WIDGETS:', {
              agentId: message.data.agentId,
              thinking: message.data.thinking,
              timestamp: new Date().toISOString()
            });
            window.postMessage({
              type: 'messageThinking',
              data: message.data
            }, '*');
          }
          break;

        case 'sharedChatResponse':
          console.log('=== RECEIVED SHARED CHAT RESPONSE ===', message.data);
          webviewLogger.log('Received shared chat response', message.data);
          // Forward to all agent widgets for shared chat display
          window.postMessage({
            type: 'sharedChatResponse',
            data: message.data
          }, '*');
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
      webviewLogger.log('Cleaning up event listener');
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

  const handleRefresh = useCallback(() => {
    webviewLogger.log('Manual refresh requested');
    setState(prev => ({ 
      ...prev, 
      loading: true, 
      errorMessage: null // Clear any existing errors on refresh
    }));
    
    try {
      vscode.postMessage({ type: 'ready' });
      webviewLogger.log('Refresh ready message sent successfully');
      
      // Set a timeout to handle stuck loading state
      setTimeout(() => {
        setState(prevState => {
          if (prevState.loading) {
            webviewLogger.log('Refresh timeout reached, showing error');
            return {
              ...prevState,
              loading: false,
              errorMessage: 'Panel refresh timed out. Try using the refresh button again or reload the window.'
            };
          }
          return prevState;
        });
      }, 5000); // 5 second timeout
      
    } catch (error) {
      webviewLogger.log('Failed to send refresh ready message', error);
      setState(prev => ({
        ...prev,
        loading: false,
        errorMessage: 'Failed to refresh panel. Try reloading the window.'
      }));
    }
  }, [vscode]);

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

  const closeQuickChat = useCallback(() => {
    setState(prev => ({ 
      ...prev, 
      showQuickChat: false,
      quickChatContext: null 
    }));
  }, []);

  const handleSendQuickChatMessage = useCallback((message: string, targetAgent?: string) => {
    webviewLogger.log('Sending quick chat message', { message, targetAgent });
    
    // For now, just log the message and close the dialog
    // TODO: Implement actual message routing to agents
    console.log('Quick chat message:', { message, targetAgent });
    
    vscode.postMessage({
      type: 'quickChatMessage',
      data: { message, targetAgent }
    });
    
    closeQuickChat();
  }, [vscode, closeQuickChat]);

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
          <button 
            className="btn btn-secondary" 
            onClick={handleRefresh}
            disabled={state.loading}
            title="Refresh agent data from extension"
          >
            {state.loading ? '🔄 Loading...' : '🔄 Refresh'}
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

      {state.showQuickChat && (
        <QuickChatDialog
          agents={state.agents}
          initialContext={state.quickChatContext}
          onClose={closeQuickChat}
          onSendMessage={handleSendQuickChatMessage}
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