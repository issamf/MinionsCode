import React, { useState } from 'react';
import { AgentConfig, AgentType, AIProvider } from '@/shared/types';

interface CreateAgentDialogProps {
  onClose: () => void;
  onCreate: (agentData: Partial<AgentConfig>) => void;
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
  { value: AIProvider.ANTHROPIC, label: 'Anthropic (Claude)', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'] },
  { value: AIProvider.OPENAI, label: 'OpenAI (GPT)', models: ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
  { value: AIProvider.OLLAMA, label: 'Ollama (Local)', models: ['llama3.1', 'llama2', 'codellama'] }
];

export const CreateAgentDialog: React.FC<CreateAgentDialogProps> = ({ onClose, onCreate }) => {
  const [selectedTemplate, setSelectedTemplate] = useState(AGENT_TEMPLATES[0]);
  const [formData, setFormData] = useState({
    name: '',
    avatar: selectedTemplate.avatar,
    provider: AIProvider.ANTHROPIC,
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7,
    customPrompt: false,
    apiKey: ''
  });

  const handleTemplateSelect = (template: typeof AGENT_TEMPLATES[0]) => {
    setSelectedTemplate(template);
    setFormData(prev => ({
      ...prev,
      avatar: template.avatar,
      name: prev.name || template.name
    }));
  };

  const handleCreate = () => {
    // First save the API key if provided
    if (formData.apiKey && formData.provider !== AIProvider.OLLAMA as AIProvider) {
      window.postMessage({
        type: 'saveAPIKey',
        data: { provider: formData.provider, key: formData.apiKey }
      }, '*');
    }

    const agentData: Partial<AgentConfig> = {
      name: formData.name || selectedTemplate.name,
      avatar: formData.avatar,
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

    onCreate(agentData);
  };

  const selectedProvider = AI_PROVIDERS.find(p => p.value === formData.provider);

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
                <label>Avatar</label>
                <input
                  type="text"
                  value={formData.avatar}
                  onChange={(e) => setFormData(prev => ({ ...prev, avatar: (e.target as HTMLInputElement).value }))}
                  placeholder="🤖"
                />
              </div>

              <div className="form-group">
                <label>AI Provider</label>
                <select
                  value={formData.provider}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    provider: (e.target as HTMLSelectElement).value as AIProvider,
                    model: AI_PROVIDERS.find(p => p.value === (e.target as HTMLSelectElement).value)?.models[0] || ''
                  }))}
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
                >
                  {selectedProvider?.models.map(model => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>

              {formData.provider !== AIProvider.OLLAMA as AIProvider && (
                <div className="form-group">
                  <label>
                    API Key 
                    <span className="required">*</span>
                    <a
                      href={formData.provider === AIProvider.ANTHROPIC 
                        ? 'https://console.anthropic.com/' 
                        : formData.provider === AIProvider.OPENAI
                        ? 'https://platform.openai.com/'
                        : '#'
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="api-key-link"
                      title="Get API Key"
                    >
                      🔗 Get Key
                    </a>
                  </label>
                  <input
                    type="password"
                    value={formData.apiKey}
                    onChange={(e) => setFormData(prev => ({ ...prev, apiKey: (e.target as HTMLInputElement).value }))}
                    placeholder={formData.provider === AIProvider.ANTHROPIC 
                      ? 'sk-ant-api03-...' 
                      : formData.provider === AIProvider.OPENAI
                      ? 'sk-...'
                      : 'Enter API Key'
                    }
                    required={formData.provider !== AIProvider.OLLAMA as AIProvider}
                  />
                  {!formData.apiKey && (
                    <small className="api-key-help">
                      Required for {AI_PROVIDERS.find(p => p.value === formData.provider)?.label}. This will be stored securely in VSCode settings.
                    </small>
                  )}
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
            disabled={formData.provider !== AIProvider.OLLAMA as AIProvider && !formData.apiKey}
          >
            Create Agent
          </button>
        </div>
      </div>

    </div>
  );
};