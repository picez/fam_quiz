import { loadEasy, saveEasy } from './storage';

/**
 * «Легкий режим» (31): більший шрифт і кнопки, чіткіші кольори, рух як за prefers-reduced-motion.
 * Вибір пристрою — quiz:easy; профіль акаунта вмикає режим лише там, де пристрій ще не вибирав.
 */

/** Вибір цієї вкладки: діє і тоді, коли сховище недоступне (приватний режим), — до перезавантаження. */
let sessionChoice: 'on' | 'off' | null = null;
/** Режим із профілю акаунта, що зараз увійшов; ключа пристрою не пише — наступний явний вибір пристрою переможе. */
let fromProfile: { accountId: string; on: boolean } | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

/** Явний вибір пристрою; null — людина ще не вибирала. */
export function loadEasyChoice(): 'on' | 'off' | null {
  return sessionChoice ?? loadEasy();
}

export function easyModeOn(): boolean {
  const choice = loadEasyChoice();
  if (choice !== null) return choice === 'on';
  return fromProfile?.on === true;
}

/** Людина сама перемкнула режим на цьому пристрої. */
export function setEasyMode(on: boolean): void {
  sessionChoice = on ? 'on' : 'off';
  saveEasy(on);
  notify();
}

export function subscribeEasyMode(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Режим профілю після GET /api/me; accountId null — вийшли з акаунта. */
export function syncAccountEasy(profileOn: boolean, accountId: string | null): void {
  const next = accountId === null ? null : { accountId, on: profileOn };
  if (next?.accountId === fromProfile?.accountId && next?.on === fromProfile?.on) return;
  fromProfile = next;
  notify();
}

/** Клас is-easy на <html>: усюди, крім сцени (вона у vw/vh має свій великий шрифт і спільна для всіх). */
export function applyEasyClass(pathname: string): void {
  document.documentElement.classList.toggle('is-easy', easyModeOn() && !pathname.startsWith('/stage/'));
}

/** Чи діє легкий режим на цій сторінці зараз. */
export function easyActive(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('is-easy');
}

export function resetEasyForTests(): void {
  sessionChoice = null;
  fromProfile = null;
}
