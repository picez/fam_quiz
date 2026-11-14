import { easyActive } from './easy-mode';

/** Гравець попросив менше руху: налаштування системи або «Легкий режим» (31). */
export function reducedMotion(): boolean {
  if (easyActive()) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
