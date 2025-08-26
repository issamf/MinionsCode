import React, { useState, useRef, useEffect } from 'react';
import { AgentConfig } from '@/shared/types';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  agentName?: string;
}

interface QuickChatDialogProps {
  agents: AgentConfig[];
  initialContext?: string | null;
  onClose: () => void;
  onSendMessage: (message: string, targetAgent?: string) => void;
}

export const QuickChatDialog: React.FC<QuickChatDialogProps> = ({
  agents,
  initialContext,
  onClose,
  onSendMessage
}) => {
  const [message, setMessage] = useState(initialContext || '');
  const [sharedConversation, setSharedConversation] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeAgents = agents.filter(agent => agent.isActive);

  useEffect(() => {
    // Focus the textarea when dialog opens
    if (textareaRef.current) {
      textareaRef.current.focus();
      // Move cursor to end if there's initial context
      if (initialContext) {
        textareaRef.current.setSelectionRange(initialContext.length, initialContext.length);
      }
    }
  }, [initialContext]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [sharedConversation]);

  // Handle messages from extension
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      if (message.type === 'sharedChatResponse') {
        const { response, done, agentName, timestamp } = message.data;
        
        if (done && response) {
          // Add complete agent response to shared conversation
          setSharedConversation(prev => [
            ...prev,
            {
              id: Date.now().toString(),
              content: response,
              isUser: false,
              timestamp: new Date(timestamp),
              agentName: agentName
            }
          ]);
          setIsLoading(false);
        } else if (!done && response) {
          // Handle streaming responses (could update the last message or show typing)
          setIsLoading(true);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSend = () => {
    if (!message.trim()) return;
    
    // Add user message to shared conversation
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      isUser: true,
      timestamp: new Date()
    };
    
    setSharedConversation(prev => [...prev, userMessage]);
    
    // Check for @agent mentions
    const atMentionMatch = message.match(/@(\w+)/);
    let targetAgent: string | undefined = undefined;
    
    if (atMentionMatch) {
      const mentionedAgentName = atMentionMatch[1];
      const mentionedAgent = activeAgents.find(agent => 
        agent.name.toLowerCase().includes(mentionedAgentName.toLowerCase())
      );
      if (mentionedAgent) {
        targetAgent = mentionedAgent.id;
      }
    }
    
    setMessage(''); // Clear input
    setIsLoading(true);
    onSendMessage(message, targetAgent);
    // Don't close the dialog anymore - keep it open for conversation
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  const insertAtMention = (agentName: string) => {
    const currentMessage = message;
    const newMessage = currentMessage ? `${currentMessage}\n@${agentName} ` : `@${agentName} `;
    setMessage(newMessage);
    
    // Focus and move cursor to end
    if (textareaRef.current) {
      textareaRef.current.focus();
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.setSelectionRange(newMessage.length, newMessage.length);
        }
      }, 0);
    }
  };

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog quick-chat-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-header">
          <h2>Quick Chat</h2>
          <button className="icon-btn" onClick={onClose}>❌</button>
        </div>

        <div className="dialog-content">
          {initialContext && (
            <div className="context-info">
              <div className="context-label">Selected text context:</div>
              <div className="context-preview">{initialContext}</div>
            </div>
          )}
          
          <div className="shared-conversation">
            <div className="conversation-header">
              <h3>Shared Conversation</h3>
              <span className="agent-count">{activeAgents.length} active agent{activeAgents.length !== 1 ? 's' : ''}</span>
            </div>
            
            <div className="messages-container">
              {sharedConversation.length === 0 ? (
                <div className="no-messages">
                  <p>Start a conversation with your agents using @mentions</p>
                  <p>Try <code>@everyone Hello!</code> or <code>@AgentName What do you think?</code></p>
                </div>
              ) : (
                <>
                  {sharedConversation.map((msg) => (
                    <div key={msg.id} className={`message ${msg.isUser ? 'user-message' : 'agent-message'}`}>
                      <div className="message-content">
                        {msg.content}
                      </div>
                      <div className="message-meta">
                        {msg.agentName && <span className="agent-name">{msg.agentName}</span>}
                        <span className="timestamp">
                          {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="message agent-message loading">
                      <div className="message-content">
                        <span className="typing-indicator">Agent is thinking...</span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>
          </div>
          
          <div className="agent-mentions">
            <div className="mentions-label">Quick mention:</div>
            <div className="mention-buttons">
              {activeAgents.map(agent => (
                <button
                  key={agent.id}
                  className="mention-btn"
                  onClick={() => insertAtMention(agent.name)}
                  title={`Mention ${agent.name}`}
                >
                  {agent.avatar} {agent.name}
                </button>
              ))}
              <button
                className="mention-btn everyone"
                onClick={() => insertAtMention('everyone')}
                title="Mention all agents"
              >
                👥 @everyone
              </button>
            </div>
          </div>

          <div className="message-input-section">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type your message... Use @agentname or @everyone to target specific agents. Ctrl+Enter to send."
              rows={4}
              className="message-input"
            />
          </div>
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary" 
            onClick={handleSend}
            disabled={!message.trim()}
          >
            Send Message (Ctrl+Enter)
          </button>
        </div>
      </div>
    </div>
  );
};