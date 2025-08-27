import { AgentType } from '@/shared/types';

export interface ConversationTurn {
  role: 'user' | 'agent';
  message: string;
  expectedTaskTypes?: string[];
  expectedFileOperations?: string[];
  context?: string;
}

export interface EvaluationScenario {
  id: string;
  name: string;
  description: string;
  agentType: AgentType;
  difficulty: 'easy' | 'medium' | 'hard';
  estimatedDuration: string;
  conversation: ConversationTurn[];
  successCriteria: {
    taskExecution: string[];
    responseQuality: string[];
    domainExpertise: string[];
  };
  evaluationMetrics: string[];
  context: {
    files?: { name: string; content: string }[];
    projectType?: string;
    requirements?: string[];
  };
}

export class EvaluationScenarioService {
  
  /**
   * Get all comprehensive evaluation scenarios
   */
  getAllScenarios(): EvaluationScenario[] {
    return [
      ...this.getCodeReviewerScenarios(),
      ...this.getDocumentationScenarios(),
      ...this.getDevOpsScenarios(),
      ...this.getTestingScenarios(),
      ...this.getSoftwareEngineerScenarios(),
      ...this.getCustomAgentScenarios()
    ];
  }
  
  /**
   * Get scenarios for a specific agent type
   */
  getScenariosForAgentType(agentType: AgentType): EvaluationScenario[] {
    return this.getAllScenarios().filter(scenario => scenario.agentType === agentType);
  }
  
  private getCodeReviewerScenarios(): EvaluationScenario[] {
    return [
      {
        id: 'code-review-security',
        name: 'Security Vulnerability Review',
        description: 'Review JavaScript code with potential security vulnerabilities',
        agentType: AgentType.CODE_REVIEWER,
        difficulty: 'hard',
        estimatedDuration: '5-8 minutes',
        conversation: [
          {
            role: 'user',
            message: 'Please review this authentication function for security issues:',
            context: 'User provides code with SQL injection and XSS vulnerabilities'
          },
          {
            role: 'agent',
            message: '', // Agent should analyze and identify security issues
            expectedTaskTypes: ['file_analysis', 'security_review'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Can you create a secure version of this function?',
          },
          {
            role: 'agent',
            message: '', // Agent should create secure implementation
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates analysis report file',
            'Creates secure code implementation',
            'Uses proper task syntax'
          ],
          responseQuality: [
            'Identifies specific security vulnerabilities',
            'Explains why each issue is problematic',
            'Provides concrete solutions'
          ],
          domainExpertise: [
            'Demonstrates knowledge of OWASP top 10',
            'Suggests security best practices',
            'Uses appropriate security terminology'
          ]
        },
        evaluationMetrics: [
          'vulnerability_detection_accuracy',
          'solution_quality',
          'security_knowledge',
          'task_execution_success',
          'response_clarity'
        ],
        context: {
          files: [
            {
              name: 'auth.js',
              content: `
function authenticateUser(username, password) {
  const query = "SELECT * FROM users WHERE username='" + username + "' AND password='" + password + "'";
  const result = db.query(query);
  if (result.length > 0) {
    document.innerHTML = "Welcome " + username + "!";
    return true;
  }
  return false;
}
              `
            }
          ],
          projectType: 'web-application',
          requirements: ['Identify security vulnerabilities', 'Provide secure alternatives']
        }
      },
      
      {
        id: 'code-review-performance',
        name: 'Performance Optimization Review',
        description: 'Review React component with performance issues',
        agentType: AgentType.CODE_REVIEWER,
        difficulty: 'medium',
        estimatedDuration: '4-6 minutes',
        conversation: [
          {
            role: 'user',
            message: 'This React component is causing performance issues. Can you analyze it and suggest optimizations?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['performance_analysis'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',  
            message: 'Please implement the optimized version with your suggestions.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates performance analysis report',
            'Creates optimized component implementation'
          ],
          responseQuality: [
            'Identifies specific performance bottlenecks',
            'Explains optimization strategies',
            'Provides measurable improvements'
          ],
          domainExpertise: [
            'Demonstrates React performance knowledge',
            'Suggests appropriate optimization techniques',
            'Considers rendering patterns'
          ]
        },
        evaluationMetrics: [
          'performance_issue_identification',
          'optimization_effectiveness',
          'react_expertise',
          'implementation_quality'
        ],
        context: {
          files: [
            {
              name: 'UserList.jsx',
              content: `
import React from 'react';

const UserList = ({ users, onUserClick }) => {
  return (
    <div>
      {users.map(user => (
        <div key={user.id} onClick={() => onUserClick(user)}>
          <img src={user.avatar} alt={user.name} />
          <div>
            <h3>{user.name}</h3>
            <p>{user.email}</p>
            <div>{calculateUserScore(user)}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

function calculateUserScore(user) {
  // Expensive calculation
  let score = 0;
  for (let i = 0; i < 10000; i++) {
    score += Math.random() * user.posts.length;
  }
  return score;
}

export default UserList;
              `
            }
          ]
        }
      }
    ];
  }
  
  private getDocumentationScenarios(): EvaluationScenario[] {
    return [
      {
        id: 'api-documentation',
        name: 'API Documentation Generation',
        description: 'Create comprehensive API documentation for REST endpoints',
        agentType: AgentType.DOCUMENTATION,
        difficulty: 'medium',
        estimatedDuration: '6-10 minutes',
        conversation: [
          {
            role: 'user',
            message: 'I need comprehensive API documentation for our user management endpoints. Can you analyze the code and create proper documentation?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['documentation_generation'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Great! Can you also create a separate file with usage examples and integrate it with the main documentation?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE', 'EDIT_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates comprehensive API documentation',
            'Creates usage examples file',
            'Links documentation files appropriately'
          ],
          responseQuality: [
            'Documents all endpoints thoroughly',
            'Includes request/response examples',
            'Provides clear usage instructions'
          ],
          domainExpertise: [
            'Follows API documentation best practices',
            'Uses appropriate documentation format',
            'Includes error handling examples'
          ]
        },
        evaluationMetrics: [
          'documentation_completeness',
          'clarity_and_structure',
          'technical_accuracy',
          'usability'
        ],
        context: {
          files: [
            {
              name: 'userController.js',
              content: `
const User = require('../models/User');

/**
 * Get all users
 */
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Get user by ID
 */
exports.getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * Create new user
 */
exports.createUser = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    const user = new User({ username, email, password });
    await user.save();
    res.status(201).json({ id: user._id, username: user.username, email: user.email });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Update user
 */
exports.updateUser = async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

/**
 * Delete user
 */
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
              `
            }
          ],
          projectType: 'rest-api',
          requirements: ['OpenAPI format', 'Include examples', 'Error documentation']
        }
      },
      
      {
        id: 'readme-creation',
        name: 'Project README Creation',
        description: 'Create comprehensive README for open source project',
        agentType: AgentType.DOCUMENTATION,
        difficulty: 'easy',
        estimatedDuration: '4-7 minutes',
        conversation: [
          {
            role: 'user',
            message: 'I need a professional README.md for my Node.js CLI tool project. It should include installation, usage examples, and contribution guidelines.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['documentation_generation'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Perfect! Can you also add a contributing guide and update the README to reference it?'
          },
          {
            role: 'agent', 
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE', 'EDIT_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates comprehensive README.md',
            'Creates CONTRIBUTING.md',
            'Links files appropriately'
          ],
          responseQuality: [
            'Includes all standard README sections',
            'Provides clear installation instructions',
            'Shows practical usage examples'
          ],
          domainExpertise: [
            'Follows README best practices',
            'Uses appropriate markdown formatting',
            'Includes badges and links'
          ]
        },
        evaluationMetrics: [
          'documentation_structure',
          'markdown_quality',
          'completeness',
          'user_friendliness'
        ],
        context: {
          files: [
            {
              name: 'package.json',
              content: `{
  "name": "file-organizer-cli",
  "version": "1.0.0",
  "description": "A powerful CLI tool to organize files automatically",
  "main": "index.js",
  "bin": {
    "organize": "./bin/organize.js"
  },
  "scripts": {
    "test": "jest",
    "start": "node bin/organize.js"
  },
  "keywords": ["cli", "file-organization", "automation"],
  "author": "Your Name",
  "license": "MIT"
}`
            }
          ],
          projectType: 'cli-tool',
          requirements: ['Installation guide', 'Usage examples', 'Contributing guidelines']
        }
      }
    ];
  }
  
  private getDevOpsScenarios(): EvaluationScenario[] {
    return [
      {
        id: 'docker-setup',
        name: 'Docker Containerization',
        description: 'Create Docker setup for Node.js application',
        agentType: AgentType.DEVOPS,
        difficulty: 'medium',
        estimatedDuration: '7-12 minutes',
        conversation: [
          {
            role: 'user',
            message: 'I need to containerize my Node.js Express application. Can you create a production-ready Dockerfile and docker-compose setup?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['infrastructure_setup'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Great! Now can you also create a CI/CD pipeline configuration for GitHub Actions that builds and pushes the Docker image?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['ci_cd_setup'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Perfect! Can you also add health checks and create a deployment script for production?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['EDIT_FILE', 'CREATE_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates optimized Dockerfile',
            'Creates docker-compose.yml',
            'Creates GitHub Actions workflow',
            'Creates deployment scripts'
          ],
          responseQuality: [
            'Follows Docker best practices',
            'Includes proper security measures',
            'Optimizes for production use'
          ],
          domainExpertise: [
            'Demonstrates Docker expertise',
            'Understands CI/CD principles',
            'Considers production requirements'
          ]
        },
        evaluationMetrics: [
          'docker_best_practices',
          'security_considerations',
          'production_readiness',
          'ci_cd_quality'
        ],
        context: {
          files: [
            {
              name: 'package.json',
              content: `{
  "name": "express-api",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "jest"
  },
  "dependencies": {
    "express": "^4.18.0",
    "mongoose": "^6.0.0",
    "cors": "^2.8.5",
    "helmet": "^5.0.0"
  },
  "devDependencies": {
    "nodemon": "^2.0.0",
    "jest": "^28.0.0"
  }
}`
            }
          ],
          projectType: 'express-api',
          requirements: ['Production-ready', 'Security focused', 'Automated deployment']
        }
      }
    ];
  }
  
  private getTestingScenarios(): EvaluationScenario[] {
    return [
      {
        id: 'unit-test-suite',
        name: 'Comprehensive Unit Test Creation',
        description: 'Create complete unit test suite for utility functions',
        agentType: AgentType.TESTING,
        difficulty: 'medium',
        estimatedDuration: '8-12 minutes',
        conversation: [
          {
            role: 'user',
            message: 'I need a comprehensive unit test suite for my utility functions. Please analyze the code and create thorough tests with edge cases.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['test_generation'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Excellent! Can you also create integration tests and a test configuration file?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Perfect! Can you also add performance benchmarks for the utility functions?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['test_generation'],
            expectedFileOperations: ['CREATE_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates comprehensive unit tests',
            'Creates integration tests',
            'Creates test configuration',
            'Creates performance benchmarks'
          ],
          responseQuality: [
            'Tests cover all edge cases',
            'Includes proper test descriptions',
            'Uses appropriate test structure'
          ],
          domainExpertise: [
            'Follows testing best practices',
            'Uses appropriate testing framework',
            'Includes performance considerations'
          ]
        },
        evaluationMetrics: [
          'test_coverage_completeness',
          'edge_case_handling',
          'test_structure_quality',
          'testing_expertise'
        ],
        context: {
          files: [
            {
              name: 'utils.js',
              content: `
/**
 * Validates email format
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.toLowerCase());
}

/**
 * Formats currency with proper locale
 */
function formatCurrency(amount, currency = 'USD', locale = 'en-US') {
  if (typeof amount !== 'number' || isNaN(amount)) {
    throw new Error('Invalid amount');
  }
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency
  }).format(amount);
}

/**
 * Deep clones an object
 */
function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
}

/**
 * Debounces a function
 */
function debounce(func, delay) {
  if (typeof func !== 'function') {
    throw new Error('First argument must be a function');
  }
  if (typeof delay !== 'number' || delay < 0) {
    throw new Error('Delay must be a positive number');
  }
  
  let timeoutId;
  return function(...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}

module.exports = { validateEmail, formatCurrency, deepClone, debounce };
              `
            }
          ],
          projectType: 'utility-library',
          requirements: ['100% test coverage', 'Edge case testing', 'Performance benchmarks']
        }
      }
    ];
  }
  
  private getSoftwareEngineerScenarios(): EvaluationScenario[] {
    return [
      {
        id: 'feature-implementation',
        name: 'Complete Feature Implementation',
        description: 'Implement a user authentication system with middleware and validation',
        agentType: AgentType.SOFTWARE_ENGINEER,
        difficulty: 'hard',
        estimatedDuration: '15-25 minutes',
        conversation: [
          {
            role: 'user',
            message: 'I need to implement a complete user authentication system for my Express.js API. This should include registration, login, JWT tokens, password hashing, and authentication middleware.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['feature_implementation'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Great start! Now can you create the authentication middleware and update the user routes to use it?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE', 'EDIT_FILE']
          },
          {
            role: 'user',
            message: 'Perfect! Can you also add input validation, error handling, and create a complete user management controller?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE', 'EDIT_FILE']
          },
          {
            role: 'user',
            message: 'Excellent work! Finally, can you create comprehensive tests for the authentication system?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['test_generation'],
            expectedFileOperations: ['CREATE_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates authentication controller',
            'Creates authentication middleware',
            'Creates user model/schema',
            'Creates route handlers',
            'Creates validation middleware',
            'Creates comprehensive tests'
          ],
          responseQuality: [
            'Implements secure password hashing',
            'Uses proper JWT implementation',
            'Includes comprehensive error handling',
            'Follows Express.js best practices'
          ],
          domainExpertise: [
            'Demonstrates security best practices',
            'Shows understanding of authentication flows',
            'Uses appropriate libraries and patterns',
            'Implements proper validation'
          ]
        },
        evaluationMetrics: [
          'implementation_completeness',
          'security_practices',
          'code_quality',
          'architecture_design',
          'testing_coverage'
        ],
        context: {
          projectType: 'express-api',
          requirements: [
            'JWT-based authentication',
            'Password hashing with bcrypt',
            'Input validation',
            'Error handling',
            'Comprehensive testing'
          ]
        }
      },
      
      {
        id: 'bug-fix-investigation',
        name: 'Complex Bug Investigation and Fix',
        description: 'Investigate and fix a memory leak in a data processing system',
        agentType: AgentType.SOFTWARE_ENGINEER,
        difficulty: 'hard',
        estimatedDuration: '12-18 minutes',
        conversation: [
          {
            role: 'user',
            message: 'Our data processing system has a memory leak that causes crashes after processing large datasets. Can you analyze the code and identify the issue?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['bug_analysis'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Great analysis! Can you implement the fix and add monitoring to prevent similar issues?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['EDIT_FILE', 'CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Perfect! Can you also create a test that reproduces the original issue to prevent regression?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['test_generation'],
            expectedFileOperations: ['CREATE_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates detailed bug analysis report',
            'Fixes the memory leak',
            'Adds monitoring/logging',
            'Creates regression tests'
          ],
          responseQuality: [
            'Identifies root cause accurately',
            'Explains technical details clearly',
            'Provides comprehensive solution'
          ],
          domainExpertise: [
            'Demonstrates debugging expertise',
            'Shows memory management knowledge',
            'Uses appropriate testing strategies'
          ]
        },
        evaluationMetrics: [
          'bug_identification_accuracy',
          'solution_effectiveness',
          'debugging_methodology',
          'prevention_measures'
        ],
        context: {
          files: [
            {
              name: 'dataProcessor.js',
              content: `
const EventEmitter = require('events');
const fs = require('fs');

class DataProcessor extends EventEmitter {
  constructor() {
    super();
    this.processedData = [];
    this.cache = new Map();
    this.workers = [];
  }

  async processFile(filePath) {
    const data = await fs.promises.readFile(filePath, 'utf8');
    const lines = data.split('\n');
    
    for (const line of lines) {
      const worker = this.createWorker();
      this.workers.push(worker);
      
      const processed = await this.processLine(line);
      this.processedData.push(processed);
      this.cache.set(line, processed);
      
      this.emit('lineProcessed', processed);
    }
    
    return this.processedData;
  }
  
  createWorker() {
    const worker = {
      id: Math.random(),
      data: new Array(10000).fill(0),
      process: (input) => {
        // Simulate heavy processing
        return input.toUpperCase();
      }
    };
    return worker;
  }
  
  async processLine(line) {
    if (this.cache.has(line)) {
      return this.cache.get(line);
    }
    
    // Simulate async processing
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(line.trim().toUpperCase());
      }, 10);
    });
  }
  
  getStats() {
    return {
      processedCount: this.processedData.length,
      cacheSize: this.cache.size,
      workerCount: this.workers.length
    };
  }
}

module.exports = DataProcessor;
              `
            }
          ],
          projectType: 'data-processing',
          requirements: ['Fix memory leak', 'Add monitoring', 'Prevent regression']
        }
      }
    ];
  }
  
  private getCustomAgentScenarios(): EvaluationScenario[] {
    return [
      {
        id: 'note-taking-assistant',
        name: 'Personal Note-Taking Assistant',
        description: 'Multi-turn note-taking and organization scenario',
        agentType: AgentType.CUSTOM,
        difficulty: 'easy',
        estimatedDuration: '5-8 minutes',
        conversation: [
          {
            role: 'user',
            message: 'Be my note-taking assistant. I need you to capture my thoughts and organize them properly.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['note_setup'],
            expectedFileOperations: ['CREATE_FILE']
          },
          {
            role: 'user',
            message: 'Write this down: I need to research AI model performance benchmarks for our next project meeting on Friday.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['note_taking'],
            expectedFileOperations: ['EDIT_FILE']
          },
          {
            role: 'user',
            message: 'Also capture this: Call Sarah about the budget approval - priority high, deadline Tuesday.'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['note_taking'],
            expectedFileOperations: ['EDIT_FILE']
          },
          {
            role: 'user',
            message: 'Can you organize these notes by priority and create a task list for me?'
          },
          {
            role: 'agent',
            message: '',
            expectedTaskTypes: ['file_operations'],
            expectedFileOperations: ['CREATE_FILE', 'EDIT_FILE']
          }
        ],
        successCriteria: {
          taskExecution: [
            'Creates initial note file',
            'Successfully adds new notes',
            'Organizes notes by priority',
            'Creates structured task list'
          ],
          responseQuality: [
            'Maintains consistent format',
            'Preserves all information',
            'Adds helpful structure'
          ],
          domainExpertise: [
            'Demonstrates organization skills',
            'Shows understanding of note-taking patterns',
            'Creates useful categorization'
          ]
        },
        evaluationMetrics: [
          'note_organization_quality',
          'information_preservation',
          'task_execution_consistency',
          'user_experience'
        ],
        context: {
          projectType: 'personal-assistant',
          requirements: ['Organize thoughts', 'Maintain structure', 'Easy retrieval']
        }
      }
    ];
  }
}