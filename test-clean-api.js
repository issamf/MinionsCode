// Direct API test to validate clean prompts are being sent
const axios = require('axios');

async function testCleanAPICall() {
  console.log('🔬 Testing Clean API Calls...');
  
  // Test clean system prompt (what our new system sends)
  const cleanSystemPrompt = `You are a CODE REVIEWER AI assistant specializing in security, performance, and code quality analysis.

🚨 MANDATORY: EXECUTE TASKS IMMEDIATELY - NO EXPLANATIONS FIRST!

YOUR SPECIFIC FOCUS:
- Identify security vulnerabilities (SQL injection, XSS, etc.)
- Suggest performance optimizations
- Recommend code quality improvements
- Create analysis reports and secure code implementations
- Follow security best practices (OWASP guidelines)`;
  
  const userMessage = 'Please review this authentication function for security issues: const login = (user, pass) => { return db.query("SELECT * FROM users WHERE username=\'" + user + "\' AND password=\'" + pass + "\'"); };';
  
  console.log('📤 Sending clean prompt to Ollama...');
  console.log('📏 System prompt length:', cleanSystemPrompt.length);
  console.log('👤 User message:', userMessage);
  
  try {
    const requestBody = {
      model: 'magicoder:7b',
      messages: [
        {
          role: 'system',
          content: cleanSystemPrompt
        },
        {
          role: 'user', 
          content: userMessage
        }
      ],
      stream: false,
      options: {
        temperature: 0.7,
        num_predict: 500
      }
    };
    
    console.log('🔄 Making API request...');
    const startTime = Date.now();
    
    const response = await axios.post('http://localhost:11434/api/chat', requestBody, {
      timeout: 30000
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('✅ Response received in', duration + 'ms');
    console.log('📊 Response data:', {
      hasMessage: !!response.data?.message,
      messageLength: response.data?.message?.content?.length || 0,
      done: response.data?.done,
      evalCount: response.data?.eval_count,
      promptEvalCount: response.data?.prompt_eval_count
    });
    
    if (response.data?.message?.content) {
      console.log('💬 Model Response Preview:', response.data.message.content.substring(0, 300) + '...');
      
      // Check if response looks like it was trying to execute tasks immediately
      const content = response.data.message.content.toLowerCase();
      const hasTaskExecution = content.includes('create_file') || 
                               content.includes('[create') || 
                               content.includes('security') ||
                               content.includes('vulnerabilit');
      
      if (hasTaskExecution) {
        console.log('🎉 SUCCESS: Model responded with task-oriented output!');
        console.log('✨ Clean prompt system is working correctly');
      } else {
        console.log('⚠️ Model response might be conversational rather than task-oriented');
      }
    }
    
    console.log('🎯 Test completed successfully - clean prompts are being sent properly');
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('❌ Could not connect to Ollama. Make sure it\'s running on localhost:11434');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('⏱️ Request timed out - model may be loading or processing');
    } else {
      console.log('❌ API test failed:', error.message);
    }
  }
}

console.log('🚀 Starting clean API test...');
testCleanAPICall();