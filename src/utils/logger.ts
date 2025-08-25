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
    
    try {
      fs.appendFileSync(this.logPath, logEntry);
    } catch (error) {
      console.error('Failed to write to log file:', error);
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