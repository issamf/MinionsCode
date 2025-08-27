import * as path from 'path';
import * as fs from 'fs';
import { ModelDiscoveryService } from './ModelDiscoveryService';
import { EvaluationScenarioService } from './EvaluationScenarioService';
import { ModelEvaluationEngine } from './ModelEvaluationEngine';
import { EvaluationReportService, ReportConfiguration } from './EvaluationReportService';

export interface EvaluationConfig {
  outputDirectory?: string;
  includeOnlineModels?: boolean;
  maxConcurrentEvaluations?: number;
  timeoutPerScenario?: number;
  generateDetailedLogs?: boolean;
  compareWithBaseline?: string;
  selectedModels?: string[]; // If specified, only evaluate these models
  selectedScenarios?: string[]; // If specified, only run these scenarios
}

export interface EvaluationRunResults {
  success: boolean;
  message: string;
  reportFiles: {
    json?: string;
    markdown?: string;
    judgePrompt?: string;
  };
  evaluationSummary: {
    modelsEvaluated: number;
    scenariosRun: number;
    totalDuration: number;
    topModel: string;
    avgSuccessRate: number;
  };
}

export class ModelEvaluationRunner {
  private discoveryService: ModelDiscoveryService;
  private scenarioService: EvaluationScenarioService;
  private evaluationEngine: ModelEvaluationEngine;
  private reportService: EvaluationReportService;
  private config: EvaluationConfig;

  constructor(config: EvaluationConfig = {}) {
    this.config = {
      outputDirectory: path.join(process.cwd(), 'model-evaluation-results'),
      includeOnlineModels: false, // Default to local only for privacy
      maxConcurrentEvaluations: 2,
      timeoutPerScenario: 60000, // 60 seconds per scenario
      generateDetailedLogs: true,
      ...config
    };

    this.discoveryService = new ModelDiscoveryService();
    this.scenarioService = new EvaluationScenarioService();
    this.evaluationEngine = new ModelEvaluationEngine();

    // Setup report service
    const reportConfig: ReportConfiguration = {
      outputDirectory: this.config.outputDirectory!,
      includeCharts: false, // Text-based reports for now
      includeDetailedLogs: this.config.generateDetailedLogs!,
      compareWithBaseline: this.config.compareWithBaseline
    };
    this.reportService = new EvaluationReportService(reportConfig);
  }

  /**
   * Run the complete model evaluation process
   */
  async runEvaluation(): Promise<EvaluationRunResults> {
    const startTime = Date.now();
    
    try {
      console.log('🚀 Starting AI Model Evaluation...');
      
      // Step 1: Discover available models
      console.log('📡 Discovering available models...');
      const availableModels = await this.discoveryService.getAllAvailableModels();
      
      // Filter models based on config
      let modelsToEvaluate = availableModels.filter(model => {
        if (!this.config.includeOnlineModels && model.type === 'online') {
          return false;
        }
        if (this.config.selectedModels && !this.config.selectedModels.includes(model.id)) {
          return false;
        }
        return true;
      });

      if (modelsToEvaluate.length === 0) {
        return {
          success: false,
          message: 'No models available for evaluation. Please ensure ollama is installed and has models available.',
          reportFiles: {},
          evaluationSummary: {
            modelsEvaluated: 0,
            scenariosRun: 0,
            totalDuration: Date.now() - startTime,
            topModel: '',
            avgSuccessRate: 0
          }
        };
      }

      console.log(`✅ Found ${modelsToEvaluate.length} models to evaluate:`);
      modelsToEvaluate.forEach(model => {
        console.log(`   - ${model.name} (${model.provider}, ${model.type})`);
      });

      // Step 2: Get evaluation scenarios
      console.log('📋 Loading evaluation scenarios...');
      let scenarios = this.scenarioService.getAllScenarios();
      
      if (this.config.selectedScenarios) {
        scenarios = scenarios.filter(s => this.config.selectedScenarios!.includes(s.id));
      }

      console.log(`✅ Loaded ${scenarios.length} evaluation scenarios`);

      // Step 3: Run evaluations
      console.log('🧪 Starting model evaluations...');
      const evaluationResults = [];
      
      for (let i = 0; i < modelsToEvaluate.length; i++) {
        const model = modelsToEvaluate[i];
        console.log(`\n📊 Evaluating ${model.name} (${i + 1}/${modelsToEvaluate.length})...`);
        
        try {
          const result = await this.evaluationEngine.evaluateModel(model, scenarios);
          evaluationResults.push(result);
          
          const successRate = (result.overallMetrics.taskSuccessRate * 100).toFixed(1);
          console.log(`   ✅ Completed - ${successRate}% success rate`);
        } catch (error) {
          console.error(`   ❌ Failed to evaluate ${model.name}:`, error instanceof Error ? error.message : String(error));
          // Continue with other models
        }
      }

      if (evaluationResults.length === 0) {
        return {
          success: false,
          message: 'All model evaluations failed. Check that models are accessible and scenarios are valid.',
          reportFiles: {},
          evaluationSummary: {
            modelsEvaluated: 0,
            scenariosRun: 0,
            totalDuration: Date.now() - startTime,
            topModel: '',
            avgSuccessRate: 0
          }
        };
      }

      // Step 4: Generate comprehensive report
      console.log('\n📈 Generating evaluation reports...');
      const comprehensiveReport = await this.reportService.generateReport(evaluationResults, availableModels);

      // Step 5: Save reports in multiple formats
      const reportFiles: { json?: string; markdown?: string; judgePrompt?: string } = {};

      try {
        reportFiles.json = await this.reportService.saveJsonReport(comprehensiveReport);
        console.log(`   ✅ JSON report saved: ${reportFiles.json}`);
      } catch (error) {
        console.error('   ❌ Failed to save JSON report:', error);
      }

      try {
        reportFiles.markdown = await this.reportService.saveMarkdownReport(comprehensiveReport);
        console.log(`   ✅ Markdown report saved: ${reportFiles.markdown}`);
      } catch (error) {
        console.error('   ❌ Failed to save Markdown report:', error);
      }

      // Step 6: Create judge prompt file with embedded data
      try {
        reportFiles.judgePrompt = await this.createJudgePromptFile(comprehensiveReport);
        console.log(`   ✅ Judge prompt saved: ${reportFiles.judgePrompt}`);
      } catch (error) {
        console.error('   ❌ Failed to create judge prompt:', error);
      }

      // Calculate summary statistics
      const avgSuccessRate = evaluationResults.reduce((sum, r) => sum + r.overallMetrics.taskSuccessRate, 0) / evaluationResults.length;
      const topModel = comprehensiveReport.modelComparisons.overall[0]?.modelName || 'None';
      const totalDuration = Date.now() - startTime;

      console.log('\n🎉 Evaluation completed successfully!');
      console.log(`   📊 Models evaluated: ${evaluationResults.length}`);
      console.log(`   📋 Scenarios run: ${scenarios.length * evaluationResults.length}`);
      console.log(`   ⏱️  Total duration: ${(totalDuration / 1000).toFixed(1)} seconds`);
      console.log(`   🏆 Top performer: ${topModel}`);
      console.log(`   📈 Average success rate: ${(avgSuccessRate * 100).toFixed(1)}%`);

      return {
        success: true,
        message: `Successfully evaluated ${evaluationResults.length} models across ${scenarios.length} scenarios`,
        reportFiles,
        evaluationSummary: {
          modelsEvaluated: evaluationResults.length,
          scenariosRun: scenarios.length * evaluationResults.length,
          totalDuration,
          topModel,
          avgSuccessRate
        }
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('💥 Evaluation failed:', errorMessage);
      
      return {
        success: false,
        message: `Evaluation failed: ${errorMessage}`,
        reportFiles: {},
        evaluationSummary: {
          modelsEvaluated: 0,
          scenariosRun: 0,
          totalDuration: Date.now() - startTime,
          topModel: '',
          avgSuccessRate: 0
        }
      };
    }
  }


  /**
   * Create judge prompt file with evaluation data embedded
   */
  private async createJudgePromptFile(report: any): Promise<string> {
    const templatePath = path.join(__dirname, 'judge-llm-prompt-template.txt');
    const promptTemplate = fs.readFileSync(templatePath, 'utf8');
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `judge-prompt-${timestamp}.txt`;
    const filepath = path.join(this.config.outputDirectory!, filename);
    
    // Create the complete prompt with embedded data
    const completePrompt = promptTemplate + '\n\n---\n\n## EVALUATION DATA TO ANALYZE\n\n```json\n' + JSON.stringify(report, null, 2) + '\n```\n\nPlease analyze this data according to the framework provided above and provide your comprehensive analysis and recommendations.';
    
    fs.writeFileSync(filepath, completePrompt, 'utf8');
    return filepath;
  }

  /**
   * Run a quick evaluation with a subset of models and scenarios for testing
   */
  async runQuickEvaluation(maxModels: number = 3, maxScenarios: number = 2): Promise<EvaluationRunResults> {
    console.log('🏃 Running quick evaluation...');
    
    // Get available models and limit to the specified count
    const availableModels = await this.discoveryService.getAllAvailableModels();
    const localModels = availableModels.filter(m => m.type === 'local').slice(0, maxModels);
    
    // Get scenarios and limit to the specified count  
    const allScenarios = this.scenarioService.getAllScenarios();
    const quickScenarios = allScenarios.slice(0, maxScenarios);
    
    // Update config for quick run
    const quickConfig = {
      ...this.config,
      selectedModels: localModels.map(m => m.id),
      selectedScenarios: quickScenarios.map(s => s.id),
      outputDirectory: path.join(this.config.outputDirectory!, 'quick-evaluation')
    };

    const quickRunner = new ModelEvaluationRunner(quickConfig);
    return await quickRunner.runEvaluation();
  }

  /**
   * Get a preview of what would be evaluated without running the evaluation
   */
  async getEvaluationPreview(): Promise<{
    modelsToEvaluate: string[];
    scenariosToRun: string[];
    estimatedDuration: string;
  }> {
    const availableModels = await this.discoveryService.getAllAvailableModels();
    
    const modelsToEvaluate = availableModels
      .filter(model => {
        if (!this.config.includeOnlineModels && model.type === 'online') {
          return false;
        }
        if (this.config.selectedModels && !this.config.selectedModels.includes(model.id)) {
          return false;
        }
        return true;
      })
      .map(m => `${m.name} (${m.provider})`);

    let scenarios = this.scenarioService.getAllScenarios();
    if (this.config.selectedScenarios) {
      scenarios = scenarios.filter(s => this.config.selectedScenarios!.includes(s.id));
    }

    const scenariosToRun = scenarios.map(s => `${s.name} (${s.id})`);
    
    // Estimate duration: scenarios × models × average time per scenario
    const avgTimePerScenario = 30; // seconds
    const totalScenarios = scenarios.length * modelsToEvaluate.length;
    const estimatedSeconds = totalScenarios * avgTimePerScenario;
    const estimatedMinutes = Math.ceil(estimatedSeconds / 60);
    
    return {
      modelsToEvaluate,
      scenariosToRun,
      estimatedDuration: `~${estimatedMinutes} minutes (${totalScenarios} total scenario runs)`
    };
  }

  /**
   * Validate configuration and dependencies
   */
  async validateSetup(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];

    // Check if ollama is installed and has models
    try {
      const localModels = await this.discoveryService.discoverLocalModels();
      if (localModels.length === 0) {
        issues.push('No ollama models found. Please install ollama and download some models first.');
      }
    } catch (error) {
      issues.push('Ollama not found or not accessible. Please ensure ollama is installed and in PATH.');
    }

    // Check output directory permissions
    try {
      if (!fs.existsSync(this.config.outputDirectory!)) {
        fs.mkdirSync(this.config.outputDirectory!, { recursive: true });
      }
      
      // Test write permissions
      const testFile = path.join(this.config.outputDirectory!, '.test');
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
    } catch (error) {
      issues.push(`Cannot write to output directory: ${this.config.outputDirectory}`);
    }

    // Validate scenario configurations
    try {
      const scenarios = this.scenarioService.getAllScenarios();
      if (scenarios.length === 0) {
        issues.push('No evaluation scenarios found.');
      }
    } catch (error) {
      issues.push('Failed to load evaluation scenarios.');
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }
}

// CLI interface if run directly
if (require.main === module) {
  const runner = new ModelEvaluationRunner();
  
  const args = process.argv.slice(2);
  const command = args[0] || 'run';
  
  switch (command) {
    case 'preview':
      runner.getEvaluationPreview().then(preview => {
        console.log('📋 Evaluation Preview:');
        console.log(`\n🤖 Models to evaluate (${preview.modelsToEvaluate.length}):`);
        preview.modelsToEvaluate.forEach(model => console.log(`   - ${model}`));
        console.log(`\n📊 Scenarios to run (${preview.scenariosToRun.length}):`);
        preview.scenariosToRun.forEach(scenario => console.log(`   - ${scenario}`));
        console.log(`\n⏱️  Estimated duration: ${preview.estimatedDuration}`);
      });
      break;
      
    case 'validate':
      runner.validateSetup().then(validation => {
        if (validation.valid) {
          console.log('✅ Setup validation passed - ready to run evaluation');
        } else {
          console.log('❌ Setup validation failed:');
          validation.issues.forEach(issue => console.log(`   - ${issue}`));
          process.exit(1);
        }
      });
      break;
      
    case 'quick':
      runner.runQuickEvaluation().then(results => {
        if (results.success) {
          console.log('\n✅ Quick evaluation completed successfully!');
          console.log(`Report files generated at: ${results.reportFiles.json}`);
        } else {
          console.error('❌ Quick evaluation failed:', results.message);
          process.exit(1);
        }
      }).catch(error => {
        console.error('💥 Quick evaluation crashed:', error);
        process.exit(1);
      });
      break;
      
    case 'run':
    default:
      runner.runEvaluation().then(results => {
        if (results.success) {
          console.log('\n🎉 Full evaluation completed successfully!');
          if (results.reportFiles.json) console.log(`📊 JSON Report: ${results.reportFiles.json}`);
          if (results.reportFiles.markdown) console.log(`📝 Markdown Report: ${results.reportFiles.markdown}`);
          if (results.reportFiles.judgePrompt) console.log(`🧠 Judge Prompt: ${results.reportFiles.judgePrompt}`);
        } else {
          console.error('❌ Evaluation failed:', results.message);
          process.exit(1);
        }
      }).catch(error => {
        console.error('💥 Evaluation crashed:', error);
        process.exit(1);
      });
      break;
  }
}