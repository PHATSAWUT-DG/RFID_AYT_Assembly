import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { backendApi } from './config/instance';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('#root missing in index.html');

const root = ReactDOM.createRoot(rootElement);
const renderApp = () => root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Inline env check + dynamic import let the production build drop the whole mocks tree.
// Render waits for the install, so no request can reach the real backend in mock mode.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK === 'true') {
  void import('./mocks').then(({ installMockMode }) => {
    installMockMode(backendApi);
    renderApp();
  });
} else {
  renderApp();
}

reportWebVitals();
