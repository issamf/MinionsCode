# CompanAI - VSCode AI Agents Extension

A VSCode extension that provides multiple AI agents with specialized capabilities, each running in resizable UI widgets beside your editor.

## Features

- **Multi-Agent System**: Create and manage multiple AI agents with different roles
- **AI Provider Support**: Anthropic Claude, OpenAI GPT, and local Ollama models
- **Context Awareness**: Agents understand your project structure and can access shared files
- **Task Execution**: Agents can create files, run git commands, and execute shell commands
- **Drag & Drop**: Share files and code snippets with agents via drag & drop
- **Streaming Responses**: Real-time AI responses with typing indicators
- **Agent Memory**: Persistent conversation history and learning

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure AI Providers** (Optional)
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

3. **Build Extension**
   ```bash
   npm run build
   ```

4. **Test in Development**
   - Open project in VSCode
   - Press F5 to launch Extension Development Host
   - Use Ctrl+Shift+P → "AI Agents: Create Agent" to start

## AI Provider Setup

### Local Ollama (Recommended)
```bash
# Install Ollama from https://ollama.ai/
# Pull a model
ollama pull llama3.1
```

### Anthropic Claude
1. Get API key from https://console.anthropic.com/
2. Add to .env: `ANTHROPIC_API_KEY=your_key`

### OpenAI
1. Get API key from https://platform.openai.com/
2. Add to .env: `OPENAI_API_KEY=your_key`

## Commands

- `Ctrl+Shift+P` → "AI Agents: Create Agent" - Create new agent
- `Ctrl+Shift+P` → "AI Agents: Show Panel" - Open agents panel
- Right-click file → "Send to AI Agent" - Share file with agent
- Select code → Right-click → "Send Selection to Agent"

## Development

```bash
# Build
npm run build

# Watch mode
npm run watch

# Test
npm test

# Package
vsce package
```

## Architecture

- **Extension Host**: Agent management and VSCode integration
- **Webview**: React UI with agent widgets
- **AI Providers**: Pluggable AI service integrations
- **Agent Service**: Task execution and memory management