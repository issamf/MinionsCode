# VSCode AI Agents - Development Context

## Project Overview
Building a revolutionary VSCode extension that provides a dynamic, multi-agent AI workspace directly integrated into the IDE. This allows developers to create, manage, and interact with specialized AI agents through a grid-based widget system.

## Current Status
- ✅ **Requirements Analysis**: Complete specification created in SPEC.md
- ✅ **Technical Architecture**: Multi-process TypeScript system with React UI
- ✅ **Implementation Plan**: 4-phase development approach (16 weeks)
- 🚧 **Project Setup**: Currently initializing development environment

## Key Technical Decisions Made

### Architecture
- **Extension Core**: TypeScript + VSCode Extension API
- **UI Framework**: React + CSS Grid in VSCode Webview
- **Agent Runtime**: Node.js worker processes with MessagePort IPC
- **AI Integration**: Multi-provider support (OpenAI, Anthropic, Ollama, etc.)
- **Storage**: SQLite + VSCode settings + encrypted secret storage
- **State Management**: Zustand + Immer for UI state

### Project Structure
```
vscode-ai-agents/
├── src/                    # Extension source code
│   ├── extension/          # Main extension process
│   ├── webview/           # React UI components
│   ├── agents/            # Agent worker processes
│   ├── providers/         # AI provider adapters
│   └── shared/            # Shared types and utilities
├── resources/             # Static resources, icons, templates
├── tests/                 # Unit and integration tests
├── docs/                  # Documentation
├── package.json          # Extension manifest
└── webpack.config.js     # Build configuration
```

## Implementation Phases

### Phase 1: Foundation (Current - Weeks 1-4)
1. **Project Setup** ⏳
   - Extension scaffold with TypeScript
   - Build system and development workflow
   - Basic VSCode integration

2. **Core Architecture** 
   - Agent process management
   - Basic UI framework
   - Settings and configuration system

3. **Single Agent MVP**
   - One agent with basic chat
   - Simple AI integration (OpenAI)
   - File context awareness

### Immediate Next Steps
1. Initialize git repository and create .gitignore
2. Create VSCode extension scaffold with package.json
3. Set up TypeScript build system with webpack
4. Create basic extension activation and webview panel
5. Implement single agent with OpenAI integration

## Core Data Models Defined

### Agent Configuration
```typescript
interface AgentConfig {
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
```

### API Interfaces
- **AgentManager**: Create, destroy, list, update agents
- **TaskManager**: Submit, track, cancel tasks with priority queue
- **ContextManager**: Project context sharing and file watching
- **MessageBus**: Agent-to-agent and UI-to-agent communication

## Key Features to Implement

### Core Features (Phase 1)
- Dynamic agent creation and management
- Grid-based resizable widget UI
- Multi-provider AI integration with hot-swapping
- Shared project context and file awareness
- Task execution system (file ops, git, commands)

### Advanced Features (Later Phases)
- Inter-agent communication
- Team collaboration and sharing
- Enterprise security and audit logging
- Performance optimization and caching
- Voice interface and mobile companion

## Security & Privacy Considerations
- API keys stored using VSCode SecretStorage with AES-256 encryption
- Agent processes run in isolated worker threads
- File system access requires explicit user permission
- Configurable data retention and GDPR compliance
- Local model preference for privacy

## Development Environment Requirements
- Node.js 18+
- VSCode 1.80.0+ 
- TypeScript 5.0+
- React 18+
- Webpack + esbuild for bundling

## Monetization Strategy
- **Free Tier**: 1 agent, basic features
- **Pro Tier** ($9.99/month): 5 agents, advanced features
- **Team Tier** ($19.99/month/user): Unlimited agents, team features
- **Enterprise**: Custom pricing, on-premises, SLA

## Context Preservation Notes
- All specifications are in SPEC.md (comprehensive 750+ lines)
- API key placeholders: ANTHROPIC_API_KEY, OPENAI_API_KEY (use env vars)
- Target VSCode Marketplace for distribution
- Focus on developer productivity and AI workflow enhancement
- Competitive advantage: multi-agent architecture vs single assistant

## Development Commands to Remember
```bash
# Development mode
npm run dev

# Build extension
npm run build

# Run tests
npm test

# Package for distribution
npm run package

# VSCode development
code --extensionDevelopmentPath=.
```

## Critical Implementation Notes
- Use VSCode's webview API for custom UI components
- Implement proper error boundaries and fallback mechanisms
- Ensure responsive design for different panel sizes
- Handle agent crashes gracefully with state recovery
- Optimize for performance with lazy loading and caching

---

This file maintains the complete context for continuing development of the VSCode AI Agents extension. Reference SPEC.md for detailed technical specifications.