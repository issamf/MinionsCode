import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QuickChatDialog } from '@/webview/components/QuickChatDialog';
import { AgentConfig, AgentType, AIProvider } from '@/shared/types';

// Mock the webview logger
jest.mock('@/webview/utils/webviewLogger', () => ({
  webviewLogger: {
    log: jest.fn(),
  },
}));

describe('QuickChatDialog - Core Functionality', () => {
  const mockAgents: AgentConfig[] = [
    {
      id: 'agent-1',
      name: 'Code Reviewer',
      avatar: '👨‍💻',
      type: AgentType.CODE_REVIEWER,
      model: {
        provider: AIProvider.ANTHROPIC,
        modelName: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
        maxTokens: 2000,
      },
      systemPrompt: 'You are a code reviewer',
      capabilities: [],
      permissions: [],
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
    }
  ];

  const mockOnClose = jest.fn();
  const mockOnSendMessage = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock window event listeners
    jest.spyOn(window, 'addEventListener').mockImplementation(() => {});
    jest.spyOn(window, 'removeEventListener').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render dialog title', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText('Quick Chat')).toBeInTheDocument();
    });

    it('should show active agents in mention buttons', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText('👨‍💻 Code Reviewer')).toBeInTheDocument();
    });

    it('should show @everyone button', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText('👥 @everyone')).toBeInTheDocument();
    });

    it('should display agent count', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText('1 active agent')).toBeInTheDocument();
    });
  });

  describe('Message Input', () => {
    it('should allow typing in textarea', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const textarea = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      expect(textarea).toHaveValue('Hello');
    });

    it('should disable send button when message is empty', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const sendButton = screen.getByText('Send Message (Ctrl+Enter)');
      expect(sendButton).toBeDisabled();
    });

    it('should enable send button when message has content', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const textarea = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(textarea, { target: { value: 'Hello' } });

      const sendButton = screen.getByText('Send Message (Ctrl+Enter)');
      expect(sendButton).not.toBeDisabled();
    });
  });

  describe('Message Sending', () => {
    it('should call onSendMessage when send button clicked', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const textarea = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      
      const sendButton = screen.getByText('Send Message (Ctrl+Enter)');
      fireEvent.click(sendButton);

      expect(mockOnSendMessage).toHaveBeenCalledWith('Test message', undefined);
    });

    it('should detect @agent mentions', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const textarea = screen.getByPlaceholderText(/Type your message/);
      fireEvent.change(textarea, { target: { value: '@Code please help' } });
      
      const sendButton = screen.getByText('Send Message (Ctrl+Enter)');
      fireEvent.click(sendButton);

      expect(mockOnSendMessage).toHaveBeenCalledWith('@Code please help', 'agent-1');
    });

    it('should clear input after sending', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const textarea = screen.getByPlaceholderText(/Type your message/) as HTMLTextAreaElement;
      fireEvent.change(textarea, { target: { value: 'Test message' } });
      
      const sendButton = screen.getByText('Send Message (Ctrl+Enter)');
      fireEvent.click(sendButton);

      expect(textarea.value).toBe('');
    });
  });

  describe('Dialog Controls', () => {
    it('should close when close button clicked', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const closeButton = screen.getByText('❌');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should close when cancel button clicked', () => {
      render(
        <QuickChatDialog
          agents={mockAgents}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('Initial Context', () => {
    it('should show initial context when provided', () => {
      const initialContext = 'function test() { return true; }';
      
      render(
        <QuickChatDialog
          agents={mockAgents}
          initialContext={initialContext}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      expect(screen.getByText('Selected text context:')).toBeInTheDocument();
      expect(screen.getAllByText(initialContext)).toHaveLength(2); // One in preview, one in textarea
    });

    it('should pre-populate textarea with initial context', () => {
      const initialContext = 'function test() { return true; }';
      
      render(
        <QuickChatDialog
          agents={mockAgents}
          initialContext={initialContext}
          onClose={mockOnClose}
          onSendMessage={mockOnSendMessage}
        />
      );

      const textarea = screen.getByPlaceholderText(/Type your message/);
      expect(textarea).toHaveValue(initialContext);
    });
  });
});