import '@fontsource-variable/unbounded';
import '@fontsource-variable/onest';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppRoutes } from './AppRoutes';
import { applyEasyClass } from './easy-mode';
import { EasyModeRoot } from './EasyModeRoot';
import { ErrorBoundary } from './ErrorBoundary';
import { applyThemeClass } from './theme-mode';
import { ThemeRoot } from './ThemeRoot';
import { initLocale } from './locales/choose';
import { LocaleRoot } from './locales/LocaleRoot';
import { installStaleChunkReload } from './stale-chunk';

const root = document.getElementById('root');
if (root === null) throw new Error('root element is missing');

// Сервіс-воркер для пушів і кешу оболонки застосунку (32), лише в збірці: у vite dev файла sw.js немає.
if (import.meta.env.PROD && 'serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js').catch(() => undefined);

// Після деплою стара вкладка може просити чанк, якого вже немає: перезавантажуємося один раз (32).
installStaleChunkReload();

// «Легкий режим» (31): клас на <html> ще до першого рендеру — сторінка не блимає звичайним розміром.
applyEasyClass(window.location.pathname);
// Тема: перший клас ставить скрипт в index.html ще до стилів; тут — те саме з модуля (і колір рядка стану).
applyThemeClass();

// Мова з localStorage чи браузера вантажиться до першого рендеру: сторінка не блимає українською.
void initLocale().then(() =>
  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <LocaleRoot>
          <BrowserRouter>
            <EasyModeRoot />
            <ThemeRoot />
            <AppRoutes />
          </BrowserRouter>
        </LocaleRoot>
      </ErrorBoundary>
    </StrictMode>,
  ),
);
