// Test script to validate clean evaluation system
require('ts-node').register({
  compilerOptions: {
    module: 'commonjs',
    target: 'es2020',
    esModuleInterop: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    baseUrl: './src',
    paths: {
      '@/*': ['*']
    }
  }
});

const { EnhancedModelEvaluationEngine } = require('./src/services/EnhancedModelEvaluationEngine');
const { AIProvider, AgentType } = require('./src/shared/types');
const path = require('path');
const os = require('os');

// Test the clean evaluation system
async function testCleanEvaluation() {
  console.log('🧪 Testing Clean Evaluation System...');
  
  // Create temp directory for evaluation
  const evalDir = path.join(os.tmpdir(), `clean-eval-test-${Date.now()}`);
  console.log('📁 Test directory:', evalDir);
  
  // Create evaluation engine
  const evaluationEngine = new EnhancedModelEvaluationEngine();
  
  // Test configuration
  const testConfig = {
    selectedModels: [
      {
        id: 'ollama:magicoder:7b',
        name: 'magicoder:7b',
        provider: 'ollama',
        type: 'local'
      }
    ],
    selectedScenarios: [
      {
        id: 'simple-test',
        name: 'Simple Code Task',
        description: 'Test basic code generation',
        userMessage: 'Create a simple Hello World function in JavaScript',
        expectedOutputs: ['function', 'hello', 'world'],
        agentType: AgentType.CODE_REVIEWER,
        timeoutMs: 30000
      }
    ],
    outputDir: evalDir,
    enableLivePreview: true,
    enableProgressiveOutput: true
  };
  
  console.log('🔧 Configuration:', JSON.stringify(testConfig, null, 2));
  
  try {
    console.log('▶️ Starting evaluation with clean prompts...');
    
    // Start evaluation
    await evaluationEngine.startEvaluation(testConfig);
    
    console.log('✅ Clean evaluation test completed successfully!');
    
    // Check if results were created
    const fs = require('fs');
    const resultFiles = fs.readdirSync(evalDir).filter(f => f.endsWith('.json'));
    console.log('📊 Result files created:', resultFiles);
    
    if (resultFiles.length > 0) {
      const resultFile = path.join(evalDir, resultFiles[0]);
      const results = JSON.parse(fs.readFileSync(resultFile, 'utf8'));
      console.log('📈 Evaluation results:', {
        modelId: results.modelId,
        overallMetrics: results.overallMetrics,
        scenarioCount: results.scenarioResults?.length,
        totalDuration: results.totalDuration
      });
      
      // Check if the evaluation succeeded (not timed out)
      const firstScenario = results.scenarioResults?.[0];
      if (firstScenario) {
        console.log('🎯 First scenario result:', {
          scenarioId: firstScenario.scenarioId,
          success: firstScenario.taskExecutionSuccess,
          timeout: firstScenario.timeout,
          errors: firstScenario.errors
        });
        
        if (!firstScenario.timeout && firstScenario.taskExecutionSuccess) {
          console.log('🎉 SUCCESS: Model responded without timeout using clean prompts!');
        } else {
          console.log('⚠️ WARNING: Model still timing out or failing');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Evaluation test failed:', error);
  }
}

// Run the test
console.log('🚀 Starting clean evaluation test...');
testCleanEvaluation().catch(console.error);