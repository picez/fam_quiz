import { useEffect, useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { recordStep, type Spot } from './nav-trail';
import { documentTitleFor, isGamePath, tabGroup } from './page-meta';
import { restoreScroll, saveScroll, savedScroll, scrollToY } from './scroll-memory';

/** Скільки кадрів чекати на заголовок сторінки, що ще вантажиться (лінивий чанк, дані), перш ніж узяти <main>. */
const FOCUS_FRAMES = 120;

/** Фокус на елемент без власного tabindex: робимо його фокусованим програмно, без рамки (data-route-focus). */
function focusQuietly(element: HTMLElement): void {
  if (!element.hasAttribute('tabindex')) {
    element.setAttribute('tabindex', '-1');
    element.setAttribute('data-route-focus', '');
  }
  element.focus({ preventScroll: true });
}

/**
 * Фокус на нову сторінку (для читачів екрана): перший h1 у <main>, а поки його немає — чекаємо до FOCUS_FRAMES кадрів,
 * тоді сам <main>. Якщо сторінка вже поставила фокус у своє поле (autofocus) — не чіпаємо. Вкладка тієї самої сторінки
 * (tabbed) фокус на заголовок не переносить: лише повертає загублений фокус на активну вкладку.
 */
function focusPage(tabbed: boolean): () => void {
  let frame = 0;
  let tries = 0;
  let stopped = false;
  const events = ['keydown', 'pointerdown'] as const;
  const stop = () => {
    stopped = true;
    cancelAnimationFrame(frame);
    for (const name of events) window.removeEventListener(name, stop, true);
  };
  const attempt = () => {
    if (stopped) return;
    const main = document.querySelector('main');
    const active = document.activeElement;
    const lost = active === null || active === document.body || !active.isConnected;
    if (main !== null && active instanceof HTMLElement && active !== main && main.contains(active)) return stop();
    if (tabbed) {
      const tab = main?.querySelector<HTMLElement>('a[aria-current="page"]');
      if (lost && tab) tab.focus({ preventScroll: true });
      return stop();
    }
    const heading = main?.querySelector<HTMLElement>('h1');
    if (heading) {
      focusQuietly(heading);
      return stop();
    }
    tries += 1;
    if (tries < FOCUS_FRAMES) {
      frame = requestAnimationFrame(attempt);
      return;
    }
    if (main !== null) focusQuietly(main);
    stop();
  };
  for (const name of events) window.addEventListener(name, stop, true);
  attempt();
  return stop;
}

/**
 * Що відбувається на кожен перехід (76): заголовок вкладки, слід «звідки прийшли», прокрутка й фокус.
 * Стоїть у AppRoutes перед <Routes>: його ефекти йдуть раніше за ефекти сторінки (useDocumentTitle уточнює назву),
 * а прибирання layout-ефекту — ще до того, як нова сторінка змінить DOM (тож прокрутка старої сторінки ще справжня).
 * Ігрові екрани не чіпаємо: ні прокрутки, ні фокуса.
 */
export function RouteEffects(): null {
  const location = useLocation();
  const action = useNavigationType();
  const { key, pathname, search } = location;
  const prev = useRef<Spot | null>(null);
  const pending = useRef<Array<() => void>>([]);

  useEffect(() => {
    document.title = documentTitleFor(pathname);
  }, [pathname]);

  // Прокрутка сторінки, яку покидаємо: до змін DOM (прибирання layout-ефекту) і перед вивантаженням вкладки.
  useLayoutEffect(() => {
    if (isGamePath(pathname)) return;
    const save = () => saveScroll(key, window.scrollY);
    window.addEventListener('pagehide', save);
    return () => {
      window.removeEventListener('pagehide', save);
      save();
    };
  }, [key, pathname]);

  useEffect(() => {
    const was = prev.current;
    // StrictMode повторює ефект для того самого запису: це не перехід.
    if (was !== null && was.key === key) return;
    const here: Spot = { key, pathname, search };
    prev.current = here;
    recordStep(was, here, action);
    for (const stop of pending.current) stop();
    pending.current = [];

    if (isGamePath(pathname)) {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'auto';
      return;
    }
    if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

    const saved = savedScroll(key);
    if (was === null) {
      // Перезавантаження: повертаємо прокрутку самі (браузер — у ручному режимі). Фокус на першому відкритті не крадемо.
      if (action === 'POP' && saved !== null && saved > 0) pending.current.push(restoreScroll(saved));
      return;
    }
    const samePage = was.pathname === pathname;
    if (action === 'POP') {
      if (saved !== null) pending.current.push(restoreScroll(saved));
      else if (!samePage) scrollToY(0);
    } else if (!samePage) {
      scrollToY(0);
    }
    if (samePage) return;
    const group = tabGroup(pathname);
    pending.current.push(focusPage(group !== null && group === tabGroup(was.pathname)));
    // Лише на зміну запису історії: решта значень — з тієї самої location.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(
    () => () => {
      for (const stop of pending.current) stop();
    },
    [],
  );

  return null;
}
