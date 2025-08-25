import React, { useState, useRef, useEffect } from 'react';
import { AgentConfig, AIProvider } from '@/shared/types';
import { webviewLogger } from '../utils/webviewLogger';

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
  onModelChange?: (agentId: string, model: { provider: AIProvider; modelName: string }) => void;
  initialPosition?: { x: number; y: number };
}

export const AgentWidget: React.FC<AgentWidgetProps> = ({
  agent,
  onSendMessage,
  onDestroy,
  onShowSettings,
  onModelChange,
  initialPosition
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sharedContext, setSharedContext] = useState<SharedContext>({ files: [], textSnippets: [] });
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const [agentStatus, setAgentStatus] = useState<'idle' | 'thinking' | 'typing' | 'responding'>('idle');
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'se' | 'sw' | 'ne' | 'nw' | null>(null);
  const [size, setSize] = useState({ width: 400, height: 500 });
  const [resizeStart, setResizeStart] = useState({ mouseX: 0, mouseY: 0, width: 0, height: 0 });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [savedScrollPosition, setSavedScrollPosition] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showModelSwitcher, setShowModelSwitcher] = useState(false);
  const [availableModels, setAvailableModels] = useState<{ [key: string]: string[] }>({});
  // const [isModelLoading, setIsModelLoading] = useState(false); // TODO: Use for loading states

  // Size constraints
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 250;
  const MAX_WIDTH = 800;
  const MAX_HEIGHT = 1000;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Save scroll position when minimizing
  const saveScrollPosition = () => {
    if (chatMessagesRef.current) {
      const scrollContainer = chatMessagesRef.current;
      setSavedScrollPosition(scrollContainer.scrollTop);
    }
  };

  // Restore scroll position when maximizing
  const restoreScrollPosition = () => {
    if (chatMessagesRef.current && savedScrollPosition !== null) {
      const scrollContainer = chatMessagesRef.current;
      setTimeout(() => {
        scrollContainer.scrollTop = savedScrollPosition;
        setSavedScrollPosition(null);
      }, 0);
    }
  };

  useEffect(() => {
    // Only auto-scroll to bottom for new messages if we're not restoring position
    if (savedScrollPosition === null) {
      scrollToBottom();
    }
  }, [messages, savedScrollPosition]);

  // Listen for responses and context updates from the agent
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;
      
      if (message.type === 'messageThinking' && message.data.agentId === agent.id) {
        setIsLoading(message.data.thinking);
        setAgentStatus(message.data.thinking ? 'thinking' : 'idle');
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
          setAgentStatus('idle');
        } else {
          setAgentStatus('responding');
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
      } else if (message.type === 'availableModels') {
        setAvailableModels(prev => ({
          ...prev,
          [message.data.provider]: message.data.models
        }));
        // setIsModelLoading(false); // TODO: Use for loading states
      }
    };

    window.addEventListener('message', messageHandler);
    return () => window.removeEventListener('message', messageHandler);
  }, [agent.id]);

  // Close model switcher when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showModelSwitcher && widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setShowModelSwitcher(false);
      }
    };

    if (showModelSwitcher) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
    
    return undefined;
  }, [showModelSwitcher]);

  // Drag and drop handlers
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    
    // Calculate offset from the mouse position to the widget's position
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
    setIsDragging(true);
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !widgetRef.current) return;
    
    const container = widgetRef.current.parentElement;
    if (!container) return;
    
    const containerRect = container.getBoundingClientRect();
    
    // Calculate new position based on mouse position and drag offset
    const newX = e.clientX - containerRect.left - dragOffset.x;
    const newY = e.clientY - containerRect.top - dragOffset.y;
    
    // Keep widget within container bounds
    const maxX = containerRect.width - size.width;
    const maxY = containerRect.height - size.height;
    
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

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent, handle: 'se' | 'sw' | 'ne' | 'nw') => {
    e.preventDefault();
    e.stopPropagation();
    
    setIsResizing(true);
    setResizeHandle(handle);
    setResizeStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      width: size.width,
      height: size.height
    });
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (!isResizing || !resizeHandle) return;
    
    const deltaX = e.clientX - resizeStart.mouseX;
    const deltaY = e.clientY - resizeStart.mouseY;
    
    let newWidth = resizeStart.width;
    let newHeight = resizeStart.height;
    
    // Calculate new size based on resize handle
    switch (resizeHandle) {
      case 'se': // South-East
        newWidth += deltaX;
        newHeight += deltaY;
        break;
      case 'sw': // South-West
        newWidth -= deltaX;
        newHeight += deltaY;
        break;
      case 'ne': // North-East
        newWidth += deltaX;
        newHeight -= deltaY;
        break;
      case 'nw': // North-West
        newWidth -= deltaX;
        newHeight -= deltaY;
        break;
    }
    
    // Apply constraints
    newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
    newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, MAX_HEIGHT));
    
    setSize({ width: newWidth, height: newHeight });
    
    // Update position for north/west handles
    if (resizeHandle.includes('n')) {
      const heightChange = newHeight - size.height;
      setPosition(prev => ({ ...prev, y: prev.y - heightChange }));
    }
    if (resizeHandle.includes('w')) {
      const widthChange = newWidth - size.width;
      setPosition(prev => ({ ...prev, x: prev.x - widthChange }));
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
    setResizeHandle(null);
  };

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
    return undefined;
  }, [isResizing, resizeStart, resizeHandle, size]);

  const toggleMinimize = () => {
    if (!isMinimized) {
      // Minimizing - save current scroll position
      saveScrollPosition();
    } else {
      // Maximizing - restore scroll position after DOM update
      setTimeout(restoreScrollPosition, 0);
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
    setAgentStatus('thinking');
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

  const handleQuickModelChange = (modelName: string) => {
    if (onModelChange) {
      onModelChange(agent.id, { provider: agent.model.provider, modelName });
      webviewLogger.log('Quick model switch', { agentId: agent.id, newModel: modelName });
    }
  };

  const getQuickModelOptions = () => {
    const provider = agent.model.provider;
    switch (provider) {
      case AIProvider.ANTHROPIC:
        return ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'];
      case AIProvider.OPENAI:
        return ['gpt-4o', 'gpt-4o-mini'];
      case AIProvider.OLLAMA:
        return availableModels.ollama?.slice(0, 2) || [];
      default:
        return [];
    }
  };

  const getStatusDisplay = (status: typeof agentStatus) => {
    switch (status) {
      case 'thinking':
        return { emoji: '💭', text: 'Thinking...', color: '#fbbf24' };
      case 'responding':
        return { emoji: '💬', text: 'Responding...', color: '#10b981' };
      case 'typing':
        return { emoji: '⌨️', text: 'Typing...', color: '#6366f1' };
      default:
        return { emoji: '😴', text: 'Idle', color: '#6b7280' };
    }
  };

  const statusDisplay = getStatusDisplay(agentStatus);

  if (isMinimized) {
    return (
      <div 
        ref={widgetRef}
        className={`agent-widget-compact slide-up ${isDragOver ? 'drag-over' : ''} ${isDragging ? 'dragging' : ''}`}
        style={{
          position: 'absolute',
          left: position.x,
          top: position.y,
          zIndex: isDragging ? 1000 : 'auto',
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="compact-content" onMouseDown={handleMouseDown}>
          <div className="compact-avatar">
            {agent.avatar.includes('vscode-resource') || agent.avatar.includes('vscode-webview') || agent.avatar.startsWith('https://file') ? (
              <img src={agent.avatar} alt="Agent Avatar" className="avatar-image" />
            ) : (
              <span className="avatar-emoji">{agent.avatar}</span>
            )}
          </div>
          <div className="status-bubble" style={{ backgroundColor: statusDisplay.color }}>
            <span className="status-emoji">{statusDisplay.emoji}</span>
            <span className="status-text">{statusDisplay.text}</span>
          </div>
          <button 
            className="expand-btn"
            title="Expand agent"
            onClick={toggleMinimize}
          >
            ↗
          </button>
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={widgetRef}
      className={`agent-widget slide-up ${isDragOver ? 'drag-over' : ''} ${isDragging || isResizing ? 'dragging' : ''}`}
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex: isDragging || isResizing ? 1000 : 'auto',
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="agent-header" onMouseDown={handleMouseDown}>
        <div className="agent-avatar">
          {agent.avatar.includes('vscode-resource') || agent.avatar.includes('vscode-webview') || agent.avatar.startsWith('https://file') ? (
            <img src={agent.avatar} alt="Agent Avatar" className="avatar-image" />
          ) : (
            <span className="avatar-emoji">{agent.avatar}</span>
          )}
        </div>
        <div className="agent-info">
          <h3 className="agent-name">{agent.name}</h3>
          <div className="agent-model-info">
            <span className="agent-type">
              {getAgentTypeDisplayName(agent.type)} • {agent.model.provider}
            </span>
            <div className="model-switcher" style={{ position: 'relative', display: 'inline-block' }}>
              <button 
                className="model-quick-switch"
                title="Click to switch model"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModelSwitcher(!showModelSwitcher);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--vscode-foreground)',
                  cursor: 'pointer',
                  fontSize: 'inherit',
                  textDecoration: 'underline',
                  padding: 0
                }}
              >
                {getModelDisplayName(agent.model.modelName)}
              </button>
              {showModelSwitcher && (
                <div className="model-options" style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 1000,
                  background: 'var(--vscode-dropdown-background)',
                  border: '1px solid var(--vscode-dropdown-border)',
                  borderRadius: '3px',
                  minWidth: '150px',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                  marginTop: '2px'
                }}>
                  {getQuickModelOptions().map(model => (
                    <button
                      key={model}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuickModelChange(model);
                        setShowModelSwitcher(false);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{
                        width: '100%',
                        padding: '6px 12px',
                        border: 'none',
                        background: model === agent.model.modelName ? 'var(--vscode-list-activeSelectionBackground)' : 'transparent',
                        color: 'var(--vscode-foreground)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        fontSize: '12px'
                      }}
                      onMouseEnter={(e) => {
                        if (model !== agent.model.modelName) {
                          (e.target as HTMLElement).style.background = 'var(--vscode-list-hoverBackground)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (model !== agent.model.modelName) {
                          (e.target as HTMLElement).style.background = 'transparent';
                        }
                      }}
                    >
                      {getModelDisplayName(model)}
                      {model === agent.model.modelName && ' ✓'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="agent-actions">
          <div className="widget-controls">
            <button
              className="control-btn"
              title={isMinimized ? "Maximize" : "Minimize"}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleMinimize();
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              {isMinimized ? '□' : '—'}
            </button>
          </div>
          <button
            className="icon-btn"
            title="Delete Agent"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              webviewLogger.log('Delete button clicked', { agentId: agent.id, agentName: agent.name });
              setShowDeleteConfirm(true);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              webviewLogger.log('DELETE BUTTON - MOUSEDOWN EVENT');
            }}
          >
            🗑️
          </button>
          <button
            className="icon-btn"
            title="Agent Settings"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onShowSettings?.(agent.id);
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            ⚙️
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
        <div className="chat-messages" ref={chatMessagesRef}>
          {messages.length === 0 ? (
            <div className="empty-state">
              <div style={{ fontSize: '24px', marginBottom: '8px' }}>
                {agent.avatar.includes('vscode-resource') || agent.avatar.includes('vscode-webview') || agent.avatar.startsWith('https://file') ? (
                  <img src={agent.avatar} alt="Agent Avatar" className="avatar-image" style={{ width: '24px', height: '24px' }} />
                ) : (
                  <span className="avatar-emoji">{agent.avatar}</span>
                )}
              </div>
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
      
      {/* Resize handles */}
      <div className="resize-handles">
        <div 
          className="resize-handle resize-handle-se" 
          onMouseDown={(e) => handleResizeStart(e, 'se')}
        />
        <div 
          className="resize-handle resize-handle-sw" 
          onMouseDown={(e) => handleResizeStart(e, 'sw')}
        />
        <div 
          className="resize-handle resize-handle-ne" 
          onMouseDown={(e) => handleResizeStart(e, 'ne')}
        />
        <div 
          className="resize-handle resize-handle-nw" 
          onMouseDown={(e) => handleResizeStart(e, 'nw')}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="dialog-overlay">
          <div className="dialog-content">
            <h3>Delete Agent</h3>
            <p>Are you sure you want to delete <strong>{agent.name}</strong>?</p>
            <p>This action cannot be undone.</p>
            <div className="dialog-actions">
              <button
                className="btn btn-secondary"
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  webviewLogger.log('Delete confirmed', { agentId: agent.id });
                  onDestroy(agent.id);
                  setShowDeleteConfirm(false);
                }}
                style={{ backgroundColor: 'var(--vscode-errorForeground)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};