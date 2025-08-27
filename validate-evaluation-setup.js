#!/usr/bin/env node

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🔍 Validating AI Model Evaluation Setup...\n');

async function checkOllama() {
  return new Promise((resolve) => {
    exec('ollama list', (error, stdout, stderr) => {
      if (error) {
        console.log('❌ Ollama not found or not accessible');
        console.log('   Please install ollama and ensure it\'s in your PATH');
        console.log('   Visit: https://ollama.ai/download');
        resolve(false);
        return;
      }
      
      const lines = stdout.trim().split('\n');
      const modelCount = lines.length - 1; // Subtract header line
      
      if (modelCount <= 0) {
        console.log('❌ No ollama models found');
        console.log('   Download models with: ollama pull <model-name>');
        console.log('   Recommended: ollama pull deepseek-coder:6.7b');
        resolve(false);
        return;
      }
      
      console.log(`✅ Ollama found with ${modelCount} models:`);
      lines.slice(1).forEach(line => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          console.log(`   - ${parts[0]} (${parts[2]} ${parts[3]})`);
        }
      });
      resolve(true);
    });
  });
}

function checkOutputDirectory() {
  const outputDir = path.join(process.cwd(), 'model-evaluation-results');
  
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Test write permissions
    const testFile = path.join(outputDir, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    
    console.log(`✅ Output directory ready: ${outputDir}`);
    return true;
  } catch (error) {
    console.log(`❌ Cannot write to output directory: ${outputDir}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

function checkNodeDependencies() {
  const requiredDeps = ['typescript', 'ts-node'];
  const packageJsonPath = path.join(process.cwd(), 'package.json');
  
  if (!fs.existsSync(packageJsonPath)) {
    console.log('❌ package.json not found');
    return false;
  }
  
  try {
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    const allDeps = {
      ...(packageJson.dependencies || {}),
      ...(packageJson.devDependencies || {})
    };
    
    let missing = [];
    for (const dep of requiredDeps) {
      if (!allDeps[dep]) {
        missing.push(dep);
      }
    }
    
    if (missing.length > 0) {
      console.log(`❌ Missing dependencies: ${missing.join(', ')}`);
      return false;
    }
    
    console.log('✅ Required Node.js dependencies found');
    return true;
  } catch (error) {
    console.log('❌ Failed to read package.json');
    return false;
  }
}

function checkEvaluationFiles() {
  const requiredFiles = [
    'src/services/ModelDiscoveryService.ts',
    'src/services/EvaluationScenarioService.ts', 
    'src/services/ModelEvaluationEngine.ts',
    'src/services/EvaluationReportService.ts',
    'src/services/judge-llm-prompt-template.txt'
  ];
  
  let allFound = true;
  for (const file of requiredFiles) {
    if (!fs.existsSync(file)) {
      console.log(`❌ Missing evaluation file: ${file}`);
      allFound = false;
    }
  }
  
  if (allFound) {
    console.log('✅ All evaluation service files found');
  }
  
  return allFound;
}

async function main() {
  const checks = [
    await checkOllama(),
    checkOutputDirectory(),
    checkNodeDependencies(),
    checkEvaluationFiles()
  ];
  
  const passed = checks.filter(Boolean).length;
  const total = checks.length;
  
  console.log(`\n📊 Validation Results: ${passed}/${total} checks passed`);
  
  if (passed === total) {
    console.log('🎉 Setup validation successful! Ready to run evaluations.');
    console.log('\nNext steps:');
    console.log('  npm run eval:preview  - See what would be evaluated');
    console.log('  npm run eval:quick    - Run quick evaluation (3 models, 2 scenarios)');  
    console.log('  npm run eval:full     - Run full evaluation');
  } else {
    console.log('⚠️  Setup validation failed. Please fix the issues above.');
    process.exit(1);
  }
}

main().catch(console.error);