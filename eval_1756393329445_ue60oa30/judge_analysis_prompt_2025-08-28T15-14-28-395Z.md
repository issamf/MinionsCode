# AI Model Evaluation Analysis Prompt

## Your Task
You are an expert AI model evaluator. Analyze the following evaluation results and provide comprehensive insights, recommendations, and comparative analysis.

## Evaluation Overview
- **Date**: 8/28/2025
- **Total Models Evaluated**: 3
- **Successful Models**: 3
- **Overall Success Rate**: 100.0%
- **Evaluation Configuration**: 
  - Timeout: 120s per turn
  - Max Retries: 3
  - Include Online Models: true

## Model Performance Results

### magicoder:7b
- **Status**: SUCCESS
- **Overall Performance**: Completed evaluation
- **Duration**: 347.6s
- **Scenarios Tested**: 3
- **Task Success Rate**: 33.3%
- **Technical Accuracy**: 53.3%
- **Context Understanding**: 70.0%
- **Response Completeness**: 80.0%
- **Domain Knowledge**: 60.0%
- **Code Quality**: 70.0%
- **User Satisfaction**: 67.8%
- **Avg Response Time**: 115732ms

### dolphin-mistral:7b
- **Status**: SUCCESS
- **Overall Performance**: Completed evaluation
- **Duration**: 150.3s
- **Scenarios Tested**: 3
- **Task Success Rate**: 66.7%
- **Technical Accuracy**: 66.7%
- **Context Understanding**: 70.0%
- **Response Completeness**: 80.0%
- **Domain Knowledge**: 60.0%
- **Code Quality**: 70.0%
- **User Satisfaction**: 72.2%
- **Avg Response Time**: 49892ms

### codellama:7b
- **Status**: SUCCESS
- **Overall Performance**: Completed evaluation
- **Duration**: 238.0s
- **Scenarios Tested**: 3
- **Task Success Rate**: 66.7%
- **Technical Accuracy**: 66.7%
- **Context Understanding**: 70.0%
- **Response Completeness**: 80.0%
- **Domain Knowledge**: 60.0%
- **Code Quality**: 70.0%
- **User Satisfaction**: 72.2%
- **Avg Response Time**: 79211ms

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
  "timestamp": "2025-08-28T15:14:28.381Z",
  "summary": {
    "totalModels": 3,
    "successfulModels": 3,
    "failedModels": 0,
    "skippedModels": 0,
    "successRate": "100.0%"
  },
  "modelResults": [
    {
      "modelId": "ollama:magicoder:7b",
      "modelName": "magicoder:7b",
      "success": true,
      "skipped": false,
      "totalDuration": 347580,
      "retryCount": 0,
      "scenarioCount": 3,
      "overallMetrics": {
        "taskSuccessRate": 0.3333333333333333,
        "technicalAccuracy": 0.5333333333333333,
        "contextUnderstanding": 0.6999999999999998,
        "responseCompleteness": 0.8000000000000002,
        "domainKnowledgeScore": 0.6,
        "codeQualityScore": 0.6999999999999998,
        "userSatisfactionScore": 0.6777777777777777,
        "responseLatency": 115731.66666666667
      }
    },
    {
      "modelId": "ollama:dolphin-mistral:7b",
      "modelName": "dolphin-mistral:7b",
      "success": true,
      "skipped": false,
      "totalDuration": 150259,
      "retryCount": 0,
      "scenarioCount": 3,
      "overallMetrics": {
        "taskSuccessRate": 0.6666666666666666,
        "technicalAccuracy": 0.6666666666666666,
        "contextUnderstanding": 0.6999999999999998,
        "responseCompleteness": 0.8000000000000002,
        "domainKnowledgeScore": 0.6,
        "codeQualityScore": 0.6999999999999998,
        "userSatisfactionScore": 0.7222222222222222,
        "responseLatency": 49891.666666666664
      }
    },
    {
      "modelId": "ollama:codellama:7b",
      "modelName": "codellama:7b",
      "success": true,
      "skipped": false,
      "totalDuration": 237980,
      "retryCount": 0,
      "scenarioCount": 3,
      "overallMetrics": {
        "taskSuccessRate": 0.6666666666666666,
        "technicalAccuracy": 0.6666666666666666,
        "contextUnderstanding": 0.6999999999999998,
        "responseCompleteness": 0.8000000000000002,
        "domainKnowledgeScore": 0.6,
        "codeQualityScore": 0.6999999999999998,
        "userSatisfactionScore": 0.7222222222222222,
        "responseLatency": 79210.66666666667
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
*Timestamp: 2025-08-28T15:14:28.396Z*
