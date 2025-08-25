// Core Types for VSCode AI Agents Extension

export interface AgentConfig {
  id: string;
  name: string;
  avatar: string;
  type: AgentType;
  model: ModelConfig;
  capabilities: Capability[];
  permissions: Permission[];
  systemPrompt: string;
  contextScope: ContextScope;
  memory: MemoryConfig;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export enum AgentType {
  CODE_REVIEWER = 'code_reviewer',
  DOCUMENTATION = 'documentation',
  DEVOPS = 'devops',
  TESTING = 'testing',
  CUSTOM = 'custom'
}

export interface ModelConfig {
  provider: AIProvider;
  modelName: string;
  temperature: number;
  maxTokens: number;
  apiKey?: string;
}

export enum AIProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  OLLAMA = 'ollama',
  LM_STUDIO = 'lm_studio'
}

export interface Capability {
  type: CapabilityType;
  enabled: boolean;
  config?: any;
}

export enum CapabilityType {
  FILE_OPERATIONS = 'file_operations',
  GIT_OPERATIONS = 'git_operations',
  COMMAND_EXECUTION = 'command_execution',
  DOCKER_OPERATIONS = 'docker_operations',
  WEB_SEARCH = 'web_search',
  CODE_ANALYSIS = 'code_analysis'
}

export interface Permission {
  type: PermissionType;
  granted: boolean;
  scope?: string[];
}

export enum PermissionType {
  READ_FILES = 'read_files',
  WRITE_FILES = 'write_files',
  EXECUTE_COMMANDS = 'execute_commands',
  NETWORK_ACCESS = 'network_access',
  GIT_OPERATIONS = 'git_operations'
}

export interface ContextScope {
  includeFiles: boolean;
  includeGit: boolean;
  includeWorkspace: boolean;
  filePatterns: string[];
  excludePatterns: string[];
}

export interface MemoryConfig {
  maxConversations: number;
  retentionDays: number;
  enableLearning: boolean;
}

// Task System Types
export interface Task {
  id: string;
  type: TaskType;
  agentId: string;
  status: TaskStatus;
  payload: TaskPayload;
  dependencies: string[];
  priority: TaskPriority;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  result?: TaskResult;
  error?: TaskError;
}

export enum TaskType {
  FILE_CREATE = 'file_create',
  FILE_UPDATE = 'file_update',
  FILE_DELETE = 'file_delete',
  GIT_COMMIT = 'git_commit',
  COMMAND_RUN = 'command_run',
  CODE_REVIEW = 'code_review',
  CUSTOM = 'custom'
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum TaskPriority {
  LOW = 1,
  NORMAL = 2,
  HIGH = 3,
  URGENT = 4
}

export interface TaskPayload {
  [key: string]: any;
}

export interface TaskResult {
  success: boolean;
  data?: any;
  files?: string[];
  output?: string;
}

export interface TaskError {
  code: string;
  message: string;
  details?: any;
}

// UI Types
export interface WidgetLayout {
  id: string;
  agentId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  minimized: boolean;
  visible: boolean;
}

export interface AgentMessage {
  id: string;
  agentId: string;
  type: MessageType;
  content: string;
  timestamp: Date;
  metadata?: any;
}

export enum MessageType {
  CHAT = 'chat',
  SYSTEM = 'system',
  ERROR = 'error',
  TASK_UPDATE = 'task_update'
}

// Context Types
export interface ProjectContext {
  workspaceRoot: string;
  gitInfo: GitInfo;
  packageInfo: PackageInfo;
  fileTree: FileNode[];
  recentFiles: string[];
  openTabs: string[];
  activeFile?: string;
}

export interface GitInfo {
  branch: string;
  remotes: string[];
  status: GitStatus;
  lastCommit: CommitInfo;
}

export interface GitStatus {
  modified: string[];
  added: string[];
  deleted: string[];
  untracked: string[];
}

export interface CommitInfo {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

export interface PackageInfo {
  name: string;
  version: string;
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
}

export interface FileNode {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
  children?: FileNode[];
}

// Agent Templates
export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  avatar: string;
  systemPrompt: string;
  capabilities: Capability[];
  defaultModel: ModelConfig;
  examples: string[];
  tags: string[];
}

// Extension Configuration
export interface ExtensionSettings {
  maxConcurrentAgents: number;
  defaultProvider: AIProvider;
  panelPosition: 'top' | 'right' | 'bottom';
  gridColumns: number;
  enableAnimations: boolean;
  theme: 'auto' | 'light' | 'dark';
  memoryLimitMB: number;
  responseTimeoutMs: number;
  enableCaching: boolean;
  logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug';
  dataRetentionDays: number;
  requireConfirmation: boolean;
  allowTelemetry: boolean;
}

// Events
export interface AgentEvent {
  type: AgentEventType;
  agentId: string;
  data?: any;
  timestamp: Date;
}

export enum AgentEventType {
  CREATED = 'created',
  DESTROYED = 'destroyed',
  UPDATED = 'updated',
  MESSAGE_SENT = 'message_sent',
  MESSAGE_RECEIVED = 'message_received',
  TASK_STARTED = 'task_started',
  TASK_COMPLETED = 'task_completed',
  ERROR_OCCURRED = 'error_occurred'
}