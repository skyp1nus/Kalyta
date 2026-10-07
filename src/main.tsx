import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startPrivacyWatch } from './lib/privacy';
import { startBackgroundSync } from './lib/store';
import { startUpdates } from './lib/update';
import { startViewportFix } from './lib/viewport';

startUpdates();
startPrivacyWatch();
startBackgroundSync();
startViewportFix();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
