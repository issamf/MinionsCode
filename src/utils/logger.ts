import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

class FileLogger {
  private logPath: string;
  
  constructor() {
    // Create log file in temp directory
    this.logPath = path.join(os.tmpdir(), 'ai-agents-debug.log');
    this.log('=== AI AGENTS DEBUG SESSION STARTED ===');
  }
  
  log(message: string, data?: any) {
    const timestamp = new Date().toISOString();
    const logEntry = data 
      ? `[${timestamp}] ${message} ${JSON.stringify(data, null, 2)}\n`
      : `[${timestamp}] ${message}\n`;
    
    // In test environment, write to test-debug.log for visibility since console might be suppressed
    if (process.env.NODE_ENV === 'test') {
      try {
        const testLogPath = path.join(os.tmpdir(), 'test-debug.log');
        fs.appendFileSync(testLogPath, `[DEBUGLOGGER] ${logEntry}`);
      } catch (testError) {
        // Ignore test logging errors
      }
    } else {
      // Log to console only in non-test environment
      if (data) {
        console.log(`[${timestamp}] ${message}`, data);
      } else {
        console.log(`[${timestamp}] ${message}`);
      }
    }
    
    try {
      fs.appendFileSync(this.logPath, logEntry);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test') {
        console.error('Failed to write to log file:', error);
      }
    }
  }
  
  getLogPath(): string {
    return this.logPath;
  }
  
  clearLog() {
    try {
      fs.writeFileSync(this.logPath, '');
      this.log('=== LOG CLEARED ===');
    } catch (error) {
      console.error('Failed to clear log file:', error);
    }
  }
}

export const debugLogger = new FileLogger();