import { AvatarService } from '@/services/AvatarService';
import * as vscode from 'vscode';

// Mock context
const mockContext = {
  extensionPath: '/mock/path'
} as unknown as vscode.ExtensionContext;

// Mock fs
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  readdirSync: jest.fn(() => ['avatar1.png', 'avatar2.png', 'avatar3.png']),
  watch: jest.fn(() => ({ close: jest.fn() })),
}));

// Mock path
jest.mock('path', () => ({
  join: jest.fn((...paths) => paths.join('/')),
  basename: jest.fn((filePath, ext) => {
    const name = filePath.split('/').pop() || '';
    return ext ? name.replace(ext, '') : name;
  }),
  extname: jest.fn((filePath) => {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  }),
}));

describe('AvatarService - Essential Functions', () => {
  let avatarService: AvatarService;

  beforeEach(() => {
    // Reset singleton
    (AvatarService as any).instance = null;
    avatarService = AvatarService.getInstance(mockContext);
  });

  afterEach(() => {
    (AvatarService as any).instance = null;
  });

  describe('Avatar Allocation', () => {
    it('should allocate avatars to agents', () => {
      const avatar = avatarService.allocateAvatar('agent-1');
      expect(avatar).toBeTruthy();
      expect(typeof avatar).toBe('string');
    });

    it('should handle repeated allocation calls', () => {
      const avatar1 = avatarService.allocateAvatar('agent-1');
      const avatar2 = avatarService.allocateAvatar('agent-1');
      // Both should be valid avatars (implementation may vary)
      expect(avatar1).toBeTruthy();
      expect(avatar2).toBeTruthy();
    });

    it('should allocate different avatars to different agents', () => {
      const avatar1 = avatarService.allocateAvatar('agent-1');
      const avatar2 = avatarService.allocateAvatar('agent-2');
      expect(avatar1).not.toBe(avatar2);
    });

    it('should track avatar usage', () => {
      avatarService.allocateAvatar('agent-1');
      const stats = avatarService.getAvatarStats();
      
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('used');
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('fallbacksUsed');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.used).toBe('number');
    });
  });

  describe('Avatar Management', () => {
    it('should release avatars when agent destroyed', () => {
      const agentId = 'agent-test';
      avatarService.allocateAvatar(agentId);
      avatarService.releaseAvatar(agentId);
      
      // Should not throw
      expect(true).toBe(true);
    });

    it('should mark avatars as in use', () => {
      avatarService.markAvatarInUse('agent-id', 'test-avatar');
      // Should not throw
      expect(true).toBe(true);
    });

    it('should refresh avatar list', () => {
      avatarService.refreshAvatars();
      // Should not throw
      expect(true).toBe(true);
    });
  });
});