import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { ErrorBoundary } from './ErrorBoundary';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

// Сервіс-воркер лише для пушів і лише в збірці: у vite dev файла sw.js немає.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);

createRoot(root).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
);
