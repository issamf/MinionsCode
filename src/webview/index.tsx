import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// Get the VS Code API
declare global {
  interface Window {
    acquireVsCodeApi(): any;
  }
}

const vscode = window.acquireVsCodeApi();

// Make vscode API available to the app
(window as any).vscode = vscode;

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}