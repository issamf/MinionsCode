import React, { useState, useEffect } from 'react';
import { AIProvider } from '@/shared/types';

interface APIKeyManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

type SupportedProvider = AIProvider.ANTHROPIC | AIProvider.OPENAI | AIProvider.OLLAMA;

interface APIKeyStatus {
  [AIProvider.ANTHROPIC]: { configured: boolean; valid: boolean };
  [AIProvider.OPENAI]: { configured: boolean; valid: boolean };
  [AIProvider.OLLAMA]: { configured: boolean; valid: boolean };
}

export const APIKeyManager: React.FC<APIKeyManagerProps> = ({ isOpen, onClose }) => {
  const [apiKeys, setApiKeys] = useState({
    [AIProvider.ANTHROPIC]: '',
    [AIProvider.OPENAI]: '',
    [AIProvider.OLLAMA]: ''
  });
  const [status, setStatus] = useState<APIKeyStatus>({
    [AIProvider.ANTHROPIC]: { configured: false, valid: false },
    [AIProvider.OPENAI]: { configured: false, valid: false },
    [AIProvider.OLLAMA]: { configured: false, valid: false }
  });
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadAPIKeys();
    }
  }, [isOpen]);

  const loadAPIKeys = () => {
    // Request current API key status from extension
    window.postMessage({
      type: 'getAPIKeyStatus'
    }, '*');
  };

  const saveAPIKey = async (provider: SupportedProvider, key: string) => {
    setSaving(provider);
    try {
      window.postMessage({
        type: 'saveAPIKey',
        data: { provider, key }
      }, '*');
      
      // Update local state
      setApiKeys(prev => ({ ...prev, [provider]: key }));
      setStatus(prev => ({ 
        ...prev, 
        [provider]: { configured: !!key, valid: true }
      }));
    } finally {
      setSaving(null);
    }
  };

  const testConnection = async (provider: SupportedProvider) => {
    setSaving(provider);
    try {
      window.postMessage({
        type: 'testAPIKey',
        data: { provider }
      }, '*');
    } finally {
      setSaving(null);
    }
  };

  const getProviderInfo = (provider: SupportedProvider) => {
    switch (provider) {
      case AIProvider.ANTHROPIC:
        return {
          name: 'Anthropic Claude',
          description: 'High-quality AI with strong reasoning capabilities',
          signupUrl: 'https://console.anthropic.com/',
          docsUrl: 'https://docs.anthropic.com/',
          keyPlaceholder: 'sk-ant-api03-...',
          features: ['Advanced reasoning', 'Code analysis', 'Long context', 'Safe responses']
        };
      case AIProvider.OPENAI:
        return {
          name: 'OpenAI GPT',
          description: 'Popular AI models with broad capabilities',
          signupUrl: 'https://platform.openai.com/',
          docsUrl: 'https://platform.openai.com/docs',
          keyPlaceholder: 'sk-...',
          features: ['Fast responses', 'Code generation', 'Diverse capabilities', 'Function calling']
        };
      case AIProvider.OLLAMA:
        return {
          name: 'Ollama (Local)',
          description: 'Run AI models locally for privacy and speed',
          signupUrl: 'https://ollama.ai/',
          docsUrl: 'https://github.com/ollama/ollama',
          keyPlaceholder: 'No API key needed - runs locally',
          features: ['Complete privacy', 'No API costs', 'Offline usage', 'Custom models']
        };
      default:
        return {
          name: 'Unknown Provider',
          description: '',
          signupUrl: '',
          docsUrl: '',
          keyPlaceholder: '',
          features: []
        };
    }
  };

  if (!isOpen) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-content api-key-manager" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>AI Provider Configuration</h2>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="dialog-body">
          <div className="provider-intro">
            <p>Configure your AI providers to enable agent capabilities. You can use multiple providers and switch between them for different agents.</p>
          </div>

          {([AIProvider.ANTHROPIC, AIProvider.OPENAI, AIProvider.OLLAMA] as SupportedProvider[]).map(provider => {
            const info = getProviderInfo(provider);
            const providerStatus = status[provider];
            
            return (
              <div key={provider} className="provider-section">
                <div className="provider-header">
                  <div className="provider-info">
                    <h3>{info.name}</h3>
                    <p>{info.description}</p>
                    <div className="provider-features">
                      {info.features.map(feature => (
                        <span key={feature} className="feature-tag">{feature}</span>
                      ))}
                    </div>
                  </div>
                  <div className="provider-status">
                    {providerStatus.configured ? (
                      <span className={`status-badge ${providerStatus.valid ? 'valid' : 'invalid'}`}>
                        {providerStatus.valid ? '✅ Connected' : '❌ Invalid'}
                      </span>
                    ) : (
                      <span className="status-badge not-configured">⚪ Not configured</span>
                    )}
                  </div>
                </div>

                {provider !== AIProvider.OLLAMA ? (
                  <div className="provider-config">
                    <div className="form-group">
                      <label htmlFor={`${provider}-key`}>API Key</label>
                      <div className="key-input-group">
                        <input
                          id={`${provider}-key`}
                          type="password"
                          value={apiKeys[provider]}
                          onChange={(e) => setApiKeys(prev => ({ ...prev, [provider]: e.target.value }))}
                          placeholder={info.keyPlaceholder}
                        />
                        <button
                          className="btn btn-secondary"
                          onClick={() => saveAPIKey(provider, apiKeys[provider])}
                          disabled={saving === provider || !apiKeys[provider]}
                        >
                          {saving === provider ? 'Saving...' : 'Save'}
                        </button>
                        {providerStatus.configured && (
                          <button
                            className="btn btn-secondary"
                            onClick={() => testConnection(provider)}
                            disabled={saving === provider}
                          >
                            {saving === provider ? 'Testing...' : 'Test'}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="provider-links">
                      <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
                        🔗 Get API Key
                      </a>
                      <a href={info.docsUrl} target="_blank" rel="noopener noreferrer">
                        📖 Documentation
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="provider-config ollama-config">
                    <div className="ollama-status">
                      {providerStatus.configured ? (
                        <div className="ollama-connected">
                          <p>✅ Ollama is running and available</p>
                          <button
                            className="btn btn-secondary"
                            onClick={() => testConnection(provider)}
                            disabled={saving === provider}
                          >
                            {saving === provider ? 'Testing...' : 'Refresh Models'}
                          </button>
                        </div>
                      ) : (
                        <div className="ollama-not-found">
                          <p>❌ Ollama not detected</p>
                          <div className="setup-instructions">
                            <h4>Quick Setup:</h4>
                            <ol>
                              <li>Download Ollama from <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">ollama.ai</a></li>
                              <li>Run: <code>ollama pull llama3.1</code></li>
                              <li>Restart this extension</li>
                            </ol>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="provider-links">
                      <a href={info.signupUrl} target="_blank" rel="noopener noreferrer">
                        📥 Download Ollama
                      </a>
                      <a href={info.docsUrl} target="_blank" rel="noopener noreferrer">
                        📖 Documentation
                      </a>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
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