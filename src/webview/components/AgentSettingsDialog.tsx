import React, { useState, useEffect } from 'react';
import { AgentConfig, AIProvider, PermissionType } from '@/shared/types';

interface AgentSettingsDialogProps {
  agent: AgentConfig;
  isOpen: boolean;
  onClose: () => void;
  onSave: (agentId: string, updates: Partial<AgentConfig>) => void;
}

export const AgentSettingsDialog: React.FC<AgentSettingsDialogProps> = ({
  agent,
  isOpen,
  onClose,
  onSave
}) => {
  const [formData, setFormData] = useState<Partial<AgentConfig>>({});
  const [activeTab, setActiveTab] = useState<'model' | 'prompt' | 'permissions'>('model');
  const [availableModels, setAvailableModels] = useState<{ [key: string]: string[] }>({});
  const [modelLoadingStates, setModelLoadingStates] = useState<{ [key: string]: boolean }>({});
  const [modelMessages, setModelMessages] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (isOpen && agent) {
      setFormData({
        name: agent.name,
        model: { ...agent.model },
        systemPrompt: agent.systemPrompt,
        permissions: Array.isArray(agent.permissions) ? [...agent.permissions] : []
      });
    }
  }, [isOpen, agent]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      if (message.type === 'availableModels') {
        setAvailableModels(prev => ({
          ...prev,
          [message.data.provider]: message.data.models
        }));
        
        setModelLoadingStates(prev => ({
          ...prev,
          [message.data.provider]: false
        }));
        
        if (message.data.message) {
          setModelMessages(prev => ({
            ...prev,
            [message.data.provider]: message.data.message
          }));
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchModelsForProvider = (provider: AIProvider) => {
    setModelLoadingStates(prev => ({ ...prev, [provider]: true }));
    setModelMessages(prev => ({ ...prev, [provider]: '' }));
    
    (window as any).vscode.postMessage({
      type: 'getAvailableModels',
      data: { provider: provider.toLowerCase() }
    });
  };

  useEffect(() => {
    if (isOpen && formData.model?.provider) {
      fetchModelsForProvider(formData.model.provider);
    }
  }, [isOpen, formData.model?.provider]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(agent.id, formData);
    onClose();
  };

  const handleModelChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      model: {
        ...prev.model!,
        [field]: value
      }
    }));
    
    if (field === 'provider') {
      fetchModelsForProvider(value);
    }
  };

  const handlePermissionChange = (permissionType: PermissionType, value: boolean) => {
    setFormData(prev => {
      const currentPermissions = Array.isArray(prev.permissions) ? prev.permissions : [];
      const updatedPermissions = currentPermissions.filter(p => p && p.type !== permissionType);
      
      if (value) {
        updatedPermissions.push({
          type: permissionType,
          granted: true
        });
      }
      
      return {
        ...prev,
        permissions: updatedPermissions
      };
    });
  };

  const hasPermission = (permissionType: PermissionType): boolean => {
    if (!formData.permissions || !Array.isArray(formData.permissions)) {
      return false;
    }
    return formData.permissions.some(p => p && p.type === permissionType && p.granted);
  };

  const availableProviders = [
    { value: AIProvider.OLLAMA, label: 'Ollama (Local)' },
    { value: AIProvider.ANTHROPIC, label: 'Anthropic Claude' },
    { value: AIProvider.OPENAI, label: 'OpenAI GPT' }
  ];

  const getModelsForProvider = (provider: AIProvider): string[] => {
    const providerKey = provider.toLowerCase();
    
    if (availableModels[providerKey]) {
      return availableModels[providerKey];
    }
    
    switch (provider) {
      case AIProvider.ANTHROPIC:
        return ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307', 'claude-3-opus-20240229'];
      case AIProvider.OPENAI:
        return ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
      case AIProvider.OLLAMA:
        return [];
      default:
        return [];
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Settings for {agent.name}</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="dialog-tabs">
          <button
            className={`tab-btn ${activeTab === 'model' ? 'active' : ''}`}
            onClick={() => setActiveTab('model')}
          >
            Model & Performance
          </button>
          <button
            className={`tab-btn ${activeTab === 'prompt' ? 'active' : ''}`}
            onClick={() => setActiveTab('prompt')}
          >
            System Prompt
          </button>
          <button
            className={`tab-btn ${activeTab === 'permissions' ? 'active' : ''}`}
            onClick={() => setActiveTab('permissions')}
          >
            Permissions
          </button>
        </div>

        <div className="dialog-body">
          {activeTab === 'model' && (
            <div className="settings-section">
              <div className="form-group">
                <label htmlFor="agent-name">Agent Name</label>
                <input
                  id="agent-name"
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Agent name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="provider">AI Provider</label>
                <select
                  id="provider"
                  value={formData.model?.provider || ''}
                  onChange={(e) => handleModelChange('provider', e.target.value as AIProvider)}
                >
                  {availableProviders.map(provider => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="model-name">Model</label>
                <select
                  id="model-name"
                  value={formData.model?.modelName || ''}
                  onChange={(e) => handleModelChange('modelName', e.target.value)}
                  disabled={modelLoadingStates[formData.model?.provider?.toLowerCase() || '']}
                >
                  {modelLoadingStates[formData.model?.provider?.toLowerCase() || ''] && (
                    <option value="">Loading models...</option>
                  )}
                  {!modelLoadingStates[formData.model?.provider?.toLowerCase() || ''] && 
                   getModelsForProvider(formData.model?.provider || AIProvider.OLLAMA).length === 0 && (
                    <option value="">
                      {modelMessages[formData.model?.provider?.toLowerCase() || ''] || 'No models available'}
                    </option>
                  )}
                  {!modelLoadingStates[formData.model?.provider?.toLowerCase() || ''] && 
                   getModelsForProvider(formData.model?.provider || AIProvider.OLLAMA).map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="temperature">Temperature ({formData.model?.temperature || 0.7})</label>
                <input
                  id="temperature"
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.model?.temperature || 0.7}
                  onChange={(e) => handleModelChange('temperature', parseFloat(e.target.value))}
                />
                <div className="range-labels">
                  <span>Focused</span>
                  <span>Balanced</span>
                  <span>Creative</span>
                </div>
              </div>

              <div className="form-group">
                <label htmlFor="max-tokens">Max Tokens</label>
                <input
                  id="max-tokens"
                  type="number"
                  value={formData.model?.maxTokens || 4000}
                  onChange={(e) => handleModelChange('maxTokens', parseInt(e.target.value))}
                  min="100"
                  max="32000"
                />
              </div>
            </div>
          )}

          {activeTab === 'prompt' && (
            <div className="settings-section">
              <div className="form-group">
                <label htmlFor="system-prompt">System Prompt</label>
                <textarea
                  id="system-prompt"
                  value={formData.systemPrompt || ''}
                  onChange={(e) => setFormData(prev => ({ ...prev, systemPrompt: e.target.value }))}
                  placeholder="Define the agent's role, personality, and capabilities..."
                  rows={12}
                />
              </div>
              <div className="prompt-help">
                <p><strong>Tips:</strong></p>
                <ul>
                  <li>Be specific about the agent's role and expertise</li>
                  <li>Define communication style and personality</li>
                  <li>Specify any constraints or guidelines</li>
                  <li>Mention available tools and capabilities</li>
                </ul>
              </div>
            </div>
          )}

          {activeTab === 'permissions' && (
            <div className="settings-section">
              <div className="permission-group">
                <h3>File Operations</h3>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPermission(PermissionType.WRITE_FILES)}
                    onChange={(e) => handlePermissionChange(PermissionType.WRITE_FILES, e.target.checked)}
                  />
                  Can create and modify files
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPermission(PermissionType.READ_FILES)}
                    onChange={(e) => handlePermissionChange(PermissionType.READ_FILES, e.target.checked)}
                  />
                  Can read project files
                </label>
              </div>

              <div className="permission-group">
                <h3>System Operations</h3>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPermission(PermissionType.EXECUTE_COMMANDS)}
                    onChange={(e) => handlePermissionChange(PermissionType.EXECUTE_COMMANDS, e.target.checked)}
                  />
                  Can execute shell commands
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPermission(PermissionType.NETWORK_ACCESS)}
                    onChange={(e) => handlePermissionChange(PermissionType.NETWORK_ACCESS, e.target.checked)}
                  />
                  Can access network resources
                </label>
              </div>

              <div className="permission-group">
                <h3>Git Operations</h3>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={hasPermission(PermissionType.GIT_OPERATIONS)}
                    onChange={(e) => handlePermissionChange(PermissionType.GIT_OPERATIONS, e.target.checked)}
                  />
                  Can perform git operations
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={handleSave}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};