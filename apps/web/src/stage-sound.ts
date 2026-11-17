import { audioReady, playbackSession, quietly, sharedAudio } from './audio';

export type StageSound = 'correct' | 'wrong' | 'tick' | 'gong' | 'fanfare' | 'accent';

export interface Note {
  hz: number;
  /** Кінцева частота свіпу (експоненційно від hz); немає — рівна нота. */
  toHz?: number;
  /** Вступ від початку звуку, с. */
  at: number;
  dur: number;
  wave: OscillatorType;
  gain: number;
}

export const STAGE_SOUND_EVENT = 'quiz:stage-sound';

/** Наростання, с: без клацання на початку ноти. */
const ATTACK_S = 0.01;
/** Скільки після кінця ноти живе осцилятор до stop, с. */
const TAIL_S = 0.02;
const FLOOR = 0.0001;

export const SOUND_NOTES: Record<StageSound, Note[]> = {
  // Мажорне тризвуччя C5–E5–G5.
  correct: [
    { hz: 523.25, at: 0, dur: 0.9, wave: 'triangle', gain: 0.06 },
    { hz: 659.25, at: 0.06, dur: 0.84, wave: 'triangle', gain: 0.06 },
    { hz: 783.99, at: 0.12, dur: 0.78, wave: 'triangle', gain: 0.06 },
  ],
  // «Бу-у»: два низькі ковзні тони вниз.
  wrong: [
    { hz: 220, toHz: 165, at: 0, dur: 0.5, wave: 'triangle', gain: 0.1 },
    { hz: 165, toHz: 123, at: 0.45, dur: 0.55, wave: 'triangle', gain: 0.1 },
  ],
  tick: [{ hz: 1800, at: 0, dur: 0.05, wave: 'sine', gain: 0.06 }],
  // Негармонічні синуси з довгим згасанням.
  gong: [
    { hz: 110, at: 0, dur: 1.5, wave: 'sine', gain: 0.07 },
    { hz: 220, at: 0, dur: 1.4, wave: 'sine', gain: 0.05 },
    { hz: 293, at: 0, dur: 1.2, wave: 'sine', gain: 0.04 },
    { hz: 401, at: 0, dur: 1.0, wave: 'sine', gain: 0.03 },
  ],
  // G4–C5–E5 по одній, потім акорд C5–E5–G5–C6.
  fanfare: [
    { hz: 392, at: 0, dur: 0.15, wave: 'triangle', gain: 0.12 },
    { hz: 523.25, at: 0.15, dur: 0.15, wave: 'triangle', gain: 0.12 },
    { hz: 659.25, at: 0.3, dur: 0.15, wave: 'triangle', gain: 0.12 },
    { hz: 523.25, at: 0.45, dur: 1.6, wave: 'triangle', gain: 0.045 },
    { hz: 659.25, at: 0.45, dur: 1.6, wave: 'triangle', gain: 0.045 },
    { hz: 783.99, at: 0.45, dur: 1.6, wave: 'triangle', gain: 0.045 },
    { hz: 1046.5, at: 0.45, dur: 1.6, wave: 'triangle', gain: 0.045 },
  ],
  accent: [{ hz: 400, toHz: 1200, at: 0, dur: 0.3, wave: 'sine', gain: 0.12 }],
};

/**
 * Грає звук сцени лише через спільний контекст у стані running (розблокований жестом). Немає контексту чи він призупинений —
 * будимо його й мовчимо (запізнілий гонг гірший за тишу): false. Після розкладу шле подію quiz:stage-sound (для e2e й діагностики).
 */
export function playStageSound(sound: StageSound): boolean {
  try {
    const ctx = sharedAudio();
    if (ctx === null) return false;
    if (!audioReady()) {
      quietly(() => ctx.resume());
      return false;
    }
    playbackSession();
    const base = ctx.currentTime;
    for (const note of SOUND_NOTES[sound]) {
      const start = base + note.at;
      const end = start + note.dur;
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = note.wave;
      oscillator.frequency.setValueAtTime(note.hz, start);
      if (note.toHz !== undefined) oscillator.frequency.exponentialRampToValueAtTime(note.toHz, end);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.gain, start + ATTACK_S);
      gain.gain.exponentialRampToValueAtTime(FLOOR, end);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.onended = () => {
        try {
          oscillator.disconnect();
          gain.disconnect();
        } catch {
          // Уже від'єднано.
        }
      };
      oscillator.start(start);
      oscillator.stop(end + TAIL_S);
    }
    try {
      window.dispatchEvent(new CustomEvent(STAGE_SOUND_EVENT, { detail: sound }));
    } catch {
      // Немає window — спостерігати нікому.
    }
    return true;
  } catch {
    return false;
  }
}
