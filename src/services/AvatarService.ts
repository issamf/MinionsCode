import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export interface AvatarInfo {
  id: string;
  filename: string;
  path: string;
  inUse: boolean;
  usedBy?: string; // agent ID
}

export class AvatarService {
  private static instance: AvatarService;
  private avatars: Map<string, AvatarInfo> = new Map();
  private avatarsPath: string;
  private agentAvatars: Map<string, string> = new Map(); // agentId -> avatar value
  private fallbackEmojis: string[] = [
    '🤖', '🎯', '🔥', '⚡', '🚀', '💡', '🎨', '🧠', '💻', '🔧',
    '📊', '🎪', '🌟', '💎', '🎭', '🦄', '🌈', '🎲', '🔮', '⭐',
    '🎊', '🎈', '🎁', '🏆', '🎖️', '🥇', '🎯', '🎪', '🎨', '🎭'
  ];
  private usedFallbacks: Set<string> = new Set();

  private constructor(context: vscode.ExtensionContext) {
    this.avatarsPath = path.join(context.extensionPath, 'resources', 'avatars');
    this.loadAvatars();
    this.watchAvatarsFolder();
  }

  public static getInstance(context: vscode.ExtensionContext): AvatarService {
    if (!AvatarService.instance) {
      AvatarService.instance = new AvatarService(context);
    }
    return AvatarService.instance;
  }

  private loadAvatars(): void {
    try {
      if (!fs.existsSync(this.avatarsPath)) {
        console.log('Avatars folder does not exist, creating it...');
        fs.mkdirSync(this.avatarsPath, { recursive: true });
        return;
      }

      const files = fs.readdirSync(this.avatarsPath);
      const imageFiles = files.filter(file => 
        /\.(png|jpg|jpeg|gif|svg)$/i.test(file)
      );

      // Clear current avatars but preserve usage info
      const currentUsage = new Map<string, string>();
      this.avatars.forEach((avatar) => {
        if (avatar.inUse && avatar.usedBy) {
          currentUsage.set(avatar.filename, avatar.usedBy);
        }
      });

      this.avatars.clear();

      imageFiles.forEach(filename => {
        const avatarId = this.getAvatarIdFromFilename(filename);
        const avatarPath = path.join(this.avatarsPath, filename);
        const usedBy = currentUsage.get(filename);
        
        this.avatars.set(avatarId, {
          id: avatarId,
          filename,
          path: avatarPath,
          inUse: !!usedBy,
          usedBy
        });
      });

      console.log(`Loaded ${this.avatars.size} avatar files`);
    } catch (error) {
      console.error('Error loading avatars:', error);
    }
  }

  private getAvatarIdFromFilename(filename: string): string {
    return path.basename(filename, path.extname(filename));
  }

  private watchAvatarsFolder(): void {
    try {
      fs.watch(this.avatarsPath, (eventType, filename) => {
        if (filename && /\.(png|jpg|jpeg|gif|svg)$/i.test(filename)) {
          console.log(`Avatar folder change detected: ${eventType} - ${filename}`);
          this.loadAvatars();
          
          // If a file was deleted and was in use, we need to handle it
          if (eventType === 'rename') {
            const avatarId = this.getAvatarIdFromFilename(filename);
            const avatar = this.avatars.get(avatarId);
            
            if (!avatar && this.avatars.has(avatarId)) {
              // File was deleted
              this.handleDeletedAvatar(avatarId);
            }
          }
        }
      });
    } catch (error) {
      console.error('Error setting up avatar folder watcher:', error);
    }
  }

  private handleDeletedAvatar(avatarId: string): void {
    const avatar = this.avatars.get(avatarId);
    if (avatar && avatar.inUse && avatar.usedBy) {
      console.log(`Avatar file ${avatar.filename} was deleted while in use by agent ${avatar.usedBy}`);
      
      // Emit event to replace the avatar with invalid icon
      // This would need to be handled by the extension
      vscode.commands.executeCommand('aiAgents.avatarDeleted', {
        agentId: avatar.usedBy,
        avatarId,
        filename: avatar.filename
      });
    }
    
    this.avatars.delete(avatarId);
  }

  public allocateAvatar(agentId: string): string {
    // First, try to find an unused avatar file
    for (const [avatarId, avatar] of this.avatars) {
      if (!avatar.inUse) {
        avatar.inUse = true;
        avatar.usedBy = agentId;
        const displayValue = this.getAvatarDisplayValue(avatar);
        this.agentAvatars.set(agentId, displayValue);
        console.log(`Allocated avatar file ${avatarId} to agent ${agentId}`);
        return displayValue;
      }
    }

    // If all avatar files are in use, use a fallback emoji
    const availableFallbacks = this.fallbackEmojis.filter(emoji => 
      !this.usedFallbacks.has(emoji)
    );

    if (availableFallbacks.length > 0) {
      const emoji = availableFallbacks[Math.floor(Math.random() * availableFallbacks.length)];
      this.usedFallbacks.add(emoji);
      this.agentAvatars.set(agentId, emoji);
      console.log(`Allocated fallback emoji ${emoji} to agent ${agentId}`);
      return emoji;
    }

    // If even fallbacks are exhausted, use random emoji
    const randomEmoji = this.fallbackEmojis[Math.floor(Math.random() * this.fallbackEmojis.length)];
    this.agentAvatars.set(agentId, randomEmoji);
    console.log(`Allocated random emoji ${randomEmoji} to agent ${agentId} (all avatars exhausted)`);
    return randomEmoji;
  }

  public releaseAvatar(agentId: string): void {
    const agentAvatar = this.agentAvatars.get(agentId);
    
    if (agentAvatar) {
      // Find and release avatar file
      for (const [avatarId, avatar] of this.avatars) {
        if (avatar.inUse && avatar.usedBy === agentId) {
          avatar.inUse = false;
          avatar.usedBy = undefined;
          console.log(`Released avatar file ${avatarId} from agent ${agentId}`);
          this.agentAvatars.delete(agentId);
          return;
        }
      }

      // Release fallback emoji if it's one
      if (this.fallbackEmojis.includes(agentAvatar)) {
        this.usedFallbacks.delete(agentAvatar);
        console.log(`Released fallback emoji ${agentAvatar} from agent ${agentId}`);
      }
      
      this.agentAvatars.delete(agentId);
    }
  }

  private getAvatarDisplayValue(avatar: AvatarInfo): string {
    // Map each avatar file to a unique minion-style emoji
    // This represents our avatar files until we implement proper image loading
    const num = parseInt(avatar.id.replace('avatar-', ''));
    const minionAvatars = [
      '😀', // avatar-01 - Happy minion
      '😎', // avatar-02 - Cool minion  
      '🤓', // avatar-03 - Smart minion
      '😋', // avatar-04 - Playful minion
      '🥳', // avatar-05 - Party minion
      '🤖', // avatar-06 - Robot minion
      '🚀', // avatar-07 - Space minion
      '💡', // avatar-08 - Bright minion
      '⚡', // avatar-09 - Electric minion
      '🔥', // avatar-10 - Fire minion
      '🌟', // avatar-11 - Star minion
      '💎'  // avatar-12 - Diamond minion
    ];
    
    console.log(`Using avatar file ${avatar.id} mapped to emoji ${minionAvatars[(num - 1) % minionAvatars.length]}`);
    return minionAvatars[(num - 1) % minionAvatars.length] || '😀';
  }

  public getAvailableAvatarCount(): number {
    let count = 0;
    for (const avatar of this.avatars.values()) {
      if (!avatar.inUse) count++;
    }
    return count;
  }

  public getUsedAvatarCount(): number {
    let count = 0;
    for (const avatar of this.avatars.values()) {
      if (avatar.inUse) count++;
    }
    return count;
  }

  public getTotalAvatarCount(): number {
    return this.avatars.size;
  }

  public refreshAvatars(): void {
    this.loadAvatars();
  }

  public getAvatarStats(): {
    total: number;
    available: number;
    used: number;
    fallbacksUsed: number;
  } {
    return {
      total: this.getTotalAvatarCount(),
      available: this.getAvailableAvatarCount(),
      used: this.getUsedAvatarCount(),
      fallbacksUsed: this.usedFallbacks.size
    };
  }
}