import '@fontsource-variable/onest';
import '@fontsource-variable/unbounded';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { startBackgroundSync } from './lib/store';

registerSW({ immediate: true });
startBackgroundSync();

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
