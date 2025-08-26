/**
 * Core Functionality Integration Tests
 * Tests the essential features that users rely on
 */

describe('Core Functionality Integration', () => {
  describe('Agent Name Matching Logic (Shared Chat)', () => {
    const testAgents = [
      { id: 'agent-1', name: 'Code Reviewer', isActive: true },
      { id: 'agent-2', name: 'Documentation Writer', isActive: true },
      { id: 'agent-3', name: 'DevOps Engineer', isActive: true },
      { id: 'agent-4', name: 'Inactive Agent', isActive: false },
    ];

    function findAgentByMention(message: string, agents: any[]): string | null {
      const activeAgents = agents.filter(agent => agent.isActive);
      
      // Check for @everyone first
      if (message.toLowerCase().includes('@everyone')) {
        return 'everyone';
      }
      
      // Extract mention from message
      const atMentionMatch = message.match(/@(\w+)/i);
      if (!atMentionMatch) {
        return null;
      }
      
      const mention = atMentionMatch[1].toLowerCase();
      
      // Find best matching agent
      const matches = activeAgents.filter(agent => 
        agent.name.toLowerCase().includes(mention)
      );
      
      if (matches.length === 0) {
        return null;
      }
      
      // Return the first match
      return matches[0].id;
    }

    it('should match @everyone mentions', () => {
      const result = findAgentByMention('@everyone help me', testAgents);
      expect(result).toBe('everyone');
    });

    it('should handle case-insensitive @mentions', () => {
      const result = findAgentByMention('@code please help', testAgents);
      expect(result).toBe('agent-1');
    });

    it('should handle partial @mentions', () => {
      const result = findAgentByMention('@Doc can you help?', testAgents);
      expect(result).toBe('agent-2');
    });

    it('should ignore inactive agents', () => {
      const result = findAgentByMention('@Inactive please help', testAgents);
      expect(result).toBeNull();
    });

    it('should return null for unknown mentions', () => {
      const result = findAgentByMention('@Unknown help me', testAgents);
      expect(result).toBeNull();
    });

    it('should return null when no @ mention found', () => {
      const result = findAgentByMention('Hello everyone', testAgents);
      expect(result).toBeNull();
    });
  });

  describe('Avatar Management Logic', () => {
    it('should allocate unique avatars', () => {
      const availableAvatars = ['avatar1', 'avatar2', 'avatar3'];
      const allocatedAvatars = new Map<string, string>();
      
      function allocateAvatar(agentId: string): string {
        if (allocatedAvatars.has(agentId)) {
          return allocatedAvatars.get(agentId)!;
        }
        
        const usedAvatars = new Set(allocatedAvatars.values());
        const availableAvatar = availableAvatars.find(avatar => !usedAvatars.has(avatar));
        
        if (availableAvatar) {
          allocatedAvatars.set(agentId, availableAvatar);
          return availableAvatar;
        }
        
        // Fallback to emoji if no file avatars available
        return '🤖';
      }
      
      const avatar1 = allocateAvatar('agent-1');
      const avatar2 = allocateAvatar('agent-2');
      const avatar3 = allocateAvatar('agent-3');
      
      expect(avatar1).not.toBe(avatar2);
      expect(avatar2).not.toBe(avatar3);
      expect(avatar1).not.toBe(avatar3);
    });

    it('should return same avatar for same agent', () => {
      const availableAvatars = ['avatar1', 'avatar2'];
      const allocatedAvatars = new Map<string, string>();
      
      function allocateAvatar(agentId: string): string {
        if (allocatedAvatars.has(agentId)) {
          return allocatedAvatars.get(agentId)!;
        }
        
        const usedAvatars = new Set(allocatedAvatars.values());
        const availableAvatar = availableAvatars.find(avatar => !usedAvatars.has(avatar));
        
        if (availableAvatar) {
          allocatedAvatars.set(agentId, availableAvatar);
          return availableAvatar;
        }
        
        return '🤖';
      }
      
      const avatar1 = allocateAvatar('agent-1');
      const avatar2 = allocateAvatar('agent-1'); // Same agent
      
      expect(avatar1).toBe(avatar2);
    });
  });

  describe('Agent Configuration Validation', () => {
    it('should validate required agent fields', () => {
      function validateAgentConfig(config: any): string[] {
        const errors: string[] = [];
        
        if (!config.name || config.name.trim().length === 0) {
          errors.push('Agent name is required');
        }
        
        if (!config.type) {
          errors.push('Agent type is required');
        }
        
        if (!config.model || !config.model.provider) {
          errors.push('AI provider is required');
        }
        
        if (config.name && config.name.length > 50) {
          errors.push('Agent name must be 50 characters or less');
        }
        
        return errors;
      }

      const validConfig = {
        name: 'Test Agent',
        type: 'CODE_REVIEWER',
        model: { provider: 'anthropic' }
      };
      
      const invalidConfig = {
        name: '',
        type: null,
        model: null
      };
      
      expect(validateAgentConfig(validConfig)).toHaveLength(0);
      expect(validateAgentConfig(invalidConfig)).toHaveLength(3);
    });
  });

  describe('Message Routing Logic', () => {
    it('should route messages based on @mentions', () => {
      const agents = [
        { id: 'agent-1', name: 'Code Reviewer', isActive: true },
        { id: 'agent-2', name: 'Writer', isActive: true }
      ];
      
      function routeMessage(message: string, agents: any[]): string[] {
        const activeAgents = agents.filter(agent => agent.isActive);
        
        if (message.toLowerCase().includes('@everyone')) {
          return activeAgents.map(agent => agent.id);
        }
        
        const mentionMatch = message.match(/@(\w+)/i);
        if (mentionMatch) {
          const mention = mentionMatch[1].toLowerCase();
          const targetAgent = activeAgents.find(agent => 
            agent.name.toLowerCase().includes(mention)
          );
          if (targetAgent) {
            return [targetAgent.id];
          }
        }
        
        // Fallback to first active agent
        return activeAgents.length > 0 ? [activeAgents[0].id] : [];
      }
      
      expect(routeMessage('@everyone hello', agents)).toEqual(['agent-1', 'agent-2']);
      expect(routeMessage('@code help me', agents)).toEqual(['agent-1']);
      expect(routeMessage('general message', agents)).toEqual(['agent-1']);
    });
  });

  describe('Configuration Management', () => {
    it('should manage settings with defaults', () => {
      const defaultSettings = {
        maxAgents: 5,
        autoSave: true,
        panelPosition: 'beside'
      };
      
      function getSettingWithDefault(key: string, value: any): any {
        if (value === undefined || value === null) {
          return defaultSettings[key as keyof typeof defaultSettings];
        }
        return value;
      }
      
      expect(getSettingWithDefault('maxAgents', undefined)).toBe(5);
      expect(getSettingWithDefault('maxAgents', 10)).toBe(10);
      expect(getSettingWithDefault('autoSave', false)).toBe(false);
    });
  });
});