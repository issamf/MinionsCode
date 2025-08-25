import React, { useState, useEffect } from 'react';
import { AgentConfig, AgentType, AIProvider } from '@/shared/types';

interface CreateAgentDialogProps {
  onClose: () => void;
  onCreate: (agentData: Partial<AgentConfig>) => void;
  onShowGlobalSettings?: (provider: AIProvider, agentData: Partial<AgentConfig>) => void;
}

const AGENT_TEMPLATES = [
  {
    type: AgentType.CODE_REVIEWER,
    name: 'Code Reviewer',
    description: 'Reviews code for bugs, performance, and best practices',
    avatar: '👨‍💻',
    systemPrompt: `You are a senior code reviewer with expertise in software engineering best practices. Your role is to:

- Review code for bugs, security vulnerabilities, and performance issues
- Suggest improvements for readability and maintainability
- Ensure adherence to coding standards and conventions
- Provide constructive feedback with specific examples
- Recommend refactoring opportunities when appropriate

Always be thorough but constructive in your feedback.`
  },
  {
    type: AgentType.DOCUMENTATION,
    name: 'Documentation Writer',
    description: 'Creates clear, comprehensive documentation',
    avatar: '📝',
    systemPrompt: `You are a technical documentation specialist. Your role is to:

- Create clear, comprehensive documentation for code and projects
- Write user guides, API documentation, and technical specifications
- Ensure documentation is up-to-date and accurate
- Use appropriate formatting and structure
- Make complex technical concepts accessible

Focus on clarity and usability in all documentation.`
  },
  {
    type: AgentType.DEVOPS,
    name: 'DevOps Assistant',
    description: 'Helps with deployment, infrastructure, and automation',
    avatar: '🚀',
    systemPrompt: `You are a DevOps engineer with expertise in deployment, infrastructure, and automation. Your role is to:

- Help with Docker, Kubernetes, and containerization
- Assist with CI/CD pipeline setup and optimization
- Provide guidance on infrastructure as code
- Help troubleshoot deployment and environment issues
- Recommend best practices for scalability and reliability

Focus on automation, reliability, and best practices.`
  },
  {
    type: AgentType.TESTING,
    name: 'Testing Specialist',
    description: 'Creates tests and ensures code quality',
    avatar: '🧪',
    systemPrompt: `You are a quality assurance specialist focused on testing and test automation. Your role is to:

- Write comprehensive test cases and test plans
- Create unit tests, integration tests, and end-to-end tests
- Identify edge cases and potential failure points
- Recommend testing strategies and frameworks
- Help with test automation and continuous testing

Focus on thorough coverage and maintainable test code.`
  },
  {
    type: AgentType.CUSTOM,
    name: 'Custom Agent',
    description: 'Create a custom agent with your own configuration',
    avatar: '🤖',
    systemPrompt: `You are a helpful AI assistant specialized in software development. Your role is to:

- Assist with coding tasks and problem-solving
- Provide explanations and guidance on technical concepts
- Help with debugging and troubleshooting
- Suggest best practices and improvements
- Adapt to the specific needs of each project

Be helpful, accurate, and focused on the task at hand.`
  }
];

const AI_PROVIDERS = [
  { value: AIProvider.ANTHROPIC, label: 'Anthropic (Claude)' },
  { value: AIProvider.OPENAI, label: 'OpenAI (GPT)' },
  { value: AIProvider.OLLAMA, label: 'Ollama (Local)' }
];

export const CreateAgentDialog: React.FC<CreateAgentDialogProps> = ({ onClose, onCreate, onShowGlobalSettings }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(AGENT_TEMPLATES[0]);
  const [formData, setFormData] = useState({
    name: '',
    avatar: selectedTemplate.avatar,
    provider: AIProvider.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    customPrompt: false
  });
  const [providerStatus, setProviderStatus] = useState<{[key: string]: boolean}>({});
  const [availableModels, setAvailableModels] = useState<{ [key: string]: string[] }>({});
  const [modelLoadingStates, setModelLoadingStates] = useState<{ [key: string]: boolean }>({});
  const [modelMessages, setModelMessages] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    // Load provider status when dialog opens
    const loadProviderStatus = () => {
      window.postMessage({ type: 'getAPIKeyStatus' }, '*');
    };

    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      if (message.type === 'apiKeyStatus') {
        const status: {[key: string]: boolean} = {};
        Object.keys(message.data).forEach(provider => {
          status[provider] = message.data[provider].configured && message.data[provider].valid;
        });
        setProviderStatus(status);
      } else if (message.type === 'availableModels') {
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

        // Auto-select first available model if no model is currently selected
        if (message.data.models.length > 0 && message.data.provider === formData.provider.toLowerCase()) {
          setFormData(prev => ({
            ...prev,
            model: prev.model || message.data.models[0]
          }));
        }
      }
    };

    loadProviderStatus();
    window.addEventListener('message', messageHandler);
    
    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, [formData.provider]);

  const fetchModelsForProvider = (provider: AIProvider) => {
    setModelLoadingStates(prev => ({ ...prev, [provider.toLowerCase()]: true }));
    setModelMessages(prev => ({ ...prev, [provider.toLowerCase()]: '' }));
    
    (window as any).vscode.postMessage({
      type: 'getAvailableModels',
      data: { provider: provider.toLowerCase() }
    });
  };

  useEffect(() => {
    fetchModelsForProvider(formData.provider);
  }, [formData.provider]);

  const handleTemplateSelect = (template: typeof AGENT_TEMPLATES[0]) => {
    setSelectedTemplate(template);
    setFormData(prev => ({
      ...prev,
      avatar: template.avatar,
      // Only update name if user hasn't manually entered one
      name: prev.name === '' || prev.name === selectedTemplate.name ? template.name : prev.name
    }));
  };

  const handleCreate = () => {
    const agentData: Partial<AgentConfig> = {
      name: formData.name || selectedTemplate.name,
      // avatar: formData.avatar, // Let the avatar service assign from files
      type: selectedTemplate.type,
      model: {
        provider: formData.provider,
        modelName: formData.model,
        temperature: formData.temperature,
        maxTokens: 2000
      },
      systemPrompt: selectedTemplate.systemPrompt,
      capabilities: [],
      permissions: [],
      contextScope: {
        includeFiles: true,
        includeGit: true,
        includeWorkspace: true,
        filePatterns: ['**/*.ts', '**/*.js', '**/*.py', '**/*.md'],
        excludePatterns: ['**/node_modules/**', '**/dist/**']
      },
      memory: {
        maxConversations: 100,
        retentionDays: 30,
        enableLearning: true
      }
    };

    // Check if provider needs configuration
    const needsApiKey = formData.provider !== AIProvider.OLLAMA && !providerStatus[formData.provider];
    
    if (needsApiKey && onShowGlobalSettings) {
      // Show global settings for this provider with the agent data
      onShowGlobalSettings(formData.provider, agentData);
      return;
    }

    onCreate(agentData);
  };

  const getModelsForProvider = (provider: AIProvider): string[] => {
    const providerKey = provider.toLowerCase();
    
    if (availableModels[providerKey]) {
      return availableModels[providerKey];
    }
    
    // Fallback for non-Ollama providers
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
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Create New Agent</h2>
          <button className="icon-btn" onClick={onClose}>❌</button>
        </div>

        <div className="dialog-content">
          <div className="form-section">
            <h3>Choose Template</h3>
            <div className="template-grid">
              {AGENT_TEMPLATES.map((template) => (
                <div
                  key={template.type}
                  className={`template-card ${selectedTemplate.type === template.type ? 'selected' : ''}`}
                  onClick={() => handleTemplateSelect(template)}
                >
                  <div className="template-avatar">{template.avatar}</div>
                  <div className="template-name">{template.name}</div>
                  <div className="template-description">{template.description}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-section">
            <h3>Configuration</h3>
            <div className="form-grid">
              <div className="form-group">
                <label>Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: (e.target as HTMLInputElement).value }))}
                  placeholder={selectedTemplate.name}
                />
              </div>


              <div className="form-group">
                <label>AI Provider</label>
                <select
                  value={formData.provider}
                  onChange={(e) => {
                    const newProvider = (e.target as HTMLSelectElement).value as AIProvider;
                    setFormData(prev => ({
                      ...prev,
                      provider: newProvider,
                      model: '' // Reset model when provider changes
                    }));
                  }}
                >
                  {AI_PROVIDERS.map(provider => (
                    <option key={provider.value} value={provider.value}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label>Model</label>
                <select
                  value={formData.model}
                  onChange={(e) => setFormData(prev => ({ ...prev, model: (e.target as HTMLSelectElement).value }))}
                  disabled={modelLoadingStates[formData.provider.toLowerCase()]}
                >
                  {modelLoadingStates[formData.provider.toLowerCase()] && (
                    <option value="">Loading models...</option>
                  )}
                  {!modelLoadingStates[formData.provider.toLowerCase()] && 
                   getModelsForProvider(formData.provider).length === 0 && (
                    <option value="">
                      {modelMessages[formData.provider.toLowerCase()] || 'No models available'}
                    </option>
                  )}
                  {!modelLoadingStates[formData.provider.toLowerCase()] && 
                   getModelsForProvider(formData.provider).map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              {formData.provider !== AIProvider.OLLAMA && !providerStatus[formData.provider] && (
                <div className="form-group">
                  <div className="api-key-notice">
                    <div className="notice-icon">⚠️</div>
                    <div className="notice-content">
                      <p>API key required for {AI_PROVIDERS.find(p => p.value === formData.provider)?.label}</p>
                      <p>Click "Create Agent" to configure this provider globally.</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="form-group">
                <label>Temperature ({formData.temperature})</label>
                <input
                  type="range"
                  min="0"
                  max="2"
                  step="0.1"
                  value={formData.temperature}
                  onChange={(e) => setFormData(prev => ({ ...prev, temperature: parseFloat((e.target as HTMLInputElement).value) }))}
                />
                <div className="temperature-labels">
                  <span>Focused</span>
                  <span>Balanced</span>
                  <span>Creative</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleCreate}
          >
            {formData.provider !== AIProvider.OLLAMA && !providerStatus[formData.provider] 
              ? 'Configure & Create Agent'
              : 'Create Agent'
            }
          </button>
        </div>
      </div>

    </div>
  );
};