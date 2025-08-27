// Use ts-node to run TypeScript directly
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    esModuleInterop: true,
    skipLibCheck: true
  }
});

const { AgentService } = require('./src/agents/AgentService');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create a simple test to debug the issue
async function debugTest() {
  console.log('🔍 Starting debug test...');
  
  // Create temp dir
  const testDir = path.join(os.tmpdir(), `debug-test-${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });
  console.log('✅ Created test directory:', testDir);
  
  // Mock VSCode workspace
  const mockVscode = {
    workspace: {
      workspaceFolders: [{
        uri: { fsPath: testDir }
      }]
    },
    window: {
      showErrorMessage: (msg) => console.log('❌ Error:', msg),
      showInformationMessage: (msg) => console.log('✅ Info:', msg),
      showWarningMessage: (msg) => console.log('⚠️ Warning:', msg)
    }
  };
  
  // Mock vscode module
  require.cache[require.resolve('vscode')] = {
    exports: mockVscode
  };
  
  const agentService = new AgentService();
  
  const mockAgent = {
    id: 'test-agent',
    name: 'Test Agent'
  };

  const response = `[CREATE_FILE: test.txt]
Hello World Test
[/CREATE_FILE]`;

  console.log('🔍 Response to parse:', response);
  
  try {
    await agentService.executeTasksFromResponse(mockAgent, response);
    console.log('✅ Task execution completed');
  } catch (error) {
    console.log('❌ Task execution error:', error);
  }
  
  // Check if file was created
  const filePath = path.join(testDir, 'test.txt');
  const exists = fs.existsSync(filePath);
  console.log('🔍 File check:', { filePath, exists });
  
  if (exists) {
    const content = fs.readFileSync(filePath, 'utf8');
    console.log('📄 File content:', content);
  }
  
  // List directory contents
  console.log('📁 Directory contents:', fs.readdirSync(testDir));
  
  // Clean up
  fs.rmSync(testDir, { recursive: true, force: true });
  console.log('🧹 Cleaned up test directory');
}

debugTest().catch(console.error);