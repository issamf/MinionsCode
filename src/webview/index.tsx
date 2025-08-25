console.log('=== WEBVIEW INDEX.TSX LOADING ===');
console.log('Document ready state:', document.readyState);

import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

console.log('=== IMPORTS LOADED SUCCESSFULLY ===');

// Get the VS Code API
declare global {
  interface Window {
    acquireVsCodeApi(): any;
  }
}

console.log('=== ACQUIRING VSCODE API ===');
const vscode = window.acquireVsCodeApi();
console.log('VSCode API acquired:', !!vscode);

// Make vscode API available to the app
(window as any).vscode = vscode;

console.log('=== FINDING ROOT CONTAINER ===');
const container = document.getElementById('root');
console.log('Root container found:', !!container);

if (container) {
  console.log('=== CREATING REACT ROOT ===');
  const root = createRoot(container);
  console.log('React root created, rendering App component');
  root.render(<App />);
  console.log('App component rendered');
} else {
  console.error('ERROR: Root container not found');
}