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
  EventEmitter: jest.fn(() => ({
    event: jest.fn(),
    fire: jest.fn(),
    dispose: jest.fn(),
  })),
  SecretStorage: jest.fn(),
};

// Make the mock available globally
(global as any).vscode = mockVSCode;

// Mock vscode module
jest.mock('vscode', () => mockVSCode, { virtual: true });

// Mock node modules that might not be available in test environment
jest.mock('sqlite3', () => ({
  Database: jest.fn(),
}));

// For integration tests, we need real fs operations
// But keep some methods mocked for unit tests
jest.mock('fs', () => {
  const actualFs = jest.requireActual('fs');
  return {
    // Use real fs for integration tests
    ...actualFs,
    // Mock only the methods that should be mocked for unit tests
    promises: {
      ...actualFs.promises,
      readFile: jest.fn().mockImplementation(actualFs.promises.readFile),
      writeFile: jest.fn().mockImplementation(actualFs.promises.writeFile),
      mkdir: jest.fn().mockImplementation(actualFs.promises.mkdir),
      readdir: jest.fn().mockImplementation(actualFs.promises.readdir),
    },
    // Keep real file operations for integration tests
    existsSync: actualFs.existsSync,
    appendFileSync: actualFs.appendFileSync,
    mkdirSync: actualFs.mkdirSync,
    readFileSync: actualFs.readFileSync,
    writeFileSync: actualFs.writeFileSync,
    readdirSync: actualFs.readdirSync,
    unlinkSync: actualFs.unlinkSync,
    rmdirSync: actualFs.rmdirSync,
    statSync: actualFs.statSync,
    chmodSync: actualFs.chmodSync,
    // Mock watch for unit tests
    watch: jest.fn(),
  };
});

// For integration tests, use real path operations with cross-platform support
jest.mock('path', () => {
  const actualPath = jest.requireActual('path');
  return {
    // Use real path for integration tests
    ...actualPath,
    // Keep real implementations but make them spy-able for unit tests
    join: jest.fn().mockImplementation(actualPath.join),
    basename: jest.fn().mockImplementation(actualPath.basename),
    extname: jest.fn().mockImplementation(actualPath.extname),
    dirname: jest.fn().mockImplementation(actualPath.dirname),
    resolve: jest.fn().mockImplementation(actualPath.resolve),
  };
});

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

// Mock DOM methods not available in jsdom
Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
  value: jest.fn(),
  writable: true
});

// Mock HTMLElement methods for better test compatibility
(HTMLTextAreaElement.prototype as any).setSelectionRange = jest.fn();
(HTMLElement.prototype as any).focus = jest.fn();

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  disconnect: jest.fn(),
  observe: jest.fn(),
  unobserve: jest.fn(),
}));