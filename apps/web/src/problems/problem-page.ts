import { PROBLEM_BROWSER_MAX, cleanPagePath, type ProblemPage } from '@quiz/shared';
import { currentLocale } from '../locales/current';
import { lightThemeOn } from '../theme-mode';

/** Сторона екрана для схеми сервера: від 2 до 5 цифр. */
function side(value: number): number {
  return Math.min(99_999, Math.max(10, Math.round(Number.isFinite(value) ? value : 0)));
}

/**
 * Відомості про сторінку до скарги (64): лише шлях (без `?` і `#` — там бувають коди доступу), браузер,
 * розмір вікна, мова й тема. `from` — сторінка, з якої людина прийшла на /report.
 */
export function pageSnapshot(from: string): ProblemPage {
  return {
    path: cleanPagePath(from),
    browser: navigator.userAgent.slice(0, PROBLEM_BROWSER_MAX),
    screen: `${side(window.innerWidth)}x${side(window.innerHeight)}`,
    lang: currentLocale(),
    theme: lightThemeOn() ? 'light' : 'dark',
  };
}
