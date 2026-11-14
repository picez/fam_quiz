import type { PublicQuestion, StageView } from '@quiz/shared';

/** Тестова підтримка читання вголос (31): фейковий speechSynthesis і зріз сцени. */
export interface FakeSynth {
  spoken: { text: string; lang: string; voice: string | null; rate: number }[];
  cancels: number;
  /** Порожні фрази з дотику (відмикання мови на iOS). */
  unlocks: number;
  voices: SpeechSynthesisVoice[];
  /** Голоси з'явилися пізніше: оновлює список і кличе слухачів voiceschanged. */
  setVoices: (voices: { lang: string; name: string; localService?: boolean }[]) => void;
  speak: (utterance: SpeechSynthesisUtterance) => void;
  cancel: () => void;
}

const asVoice = (v: { lang: string; name: string; localService?: boolean }) =>
  ({ lang: v.lang, name: v.name, voiceURI: v.name, localService: v.localService ?? true, default: false }) as SpeechSynthesisVoice;

export function installSpeech(voices: { lang: string; name: string; localService?: boolean }[]): FakeSynth {
  const listeners = new Set<() => void>();
  const synth: FakeSynth = {
    spoken: [],
    cancels: 0,
    unlocks: 0,
    voices: voices.map(asVoice),
    setVoices(next) {
      synth.voices = next.map(asVoice);
      for (const listener of listeners) listener();
    },
    speak(utterance) {
      if (utterance.text === '') {
        synth.unlocks += 1;
        return;
      }
      synth.spoken.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.lang ?? null, rate: utterance.rate });
    },
    cancel() {
      synth.cancels += 1;
    },
  };
  const api = {
    getVoices: () => synth.voices,
    speak: (u: SpeechSynthesisUtterance) => synth.speak(u),
    cancel: () => synth.cancel(),
    pause() {},
    resume() {},
    addEventListener: (_: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
  };
  class Utterance {
    text: string;
    lang = '';
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    onend: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.defineProperty(window, 'speechSynthesis', { value: api, configurable: true, writable: true });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { value: Utterance, configurable: true, writable: true });
  return synth;
}

export function removeSpeech(): void {
  Reflect.deleteProperty(window, 'speechSynthesis');
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance');
}

export const speechQuestion = (over: Partial<PublicQuestion> = {}): PublicQuestion => ({
  type: 'single',
  text: 'Яка річка тече через Київ?',
  imageUrl: null,
  video: null,
  timeLimit: 30,
  points: 1000,
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  choices: [
    { id: 'a', text: 'Дніпро' },
    { id: 'b', text: 'Дунай' },
    { id: 'c', text: 'Десна' },
  ],
  ...over,
});

/** Зріз сцени лише з полями, які читає useStageSpeech. */
export const speechView = (over: Partial<StageView> = {}): StageView =>
  ({
    role: 'stage',
    phase: 'question',
    paused: false,
    round: { index: 0, total: 1, title: '', type: 'classic', partial: false },
    questionIndex: 0,
    question: speechQuestion(),
    bluff: null,
    reveal: null,
    ...over,
  }) as unknown as StageView;
