import { AgentService } from '@/agents/AgentService';
import { AgentConfig, AgentType, AIProvider, PermissionType } from '@/shared/types';
import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';

// Import the real fs module, not the mocked one
const fs = jest.requireActual('fs');

// Test-specific logger that writes directly to a file
const testLogPath = path.join(os.tmpdir(), 'test-debug.log');
const testLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  const logEntry = data 
    ? `[${timestamp}] ${message} ${JSON.stringify(data)}\n`
    : `[${timestamp}] ${message}\n`;
  try {
    fs.appendFileSync(testLogPath, logEntry);
  } catch (error) {
    // Ignore errors in test logging
  }
};

// Mock only VSCode UI methods, but keep workspace and file system real  
jest.mock('vscode', () => {
  const mockWorkspace = {
    workspaceFolders: undefined as any,
    openTextDocument: jest.fn(),
    getConfiguration: jest.fn(() => ({
      get: jest.fn(() => ({})),
      update: jest.fn(() => Promise.resolve()),
    })),
  };
  
  return {
    workspace: mockWorkspace,
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
    file: jest.fn((filePath) => ({ fsPath: filePath })),
  },
  };
});

describe('AgentService - Real File Operations Integration', () => {
  let agentService: AgentService;
  let mockAgent: AgentConfig;
  let mockContext: vscode.ExtensionContext;
  let testDir: string;

  const mockVscode = vscode as jest.Mocked<typeof vscode>;
  const mockWorkspace = vscode.workspace as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Clear test log file
    try {
      fs.writeFileSync(testLogPath, '=== NEW TEST RUN ===\n');
    } catch (error) {
      // Ignore
    }
    
    // Create a real temporary directory for testing (compatible with all Node versions)
    testDir = path.join(os.tmpdir(), `agent-test-${Date.now()}-${Math.random().toString(36).substring(2)}`);
    fs.mkdirSync(testDir, { recursive: true });
    
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
  });

  afterEach(() => {
    // Clean up test directory synchronously for better compatibility
    try {
      if (fs.existsSync(testDir)) {
        const deleteRecursive = (dir: string) => {
          const files = fs.readdirSync(dir);
          for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
              deleteRecursive(filePath);
            } else {
              fs.unlinkSync(filePath);
            }
          }
          fs.rmdirSync(dir);
        };
        deleteRecursive(testDir);
      }
    } catch (error) {
      console.warn('Failed to clean up test directory:', error);
    }
  });

  describe('No Workspace Scenario (Real Issue)', () => {
    it('should handle file creation when no workspace is detected', async () => {
      // This tests the exact scenario that might be failing in real usage
      mockWorkspace.workspaceFolders = undefined;

      const service = agentService as any;
      const response = `[CREATE_FILE: test-no-workspace.txt]
Hello from no workspace test
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should show error about no workspace - agents have no "world" to operate in
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        'No workspace folder open'
      );

      // File should NOT be created anywhere since workspace detection failed
      const possiblePaths = [
        path.join(process.cwd(), 'test-no-workspace.txt'),
        'test-no-workspace.txt',
        path.resolve('test-no-workspace.txt'),
      ];
      
      for (const filePath of possiblePaths) {
        expect(fs.existsSync(filePath)).toBe(false);
      }
    });

    it('should handle file editing when no workspace is detected', async () => {
      mockWorkspace.workspaceFolders = undefined;

      const service = agentService as any;
      const response = `[EDIT_FILE: nonexistent.txt]
[FIND]old content[/FIND]
[REPLACE]new content[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should show error about no workspace
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Failed to edit file: No workspace folder open'
      );
    });
  });

  describe('With Workspace Scenario', () => {
    beforeEach(() => {
      // Mock workspace to point to our test directory
      mockWorkspace.workspaceFolders = [{
        uri: { fsPath: testDir }
      }] as any;
    });

    it('should create real files in workspace directory', async () => {
      testLog('🔍 TEST START: Test execution started');
      
      // Test if debugLogger works in test environment - bypass console.log and test file writing directly
      const { debugLogger } = require('@/utils/logger');
      const fs = require('fs');
      try {
        const logPath = debugLogger.getLogPath();
        testLog('🔍 TEST: debugLogger path is', { logPath });
        fs.appendFileSync(logPath, '[DIRECT TEST] Testing direct file write to debugLogger path\n');
        testLog('🔍 TEST: Direct file write to debugLogger path successful');
      } catch (error) {
        testLog('🔍 TEST: Direct file write failed', { error: error instanceof Error ? error.message : String(error) });
      }
      
      debugLogger.log('🧪 TEST: Testing debugLogger from test environment');
      testLog('🔍 TEST: debugLogger test called');
      
      const service = agentService as any;
      testLog('🔍 TEST: service instance created', { serviceType: typeof service });
      const response = `[CREATE_FILE: integration-test.txt]
This is real file content
Created by integration test
[/CREATE_FILE]`;

      testLog('🔍 TEST: About to call executeTasksFromResponse', { 
        methodExists: typeof service.executeTasksFromResponse,
        responseLength: response.length,
        serviceConstructorName: service.constructor.name,
        serviceMethods: Object.getOwnPropertyNames(Object.getPrototypeOf(service)),
        executeTasksExists: 'executeTasksFromResponse' in service,
        isFunction: service.executeTasksFromResponse instanceof Function,
        NODE_ENV: process.env.NODE_ENV,
        allProcessEnv: Object.keys(process.env).filter(k => k.includes('NODE') || k.includes('TEST') || k.includes('JEST'))
      });
      
      try {
        // Add explicit logging to see if the promise is actually resolving
        testLog('🔍 TEST: Calling executeTasksFromResponse now...');
        const promise = service.executeTasksFromResponse(mockAgent, response);
        testLog('🔍 TEST: Promise created, typeof promise:', { promiseType: typeof promise, isPromise: promise instanceof Promise });
        const result = await promise;
        testLog('🔍 TEST: executeTasksFromResponse completed successfully', { result, resultType: typeof result });
      } catch (error) {
        testLog('🔍 TEST: executeTasksFromResponse failed with error', { 
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined
        });
        throw error;
      }

      // Check if file was actually created
      const filePath = path.join(testDir, 'integration-test.txt');
      testLog('🔍 TEST: Checking if file was created', { 
        filePath,
        testDir,
        fileExists: fs.existsSync(filePath)
      });
      
      expect(fs.existsSync(filePath)).toBe(true);
      
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('This is real file content\nCreated by integration test');

      // Should show success message
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Agent executed 1 task(s)')
      );
    });

    it('should edit real files with EDIT_FILE syntax', async () => {
      // First create a file
      const filePath = path.join(testDir, 'edit-test.txt');
      fs.writeFileSync(filePath, 'Original content here', 'utf8');

      const service = agentService as any;
      const response = `[EDIT_FILE: edit-test.txt]
[FIND]Original content here[/FIND]
[REPLACE]Edited content here[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Check if file was actually modified
      const newContent = fs.readFileSync(filePath, 'utf8');
      expect(newContent).toBe('Edited content here');

      // Should show success message
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Updated file: edit-test.txt')
      );
    });

    it('should handle edit when find text does not match', async () => {
      // Create file with different content
      const filePath = path.join(testDir, 'mismatch-test.txt');
      fs.writeFileSync(filePath, 'Actual content', 'utf8');

      const service = agentService as any;
      const response = `[EDIT_FILE: mismatch-test.txt]
[FIND]Expected content[/FIND]
[REPLACE]New content[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // File should remain unchanged
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('Actual content');

      // Should show warning about text not found
      expect(mockVscode.window.showWarningMessage).toHaveBeenCalledWith(
        expect.stringContaining('Text not found in mismatch-test.txt')
      );
    });

    it('should create subdirectories when needed', async () => {
      const service = agentService as any;
      const response = `[CREATE_FILE: nested/folder/deep-file.txt]
Content in nested directory
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Check if nested directories and file were created
      const filePath = path.join(testDir, 'nested', 'folder', 'deep-file.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toBe('Content in nested directory');
    });

    it('should handle multiple file operations in sequence', async () => {
      const service = agentService as any;
      const response = `[CREATE_FILE: file1.txt]
First file content
[/CREATE_FILE]

[CREATE_FILE: file2.txt]
Second file content
[/CREATE_FILE]

[EDIT_FILE: file1.txt]
[FIND]First file content[/FIND]
[REPLACE]Modified first file[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Check both files were created and one was modified
      const file1Path = path.join(testDir, 'file1.txt');
      const file2Path = path.join(testDir, 'file2.txt');
      
      expect(fs.existsSync(file1Path)).toBe(true);
      expect(fs.existsSync(file2Path)).toBe(true);
      
      expect(fs.readFileSync(file1Path, 'utf8')).toBe('Modified first file');
      expect(fs.readFileSync(file2Path, 'utf8')).toBe('Second file content');

      // Should report multiple tasks executed
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Agent executed 3 task(s)')
      );
    });

    it('should handle file deletion', async () => {
      // Create file first
      const filePath = path.join(testDir, 'delete-me.txt');
      fs.writeFileSync(filePath, 'To be deleted', 'utf8');
      expect(fs.existsSync(filePath)).toBe(true);

      const service = agentService as any;
      const response = `[DELETE_FILE: delete-me.txt]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // File should be deleted
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('Error Scenarios', () => {
    beforeEach(() => {
      mockWorkspace.workspaceFolders = [{
        uri: { fsPath: testDir }
      }] as any;
    });

    it('should handle permission errors gracefully', async () => {
      const service = agentService as any;
      let response: string;
      let shouldCleanup = false;
      let badPath: string | undefined;

      if (process.platform === 'win32') {
        // On Windows, try to create file in a system directory that requires admin rights
        response = `[CREATE_FILE: C:/Windows/System32/should-fail.txt]
This should fail
[/CREATE_FILE]`;
      } else {
        // On Unix systems, use chmod to create permission error
        badPath = path.join(testDir, 'readonly');
        fs.mkdirSync(badPath);
        fs.chmodSync(badPath, 0o444); // Read-only
        shouldCleanup = true;
        
        response = `[CREATE_FILE: readonly/should-fail.txt]
This should fail
[/CREATE_FILE]`;
      }

      await service.executeTasksFromResponse(mockAgent, response);

      // Should handle error gracefully
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to create file')
      );

      // Cleanup for Unix systems
      if (shouldCleanup && badPath) {
        fs.chmodSync(badPath, 0o755);
      }
    });

    it('should handle editing non-existent files', async () => {
      const service = agentService as any;
      const response = `[EDIT_FILE: does-not-exist.txt]
[FIND]anything[/FIND]
[REPLACE]nothing[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, response);

      // Should show error about file not found
      expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to edit file')
      );
    });
  });

  describe('Real World Workflow Test', () => {
    beforeEach(() => {
      mockWorkspace.workspaceFolders = [{
        uri: { fsPath: testDir }
      }] as any;
    });

    it('should handle the exact user workflow that failed', async () => {
      const service = agentService as any;

      // Step 1: Create file (this worked)
      const createResponse = `[CREATE_FILE: test.txt]
Hello World
[/CREATE_FILE]`;

      await service.executeTasksFromResponse(mockAgent, createResponse);

      const filePath = path.join(testDir, 'test.txt');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe('Hello World');

      // Step 2: Edit file (this failed in real usage)
      const editResponse = `[EDIT_FILE: test.txt]
[FIND]Hello World[/FIND]
[REPLACE]third try[/REPLACE]
[/EDIT_FILE]`;

      await service.executeTasksFromResponse(mockAgent, editResponse);

      // This should work in integration test
      const newContent = fs.readFileSync(filePath, 'utf8');
      expect(newContent).toBe('third try');

      // Should show success messages
      expect(mockVscode.window.showInformationMessage).toHaveBeenCalledWith(
        expect.stringContaining('Updated file: test.txt')
      );
    });
  });
});