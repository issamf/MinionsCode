# AI Model Evaluation Analysis Prompt

## Your Task
You are an expert AI model evaluator. Analyze the following evaluation results and provide comprehensive insights, recommendations, and comparative analysis.

## Evaluation Overview
- **Date**: 8/28/2025
- **Total Models Evaluated**: 3
- **Successful Models**: 1
- **Overall Success Rate**: 33.3%
- **Evaluation Configuration**: 
  - Timeout: 120s per turn
  - Max Retries: 3
  - Include Online Models: true

## Model Performance Results

### magicoder:7b
- **Status**: FAILED
- **Overall Performance**: Failed to complete
- **Duration**: 300.4s
- **Scenarios Tested**: 3
- **Task Success Rate**: 0.0%
- **Technical Accuracy**: 26.7%
- **Context Understanding**: 46.7%
- **Response Completeness**: 53.3%
- **Domain Knowledge**: 46.7%
- **Code Quality**: 56.7%
- **User Satisfaction**: 42.2%
- **Avg Response Time**: 100029ms

### dolphin-mistral:7b
- **Status**: SUCCESS
- **Overall Performance**: Completed evaluation
- **Duration**: 176.6s
- **Scenarios Tested**: 3
- **Task Success Rate**: 33.3%
- **Technical Accuracy**: 40.0%
- **Context Understanding**: 46.7%
- **Response Completeness**: 53.3%
- **Domain Knowledge**: 46.7%
- **Code Quality**: 56.7%
- **User Satisfaction**: 46.7%
- **Avg Response Time**: 58696ms

### codellama:7b
- **Status**: FAILED
- **Overall Performance**: Failed to complete
- **Duration**: 240.6s
- **Scenarios Tested**: 3
- **Task Success Rate**: 0.0%
- **Technical Accuracy**: 13.3%
- **Context Understanding**: 23.3%
- **Response Completeness**: 26.7%
- **Domain Knowledge**: 33.3%
- **Code Quality**: 43.3%
- **User Satisfaction**: 21.1%
- **Avg Response Time**: 80065ms

## Analysis Questions
Please provide detailed analysis for the following:

### 1. Overall Performance Assessment
- Which models performed best and why?
- What patterns do you see in the success/failure rates?
- Are there clear performance tiers among the models?

### 2. Technical Analysis
- Which models showed the strongest technical accuracy?
- How did context understanding vary between models?
- Which models produced the most complete responses?

### 3. Failure Analysis
- What were the common failure modes?
- Which models were skipped and why?
- Are there patterns in timeout/availability issues?

### 4. Domain Expertise Evaluation
- Which models demonstrated the best domain knowledge?
- How did code quality scores compare?
- Which models would be best for specific use cases?

### 5. Performance vs. Efficiency
- Which models provided the best balance of accuracy and speed?
- Are there models that are fast but inaccurate, or slow but thorough?

### 6. Recommendations
- Which models would you recommend for production use?
- What specific use cases would each successful model be best for?
- What improvements could be made to the evaluation process?

## Raw Data
```json
{
  "timestamp": "2025-08-28T13:28:06.066Z",
  "summary": {
    "totalModels": 3,
    "successfulModels": 1,
    "failedModels": 2,
    "skippedModels": 0,
    "successRate": "33.3%"
  },
  "modelResults": [
    {
      "modelId": "ollama:magicoder:7b",
      "modelName": "magicoder:7b",
      "success": false,
      "skipped": false,
      "totalDuration": 300412,
      "retryCount": 0,
      "scenarioCount": 3,
      "overallMetrics": {
        "taskSuccessRate": 0,
        "technicalAccuracy": 0.26666666666666666,
        "contextUnderstanding": 0.4666666666666666,
        "responseCompleteness": 0.5333333333333333,
        "domainKnowledgeScore": 0.4666666666666666,
        "codeQualityScore": 0.5666666666666667,
        "userSatisfactionScore": 0.4222222222222223,
        "responseLatency": 100028.66666666667
      }
    },
    {
      "modelId": "ollama:dolphin-mistral:7b",
      "modelName": "dolphin-mistral:7b",
      "success": true,
      "skipped": false,
      "totalDuration": 176572,
      "retryCount": 0,
      "scenarioCount": 3,
      "overallMetrics": {
        "taskSuccessRate": 0.3333333333333333,
        "technicalAccuracy": 0.4000000000000001,
        "contextUnderstanding": 0.4666666666666666,
        "responseCompleteness": 0.5333333333333333,
        "domainKnowledgeScore": 0.4666666666666666,
        "codeQualityScore": 0.5666666666666667,
        "userSatisfactionScore": 0.4666666666666666,
        "responseLatency": 58696.333333333336
      }
    },
    {
      "modelId": "ollama:codellama:7b",
      "modelName": "codellama:7b",
      "success": false,
      "skipped": false,
      "totalDuration": 240647,
      "retryCount": 0,
      "scenarioCount": 3,
      "overallMetrics": {
        "taskSuccessRate": 0,
        "technicalAccuracy": 0.13333333333333333,
        "contextUnderstanding": 0.2333333333333333,
        "responseCompleteness": 0.26666666666666666,
        "domainKnowledgeScore": 0.3333333333333333,
        "codeQualityScore": 0.43333333333333335,
        "userSatisfactionScore": 0.21111111111111114,
        "responseLatency": 80065
      }
    }
  ],
  "configuration": {
    "timeout": 120000,
    "maxRetries": 3,
    "retryDelay": 1000,
    "includeOnlineModels": true,
    "outputDirectory": "c:\\Projects\\apes-foundation\\CompanAI.local.v1",
    "enableLivePreview": true,
    "enableFailsafeMode": true
  }
}
```

---
*Generated by Enhanced Model Evaluation Engine*
*Timestamp: 2025-08-28T13:28:06.101Z*
