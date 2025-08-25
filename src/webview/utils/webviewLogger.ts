class WebviewLogger {
  private vscode: any;
  
  constructor() {
    this.vscode = (window as any).vscode;
  }
  
  log(message: string, data?: any) {
    // Send log message to extension
    this.vscode?.postMessage({
      type: 'webviewLog',
      data: {
        message,
        data,
        timestamp: new Date().toISOString()
      }
    });
  }
}

export const webviewLogger = new WebviewLogger();