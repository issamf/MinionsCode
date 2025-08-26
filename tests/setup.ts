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

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    mkdir: jest.fn(),
    readdir: jest.fn(),
  },
  existsSync: jest.fn(),
  appendFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(),
  watch: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
  basename: jest.fn((filePath, ext) => {
    const name = filePath.split('/').pop() || '';
    return ext ? name.replace(ext, '') : name;
  }),
  extname: jest.fn((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? '.' + parts.pop() : '';
  }),
  dirname: jest.fn(),
  resolve: jest.fn(),
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