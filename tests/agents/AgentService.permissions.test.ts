import { AgentService } from '@/agents/AgentService';
import { AgentConfig, AgentType, AIProvider, Permission, PermissionType } from '@/shared/types';
import * as vscode from 'vscode';
import * as fs from 'fs';

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
    createTerminal: jest.fn(() => ({
      sendText: jest.fn(),
      show: jest.fn(),
    })),
  },
}));

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('AgentService - Permission System', () => {
  let agentService: AgentService;
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

    // Setup default fs mocks
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readFileSync.mockReturnValue('test content');
  });

  const createAgentWithPermissions = (permissions: Permission[]): AgentConfig => ({
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
    permissions,
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
  });

  describe('File Read Permissions', () => {
    it('should allow file reading with READ_FILES permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.READ_FILES, granted: true }
      ]);

      const service = agentService as any;
      const response = `[READ_FILE: test.txt]`;

      // Test permissions system

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/workspace/test.txt', 'utf8');
      expect(mockVscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('should deny file reading without READ_FILES permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.WRITE_FILES, granted: true } // Only write, no read
      ]);

      const service = agentService as any;
      const response = `[READ_FILE: test.txt]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to read files. Please update agent permissions.`
      );
    });

    it('should respect file scope restrictions for reading', async () => {
      const agent = createAgentWithPermissions([
        { 
          type: PermissionType.READ_FILES, 
          granted: true,
          scope: ['*.txt'] // Only allow .txt files
        }
      ]);

      const service = agentService as any;
      
      // Should allow .txt file
      let response = `[READ_FILE: test.txt]`;
      await service.executeTasksFromResponse(agent, response);
      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/workspace/test.txt', 'utf8');
      
      jest.clearAllMocks();
      
      // Should deny .js file
      response = `[READ_FILE: test.js]`;
      await service.executeTasksFromResponse(agent, response);
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to read "test.js". File not in allowed scope.`
      );
    });
  });

  describe('File Write Permissions', () => {
    it('should allow file creation with WRITE_FILES permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.WRITE_FILES, granted: true }
      ]);

      const service = agentService as any;
      const response = `[CREATE_FILE: test.txt]
Hello World
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/test/workspace/test.txt',
        'Hello World',
        'utf8'
      );
      expect(mockVscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('should deny file creation without WRITE_FILES permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.READ_FILES, granted: true } // Only read, no write
      ]);

      const service = agentService as any;
      const response = `[CREATE_FILE: test.txt]
Hello World
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to write files. Please update agent permissions.`
      );
    });

    it('should allow file editing with WRITE_FILES permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.WRITE_FILES, granted: true }
      ]);

      const service = agentService as any;
      const response = `[EDIT_FILE: test.txt]
[FIND]test[/FIND]
[REPLACE]Hi[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/workspace/test.txt', 'utf8');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('should allow file deletion with WRITE_FILES permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.WRITE_FILES, granted: true }
      ]);

      const service = agentService as any;
      const response = `[DELETE_FILE: test.txt]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/test/workspace/test.txt');
    });
  });

  describe('Command Execution Permissions', () => {
    it('should allow command execution with EXECUTE_COMMANDS permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.EXECUTE_COMMANDS, granted: true }
      ]);

      const service = agentService as any;
      const response = `[RUN_COMMAND: npm install]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockVscode.window.createTerminal).toHaveBeenCalledWith('AI Agent Command');
      expect(mockVscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('should deny command execution without EXECUTE_COMMANDS permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.READ_FILES, granted: true } // Different permission
      ]);

      const service = agentService as any;
      const response = `[RUN_COMMAND: npm install]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockVscode.window.createTerminal).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to execute commands. Please update agent permissions.`
      );
    });
  });

  describe('Git Operations Permissions', () => {
    it('should allow git commands with GIT_OPERATIONS permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.GIT_OPERATIONS, granted: true }
      ]);

      const service = agentService as any;
      const response = `[GIT_COMMAND: git status]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockVscode.window.createTerminal).toHaveBeenCalledWith('AI Agent Git');
    });

    it('should deny git commands without GIT_OPERATIONS permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.READ_FILES, granted: true } // Different permission
      ]);

      const service = agentService as any;
      const response = `[GIT_COMMAND: git status]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockVscode.window.createTerminal).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to perform Git operations. Please update agent permissions.`
      );
    });

    it('should allow git commits with GIT_OPERATIONS permission', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.GIT_OPERATIONS, granted: true }
      ]);

      const service = agentService as any;
      const response = `[GIT_COMMIT: Initial commit]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockVscode.window.createTerminal).toHaveBeenCalledWith('AI Agent Git');
    });
  });

  describe('Permission Combinations', () => {
    it('should work with multiple permissions granted', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.READ_FILES, granted: true },
        { type: PermissionType.WRITE_FILES, granted: true },
        { type: PermissionType.EXECUTE_COMMANDS, granted: true },
        { type: PermissionType.GIT_OPERATIONS, granted: true },
      ]);

      const service = agentService as any;
      const response = `[CREATE_FILE: test.txt]
Hello
[/CREATE_FILE]
[RUN_COMMAND: echo "done"]
[GIT_COMMAND: git add .]`;

      await service.executeTasksFromResponse(agent, response);

      // All operations should succeed
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(mockVscode.window.createTerminal).toHaveBeenCalledTimes(2);
      expect(mockVscode.window.showErrorMessage).not.toHaveBeenCalled();
    });

    it('should handle denied permissions gracefully', async () => {
      const agent = createAgentWithPermissions([
        { type: PermissionType.READ_FILES, granted: false },  // Explicitly denied
        { type: PermissionType.WRITE_FILES, granted: true },
      ]);

      const service = agentService as any;
      const response = `[READ_FILE: test.txt]
[CREATE_FILE: output.txt]
Content
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(agent, response);

      // Read should be denied
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      // Write should succeed
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      // Should show error for denied permission
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to read files. Please update agent permissions.`
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty permissions array (deny all)', async () => {
      const agent = createAgentWithPermissions([]); // No permissions

      const service = agentService as any;
      const response = `[CREATE_FILE: test.txt]
Content
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.writeFileSync).not.toHaveBeenCalled();
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        `Agent "Test Agent" does not have permission to write files. Please update agent permissions.`
      );
    });

    it('should handle permission with empty scope (allow all files)', async () => {
      const agent = createAgentWithPermissions([
        { 
          type: PermissionType.READ_FILES, 
          granted: true,
          scope: [] // Empty scope should allow all files
        }
      ]);

      const service = agentService as any;
      const response = `[READ_FILE: any-file.xyz]`;

      await service.executeTasksFromResponse(agent, response);

      expect(mockFs.readFileSync).toHaveBeenCalledWith('/test/workspace/any-file.xyz', 'utf8');
    });
  });
});