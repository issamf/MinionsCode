import React, { useState, useRef, useEffect } from 'react';
import { AgentConfig } from '@/shared/types';

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
  const [selectedAgent, setSelectedAgent] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  const handleSend = () => {
    if (!message.trim()) return;
    
    // Check for @agent mentions
    const atMentionMatch = message.match(/@(\w+)/);
    let targetAgent = selectedAgent;
    
    if (atMentionMatch) {
      const mentionedAgentName = atMentionMatch[1];
      const mentionedAgent = activeAgents.find(agent => 
        agent.name.toLowerCase().includes(mentionedAgentName.toLowerCase())
      );
      if (mentionedAgent) {
        targetAgent = mentionedAgent.id;
      }
    }
    
    onSendMessage(message, targetAgent || undefined);
    onClose();
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
              rows={6}
              className="message-input"
            />
          </div>

          <div className="agent-selection">
            <label>Send to specific agent (optional):</label>
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
            >
              <option value="">Let AI decide based on context</option>
              {activeAgents.map(agent => (
                <option key={agent.id} value={agent.id}>
                  {agent.avatar} {agent.name}
                </option>
              ))}
            </select>
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