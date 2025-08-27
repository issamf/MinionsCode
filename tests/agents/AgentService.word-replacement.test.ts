import { AgentService } from '@/agents/AgentService';
import { AgentConfig, AgentType, AIProvider, PermissionType } from '@/shared/types';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Mock VSCode
jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{
      uri: { fsPath: '/test/workspace' }
    }],
  },
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
  },
}));

// Mock fs for controlled testing
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

describe('AgentService - Word Replacement Bug', () => {
  let agentService: AgentService;
  let mockAgent: AgentConfig;
  let mockContext: vscode.ExtensionContext;

  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockContext = {
      globalState: {
        get: jest.fn(() => ({})),
        update: jest.fn(() => Promise.resolve()),
      },
    } as unknown as vscode.ExtensionContext;

    agentService = new AgentService();
    agentService.setContext(mockContext);

    mockAgent = {
      id: 'test-agent',
      name: 'Test Agent',
      avatar: '🤖',
      type: AgentType.CUSTOM,
      model: {
        provider: AIProvider.ANTHROPIC,
        modelName: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 2000,
      },
      systemPrompt: 'Test agent',
      capabilities: [],
      permissions: [
        { type: PermissionType.READ_FILES, granted: true },
        { type: PermissionType.WRITE_FILES, granted: true }
      ],
      contextScope: {
        includeFiles: true,
        includeGit: true,
        includeWorkspace: true,
        filePatterns: [],
        excludePatterns: [],
      },
      memory: {
        maxConversations: 100,
        retentionDays: 30,
        enableLearning: true,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true,
    };

    // Setup default mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('hi bob');
  });

  describe('Word Replacement Scenarios', () => {
    it('should replace "hi" with "bye" correctly (hi bob -> bye bob)', async () => {
      mockFs.readFileSync.mockReturnValue('hi bob');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]hi[/FIND]
[REPLACE]bye[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.normalize('/test/workspace/test.txt'),
        'bye bob',
        'utf8'
      );
    });

    it('should replace first word "hi bob" with "bye" correctly (hi bob -> bye)', async () => {
      mockFs.readFileSync.mockReturnValue('hi bob');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]hi bob[/FIND]
[REPLACE]bye[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.normalize('/test/workspace/test.txt'),
        'bye',
        'utf8'
      );
    });

    it('should handle word boundaries correctly', async () => {
      mockFs.readFileSync.mockReturnValue('hi bob, hi there');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]hi[/FIND]
[REPLACE]bye[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should replace all instances of "hi"
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.normalize('/test/workspace/test.txt'),
        'bye bob, bye there',
        'utf8'
      );
    });

    it('should NOT create incorrect word order (regression test)', async () => {
      mockFs.readFileSync.mockReturnValue('hi bob');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]hi[/FIND]
[REPLACE]bye[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should NOT result in "bob bye" - this would be the bug
      expect(mockFs.writeFileSync).not.toHaveBeenCalledWith(
        '/test/workspace/test.txt',
        'bob bye',
        'utf8'
      );

      // Should result in "bye bob" - correct behavior
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        path.normalize('/test/workspace/test.txt'),
        'bye bob',
        'utf8'
      );
    });
  });
});