# 🚀 How to Run AI Model Evaluation - Step by Step

## **Method 1: VSCode Extension Command (Recommended)**

### **Step 1: Build the Extension**
```bash
# In your project directory
npm run build
```

### **Step 2: Start VSCode Extension Development**
```bash
# This launches VSCode with your extension loaded
code --extensionDevelopmentPath=. .
```

### **Step 3: Run the Model Evaluation**

In the VSCode window that opens:

1. **Open Command Palette**: `Ctrl+Shift+P` (Windows/Linux) or `Cmd+Shift+P` (Mac)

2. **Type**: `AI Agents: Run Model Evaluation`

3. **Press Enter**

The evaluation will:
- ✅ Validate your 9 Ollama models
- 🧪 Run real conversations against each model
- 📊 Test all scenarios (code review, documentation, etc.)
- 📈 Generate performance reports
- 🎯 Provide model recommendations

### **Step 4: View Results**

After completion (may take 10-30 minutes), you'll get:
- **Success notification** with summary statistics
- **Options to open**:
  - Reports folder with all generated files
  - Markdown report for human reading
  - JSON data for programmatic analysis
  - Judge prompt for external LLM analysis

---

## **Method 2: Validate Setup First (Recommended Before Full Run)**

```bash
# Check that everything is ready
npm run eval:validate

# Test system architecture
npm run eval:test
```

This tells you if:
- ✅ All 9 Ollama models are discovered
- ✅ Output directory is writable  
- ✅ All evaluation components exist
- ✅ System architecture is ready

---

## **What Actually Happens During Evaluation**

### **Real Model Testing Process**:

1. **Discovery**: Finds your 9 models (magicoder, deepseek-coder, codellama, etc.)

2. **Scenario Execution**: For each model, runs realistic conversations like:
   - **Code Reviewer**: "Review this authentication function for security issues"
   - **Software Engineer**: "Implement a file upload feature with validation"  
   - **Documentation**: "Create API documentation for this REST endpoint"
   - **Testing**: "Write comprehensive unit tests for this class"
   - **DevOps**: "Create a Docker configuration for this Node.js app"

3. **Real Task Execution**: Tests actual task syntax:
   ```
   [CREATE_FILE: security-review.md]
   # Security Analysis Report
   [/CREATE_FILE]
   
   [EDIT_FILE: app.js]
   [FIND]old code[/FIND]  
   [REPLACE]improved code[/REPLACE]
   [/EDIT_FILE]
   ```

4. **Performance Measurement**: Records:
   - Task success rates (did the file get created?)
   - Response quality and accuracy
   - Code quality scores
   - Context understanding
   - Response latency

5. **Report Generation**: Creates comprehensive analysis with model rankings and recommendations

---

## **Expected Timeline**

- **Setup validation**: 5 seconds
- **Per model evaluation**: 2-5 minutes  
- **Total time**: 20-45 minutes (depends on model count and scenario complexity)

---

## **Output Files**

After completion, you'll find in `model-evaluation-results/`:

```
model-evaluation-results/
├── model_evaluation_2024-08-27T21-30-00-000Z.json     # Raw data
├── model_evaluation_2024-08-27T21-30-00-000Z.md       # Human-readable report  
└── judge-prompt-2024-08-27T21-30-00-000Z.txt          # For external analysis
```

### **JSON Report**: Complete data for programmatic analysis
### **Markdown Report**: Executive summary, rankings, recommendations
### **Judge Prompt**: Ready to paste into ChatGPT/Claude for expert analysis

---

## **Troubleshooting**

### **"No workspace folder open"**
- Open a folder in VSCode before running the evaluation
- The system needs a workspace to create temporary files

### **"Setup validation failed"** 
```bash
# Check what's wrong
npm run eval:validate

# Common fixes:
ollama list                    # Verify models exist
ollama serve                   # Start ollama service
mkdir model-evaluation-results # Create output directory
```

### **"Model evaluation failed"**
- Check VSCode Developer Console (`Ctrl+Shift+I` → Console tab)
- Look for specific error messages
- Verify workspace has write permissions

### **Extension doesn't load**
```bash
# Rebuild and try again
npm run build
code --extensionDevelopmentPath=. .
```

---

## **What You'll Learn**

The evaluation will tell you:

🏆 **Best overall model** for general agent tasks
📊 **Model rankings** with detailed performance scores  
🎯 **Agent-specific recommendations** (which model for code review, documentation, etc.)
⚡ **Speed vs accuracy trade-offs** 
🔍 **Strengths and weaknesses** of each model
📈 **Performance insights** and optimization suggestions

This gives you **data-driven decisions** for configuring your AI agents with the optimal models! 🚀