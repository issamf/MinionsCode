import { render, screen, fireEvent, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '@/webview/App';

// Mock the webview logger
jest.mock('@/webview/utils/webviewLogger', () => ({
  webviewLogger: {
    log: jest.fn(),
  },
}));

// Mock all complex components
jest.mock('@/webview/components/AgentWidget', () => ({
  AgentWidget: ({ agent }: any) => (
    <div data-testid={`agent-widget-${agent.id}`}>
      <span>{agent.name}</span>
    </div>
  ),
}));

jest.mock('@/webview/components/CreateAgentDialog', () => ({
  CreateAgentDialog: () => <div data-testid="create-agent-dialog">Create Agent Dialog</div>,
}));

jest.mock('@/webview/components/QuickChatDialog', () => ({
  QuickChatDialog: () => <div data-testid="quick-chat-dialog">Quick Chat Dialog</div>,
}));

jest.mock('@/webview/components/AgentSettingsDialog', () => ({
  AgentSettingsDialog: () => <div data-testid="agent-settings-dialog">Settings Dialog</div>,
}));

jest.mock('@/webview/components/GlobalSettings', () => ({
  GlobalSettings: () => <div data-testid="global-settings">Global Settings</div>,
}));

describe('App - Core UI Functions', () => {
  let mockVscode: any;
  let messageListeners: ((event: MessageEvent) => void)[] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockVscode = {
      postMessage: jest.fn(),
    };
    (window as any).vscode = mockVscode;

    // Mock window message event handling
    messageListeners = [];
    jest.spyOn(window, 'addEventListener').mockImplementation((event, listener) => {
      if (event === 'message') {
        messageListeners.push(listener as any);
      }
    });

    jest.spyOn(window, 'removeEventListener').mockImplementation(() => {});

    Object.defineProperty(document, 'hidden', {
      writable: true,
      value: false,
    });
  });

  const sendMessage = (message: any) => {
    act(() => {
      const event = new MessageEvent('message', { data: message });
      messageListeners.forEach(listener => listener(event));
    });
  };

  describe('Basic Rendering', () => {
    it('should render loading state initially', () => {
      render(<App />);
      expect(screen.getByText('Loading AI Agents...')).toBeInTheDocument();
    });

    it('should send ready message on mount', () => {
      render(<App />);
      expect(mockVscode.postMessage).toHaveBeenCalledWith({ type: 'ready' });
    });
  });

  describe('Agent Display', () => {
    it('should show empty state when no agents', () => {
      render(<App />);
      
      sendMessage({
        type: 'init',
        data: { agents: [] }
      });

      expect(screen.getByText('No AI Agents Yet')).toBeInTheDocument();
      expect(screen.getByText('Create Your First Agent')).toBeInTheDocument();
    });

    it('should display agents when received', () => {
      render(<App />);
      
      const testAgents = [
        { id: 'agent-1', name: 'Test Agent 1', isActive: true },
        { id: 'agent-2', name: 'Test Agent 2', isActive: true }
      ];

      sendMessage({
        type: 'init',
        data: { agents: testAgents }
      });

      expect(screen.queryByText('No AI Agents Yet')).not.toBeInTheDocument();
      expect(screen.getByTestId('agent-widget-agent-1')).toBeInTheDocument();
      expect(screen.getByTestId('agent-widget-agent-2')).toBeInTheDocument();
    });
  });

  describe('Header Actions', () => {
    beforeEach(() => {
      render(<App />);
      sendMessage({ type: 'init', data: { agents: [] } });
    });

    it('should have create agent button', () => {
      const createButton = screen.getByText('+ Create Agent');
      expect(createButton).toBeInTheDocument();
      
      fireEvent.click(createButton);
      expect(screen.getByTestId('create-agent-dialog')).toBeInTheDocument();
    });

    it('should have settings button', () => {
      const settingsButton = screen.getByText('⚙️ Settings');
      expect(settingsButton).toBeInTheDocument();
      
      fireEvent.click(settingsButton);
      expect(screen.getByTestId('global-settings')).toBeInTheDocument();
    });

    it('should have refresh button', () => {
      const refreshButton = screen.getByText('🔄 Refresh');
      expect(refreshButton).toBeInTheDocument();
      
      fireEvent.click(refreshButton);
      expect(mockVscode.postMessage).toHaveBeenCalledWith({ type: 'ready' });
    });
  });

  describe('Message Handling', () => {
    it('should handle show quick chat message', () => {
      render(<App />);
      sendMessage({ type: 'init', data: { agents: [] } });
      
      sendMessage({
        type: 'showQuickChat',
        data: { selectedText: 'test text' }
      });

      expect(screen.getByTestId('quick-chat-dialog')).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle error messages without crashing', () => {
      render(<App />);
      
      // Send error message - should not crash
      sendMessage({
        type: 'error',
        data: { message: 'Something went wrong' }
      });

      // App should still be functional and show loading message
      expect(screen.getByText('Loading AI Agents...')).toBeInTheDocument();
    });
  });
});