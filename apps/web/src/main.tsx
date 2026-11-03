import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { ErrorBoundary } from './ErrorBoundary';
import { initLocale } from './locales/choose';
import { LocaleRoot } from './locales/LocaleRoot';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

// Сервіс-воркер лише для пушів і лише в збірці: у vite dev файла sw.js немає.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);

// Мова з localStorage чи браузера вантажиться до першого рендеру: сторінка не блимає українською.
void initLocale().then(() =>
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <LocaleRoot>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </LocaleRoot>
      </ErrorBoundary>
    </StrictMode>,
  ),
);
