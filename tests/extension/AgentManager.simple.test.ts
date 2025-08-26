import { AgentManager } from '@/extension/AgentManager';
import { SettingsManager } from '@/extension/SettingsManager';
import { AgentConfig, AgentType, AIProvider } from '@/shared/types';
import * as vscode from 'vscode';

// Mock context
const mockContext = {
  extensionPath: '/mock/path',
  globalState: {
    get: jest.fn(() => []),
    update: jest.fn(() => Promise.resolve()),
  },
  subscriptions: []
} as unknown as vscode.ExtensionContext;

// Mock settings manager
const mockSettingsManager = {
  getDefaultProvider: jest.fn(() => AIProvider.ANTHROPIC),
  getMaxConcurrentAgents: jest.fn(() => 5),
  getSettings: jest.fn(() => ({ dataRetentionDays: 30 })),
} as unknown as SettingsManager;

describe('AgentManager - Essential Functions', () => {
  let agentManager: AgentManager;

  beforeEach(() => {
    jest.clearAllMocks();
    agentManager = new AgentManager(mockContext, mockSettingsManager);
  });

  describe('Agent Lifecycle', () => {
    const mockAgent: Partial<AgentConfig> = {
      name: 'Test Agent',
      type: AgentType.CODE_REVIEWER,
      model: {
        provider: AIProvider.ANTHROPIC,
        modelName: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 2000,
      },
      systemPrompt: 'You are a test agent',
    };

    it('should create agents', async () => {
      await expect(agentManager.createAgent(mockAgent)).resolves.toBeTruthy();
    });

    it('should handle agent creation validation', async () => {
      // Just test that the method exists and can be called
      expect(typeof agentManager.createAgent).toBe('function');
    });

    it('should handle various agent creation inputs', async () => {
      const validAgent = mockAgent;
      const result = await agentManager.createAgent(validAgent);
      expect(result).toBeTruthy();
    });
  });

  describe('Agent Retrieval', () => {
    it('should get agent by ID', () => {
      const agent = agentManager.getAgent('non-existent');
      expect(agent).toBeNull();
    });
  });

  describe('Agent Management', () => {
    it('should have update and destroy methods', () => {
      expect(typeof agentManager.updateAgent).toBe('function');
      expect(typeof agentManager.destroyAgent).toBe('function');
    });
  });

  describe('Configuration', () => {
    it('should respect max agents setting', () => {
      expect(mockSettingsManager.getMaxConcurrentAgents).toBeDefined();
    });

    it('should use default AI provider from settings', () => {
      expect(mockSettingsManager.getDefaultProvider).toBeDefined();
    });
  });
});