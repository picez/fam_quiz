import type { SplashKind, StageView } from '@quiz/shared';
import { secondsLeft } from '../clock';
import type { StageSound } from '../stage-sound';

/** Звук сцени (40) зі сталим ключем: хук грає кожен ключ рівно раз. */
export interface SoundCue {
  sound: StageSound;
  key: string;
}

/** Заставки з акцентом: без question/cell (вони на кожному запитанні) і без podium (там фанфари). */
export const ACCENT_SPLASHES: readonly SplashKind[] = ['round', 'final', 'duel', 'trial', 'blitz'];
/** На скільки раніше кінця сервер може закрити запитання «за часом», поки сцена ще не побачила нуля, мс. */
export const GONG_GRACE_MS = 1000;
/** З якої секунди до кінця цокає таймер. */
export const TICK_FROM_S = 5;

const questionKey = (view: StageView) => `${view.round?.index ?? -1}:${view.questionIndex}`;

/** Головний таймер запитання справді біжить: не пауза, не притримано, не заморожений залишок. */
const counting = (view: StageView): view is StageView & { endsAt: number } =>
  view.phase === 'question' && !view.paused && !view.held && view.remainingMs === null && view.endsAt !== null;

/**
 * Звуки, що належать показаному зрізу в мить serverNow (час сервера). prev — попередній оцінений зріз:
 * з нього видно, що сервер закрив запитання за часом раніше, ніж сцена встигла побачити нуль.
 */
export function stageCues(prev: StageView | null, view: StageView, serverNow: number): SoundCue[] {
  const cues: SoundCue[] = [];
  const q = questionKey(view);
  const { splash } = view;
  if (splash !== null && ACCENT_SPLASHES.includes(splash.kind) && serverNow < splash.until && !view.paused) {
    cues.push({ sound: 'accent', key: `splash:${splash.kind}:${splash.at}` });
  }
  if (counting(view)) {
    const left = secondsLeft(view, 0, serverNow) ?? 0;
    if (serverNow >= view.endsAt) cues.push({ sound: 'gong', key: `gong:${q}` });
    else if (left >= 1 && left <= TICK_FROM_S) cues.push({ sound: 'tick', key: `tick:${q}:${view.endsAt}:${left}` });
  } else if (prev !== null && view.phase !== 'question' && counting(prev) && questionKey(prev) === q && serverNow >= prev.endsAt - GONG_GRACE_MS) {
    cues.push({ sound: 'gong', key: `gong:${q}` });
  }
  if (view.phase === 'reveal' && view.stats !== null && view.stats.accepted !== null) {
    cues.push({ sound: view.stats.accepted > 0 ? 'correct' : 'wrong', key: `reveal:${q}` });
  }
  if (view.phase === 'finished') cues.push({ sound: 'fanfare', key: 'fanfare' });
  return cues;
}
