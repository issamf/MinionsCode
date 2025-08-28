// Quick response test
const axios = require('axios');

async function quickTest() {
  console.log('⚡ Quick Response Test...');
  
  try {
    const requestBody = {
      model: 'magicoder:7b',
      messages: [
        {
          role: 'user',
          content: 'Say hello in one word'
        }
      ],
      stream: false,
      options: {
        num_predict: 10  // Very short response
      }
    };
    
    console.log('🔄 Testing basic response...');
    const response = await axios.post('http://localhost:11434/api/chat', requestBody, {
      timeout: 15000
    });
    
    console.log('✅ Model responded:', response.data?.message?.content);
    console.log('🎯 Clean evaluation system is ready for testing!');
    
  } catch (error) {
    console.log('❌ Quick test failed:', error.message);
  }
}

quickTest();