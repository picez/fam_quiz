import { sessionMap } from './session-map';

const scrolls = sessionMap<number>('quiz.nav.scroll', 100);

export function saveScroll(key: string, y: number): void {
  scrolls.set(key, Math.max(0, Math.round(y)));
}

export function savedScroll(key: string): number | null {
  return scrolls.get(key) ?? null;
}

export function forgetScrolls(): void {
  scrolls.clear();
}

/** Миттєво, без плавної прокрутки: «зменшити рух» дотримано завжди. */
export function scrollToY(y: number): void {
  window.scrollTo({ top: y, left: 0, behavior: 'instant' });
}

/**
 * Повертає прокрутку після «назад»: сторінка може ще вантажитися, тож пробуємо щокадру до 2 с, доки документ
 * не стане досить високим. Будь-яке втручання людини зупиняє спроби. Повертає функцію зупинки.
 */
export function restoreScroll(y: number, limitMs = 2000): () => void {
  const until = performance.now() + limitMs;
  let frame = 0;
  let stopped = false;
  const events = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    for (const name of events) window.removeEventListener(name, stop);
  };
  const step = () => {
    if (stopped) return;
    const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    scrollToY(Math.min(y, max));
    if (max >= y || performance.now() > until) return stop();
    frame = requestAnimationFrame(step);
  };
  for (const name of events) window.addEventListener(name, stop, { passive: true });
  step();
  return stop;
}
