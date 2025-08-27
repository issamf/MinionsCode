import { AgentService } from '@/agents/AgentService';
import { AgentConfig, AgentType, AIProvider, PermissionType } from '@/shared/types';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock VSCode APIs
jest.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [{
      uri: { fsPath: '/test/workspace' }
    }],
    openTextDocument: jest.fn(),
  },
  window: {
    showInformationMessage: jest.fn(),
    showErrorMessage: jest.fn(),
    showWarningMessage: jest.fn(),
    showTextDocument: jest.fn(),
    createOutputChannel: jest.fn(() => ({
      appendLine: jest.fn(),
      show: jest.fn(),
    })),
    createTerminal: jest.fn(() => ({
      sendText: jest.fn(),
      show: jest.fn(),
    })),
  },
  commands: {
    executeCommand: jest.fn(),
  },
  Uri: {
    file: jest.fn((path) => ({ fsPath: path })),
  },
}));

// Mock file system
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn((...paths) => paths.join('/')),
  dirname: jest.fn((filePath) => filePath.split('/').slice(0, -1).join('/')),
  relative: jest.fn((from, to) => to.replace(from, '').replace(/^\//, '')),
}));

// Mock glob
jest.mock('glob', () => ({
  sync: jest.fn(() => ['/test/workspace/file1.txt', '/test/workspace/file2.txt']),
}));

describe('AgentService - Task Execution', () => {
  let agentService: AgentService;
  let mockAgent: AgentConfig;
  let mockContext: vscode.ExtensionContext;

  const mockFs = fs as jest.Mocked<typeof fs>;
  const mockVscode = vscode as jest.Mocked<typeof vscode>;

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
      systemPrompt: 'You are a test agent',
      capabilities: [],
      permissions: [
        { type: PermissionType.READ_FILES, granted: true },
        { type: PermissionType.WRITE_FILES, granted: true },
        { type: PermissionType.EXECUTE_COMMANDS, granted: true },
        { type: PermissionType.GIT_OPERATIONS, granted: true }
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
    mockFs.readFileSync.mockReturnValue('Hello World');
  });

  // Task Detection is now handled by AI-powered IntentClassificationService
  // These tests are replaced by integration tests that verify actual task execution

  describe('File Creation Tasks', () => {
    it('should execute CREATE_FILE task', async () => {
      const service = agentService as any;
      const response = `[CREATE_FILE: test.txt]
Hello World
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/test.txt',
        'Hello World',
        'utf8'
      );
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Agent executed 1 task(s)')
      );
    });

    it('should create directories if they dont exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      
      const service = agentService as any;
      const response = `[CREATE_FILE: subfolder/test.txt]
Content
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.mkdirSync).toHaveBeenCalledWith(
        '/test/workspace/subfolder',
        { recursive: true }
      );
    });

    it('should handle empty CREATE_FILE by adding default content', async () => {
      const service = agentService as any;
      const response = `[CREATE_FILE: thought_log.txt]
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should create file with default content, not empty file
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/thought_log.txt',
        expect.stringContaining('THOUGHT LOG'),
        'utf8'
      );
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/thought_log.txt',
        expect.stringContaining('Created on:'),
        'utf8'
      );
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('(with default content - original was empty)')
      );
    });
  });

  describe('File Editing Tasks', () => {
    it('should execute EDIT_FILE task', async () => {
      mockFs.readFileSync.mockReturnValue('Hello World');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]Hello World[/FIND]
[REPLACE]Goodbye World[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/workspace/test.txt', 'utf8');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/test.txt',
        'Goodbye World',
        'utf8'
      );
    });

    it('should handle multiple replacements in file editing', async () => {
      mockFs.readFileSync.mockReturnValue('Hello World Hello World');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]Hello[/FIND]
[REPLACE]Hi[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/test.txt',
        'Hi World Hi World',
        'utf8'
      );
    });

    it('should warn when find text is not found', async () => {
      mockFs.readFileSync.mockReturnValue('Hello World');
      
      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]Not Found[/FIND]
[REPLACE]Replacement[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Text not found in test.txt')
      );
    });
  });

  describe('Multiple Task Execution', () => {
    it('should execute multiple tasks in sequence', async () => {
      const service = agentService as any;
      const response = `[CREATE_FILE: file1.txt]
Content 1
[/CREATE_FILE]

[CREATE_FILE: file2.txt]
Content 2
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/test/workspace/file1.txt', 'Content 1', 'utf8');
      expect(mockFs.writeFileSync).toHaveBeenCalledWith('/test/workspace/file2.txt', 'Content 2', 'utf8');
    });

    it('should show summary of all executed tasks', async () => {
      const service = agentService as any;
      const response = `[CREATE_FILE: test1.txt]
Content
[/CREATE_FILE]

[DELETE_FILE: test2.txt]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Agent executed 2 task(s)')
      );
    });
  });

  describe('File Search and Management', () => {
    it('should execute GREP search tasks', async () => {
      const service = agentService as any;
      const response = `[GREP: pattern, **/*.txt]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should show task execution summary
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Agent executed 1 task(s)')
      );
    });

    it('should execute FIND_FILES tasks', async () => {
      const service = agentService as any;
      const response = `[FIND_FILES: *.txt]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockVscode.window.createOutputChannel).toHaveBeenCalledWith(
        'Agent Find: *.txt'
      );
    });

    it('should execute DELETE_FILE tasks', async () => {
      const service = agentService as any;
      const response = `[DELETE_FILE: unwanted.txt]`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/workspace/unwanted.txt');
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors gracefully', async () => {
      mockFs.writeFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const service = agentService as any;
      const response = `[CREATE_FILE: test.txt]
Content
[/CREATE_FILE]`;

      await expect(service.executeTasksFromResponse(mockAgent, response)).resolves.not.toThrow();
      
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create file')
      );
    });

    it('should continue executing other tasks after one fails', async () => {
      mockFs.writeFileSync.mockImplementationOnce(() => {
        throw new Error('First file failed');
      });

      const service = agentService as any;
      const response = `[CREATE_FILE: fail.txt]
Content 1
[/CREATE_FILE]

[CREATE_FILE: success.txt]
Content 2
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // First call throws, second should still be attempted
      expect(mockFs.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('No Tasks Found', () => {
    it('should log when no tasks are found in response', async () => {
      // Import debugLogger to spy on it
      const { debugLogger } = require('@/utils/logger');
      const debugLoggerSpy = jest.spyOn(debugLogger, 'log').mockImplementation();
      
      const service = agentService as any;
      const response = `This is just a regular response without any task syntax.`;

      await service.executeTasksFromResponse(mockAgent, response);

      expect(debugLoggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('NO TASKS FOUND IN RESPONSE')
      );
      
      debugLoggerSpy.mockRestore();
    });
  });
});