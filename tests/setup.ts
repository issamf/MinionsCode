// Jest setup file for VSCode AI Agents tests
import 'jest';

// Mock VSCode API
const mockVSCode = {
  commands: {
    registerCommand: jest.fn(),
    executeCommand: jest.fn(),
  },
  window: {
    createWebviewPanel: jest.fn(),
    showErrorMessage: jest.fn(),
    showInformationMessage: jest.fn(),
    showWarningMessage: jest.fn(),
  },
  workspace: {
    getConfiguration: jest.fn(() => ({
      get: jest.fn(),
      update: jest.fn(),
    })),
    workspaceFolders: [],
    onDidChangeConfiguration: jest.fn(),
  },
  Uri: {
    file: jest.fn(),
    parse: jest.fn(),
  },
  ViewColumn: {
    One: 1,
    Two: 2,
  },
  WebviewPanelOnDidChangeViewStateEvent: jest.fn(),
  Disposable: {
    from: jest.fn(),
  },
  EventEmitter: jest.fn(),
  SecretStorage: jest.fn(),
};

// Make the mock available globally
(global as any).vscode = mockVSCode;

// Mock node modules that might not be available in test environment
jest.mock('sqlite3', () => ({
  Database: jest.fn(),
}));

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
  },
  existsSync: jest.fn(),
}));

// Setup console spy to reduce noise in tests
const originalConsole = console;
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: originalConsole.warn,
  error: originalConsole.error,
};