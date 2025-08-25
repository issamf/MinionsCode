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
  initialPosition?: { x: number; y: number };
}

export const AgentWidget: React.FC<AgentWidgetProps> = ({
  agent,
  onSendMessage,
  onDestroy,
  onShowSettings,
  initialPosition
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sharedContext, setSharedContext] = useState<SharedContext>({ files: [], textSnippets: [] });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [originalSize, setOriginalSize] = useState({ width: 400, height: 500 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

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
      
      if (message.type === 'messageThinking' && message.data.agentId === agent.id) {
        setIsLoading(message.data.thinking);
      } else if (message.type === 'messageResponse' && message.data.agentId === agent.id) {
        if (message.data.done) {
          // Final response - add to messages
          setMessages(prev => {
            const newMessages = [...prev];
            // Check if we already have this message (for streaming)
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && !lastMessage.isUser && lastMessage.id === 'streaming') {
              // Update the streaming message
              lastMessage.content = message.data.response;
              lastMessage.id = Date.now().toString();
            } else {
              // Add new message
              newMessages.push({
                id: Date.now().toString(),
                content: message.data.response,
                isUser: false,
                timestamp: new Date(message.data.timestamp)
              });
            }
            return newMessages;
          });
          setIsLoading(false);
        } else {
          // Streaming response - update or add streaming message
          setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage && !lastMessage.isUser && lastMessage.id === 'streaming') {
              // Update streaming message
              lastMessage.content = message.data.response;
            } else {
              // Add new streaming message
              newMessages.push({
                id: 'streaming',
                content: message.data.response,
                isUser: false,
                timestamp: new Date(message.data.timestamp)
              });
            }
            return newMessages;
          });
        }
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
    
    try {
      // Handle file drops from VSCode explorer
      const data = e.dataTransfer.getData('text/plain');
      if (data) {
        // This is likely a file path from VSCode
        const filePaths = data.split('\n').filter(path => path.trim());
        filePaths.forEach(filePath => {
          if (filePath) {
            // Send message to extension to handle file sharing
            window.postMessage({
              type: 'shareFile',
              data: { agentId: agent.id, filePath: filePath.trim() }
            }, '*');
          }
        });
        return;
      }

      // Handle regular file drops
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        files.forEach(file => {
          // For regular file drops, we can only get the file name
          // The extension would need to handle the actual file reading
          window.postMessage({
            type: 'shareFile', 
            data: { agentId: agent.id, filePath: file.name }
          }, '*');
        });
      }
    } catch (error) {
      console.error('Error handling file drop:', error);
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

  // Widget dragging handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!widgetRef.current) return;
    
    const rect = widgetRef.current.getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    setIsDragging(true);
    e.preventDefault();
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !widgetRef.current) return;
    
    const container = widgetRef.current.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const newY = e.clientY - containerRect.top - dragOffset.y;
    
    // Keep widget within container bounds
    const maxX = containerRect.width - widgetRef.current.offsetWidth;
    const maxY = containerRect.height - widgetRef.current.offsetHeight;
    
    const clampedX = Math.max(0, Math.min(newX, maxX));
    const clampedY = Math.max(0, Math.min(newY, maxY));
    
    setPosition({ x: clampedX, y: clampedY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
    return undefined;
  }, [isDragging, dragOffset]);

  const toggleMinimize = () => {
    if (!widgetRef.current) return;
    
    if (!isMinimized) {
      // Store current size before minimizing
      const rect = widgetRef.current.getBoundingClientRect();
      setOriginalSize({ width: rect.width, height: rect.height });
    }
    
    setIsMinimized(!isMinimized);
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
      ref={widgetRef}
      className={`agent-widget slide-up ${isDragOver ? 'drag-over' : ''} ${isMinimized ? 'widget-minimized' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        zIndex: isDragging ? 1000 : 'auto',
        width: isMinimized ? originalSize.width : undefined,
        height: isMinimized ? 48 : undefined
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="agent-header" onMouseDown={handleMouseDown}>
        <div className="agent-avatar">{agent.avatar}</div>
        <div className="agent-info">
          <h3 className="agent-name">{agent.name}</h3>
          <p className="agent-type">
            {getAgentTypeDisplayName(agent.type)} • {agent.model.provider} • {getModelDisplayName(agent.model.modelName)}
          </p>
        </div>
        <div className="agent-actions">
          <div className="widget-controls">
            <button
              className="control-btn"
              title={isMinimized ? "Maximize" : "Minimize"}
              onClick={toggleMinimize}
            >
              {isMinimized ? '□' : '—'}
            </button>
          </div>
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