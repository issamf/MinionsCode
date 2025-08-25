import React, { useState, useRef, useEffect } from 'react';
import { AgentConfig } from '@/shared/types';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface AgentWidgetProps {
  agent: AgentConfig;
  onSendMessage: (agentId: string, message: string) => void;
  onDestroy: (agentId: string) => void;
}

export const AgentWidget: React.FC<AgentWidgetProps> = ({
  agent,
  onSendMessage,
  onDestroy
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for responses from the agent
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      
      if (message.type === 'messageResponse' && message.data.agentId === agent.id) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          content: message.data.response,
          isUser: false,
          timestamp: new Date(message.data.timestamp)
        }]);
        setIsLoading(false);
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [agent.id]);

  const handleSendMessage = () => {
    if (!inputMessage.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputMessage,
      isUser: true,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);
    onSendMessage(agent.id, inputMessage);
    setInputMessage('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const formatTimestamp = (date: Date) => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getAgentTypeDisplayName = (type: string) => {
    return type.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getModelDisplayName = (modelName: string) => {
    // Simplify model names for display
    return modelName.replace(/^(gpt-|claude-|gemini-)/, '').replace(/-\d{8}$/, '');
  };

  return (
    <div className="agent-widget slide-up">
      <div className="agent-header">
        <div className="agent-avatar">{agent.avatar}</div>
        <div className="agent-info">
          <h3 className="agent-name">{agent.name}</h3>
          <p className="agent-type">
            {getAgentTypeDisplayName(agent.type)} • {agent.model.provider} • {getModelDisplayName(agent.model.modelName)}
          </p>
        </div>
        <div className="agent-actions">
          <button
            className="icon-btn"
            title="Agent Settings"
            onClick={() => {/* TODO: Open settings */}}
          >
            ⚙️
          </button>
          <button
            className="icon-btn"
            title="Delete Agent"
            onClick={() => {
              if (window.confirm(`Are you sure you want to delete ${agent.name}?`)) {
                onDestroy(agent.id);
              }
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="agent-content">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>{agent.avatar}</div>
              <div style={{ fontSize: '14px', textAlign: 'center' }}>
                Hi! I'm {agent.name}. How can I help you today?
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`message ${message.isUser ? 'message-user' : 'message-agent'}`}
              >
                <div className="message-content">{message.content}</div>
                <div className="message-timestamp">
                  {formatTimestamp(message.timestamp)}
                </div>
              </div>
            ))
          )}
          
          {isLoading && (
            <div className="loading-message">
              <div className="loading-spinner-small"></div>
              <span>{agent.name} is thinking...</span>
            </div>
          )}
          
          <div ref={messagesEndRef} />
        </div>

        <div className="chat-input-container">
          <textarea
            className="chat-input"
            placeholder={`Message ${agent.name}...`}
            value={inputMessage}
            onChange={(e) => setInputMessage((e.target as HTMLTextAreaElement).value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            rows={1}
          />
          <button
            className="btn send-btn"
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};