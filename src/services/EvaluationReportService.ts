import * as fs from 'fs';
import * as path from 'path';
import { 
  ScenarioResult, 
  EvaluationResult,
  AvailableModel 
} from './ModelEvaluationEngine';
import { AgentType } from '@/shared/types';

export interface ReportConfiguration {
  outputDirectory: string;
  includeCharts: boolean;
  includeDetailedLogs: boolean;
  compareWithBaseline?: string; // Model ID to use as baseline
}

export interface ModelRanking {
  modelId: string;
  modelName: string;
  overallScore: number;
  rank: number;
  strengths: string[];
  weaknesses: string[];
  recommendedFor: AgentType[];
  bestScenarios: string[];
  worstScenarios: string[];
}

export interface SimpleMetrics {
  taskSuccessRate: number;
  technicalAccuracy: number;
  contextUnderstanding: number;
  responseCompleteness: number;
  domainKnowledgeScore: number;
  codeQualityScore: number;
  userSatisfactionScore: number;
  responseLatency: number;
}

export interface AgentTypeRecommendation {
  agentType: AgentType;
  recommendedModels: ModelRanking[];
  keyMetrics: string[];
  reasoning: string;
}

export interface ComprehensiveReport {
  metadata: {
    generatedAt: Date;
    totalModelsEvaluated: number;
    totalScenariosRun: number;
    evaluationDuration: number;
    version: string;
  };
  executiveSummary: {
    topPerformingModels: ModelRanking[];
    keyFindings: string[];
    recommendations: string[];
    surprises: string[];
  };
  modelComparisons: {
    overall: ModelRanking[];
    byAgentType: { [key in AgentType]?: ModelRanking[] };
    speedVsAccuracy: Array<{ modelId: string; speed: number; accuracy: number }>;
    costEfficiency: Array<{ modelId: string; performance: number; cost: number }>;
  };
  detailedAnalysis: {
    modelBreakdowns: Array<{
      modelId: string;
      metrics: SimpleMetrics;
      scenarioPerformance: ScenarioResult[];
      analysis: string;
    }>;
    scenarioAnalysis: Array<{
      scenarioId: string;
      scenarioName: string;
      avgSuccessRate: number;
      bestModel: string;
      worstModel: string;
      insights: string[];
    }>;
  };
  agentTypeRecommendations: AgentTypeRecommendation[];
  technicalInsights: {
    modelSizeVsPerformance: string;
    specializationEffect: string;
    latencyAnalysis: string;
    qualityFactors: string[];
  };
}

export class EvaluationReportService {
  private config: ReportConfiguration;

  constructor(config: ReportConfiguration) {
    this.config = config;
    if (!fs.existsSync(config.outputDirectory)) {
      fs.mkdirSync(config.outputDirectory, { recursive: true });
    }
  }

  /**
   * Generate comprehensive evaluation report from results
   */
  async generateReport(
    evaluationResults: EvaluationResult[],
    availableModels: AvailableModel[]
  ): Promise<ComprehensiveReport> {
    const modelMap = new Map(availableModels.map(m => [m.id, m]));
    
    // Calculate overall rankings
    const modelRankings = this.calculateModelRankings(evaluationResults, modelMap);
    
    // Generate agent-specific recommendations  
    const agentRecommendations = this.generateAgentTypeRecommendations(evaluationResults, modelMap);
    
    // Analyze scenarios
    const scenarioAnalysis = this.analyzeScenarioPerformance(evaluationResults);
    
    // Generate insights
    const technicalInsights = this.generateTechnicalInsights(evaluationResults, modelMap);
    
    const report: ComprehensiveReport = {
      metadata: {
        generatedAt: new Date(),
        totalModelsEvaluated: evaluationResults.length,
        totalScenariosRun: evaluationResults.reduce((sum, r) => sum + r.scenarioResults.length, 0),
        evaluationDuration: evaluationResults.reduce((sum, r) => sum + r.totalDuration, 0),
        version: '1.0.0'
      },
      executiveSummary: {
        topPerformingModels: modelRankings.slice(0, 5),
        keyFindings: this.extractKeyFindings(evaluationResults, modelRankings),
        recommendations: this.generateHighLevelRecommendations(modelRankings, agentRecommendations, evaluationResults),
        surprises: this.identifySuprisesandOutliers(evaluationResults, modelRankings)
      },
      modelComparisons: {
        overall: modelRankings,
        byAgentType: this.groupRankingsByAgentType(evaluationResults, modelMap),
        speedVsAccuracy: this.analyzeSpeedVsAccuracy(evaluationResults, modelMap),
        costEfficiency: this.analyzeCostEfficiency(evaluationResults, modelMap)
      },
      detailedAnalysis: {
        modelBreakdowns: evaluationResults.map(result => ({
          modelId: result.modelId,
          metrics: result.overallMetrics,
          scenarioPerformance: result.scenarioResults,
          analysis: this.generateModelAnalysis(result, modelMap.get(result.modelId))
        })),
        scenarioAnalysis
      },
      agentTypeRecommendations: agentRecommendations,
      technicalInsights
    };

    return report;
  }

  /**
   * Save report in JSON format
   */
  async saveJsonReport(report: ComprehensiveReport): Promise<string> {
    const filename = `model_evaluation_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    const filepath = path.join(this.config.outputDirectory, filename);
    
    fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8');
    return filepath;
  }

  /**
   * Save report in Markdown format with rich formatting
   */
  async saveMarkdownReport(report: ComprehensiveReport): Promise<string> {
    const markdown = this.generateMarkdownReport(report);
    const filename = `model_evaluation_${new Date().toISOString().replace(/[:.]/g, '-')}.md`;
    const filepath = path.join(this.config.outputDirectory, filename);
    
    fs.writeFileSync(filepath, markdown, 'utf8');
    return filepath;
  }

  private calculateModelRankings(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ): ModelRanking[] {
    const rankings: ModelRanking[] = [];

    for (const result of evaluationResults) {
      const model = modelMap.get(result.modelId);
      const metrics = result.overallMetrics;
      
      // Calculate composite score with weighted factors
      const overallScore = this.calculateCompositeScore(metrics);
      
      // Analyze strengths and weaknesses
      const { strengths, weaknesses } = this.analyzeModelCapabilities(metrics, result.scenarioResults);
      
      // Determine recommended agent types
      const recommendedFor = this.determineRecommendedAgentTypes(result.scenarioResults);
      
      // Find best/worst scenarios
      const sortedScenarios = result.scenarioResults.sort((a, b) => b.successRate - a.successRate);
      const bestScenarios = sortedScenarios.slice(0, 3).map(s => s.scenarioId);
      const worstScenarios = sortedScenarios.slice(-3).map(s => s.scenarioId);

      rankings.push({
        modelId: result.modelId,
        modelName: model?.name || result.modelId,
        overallScore,
        rank: 0, // Will be set after sorting
        strengths,
        weaknesses,
        recommendedFor,
        bestScenarios,
        worstScenarios
      });
    }

    // Sort by score and assign ranks
    rankings.sort((a, b) => b.overallScore - a.overallScore);
    rankings.forEach((ranking, index) => ranking.rank = index + 1);

    return rankings;
  }

  private calculateCompositeScore(metrics: SimpleMetrics): number {
    // Weighted scoring algorithm
    const weights = {
      taskSuccessRate: 0.25,
      technicalAccuracy: 0.20,
      contextUnderstanding: 0.15,
      responseCompleteness: 0.15,
      domainKnowledgeScore: 0.10,
      codeQualityScore: 0.10,
      userSatisfactionScore: 0.05
    };

    return Object.entries(weights).reduce((score, [metric, weight]) => {
      const value = metrics[metric as keyof SimpleMetrics] as number;
      return score + (value * weight);
    }, 0);
  }

  private analyzeModelCapabilities(
    metrics: SimpleMetrics,
    scenarios: ScenarioResult[]
  ): { strengths: string[]; weaknesses: string[] } {
    const strengths: string[] = [];
    const weaknesses: string[] = [];

    // Analyze individual metrics
    if (metrics.taskSuccessRate > 0.9) strengths.push('Excellent task execution');
    else if (metrics.taskSuccessRate < 0.6) weaknesses.push('Poor task execution reliability');

    if (metrics.technicalAccuracy > 0.85) strengths.push('High technical accuracy');
    else if (metrics.technicalAccuracy < 0.6) weaknesses.push('Technical accuracy concerns');

    if (metrics.responseLatency < 2000) strengths.push('Fast response times');
    else if (metrics.responseLatency > 5000) weaknesses.push('Slow response times');

    if (metrics.codeQualityScore > 0.8) strengths.push('Excellent code generation');
    else if (metrics.codeQualityScore < 0.6) weaknesses.push('Code quality issues');

    if (metrics.contextUnderstanding > 0.8) strengths.push('Strong context understanding');
    else if (metrics.contextUnderstanding < 0.6) weaknesses.push('Context comprehension issues');

    // Analyze scenario performance patterns
    const avgSuccessByType = this.groupScenariosByType(scenarios);
    for (const [type, avgSuccess] of Object.entries(avgSuccessByType)) {
      if (avgSuccess > 0.9) {
        strengths.push(`Excellent ${type.toLowerCase()} capabilities`);
      } else if (avgSuccess < 0.5) {
        weaknesses.push(`Struggles with ${type.toLowerCase()} tasks`);
      }
    }

    return { strengths, weaknesses };
  }

  private groupScenariosByType(scenarios: ScenarioResult[]): { [type: string]: number } {
    const typeGroups: { [type: string]: number[] } = {};
    
    scenarios.forEach(scenario => {
      // Extract agent type from scenario ID
      const agentType = scenario.scenarioId.split('-')[0].toUpperCase();
      if (!typeGroups[agentType]) {
        typeGroups[agentType] = [];
      }
      typeGroups[agentType].push(scenario.successRate);
    });

    // Calculate averages
    const averages: { [type: string]: number } = {};
    for (const [type, scores] of Object.entries(typeGroups)) {
      averages[type] = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    }

    return averages;
  }

  private determineRecommendedAgentTypes(scenarios: ScenarioResult[]): AgentType[] {
    const typePerformance = this.groupScenariosByType(scenarios);
    const recommended: AgentType[] = [];

    for (const [type, avgScore] of Object.entries(typePerformance)) {
      if (avgScore > 0.75) {
        switch (type.toUpperCase()) {
          case 'CODE':
            recommended.push(AgentType.CODE_REVIEWER);
            break;
          case 'SOFTWARE':
            recommended.push(AgentType.SOFTWARE_ENGINEER);
            break;
          case 'DOCUMENTATION':
            recommended.push(AgentType.DOCUMENTATION);
            break;
          case 'TESTING':
            recommended.push(AgentType.TESTING);
            break;
          case 'DEVOPS':
            recommended.push(AgentType.DEVOPS);
            break;
          default:
            recommended.push(AgentType.CUSTOM);
        }
      }
    }

    return [...new Set(recommended)]; // Remove duplicates
  }

  private generateAgentTypeRecommendations(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ): AgentTypeRecommendation[] {
    const agentTypes = Object.values(AgentType);
    const recommendations: AgentTypeRecommendation[] = [];

    for (const agentType of agentTypes) {
      // Filter scenarios relevant to this agent type
      const relevantResults = evaluationResults.map(result => ({
        ...result,
        scenarioResults: result.scenarioResults.filter(s => 
          s.scenarioId.toLowerCase().includes(agentType.toLowerCase()) ||
          s.scenarioId.toLowerCase().includes(agentType.replace('_', '-').toLowerCase())
        )
      })).filter(result => result.scenarioResults.length > 0);

      if (relevantResults.length === 0) continue;

      // Calculate performance for this agent type
      const modelPerformances = relevantResults.map(result => {
        const avgSuccessRate = result.scenarioResults.reduce((sum, s) => sum + s.successRate, 0) / result.scenarioResults.length;
        return {
          modelId: result.modelId,
          modelName: modelMap.get(result.modelId)?.name || result.modelId,
          overallScore: avgSuccessRate,
          rank: 0,
          strengths: [],
          weaknesses: [],
          recommendedFor: [agentType],
          bestScenarios: [],
          worstScenarios: []
        } as ModelRanking;
      });

      modelPerformances.sort((a, b) => b.overallScore - a.overallScore);
      modelPerformances.forEach((perf, index) => perf.rank = index + 1);

      recommendations.push({
        agentType,
        recommendedModels: modelPerformances.slice(0, 5),
        keyMetrics: this.getKeyMetricsForAgentType(agentType),
        reasoning: this.generateRecommendationReasoning(agentType, modelPerformances)
      });
    }

    return recommendations;
  }

  private getKeyMetricsForAgentType(agentType: AgentType): string[] {
    switch (agentType) {
      case AgentType.CODE_REVIEWER:
        return ['Technical Accuracy', 'Code Quality Score', 'Security Awareness', 'Best Practice Adherence'];
      case AgentType.SOFTWARE_ENGINEER:
        return ['Task Success Rate', 'Code Quality', 'Problem Solving', 'Architecture Understanding'];
      case AgentType.DOCUMENTATION:
        return ['Writing Quality', 'Technical Accuracy', 'Completeness', 'Clarity'];
      case AgentType.TESTING:
        return ['Test Coverage', 'Edge Case Detection', 'Code Understanding', 'Quality Assurance'];
      case AgentType.DEVOPS:
        return ['System Understanding', 'Configuration Accuracy', 'Security Best Practices', 'Automation'];
      default:
        return ['Overall Performance', 'Versatility', 'Context Understanding', 'Task Execution'];
    }
  }

  private generateRecommendationReasoning(agentType: AgentType, performances: ModelRanking[]): string {
    const topModel = performances[0];
    const scoreRange = performances[0].overallScore - performances[performances.length - 1].overallScore;
    
    let reasoning = `For ${agentType} tasks, `;
    
    if (topModel.overallScore > 0.9) {
      reasoning += `${topModel.modelName} shows exceptional performance with ${(topModel.overallScore * 100).toFixed(1)}% success rate.`;
    } else if (topModel.overallScore > 0.75) {
      reasoning += `${topModel.modelName} demonstrates strong capabilities with ${(topModel.overallScore * 100).toFixed(1)}% success rate.`;
    } else {
      reasoning += `performance varies significantly across models, with ${topModel.modelName} leading at ${(topModel.overallScore * 100).toFixed(1)}%.`;
    }

    if (scoreRange > 0.3) {
      reasoning += ` There's significant variation between models (${(scoreRange * 100).toFixed(1)}% range), suggesting model choice is critical for this agent type.`;
    } else {
      reasoning += ` Models perform relatively similarly, providing flexibility in selection.`;
    }

    return reasoning;
  }

  private analyzeScenarioPerformance(evaluationResults: EvaluationResult[]) {
    type ScenarioWithModel = ScenarioResult & { modelId: string };
    const scenarioMap = new Map<string, ScenarioWithModel[]>();
    
    // Group results by scenario
    evaluationResults.forEach(result => {
      result.scenarioResults.forEach(scenario => {
        if (!scenarioMap.has(scenario.scenarioId)) {
          scenarioMap.set(scenario.scenarioId, []);
        }
        scenarioMap.get(scenario.scenarioId)!.push({
          ...scenario,
          modelId: result.modelId
        });
      });
    });

    return Array.from(scenarioMap.entries()).map(([scenarioId, results]) => {
      const avgSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;
      const sortedResults = results.sort((a, b) => b.successRate - a.successRate);
      
      const insights: string[] = [];
      if (avgSuccessRate > 0.9) insights.push('High success across all models');
      else if (avgSuccessRate < 0.5) insights.push('Challenging scenario for most models');
      
      const successRange = sortedResults[0].successRate - sortedResults[sortedResults.length - 1].successRate;
      if (successRange > 0.4) insights.push('High model sensitivity - choice matters significantly');

      return {
        scenarioId,
        scenarioName: results[0].scenarioName || scenarioId,
        avgSuccessRate,
        bestModel: sortedResults[0].modelId,
        worstModel: sortedResults[sortedResults.length - 1].modelId,
        insights
      };
    });
  }

  private generateTechnicalInsights(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ) {
    // Analyze model size vs performance correlation
    const sizePerformance = evaluationResults.map(result => {
      const model = modelMap.get(result.modelId);
      const sizeMatch = model?.size?.match(/(\d+\.?\d*)/);
      const sizeGB = sizeMatch ? parseFloat(sizeMatch[1]) : 0;
      return { size: sizeGB, performance: result.overallMetrics.taskSuccessRate };
    }).filter(item => item.size > 0);

    const modelSizeVsPerformance = this.analyzeCorrelation(sizePerformance, 'size', 'performance');

    // Analyze specialization effect
    const specializationEffect = this.analyzeSpecializationImpact(evaluationResults, modelMap);

    // Analyze latency patterns
    const latencyAnalysis = this.analyzeLatencyPatterns(evaluationResults);

    // Identify quality factors
    const qualityFactors = this.identifyQualityFactors(evaluationResults);

    return {
      modelSizeVsPerformance,
      specializationEffect,
      latencyAnalysis,
      qualityFactors
    };
  }

  private analyzeCorrelation(data: Array<{size: number; performance: number}>, xLabel: string, yLabel: string): string {
    if (data.length < 3) return `Insufficient data to analyze ${xLabel} vs ${yLabel} correlation.`;

    const avgX = data.reduce((sum, d) => sum + d.size, 0) / data.length;
    const avgY = data.reduce((sum, d) => sum + d.performance, 0) / data.length;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    data.forEach(d => {
      const deltaX = d.size - avgX;
      const deltaY = d.performance - avgY;
      numerator += deltaX * deltaY;
      denomX += deltaX * deltaX;
      denomY += deltaY * deltaY;
    });

    const correlation = numerator / Math.sqrt(denomX * denomY);

    if (correlation > 0.7) {
      return `Strong positive correlation (${correlation.toFixed(2)}) between ${xLabel} and ${yLabel}. Larger models generally perform better.`;
    } else if (correlation > 0.3) {
      return `Moderate positive correlation (${correlation.toFixed(2)}) between ${xLabel} and ${yLabel}. Size has some impact on performance.`;
    } else if (correlation > -0.3) {
      return `Weak correlation (${correlation.toFixed(2)}) between ${xLabel} and ${yLabel}. Size is not a strong predictor of performance.`;
    } else {
      return `Negative correlation (${correlation.toFixed(2)}) between ${xLabel} and ${yLabel}. Smaller models may actually perform better in some cases.`;
    }
  }

  private analyzeSpecializationImpact(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ): string {
    const specialized = evaluationResults.filter(r => {
      const model = modelMap.get(r.modelId);
      return model?.name.includes('code') || model?.name.includes('coder') || model?.specialization === 'coding';
    });

    const general = evaluationResults.filter(r => {
      return !specialized.some(s => s.modelId === r.modelId);
    });

    if (specialized.length === 0 || general.length === 0) {
      return 'Insufficient data to analyze specialization impact.';
    }

    const avgSpecializedScore = specialized.reduce((sum, r) => sum + r.overallMetrics.taskSuccessRate, 0) / specialized.length;
    const avgGeneralScore = general.reduce((sum, r) => sum + r.overallMetrics.taskSuccessRate, 0) / general.length;

    const difference = avgSpecializedScore - avgGeneralScore;
    const percentDiff = (difference * 100).toFixed(1);

    if (Math.abs(difference) < 0.05) {
      return `Minimal difference between specialized and general models (${percentDiff}%). Specialization doesn't show clear advantages.`;
    } else if (difference > 0) {
      return `Specialized coding models outperform general models by ${percentDiff}%. Domain specialization provides clear benefits.`;
    } else {
      return `General models outperform specialized coding models by ${Math.abs(parseFloat(percentDiff))}%. General training may be more beneficial.`;
    }
  }

  private analyzeLatencyPatterns(evaluationResults: EvaluationResult[]): string {
    const latencies = evaluationResults.map(r => r.overallMetrics.responseLatency);
    const avgLatency = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);

    return `Response latency ranges from ${minLatency}ms to ${maxLatency}ms with average of ${avgLatency.toFixed(0)}ms. ` +
           `${maxLatency / minLatency > 3 ? 'Significant variation suggests model choice impacts speed significantly.' : 'Relatively consistent performance across models.'}`;
  }

  private identifyQualityFactors(evaluationResults: EvaluationResult[]): string[] {
    const factors: string[] = [];
    
    // Analyze which metrics correlate with overall success
    const metrics = ['technicalAccuracy', 'contextUnderstanding', 'codeQualityScore', 'domainKnowledgeScore'];
    
    metrics.forEach(metric => {
      const correlation = this.calculateMetricCorrelation(evaluationResults, metric, 'taskSuccessRate');
      if (correlation > 0.6) {
        factors.push(`${metric} strongly predicts overall success (r=${correlation.toFixed(2)})`);
      } else if (correlation > 0.4) {
        factors.push(`${metric} moderately impacts success (r=${correlation.toFixed(2)})`);
      }
    });

    if (factors.length === 0) {
      factors.push('No single metric dominates success - performance is multifaceted');
    }

    return factors;
  }

  private calculateMetricCorrelation(results: EvaluationResult[], metric1: string, metric2: string): number {
    const data = results.map(r => ({
      x: (r.overallMetrics as any)[metric1],
      y: (r.overallMetrics as any)[metric2]
    }));

    if (data.length < 3) return 0;

    const avgX = data.reduce((sum, d) => sum + d.x, 0) / data.length;
    const avgY = data.reduce((sum, d) => sum + d.y, 0) / data.length;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    data.forEach(d => {
      const deltaX = d.x - avgX;
      const deltaY = d.y - avgY;
      numerator += deltaX * deltaY;
      denomX += deltaX * deltaX;
      denomY += deltaY * deltaY;
    });

    return numerator / Math.sqrt(denomX * denomY);
  }

  private extractKeyFindings(evaluationResults: EvaluationResult[], rankings: ModelRanking[]): string[] {
    const findings: string[] = [];
    
    // Top performer analysis
    const topModel = rankings[0];
    findings.push(`${topModel.modelName} emerged as the top performer with ${(topModel.overallScore * 100).toFixed(1)}% overall score`);
    
    // Performance spread
    const scoreSpread = rankings[0].overallScore - rankings[rankings.length - 1].overallScore;
    if (scoreSpread > 0.3) {
      findings.push(`Significant performance variation (${(scoreSpread * 100).toFixed(1)}%) between best and worst models`);
    } else {
      findings.push(`Models perform relatively similarly (${(scoreSpread * 100).toFixed(1)}% variation)`);
    }
    
    // Task success patterns
    const avgTaskSuccess = evaluationResults.reduce((sum, r) => sum + r.overallMetrics.taskSuccessRate, 0) / evaluationResults.length;
    if (avgTaskSuccess > 0.8) {
      findings.push(`High overall task execution success (${(avgTaskSuccess * 100).toFixed(1)}% average) across all models`);
    } else if (avgTaskSuccess < 0.6) {
      findings.push(`Task execution challenges identified (${(avgTaskSuccess * 100).toFixed(1)}% average success rate)`);
    }

    return findings;
  }

  private generateHighLevelRecommendations(rankings: ModelRanking[], agentRecommendations: AgentTypeRecommendation[], evaluationResults: EvaluationResult[]): string[] {
    const recommendations: string[] = [];
    
    recommendations.push(`For general use, consider ${rankings[0].modelName} as the top overall performer`);
    
    // Find models that appear frequently in agent type recommendations
    const modelFrequency = new Map<string, number>();
    agentRecommendations.forEach(rec => {
      rec.recommendedModels.slice(0, 2).forEach(model => {
        modelFrequency.set(model.modelName, (modelFrequency.get(model.modelName) || 0) + 1);
      });
    });
    
    const versatileModels = Array.from(modelFrequency.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1]);
    
    if (versatileModels.length > 0) {
      recommendations.push(`${versatileModels[0][0]} shows strong versatility across multiple agent types`);
    }

    // Performance vs latency recommendation
    const fastModels = rankings.filter(r => {
      const result = evaluationResults.find(evalResult => evalResult.modelId === r.modelId);
      return result && result.overallMetrics.responseLatency < 3000;
    });

    if (fastModels.length > 0 && fastModels[0].overallScore > 0.75) {
      recommendations.push(`${fastModels[0].modelName} offers excellent performance with fast response times`);
    }

    return recommendations;
  }

  private identifySuprisesandOutliers(evaluationResults: EvaluationResult[], rankings: ModelRanking[]): string[] {
    const surprises: string[] = [];
    
    // @ts-ignore - evaluationResults could be used for more detailed surprise analysis in the future
    evaluationResults;
    
    // Look for small models that punch above their weight
    // This would need model size data which we'd get from the model map
    
    // Look for specialized models that performed poorly in their domain
    // This would need more detailed scenario analysis
    
    // For now, provide generic outlier detection
    const scores = rankings.map(r => r.overallScore);
    const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
    const stdDev = Math.sqrt(scores.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scores.length);
    
    const outliers = rankings.filter(r => Math.abs(r.overallScore - avgScore) > 2 * stdDev);
    outliers.forEach(outlier => {
      if (outlier.overallScore > avgScore) {
        surprises.push(`${outlier.modelName} significantly outperformed expectations`);
      } else {
        surprises.push(`${outlier.modelName} underperformed compared to similar models`);
      }
    });

    if (surprises.length === 0) {
      surprises.push('Performance results aligned with expectations - no major surprises detected');
    }

    return surprises;
  }

  private groupRankingsByAgentType(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ): { [key in AgentType]?: ModelRanking[] } {
    const grouped: { [key in AgentType]?: ModelRanking[] } = {};
    
    // This is a simplified version - in practice we'd need to analyze each agent type's specific scenarios
    Object.values(AgentType).forEach(agentType => {
      const relevantResults = evaluationResults.filter(result => 
        result.scenarioResults.some(s => 
          s.scenarioId.toLowerCase().includes(agentType.toLowerCase()) ||
          s.scenarioId.toLowerCase().includes(agentType.replace('_', '-').toLowerCase())
        )
      );
      
      if (relevantResults.length > 0) {
        grouped[agentType] = this.calculateModelRankings(relevantResults, modelMap);
      }
    });
    
    return grouped;
  }

  private analyzeSpeedVsAccuracy(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ): Array<{ modelId: string; speed: number; accuracy: number }> {
    // @ts-ignore - modelMap could be used for model-specific speed analysis
    modelMap;
    
    return evaluationResults.map(result => ({
      modelId: result.modelId,
      speed: 1 / result.overallMetrics.responseLatency, // Inverse of latency for speed
      accuracy: result.overallMetrics.taskSuccessRate
    }));
  }

  private analyzeCostEfficiency(
    evaluationResults: EvaluationResult[],
    modelMap: Map<string, AvailableModel>
  ): Array<{ modelId: string; performance: number; cost: number }> {
    return evaluationResults.map(result => {
      const model = modelMap.get(result.modelId);
      // For local models, cost is essentially zero for usage
      // For online models, we'd calculate based on token usage and pricing
      const cost = model?.type === 'local' ? 0 : 1; // Simplified
      
      return {
        modelId: result.modelId,
        performance: result.overallMetrics.taskSuccessRate,
        cost
      };
    });
  }

  private generateMarkdownReport(report: ComprehensiveReport): string {
    const md: string[] = [];
    
    md.push('# AI Model Evaluation Report');
    md.push('');
    md.push(`Generated: ${report.metadata.generatedAt.toLocaleString()}`);
    md.push(`Models Evaluated: ${report.metadata.totalModelsEvaluated}`);
    md.push(`Scenarios Run: ${report.metadata.totalScenariosRun}`);
    md.push(`Evaluation Duration: ${(report.metadata.evaluationDuration / 1000).toFixed(1)} seconds`);
    md.push('');
    
    // Executive Summary
    md.push('## Executive Summary');
    md.push('');
    md.push('### Key Findings');
    report.executiveSummary.keyFindings.forEach(finding => {
      md.push(`- ${finding}`);
    });
    md.push('');
    
    md.push('### Top Recommendations');
    report.executiveSummary.recommendations.forEach(rec => {
      md.push(`- ${rec}`);
    });
    md.push('');
    
    md.push('### Surprises & Outliers');
    report.executiveSummary.surprises.forEach(surprise => {
      md.push(`- ${surprise}`);
    });
    md.push('');
    
    // Overall Rankings
    md.push('## Overall Model Rankings');
    md.push('');
    md.push('| Rank | Model | Score | Strengths | Weaknesses | Recommended For |');
    md.push('|------|-------|-------|-----------|------------|-----------------|');
    
    report.modelComparisons.overall.slice(0, 10).forEach(model => {
      md.push(`| ${model.rank} | ${model.modelName} | ${(model.overallScore * 100).toFixed(1)}% | ${model.strengths.slice(0, 2).join(', ')} | ${model.weaknesses.slice(0, 2).join(', ')} | ${model.recommendedFor.join(', ')} |`);
    });
    md.push('');
    
    // Agent Type Recommendations
    md.push('## Agent Type Recommendations');
    md.push('');
    
    report.agentTypeRecommendations.forEach(rec => {
      md.push(`### ${rec.agentType.replace('_', ' ')}`);
      md.push('');
      md.push(rec.reasoning);
      md.push('');
      
      md.push('**Recommended Models:**');
      rec.recommendedModels.slice(0, 3).forEach((model, idx) => {
        md.push(`${idx + 1}. **${model.modelName}** - ${(model.overallScore * 100).toFixed(1)}% success rate`);
      });
      md.push('');
      
      md.push('**Key Metrics:**');
      rec.keyMetrics.forEach(metric => {
        md.push(`- ${metric}`);
      });
      md.push('');
    });
    
    // Technical Insights
    md.push('## Technical Insights');
    md.push('');
    
    md.push('### Model Size vs Performance');
    md.push(report.technicalInsights.modelSizeVsPerformance);
    md.push('');
    
    md.push('### Specialization Effect');
    md.push(report.technicalInsights.specializationEffect);
    md.push('');
    
    md.push('### Latency Analysis');
    md.push(report.technicalInsights.latencyAnalysis);
    md.push('');
    
    md.push('### Quality Factors');
    report.technicalInsights.qualityFactors.forEach(factor => {
      md.push(`- ${factor}`);
    });
    md.push('');
    
    // Detailed Model Analysis
    md.push('## Detailed Model Analysis');
    md.push('');
    
    report.detailedAnalysis.modelBreakdowns.forEach(breakdown => {
      md.push(`### ${breakdown.modelId}`);
      md.push('');
      md.push(breakdown.analysis);
      md.push('');
      
      md.push('**Performance Metrics:**');
      md.push(`- Task Success Rate: ${(breakdown.metrics.taskSuccessRate * 100).toFixed(1)}%`);
      md.push(`- Technical Accuracy: ${(breakdown.metrics.technicalAccuracy * 100).toFixed(1)}%`);
      md.push(`- Context Understanding: ${(breakdown.metrics.contextUnderstanding * 100).toFixed(1)}%`);
      md.push(`- Code Quality Score: ${(breakdown.metrics.codeQualityScore * 100).toFixed(1)}%`);
      md.push(`- Response Latency: ${breakdown.metrics.responseLatency}ms`);
      md.push('');
    });
    
    return md.join('\n');
  }

  private generateModelAnalysis(result: EvaluationResult, model?: AvailableModel): string {
    const metrics = result.overallMetrics;
    let analysis = '';
    
    if (model) {
      analysis += `${model.name} (${model.provider}) `;
    }
    
    analysis += `achieved a ${(metrics.taskSuccessRate * 100).toFixed(1)}% task success rate `;
    
    if (metrics.taskSuccessRate > 0.9) {
      analysis += 'with excellent reliability. ';
    } else if (metrics.taskSuccessRate > 0.75) {
      analysis += 'with good reliability. ';
    } else {
      analysis += 'with some reliability concerns. ';
    }
    
    if (metrics.responseLatency < 2000) {
      analysis += 'Response times are fast. ';
    } else if (metrics.responseLatency > 5000) {
      analysis += 'Response times are slower than average. ';
    }
    
    const bestScenario = result.scenarioResults.reduce((best, current) => 
      current.successRate > best.successRate ? current : best
    );
    const worstScenario = result.scenarioResults.reduce((worst, current) => 
      current.successRate < worst.successRate ? current : worst
    );
    
    analysis += `Best performance in ${bestScenario.scenarioId} (${(bestScenario.successRate * 100).toFixed(1)}%), `;
    analysis += `struggled most with ${worstScenario.scenarioId} (${(worstScenario.successRate * 100).toFixed(1)}%).`;
    
    return analysis;
  }
}