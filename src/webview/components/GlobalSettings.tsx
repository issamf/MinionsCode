import React, { useState, useEffect } from 'react';
import { AIProvider } from '@/shared/types';

interface GlobalSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  initialProvider?: AIProvider;
}

interface APIKeyStatus {
  [AIProvider.ANTHROPIC]: { configured: boolean; valid: boolean; key?: string };
  [AIProvider.OPENAI]: { configured: boolean; valid: boolean; key?: string };
  [AIProvider.OLLAMA]: { configured: boolean; valid: boolean; key?: string };
}

export const GlobalSettings: React.FC<GlobalSettingsProps> = ({ 
  isOpen, 
  onClose, 
  initialProvider 
}) => {
  const [activeTab, setActiveTab] = useState<'providers' | 'general'>('providers');
  const [apiKeyStatus, setApiKeyStatus] = useState<APIKeyStatus>({
    [AIProvider.ANTHROPIC]: { configured: false, valid: false },
    [AIProvider.OPENAI]: { configured: false, valid: false },
    [AIProvider.OLLAMA]: { configured: true, valid: true } // Ollama doesn't need keys
  });
  const [tempKeys, setTempKeys] = useState<{[key in AIProvider]?: string}>({});
  const [testingProvider, setTestingProvider] = useState<AIProvider | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadAPIKeyStatus();
    }
  }, [isOpen]);

  useEffect(() => {
    if (initialProvider && initialProvider !== AIProvider.OLLAMA) {
      setActiveTab('providers');
      // Focus on the specific provider that needs configuration
      const element = document.getElementById(`provider-${initialProvider}`);
      setTimeout(() => element?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [initialProvider]);

  const loadAPIKeyStatus = async () => {
    try {
      window.postMessage({ type: 'getAPIKeyStatus' }, '*');
    } catch (error) {
      console.error('Failed to load API key status:', error);
    }
  };

  const saveAPIKey = async (provider: AIProvider, key: string) => {
    if (!key.trim()) return;
    
    setSaving(true);
    try {
      window.postMessage({
        type: 'saveAPIKey',
        data: { provider, key: key.trim() }
      }, '*');
      
      setApiKeyStatus(prev => ({
        ...prev,
        [provider]: { configured: true, valid: true, key: '***' + key.slice(-4) }
      }));
      
      setTempKeys(prev => ({ ...prev, [provider]: '' }));
      
    } catch (error) {
      console.error('Failed to save API key:', error);
    } finally {
      setSaving(false);
    }
  };

  const testAPIKey = async (provider: AIProvider) => {
    setTestingProvider(provider);
    try {
      window.postMessage({
        type: 'testAPIKey',
        data: { provider }
      }, '*');
    } finally {
      setTimeout(() => setTestingProvider(null), 2000);
    }
  };

  const removeAPIKey = async (provider: AIProvider) => {
    if (!window.confirm(`Remove API key for ${getProviderLabel(provider)}?`)) return;
    
    try {
      window.postMessage({
        type: 'removeAPIKey',
        data: { provider }
      }, '*');
      
      setApiKeyStatus(prev => ({
        ...prev,
        [provider]: { configured: false, valid: false }
      }));
    } catch (error) {
      console.error('Failed to remove API key:', error);
    }
  };

  const getProviderLabel = (provider: AIProvider): string => {
    switch (provider) {
      case AIProvider.ANTHROPIC: return 'Anthropic Claude';
      case AIProvider.OPENAI: return 'OpenAI GPT';
      case AIProvider.OLLAMA: return 'Ollama (Local)';
      default: return 'Unknown Provider';
    }
  };

  const getProviderInfo = (provider: AIProvider) => {
    switch (provider) {
      case AIProvider.ANTHROPIC:
        return {
          description: 'High-quality AI with strong reasoning capabilities',
          signupUrl: 'https://console.anthropic.com/',
          placeholder: 'sk-ant-api03-...',
          instructions: 'Get your API key from the Anthropic Console'
        };
      case AIProvider.OPENAI:
        return {
          description: 'Popular AI models with broad capabilities',
          signupUrl: 'https://platform.openai.com/',
          placeholder: 'sk-...',
          instructions: 'Get your API key from the OpenAI Platform'
        };
      case AIProvider.OLLAMA:
        return {
          description: 'Run AI models locally for complete privacy',
          signupUrl: 'https://ollama.ai/',
          placeholder: 'No API key needed',
          instructions: 'Install Ollama locally and pull models'
        };
      default:
        return {
          description: '',
          signupUrl: '',
          placeholder: '',
          instructions: ''
        };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content global-settings" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Global Settings</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="dialog-tabs">
          <button
            className={`tab-btn ${activeTab === 'providers' ? 'active' : ''}`}
            onClick={() => setActiveTab('providers')}
          >
            AI Providers
          </button>
          <button
            className={`tab-btn ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            General
          </button>
        </div>

        <div className="dialog-body">
          {activeTab === 'providers' && (
            <div className="providers-config">
              <div className="config-intro">
                <p>Configure your AI providers globally. All agents using the same provider will share these credentials.</p>
                {initialProvider && !apiKeyStatus[initialProvider as keyof APIKeyStatus]?.configured && (
                  <div className="config-prompt">
                    <strong>⚡ Setup Required:</strong> Configure {getProviderLabel(initialProvider)} to use this provider in your agents.
                  </div>
                )}
              </div>

              {[AIProvider.ANTHROPIC, AIProvider.OPENAI, AIProvider.OLLAMA].map(provider => {
                const info = getProviderInfo(provider);
                const status = apiKeyStatus[provider as keyof APIKeyStatus];
                const isHighlighted = provider === initialProvider && !status?.configured;

                return (
                  <div 
                    key={provider} 
                    id={`provider-${provider}`}
                    className={`provider-config-card ${isHighlighted ? 'highlighted' : ''}`}
                  >
                    <div className="provider-header">
                      <div className="provider-title">
                        <h3>{getProviderLabel(provider)}</h3>
                        <p>{info.description}</p>
                      </div>
                      <div className="provider-status">
                        {status.configured ? (
                          <span className={`status-indicator ${status.valid ? 'valid' : 'invalid'}`}>
                            {status.valid ? '✅ Connected' : '❌ Invalid'}
                          </span>
                        ) : (
                          <span className="status-indicator not-configured">
                            ⚪ Not configured
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="provider-config">
                      {provider !== AIProvider.OLLAMA ? (
                        <div className="api-key-config">
                          {status.configured ? (
                            <div className="configured-key">
                              <div className="key-info">
                                <span className="key-preview">API Key: {status.key}</span>
                                <div className="key-actions">
                                  <button
                                    className="btn btn-secondary btn-sm"
                                    onClick={() => testAPIKey(provider)}
                                    disabled={testingProvider === provider}
                                  >
                                    {testingProvider === provider ? 'Testing...' : '🔍 Test'}
                                  </button>
                                  <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => removeAPIKey(provider)}
                                  >
                                    🗑️ Remove
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div className="key-input-section">
                              <div className="form-group">
                                <label>API Key</label>
                                <div className="key-input-group">
                                  <input
                                    type="password"
                                    value={tempKeys[provider] || ''}
                                    onChange={(e) => setTempKeys(prev => ({
                                      ...prev,
                                      [provider]: e.target.value
                                    }))}
                                    placeholder={info.placeholder}
                                    onKeyPress={(e) => {
                                      if (e.key === 'Enter' && tempKeys[provider]) {
                                        saveAPIKey(provider, tempKeys[provider]);
                                      }
                                    }}
                                  />
                                  <button
                                    className="btn btn-primary btn-sm"
                                    onClick={() => tempKeys[provider] && saveAPIKey(provider, tempKeys[provider])}
                                    disabled={!tempKeys[provider] || saving}
                                  >
                                    {saving ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                              <div className="provider-help">
                                <p>{info.instructions}</p>
                                <a 
                                  href={info.signupUrl} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="get-key-link"
                                >
                                  🔗 Get API Key
                                </a>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="ollama-config">
                          <div className="ollama-status">
                            <div className="ollama-info">
                              <p>✅ No configuration needed - runs locally</p>
                              <div className="ollama-links">
                                <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
                                  📥 Download Ollama
                                </a>
                                <span>•</span>
                                <a href="https://github.com/ollama/ollama#quickstart" target="_blank" rel="noopener noreferrer">
                                  📖 Quick Start Guide
                                </a>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {activeTab === 'general' && (
            <div className="general-config">
              <div className="config-section">
                <h3>Extension Settings</h3>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" defaultChecked />
                    Enable debug logging
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" defaultChecked />
                    Auto-save agent positions
                  </label>
                </div>
                <div className="setting-item">
                  <label>
                    <input type="checkbox" defaultChecked />
                    Show typing indicators
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
};