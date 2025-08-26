// Test for agent name matching logic used in shared chat
describe('Agent Name Matching Logic', () => {
  const testAgents = [
    { id: 'agent-1', name: 'Code Reviewer', isActive: true },
    { id: 'agent-2', name: 'Documentation Writer', isActive: true },
    { id: 'agent-3', name: 'DevOps Engineer', isActive: true },
    { id: 'agent-4', name: 'UI/UX Designer', isActive: true },
    { id: 'agent-5', name: 'Inactive Agent', isActive: false },
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
    
    // Return the first match (or could implement better matching logic)
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

  it('should handle messages with multiple @mentions by using first match', () => {
    const result = findAgentByMention('@Code and @Doc please collaborate', testAgents);
    expect(result).toBe('agent-1');
  });

  it('should handle special characters in names', () => {
    const specialAgents = [
      { id: 'agent-1', name: 'C++ Expert', isActive: true },
      { id: 'agent-2', name: 'UI/UX Designer', isActive: true },
    ];
    
    const result1 = findAgentByMention('@C++ can you help?', specialAgents);
    expect(result1).toBe('agent-1');
    
    const result2 = findAgentByMention('@UI help with design', specialAgents);
    expect(result2).toBe('agent-2');
  });

  it('should be case insensitive for @everyone', () => {
    const result1 = findAgentByMention('@EVERYONE help me', testAgents);
    expect(result1).toBe('everyone');
    
    const result2 = findAgentByMention('@Everyone help me', testAgents);
    expect(result2).toBe('everyone');
  });
});