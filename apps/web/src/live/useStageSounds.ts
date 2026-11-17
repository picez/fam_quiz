import type { StageView } from '@quiz/shared';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { audioReady, audioSupported, subscribeAudio, unlockAudio } from '../audio';
import { playStageSound } from '../stage-sound';
import { loadStageSounds, saveStageSounds } from '../storage';
import { stageCues } from './stage-cues';

/** Як часто на відліку перевіряти годинник, мс: цокання не запізнюється більше ніж на десяту секунди. */
export const TICK_POLL_MS = 100;

export interface StageSoundsControl {
  /** Браузер уміє Web Audio. */
  supported: boolean;
  /** Ведучий не вимкнув звуки сцени. */
  hostOn: boolean;
  /** Звуки ввімкнено на цьому пристрої. */
  device: boolean;
  /** Звук розблоковано жестом (спільний контекст грає). */
  ready: boolean;
  unlock(): void;
  toggle(): void;
}

/**
 * Звуки сцени (40) з показаних зрізів і годинника сервера. Кожна подія має сталий ключ і грає рівно раз;
 * перший зріз після монтування лише запам'ятовується, а події, що сталися, поки звук вимкнено чи не розблоковано, не наздоганяються.
 */
export function useStageSounds(view: StageView, offsetMs: number): StageSoundsControl {
  const [device, setDevice] = useState(loadStageSounds);
  const ready = useSyncExternalStore(subscribeAudio, audioReady);
  const heard = useRef(new Set<string>());
  const prev = useRef<StageView | null>(null);
  const latest = useRef({ view, offsetMs, device });
  latest.current = { view, offsetMs, device };

  const evaluate = useCallback(() => {
    const { view: shown, offsetMs: offset, device: on } = latest.current;
    const first = prev.current === null;
    const cues = stageCues(prev.current, shown, Date.now() + offset);
    prev.current = shown;
    for (const cue of cues) {
      if (heard.current.has(cue.key)) continue;
      heard.current.add(cue.key);
      if (!first && shown.soundsOff !== true && on && audioReady()) playStageSound(cue.sound);
    }
  }, []);

  useEffect(evaluate, [view, offsetMs, evaluate]);

  const countdown = view.phase === 'question' && view.endsAt !== null && !view.paused;
  useEffect(() => {
    if (!countdown) return;
    const id = setInterval(evaluate, TICK_POLL_MS);
    return () => clearInterval(id);
  }, [countdown, view, evaluate]);

  const toggle = useCallback(() => {
    const on = !latest.current.device;
    saveStageSounds(on);
    latest.current.device = on;
    setDevice(on);
    if (on) unlockAudio();
  }, []);

  return { supported: audioSupported(), hostOn: view.soundsOff !== true, device, ready, unlock: unlockAudio, toggle };
}
