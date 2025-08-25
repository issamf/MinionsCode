import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectContext, GitInfo, FileNode, PackageInfo } from '@/shared/types';

export class ContextProvider {
  private context: ProjectContext | null = null;
  private watchers: vscode.FileSystemWatcher[] = [];

  constructor() {
    this.refreshWorkspaceContext();
    this.setupWatchers();
  }

  public async getProjectContext(): Promise<ProjectContext | null> {
    if (!this.context) {
      await this.refreshWorkspaceContext();
    }
    return this.context;
  }

  public async refreshWorkspaceContext(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      this.context = null;
      return;
    }

    const workspaceRoot = workspaceFolders[0].uri.fsPath;

    try {
      const [gitInfo, packageInfo, fileTree] = await Promise.all([
        this.getGitInfo(workspaceRoot),
        this.getPackageInfo(workspaceRoot),
        this.getFileTree(workspaceRoot)
      ]);

      this.context = {
        workspaceRoot,
        gitInfo,
        packageInfo,
        fileTree,
        recentFiles: await this.getRecentFiles(),
        openTabs: this.getOpenTabs(),
        activeFile: this.getActiveFile()
      };
    } catch (error) {
      console.error('Error refreshing workspace context:', error);
      this.context = null;
    }
  }

  private async getGitInfo(workspaceRoot: string): Promise<GitInfo> {
    const gitDir = path.join(workspaceRoot, '.git');
    
    if (!fs.existsSync(gitDir)) {
      return {
        branch: 'main',
        remotes: [],
        status: { modified: [], added: [], deleted: [], untracked: [] },
        lastCommit: {
          hash: '',
          message: '',
          author: '',
          date: new Date()
        }
      };
    }

    try {
      // Get current branch
      const headPath = path.join(gitDir, 'HEAD');
      const headContent = await fs.promises.readFile(headPath, 'utf8');
      const branchMatch = headContent.match(/ref: refs\/heads\/(.+)/);
      const branch = branchMatch ? branchMatch[1].trim() : 'HEAD';

      // Get git status using VSCode's git API if available
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      let status = { modified: [], added: [], deleted: [], untracked: [] };
      
      if (gitExtension && gitExtension.isActive) {
        const git = gitExtension.exports.getAPI(1);
        const repo = git.repositories.find((r: any) => r.rootUri.fsPath === workspaceRoot);
        
        if (repo && repo.state) {
          status = {
            modified: repo.state.workingTreeChanges
              .filter((c: any) => c.status === 5) // Modified
              .map((c: any) => c.uri.fsPath),
            added: repo.state.indexChanges
              .filter((c: any) => c.status === 0) // Added
              .map((c: any) => c.uri.fsPath),
            deleted: repo.state.workingTreeChanges
              .filter((c: any) => c.status === 6) // Deleted
              .map((c: any) => c.uri.fsPath),
            untracked: repo.state.workingTreeChanges
              .filter((c: any) => c.status === 7) // Untracked
              .map((c: any) => c.uri.fsPath)
          };
        }
      }

      return {
        branch,
        remotes: [], // TODO: Parse remotes from git config
        status,
        lastCommit: {
          hash: '',
          message: '',
          author: '',
          date: new Date()
        }
      };
    } catch (error) {
      console.error('Error getting git info:', error);
      return {
        branch: 'main',
        remotes: [],
        status: { modified: [], added: [], deleted: [], untracked: [] },
        lastCommit: {
          hash: '',
          message: '',
          author: '',
          date: new Date()
        }
      };
    }
  }

  private async getPackageInfo(workspaceRoot: string): Promise<PackageInfo> {
    const packageJsonPath = path.join(workspaceRoot, 'package.json');
    
    if (!fs.existsSync(packageJsonPath)) {
      return {
        name: path.basename(workspaceRoot),
        version: '0.0.0',
        dependencies: {},
        scripts: {}
      };
    }

    try {
      const packageContent = await fs.promises.readFile(packageJsonPath, 'utf8');
      const packageJson = JSON.parse(packageContent);
      
      return {
        name: packageJson.name || path.basename(workspaceRoot),
        version: packageJson.version || '0.0.0',
        dependencies: {
          ...(packageJson.dependencies || {}),
          ...(packageJson.devDependencies || {})
        },
        scripts: packageJson.scripts || {}
      };
    } catch (error) {
      console.error('Error parsing package.json:', error);
      return {
        name: path.basename(workspaceRoot),
        version: '0.0.0',
        dependencies: {},
        scripts: {}
      };
    }
  }

  private async getFileTree(workspaceRoot: string, maxDepth = 3): Promise<FileNode[]> {
    try {
      return await this.buildFileTree(workspaceRoot, workspaceRoot, maxDepth);
    } catch (error) {
      console.error('Error building file tree:', error);
      return [];
    }
  }

  private async buildFileTree(
    rootPath: string,
    currentPath: string,
    maxDepth: number,
    currentDepth = 0
  ): Promise<FileNode[]> {
    if (currentDepth >= maxDepth) {
      return [];
    }

    const items = await fs.promises.readdir(currentPath, { withFileTypes: true });
    const nodes: FileNode[] = [];

    for (const item of items) {
      // Skip hidden files and common ignore patterns
      if (item.name.startsWith('.') || 
          item.name === 'node_modules' || 
          item.name === 'dist' || 
          item.name === 'build' ||
          item.name === 'out') {
        continue;
      }

      const itemPath = path.join(currentPath, item.name);
      const relativePath = path.relative(rootPath, itemPath);
      
      if (item.isDirectory()) {
        const children = await this.buildFileTree(rootPath, itemPath, maxDepth, currentDepth + 1);
        nodes.push({
          path: relativePath,
          name: item.name,
          type: 'directory',
          children: children.length > 0 ? children : undefined
        });
      } else {
        const stats = await fs.promises.stat(itemPath);
        nodes.push({
          path: relativePath,
          name: item.name,
          type: 'file',
          size: stats.size,
          modified: stats.mtime
        });
      }
    }

    return nodes.sort((a, b) => {
      // Directories first, then files
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
  }

  private async getRecentFiles(): Promise<string[]> {
    // VSCode doesn't provide direct access to recently opened files
    // We'll track this ourselves or use workspace state
    const recentFiles: string[] = [];
    
    // Get currently open editors as recent files
    vscode.window.tabGroups.all.forEach(group => {
      group.tabs.forEach(tab => {
        if (tab.input instanceof vscode.TabInputText) {
          recentFiles.push(tab.input.uri.fsPath);
        }
      });
    });

    return recentFiles.slice(0, 10); // Limit to 10 recent files
  }

  private getOpenTabs(): string[] {
    const openTabs: string[] = [];
    
    vscode.window.tabGroups.all.forEach(group => {
      group.tabs.forEach(tab => {
        if (tab.input instanceof vscode.TabInputText) {
          openTabs.push(tab.input.uri.fsPath);
        }
      });
    });

    return openTabs;
  }

  private getActiveFile(): string | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    return activeEditor ? activeEditor.document.uri.fsPath : undefined;
  }

  private setupWatchers(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
      return;
    }

    // Watch for file changes
    const fileWatcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(workspaceFolders[0], '**/*'),
      false, // Don't ignore creates
      false, // Don't ignore changes
      false  // Don't ignore deletes
    );

    fileWatcher.onDidCreate(() => this.refreshWorkspaceContext());
    fileWatcher.onDidChange(() => this.refreshWorkspaceContext());
    fileWatcher.onDidDelete(() => this.refreshWorkspaceContext());

    this.watchers.push(fileWatcher);

    // Watch for active editor changes
    const editorWatcher = vscode.window.onDidChangeActiveTextEditor(() => {
      if (this.context) {
        this.context.activeFile = this.getActiveFile();
        this.context.openTabs = this.getOpenTabs();
      }
    });

    this.watchers.push(editorWatcher as any);
  }

  public dispose(): void {
    this.watchers.forEach(watcher => watcher.dispose());
    this.watchers = [];
  }
}