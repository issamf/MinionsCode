import React, { useState, useRef, useEffect } from 'react';
import { AgentConfig } from '@/shared/types';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
}

interface SharedContext {
  files: string[];
  textSnippets: { content: string; fileName?: string }[];
}

interface AgentWidgetProps {
  agent: AgentConfig;
  onSendMessage: (agentId: string, message: string) => void;
  onDestroy: (agentId: string) => void;
  onShowSettings?: (agentId: string) => void;
}

export const AgentWidget: React.FC<AgentWidgetProps> = ({
  agent,
  onSendMessage,
  onDestroy,
  onShowSettings
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sharedContext, setSharedContext] = useState<SharedContext>({ files: [], textSnippets: [] });
  const [isDragOver, setIsDragOver] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Listen for responses and context updates from the agent
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
      } else if (message.type === 'fileDropped' && message.data.agentId === agent.id) {
        setSharedContext(prev => ({
          ...prev,
          files: [...prev.files, message.data.filePath]
        }));
      } else if (message.type === 'selectionSent' && message.data.agentId === agent.id) {
        setSharedContext(prev => ({
          ...prev,
          textSnippets: [...prev.textSnippets, {
            content: message.data.selectedText,
            fileName: message.data.fileName
          }]
        }));
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [agent.id]);

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      files.forEach(file => {
        setSharedContext(prev => ({
          ...prev,
          files: [...prev.files, file.name]
        }));
      });
    }
  };

  const removeContextItem = (type: 'file' | 'snippet', index: number) => {
    if (type === 'file') {
      setSharedContext(prev => ({
        ...prev,
        files: prev.files.filter((_, i) => i !== index)
      }));
    } else {
      setSharedContext(prev => ({
        ...prev,
        textSnippets: prev.textSnippets.filter((_, i) => i !== index)
      }));
    }
  };

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
    <div 
      className={`agent-widget slide-up ${isDragOver ? 'drag-over' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
            onClick={() => onShowSettings?.(agent.id)}
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

      {(sharedContext.files.length > 0 || sharedContext.textSnippets.length > 0) && (
        <div className="shared-context">
          <div className="context-header">
            <span className="context-title">📎 Shared Context</span>
          </div>
          
          {sharedContext.files.length > 0 && (
            <div className="context-section">
              <span className="context-label">Files:</span>
              <div className="context-items">
                {sharedContext.files.map((file, index) => (
                  <div key={index} className="context-item file-item">
                    <span className="file-icon">📄</span>
                    <span className="file-name">{file}</span>
                    <button 
                      className="remove-btn"
                      onClick={() => removeContextItem('file', index)}
                      title="Remove file"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {sharedContext.textSnippets.length > 0 && (
            <div className="context-section">
              <span className="context-label">Text Snippets:</span>
              <div className="context-items">
                {sharedContext.textSnippets.map((snippet, index) => (
                  <div key={index} className="context-item snippet-item">
                    <span className="snippet-icon">📝</span>
                    <div className="snippet-info">
                      <span className="snippet-preview">
                        {snippet.content.length > 50 
                          ? snippet.content.substring(0, 50) + '...' 
                          : snippet.content
                        }
                      </span>
                      {snippet.fileName && (
                        <span className="snippet-source">from {snippet.fileName}</span>
                      )}
                    </div>
                    <button 
                      className="remove-btn"
                      onClick={() => removeContextItem('snippet', index)}
                      title="Remove snippet"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

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