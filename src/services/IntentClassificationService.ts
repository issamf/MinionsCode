import * as vscode from 'vscode';
import { AIProviderManager } from '@/providers/AIProviderManager';
import { AIProvider, IntentDeclaration, IntentClassificationResult, KeywordLearningEntry, HelperBrainSettings } from '@/shared/types';
import { debugLogger } from '@/utils/logger';

export class IntentClassificationService {
  private providerManager: AIProviderManager;
  private context: vscode.ExtensionContext;
  private intents: Map<string, IntentDeclaration> = new Map();
  private keywordHistory: KeywordLearningEntry[] = [];
  
  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.providerManager = new AIProviderManager();
    this.loadPersistedIntents();
    this.initializeDefaultIntents();
  }

  private initializeDefaultIntents(): void {
    const defaultIntents: IntentDeclaration[] = [
      {
        id: 'file_operations',
        name: 'File Operations',
        description: 'User wants to create, edit, delete, or manipulate files in any way. This includes note-taking, logging, saving content, writing text to files, or any file system operations.',
        staticKeywords: [
          'create file', 'write file', 'save to file', 'generate file', 'make file',
          'edit file', 'modify file', 'change file', 'update file',
          'delete file', 'remove file',
          'get this', 'capture this', 'write this down', 'note this', 'log this',
          'add this', 'remember this', 'save this', 'record this'
        ],
        dynamicKeywords: [],
        examples: [
          'write this down: Starting the brain log!',
          'capture this thought',
          'save this to a file',
          'create a notes file',
          'log this information',
          'keep track of this',
          'jot down these ideas'
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'git_operations', 
        name: 'Git Operations',
        description: 'User wants to perform version control operations like commits, branches, pushes, or other git-related tasks.',
        staticKeywords: ['git commit', 'commit changes', 'push to git', 'create branch', 'git status'],
        dynamicKeywords: [],
        examples: [
          'commit these changes',
          'push to repository',
          'create a new branch',
          'check git status'
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'command_execution',
        name: 'Command Execution', 
        description: 'User wants to run shell commands, scripts, or execute terminal operations.',
        staticKeywords: ['run command', 'execute', 'npm install', 'npm run', 'docker', 'terminal'],
        dynamicKeywords: [],
        examples: [
          'run npm install',
          'execute this script',
          'start the development server',
          'build the project'
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: 'code_analysis',
        name: 'Code Analysis',
        description: 'User wants to analyze, review, or examine code for bugs, improvements, or understanding.',
        staticKeywords: ['analyze code', 'review code', 'check for bugs', 'lint code', 'examine'],
        dynamicKeywords: [],
        examples: [
          'analyze this code',
          'review my changes',
          'check for bugs',
          'examine this function'
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];

    for (const intent of defaultIntents) {
      if (!this.intents.has(intent.id)) {
        this.intents.set(intent.id, intent);
      }
    }
  }

  public async classifyIntent(
    message: string, 
    agentProvider: AIProvider,
    agentModelName: string,
    helperBrainSettings?: HelperBrainSettings
  ): Promise<IntentClassificationResult> {
    try {
      // First, try static keyword matching
      const staticResult = this.performStaticClassification(message);
      
      // If helper brain is disabled, return static result
      if (!helperBrainSettings?.enabled) {
        return staticResult;
      }

      // Use AI for enhanced classification
      const aiResult = await this.performAIClassification(
        message, 
        staticResult,
        agentProvider,
        agentModelName,
        helperBrainSettings
      );

      // Learn from AI suggestions
      await this.learnFromAIResult(message, aiResult);

      return aiResult;
    } catch (error) {
      debugLogger.log('Error in intent classification, falling back to static', error);
      return this.performStaticClassification(message);
    }
  }

  private performStaticClassification(message: string): IntentClassificationResult {
    const lowerMessage = message.toLowerCase();
    const detectedIntents: string[] = [];

    for (const [intentId, intent] of this.intents.entries()) {
      const allKeywords = [...intent.staticKeywords, ...intent.dynamicKeywords];
      const hasMatch = allKeywords.some(keyword => lowerMessage.includes(keyword.toLowerCase()));
      
      if (hasMatch) {
        detectedIntents.push(intentId);
      }
    }

    return {
      detectedIntents,
      confidence: detectedIntents.length > 0 ? 0.7 : 0.1,
      suggestedKeywords: [],
      reasoning: 'Static keyword matching'
    };
  }

  private async performAIClassification(
    message: string,
    staticResult: IntentClassificationResult,
    agentProvider: AIProvider,
    agentModelName: string,
    helperBrainSettings: HelperBrainSettings
  ): Promise<IntentClassificationResult> {
    const provider = helperBrainSettings.useAgentProvider ? agentProvider : helperBrainSettings.provider;
    const modelName = helperBrainSettings.useAgentProvider ? agentModelName : helperBrainSettings.modelName;

    const systemPrompt = helperBrainSettings.systemPrompt || this.getDefaultHelperBrainPrompt();
    const userPrompt = this.buildClassificationPrompt(message, staticResult);

    try {
      const response = await this.providerManager.generateResponse(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        {
          provider,
          modelName,
          temperature: helperBrainSettings.temperature,
          maxTokens: helperBrainSettings.maxTokens
        }
      );

      return this.parseAIResponse(response.content, staticResult);
    } catch (error) {
      debugLogger.log('AI classification failed, using static result', error);
      return staticResult;
    }
  }

  private getDefaultHelperBrainPrompt(): string {
    return `You are an intelligent intent classification system. Your job is to analyze user messages and determine what actions they want an AI agent to perform.

You have access to these intent categories:
${Array.from(this.intents.values()).map(intent => 
  `- ${intent.name}: ${intent.description}\n  Examples: ${intent.examples.join('; ')}`
).join('\n')}

Your tasks:
1. Classify the user's message into one or more intent categories
2. Assess confidence level (0.0 to 1.0)
3. Suggest new keywords that could help detect similar intents in the future
4. Provide reasoning for your classification

Be especially sensitive to:
- Natural language expressions of file operations (like "write this down", "capture this", "save this")
- Implicit requests (user mentions wanting to track something = file operations)
- Context clues that indicate desired actions

CRITICAL: Respond with ONLY valid JSON, no additional text or analysis:
{
  "detectedIntents": ["intent1", "intent2"],
  "confidence": 0.85,
  "suggestedKeywords": ["keyword1", "keyword2"],
  "reasoning": "Explanation of classification"
}

Do NOT include any text before or after the JSON. Your entire response must be valid JSON that can be parsed directly.`;
  }

  private buildClassificationPrompt(message: string, staticResult: IntentClassificationResult): string {
    return `User Message: "${message}"

Static Classification Result:
- Detected Intents: ${staticResult.detectedIntents.join(', ') || 'none'}
- Confidence: ${staticResult.confidence}

Please analyze this message and provide an enhanced classification. Consider:
1. Are there intents the static system missed?
2. Should the confidence be adjusted?
3. What keywords could help detect similar messages in the future?
4. Is this a request for action or just conversation?

Current Intent Definitions:
${Array.from(this.intents.values()).map(intent => 
  `${intent.id}: ${intent.description}`
).join('\n')}`;
  }

  private parseAIResponse(response: string, fallback: IntentClassificationResult): IntentClassificationResult {
    try {
      // Try direct JSON parse first
      let parsed = JSON.parse(response);
      return this.validateAndReturnResult(parsed, fallback);
    } catch (error) {
      // If direct parse fails, try to extract JSON from mixed content
      try {
        const jsonMatch = response.match(/\{[\s\S]*?\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          debugLogger.log('Extracted JSON from mixed content', { original: response.substring(0, 200), extracted: jsonMatch[0] });
          return this.validateAndReturnResult(parsed, fallback);
        }
      } catch (extractError) {
        debugLogger.log('Failed to extract JSON from response', { response: response.substring(0, 200), extractError });
      }
      
      debugLogger.log('Failed to parse AI classification response', { response: response.substring(0, 200), error });
      return fallback;
    }
  }

  private validateAndReturnResult(parsed: any, fallback: IntentClassificationResult): IntentClassificationResult {
    return {
      detectedIntents: Array.isArray(parsed.detectedIntents) ? parsed.detectedIntents : fallback.detectedIntents,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : fallback.confidence,
      suggestedKeywords: Array.isArray(parsed.suggestedKeywords) ? parsed.suggestedKeywords : [],
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : 'AI classification'
    };
  }

  private async learnFromAIResult(_message: string, result: IntentClassificationResult): Promise<void> {
    if (result.suggestedKeywords.length === 0 || result.confidence < 0.6) {
      return;
    }

    for (const keyword of result.suggestedKeywords) {
      for (const intentId of result.detectedIntents) {
        const entry: KeywordLearningEntry = {
          keyword: keyword.toLowerCase(),
          intentId,
          confidence: result.confidence,
          source: 'ai_suggestion',
          createdAt: new Date(),
          usageCount: 1
        };

        // Add to dynamic keywords if not already present and confidence is high
        if (result.confidence > 0.8 && this.intents.has(intentId)) {
          const intent = this.intents.get(intentId)!;
          const allKeywords = [...intent.staticKeywords, ...intent.dynamicKeywords];
          
          if (!allKeywords.some(k => k.toLowerCase() === keyword.toLowerCase())) {
            intent.dynamicKeywords.push(keyword);
            intent.updatedAt = new Date();
            await this.persistIntents();
          }
        }

        this.keywordHistory.push(entry);
      }
    }

    // Keep keyword history manageable
    if (this.keywordHistory.length > 1000) {
      this.keywordHistory = this.keywordHistory.slice(-500);
    }
  }

  public getIntents(): IntentDeclaration[] {
    return Array.from(this.intents.values());
  }

  public async updateIntent(intentId: string, updates: Partial<IntentDeclaration>): Promise<void> {
    const intent = this.intents.get(intentId);
    if (intent) {
      Object.assign(intent, updates, { updatedAt: new Date() });
      await this.persistIntents();
    }
  }

  public async addCustomIntent(intent: Omit<IntentDeclaration, 'createdAt' | 'updatedAt'>): Promise<void> {
    const fullIntent: IntentDeclaration = {
      ...intent,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.intents.set(intent.id, fullIntent);
    await this.persistIntents();
  }

  public async cleanupKeywords(): Promise<void> {
    const now = new Date();
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    for (const [intentId, intent] of this.intents.entries()) {
      // Remove low-confidence dynamic keywords older than 30 days
      const lowConfidenceKeywords = this.keywordHistory
        .filter(entry => 
          entry.intentId === intentId && 
          entry.confidence < 0.7 && 
          entry.createdAt < monthAgo &&
          entry.usageCount < 3
        )
        .map(entry => entry.keyword);

      intent.dynamicKeywords = intent.dynamicKeywords.filter(
        keyword => !lowConfidenceKeywords.includes(keyword.toLowerCase())
      );
    }

    await this.persistIntents();
  }

  private async loadPersistedIntents(): Promise<void> {
    try {
      const stored = this.context.globalState.get<IntentDeclaration[]>('intentDeclarations', []);
      for (const intent of stored) {
        this.intents.set(intent.id, intent);
      }
    } catch (error) {
      debugLogger.log('Error loading persisted intents', error);
    }
  }

  private async persistIntents(): Promise<void> {
    try {
      const intentsArray = Array.from(this.intents.values());
      await this.context.globalState.update('intentDeclarations', intentsArray);
    } catch (error) {
      debugLogger.log('Error persisting intents', error);
    }
  }

  public async initialize(): Promise<void> {
    await this.providerManager.detectAvailableProviders();
  }
}