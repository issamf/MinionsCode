// Debug script to test infinite loop scenario
console.log('🔍 Testing infinite loop scenario...');

// Simulate the agent response that might cause infinite loop
const testResponse = `I'll be your note taker! Let me set up a file to track your thoughts.

[CREATE_FILE: thought_log.txt]
# Thought Log - ${new Date().toISOString()}

Starting the brain log!
[/CREATE_FILE]

I've created a thought log file for you. From now on, whenever you say things like:
- "write this down"
- "capture this" 
- "log this"
- "note this"

I'll automatically add them to the file using this format:

[EDIT_FILE: thought_log.txt]
[FIND]# Thought Log - ${new Date().toISOString()}

Starting the brain log![/FIND]
[REPLACE]# Thought Log - ${new Date().toISOString()}

Starting the brain log!

## New Entry - ${new Date().toISOString()}
Your next thought will go here...[/REPLACE]
[/EDIT_FILE]`;

console.log('📝 Test response length:', testResponse.length);
console.log('📝 Task count estimates:');

// Count potential tasks in the response
const patterns = {
  fileCreate: /\[CREATE_FILE:\s*([^\]]+)\]/g,
  fileEdit: /\[EDIT_FILE:\s*([^\]]+)\]/g,
};

let match;
let createCount = 0;
let editCount = 0;

while ((match = patterns.fileCreate.exec(testResponse)) !== null) {
  createCount++;
  console.log(`  - CREATE_FILE: ${match[1]}`);
}

while ((match = patterns.fileEdit.exec(testResponse)) !== null) {
  editCount++;
  console.log(`  - EDIT_FILE: ${match[1]}`);
}

console.log(`📊 Total tasks found: ${createCount + editCount} (${createCount} creates, ${editCount} edits)`);

// Check for potential recursive patterns
if (testResponse.includes('[EDIT_FILE:') && testResponse.includes('[CREATE_FILE:')) {
  console.log('⚠️ WARNING: Response contains both CREATE and EDIT operations for same file');
}

if (testResponse.includes('I\'ll automatically') || testResponse.includes('From now on')) {
  console.log('⚠️ WARNING: Response indicates ongoing behavior - potential loop trigger');
}

// Check for timestamp generation in response
if (testResponse.includes('new Date()') || testResponse.includes('Date.now()')) {
  console.log('🚨 CRITICAL: Response contains dynamic timestamp generation - will create infinite variations!');
}