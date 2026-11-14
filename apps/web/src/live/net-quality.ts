/**
 * Якість зв'язку з сервером гри (32): чиста модель без таймерів. useGame шле net:ping кожні NET_PING_EVERY_MS і
 * передає сюди час відгуку або тайм-аут.
 *
 * weak: медіана трьох останніх відгуків понад WEAK_RTT_MS або серед трьох останніх є тайм-аут;
 * good знову: три відгуки поспіль швидші за GOOD_RTT_MS (гістерезис, щоб плашка не блимала).
 * Поки сервер жодного разу не відповів на пінг (старий сервер під час деплою), тайм-аути нічого не означають.
 */
export const NET_PING_EVERY_MS = 5000;
export const NET_PING_TIMEOUT_MS = 3000;
export const WEAK_RTT_MS = 800;
export const GOOD_RTT_MS = 500;
export const FORCE_RECONNECT_AFTER = 3;
export const STALE_AFTER_MS = 15_000;

const WINDOW = 3;

export type Quality = 'good' | 'weak';
export type Sample = number | 'timeout';

export interface NetState {
  samples: Sample[];
  quality: Quality;
  supported: boolean;
  misses: number;
  lastPongAt: number | null;
}

export const initialNet: NetState = { samples: [], quality: 'good', supported: false, misses: 0, lastPongAt: null };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function judge(previous: Quality, samples: Sample[]): Quality {
  const full = samples.length === WINDOW;
  const numbers = samples.filter((sample): sample is number => sample !== 'timeout');
  if (previous === 'good') {
    const weak = numbers.length < samples.length || (full && median(numbers) > WEAK_RTT_MS);
    return weak ? 'weak' : 'good';
  }
  const recovered = full && numbers.length === WINDOW && numbers.every((rtt) => rtt < GOOD_RTT_MS);
  return recovered ? 'good' : 'weak';
}

const keep = (samples: Sample[], next: Sample): Sample[] => [...samples, next].slice(-WINDOW);

export function onPong(state: NetState, rtt: number, at: number): NetState {
  const samples = keep(state.samples, rtt);
  return { samples, quality: judge(state.quality, samples), supported: true, misses: 0, lastPongAt: at };
}

/** Пінг без відповіді. Сервер, що ще жодного разу не відповів (старий під час деплою), стану не змінює. */
export function onTimeout(state: NetState): NetState {
  if (!state.supported) return state;
  const samples = keep(state.samples, 'timeout');
  return { ...state, samples, quality: judge(state.quality, samples), misses: state.misses + 1 };
}

/** Три пінги поспіль без відповіді: з'єднання, найпевніше, зависло — його варто перепідключити. */
export function shouldForceReconnect(state: NetState): boolean {
  return state.misses >= FORCE_RECONNECT_AFTER;
}

/** Відповіді давно не було: після повернення у вкладку з'єднання могло померти, поки телефон спав. */
export function isStale(state: NetState, now: number): boolean {
  return state.lastPongAt !== null && now - state.lastPongAt > STALE_AFTER_MS;
}

/** Нове з'єднання: вибірки й пропуски з нуля; вердикт лишається до перших даних. */
export function onReconnect(state: NetState): NetState {
  return { ...state, samples: [], misses: 0 };
}
