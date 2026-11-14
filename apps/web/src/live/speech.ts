import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale, PublicQuestion, StageView } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { currentLocale } from '../locales/current';

/**
 * «Читати вголос» на сцені (31): speechSynthesis читає текст запитання й варіанти — і ніколи нічого з розкриття.
 * Браузер дозволяє speak() лише після дотику людини саме на цій сторінці, тож вмикає кнопка на сцені, а не пульт.
 */

/** Темп читання: трохи повільніше звичайного — зручно дітям і старшим. */
export const SPEECH_RATE = 0.9;
/** Chrome обриває довгу фразу приблизно на 15-й секунді — ріжемо на шматки не довші за стільки символів. */
export const SPEECH_CHUNK = 180;
/** Скільки чекати голосів (вони вантажаться асинхронно), перш ніж сказати «немає голосу». */
export const VOICES_WAIT_MS = 2000;

const LATIN_UI: readonly Locale[] = ['en', 'pl', 'de', 'es', 'it'];
/** Бажаний регіон голосу для мови: український голос — uk-UA. */
const PREFERRED: Partial<Record<Locale, string>> = { uk: 'uk-ua', pl: 'pl-pl', de: 'de-de', es: 'es-es', it: 'it-it' };
const CYRILLIC = /\p{Script=Cyrillic}/u;
const ARABIC = /\p{Script=Arabic}/u;

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function';
}

/** Мова читання: кирилиця — українська, арабське письмо — арабська; інакше мова інтерфейсу з латинкою, а для uk/ar — англійська. */
export function speechLang(text: string, ui: Locale): Locale {
  if (CYRILLIC.test(text)) return 'uk';
  if (ARABIC.test(text)) return 'ar';
  return LATIN_UI.includes(ui) ? ui : 'en';
}

const voiceLang = (voice: SpeechSynthesisVoice) => voice.lang.toLowerCase().replace('_', '-');

/**
 * Голос лише тієї самої мови: «найближчого» голосу іншої мови немає. Кирилицю ніколи не читає неукраїнський голос —
 * немає українського, значить не читаємо. Спершу бажаний регіон, далі голос на пристрої (localService).
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[], lang: Locale): SpeechSynthesisVoice | null {
  const own = voices.filter((voice) => {
    const tag = voiceLang(voice);
    return tag === lang || tag.startsWith(`${lang}-`);
  });
  const preferred = PREFERRED[lang];
  const rank = (voice: SpeechSynthesisVoice) => (voiceLang(voice) === preferred ? 0 : 2) + (voice.localService ? 0 : 1);
  return [...own].sort((a, b) => rank(a) - rank(b))[0] ?? null;
}

type Text = (key: TextKey, vars?: Record<string, string | number>) => string;

/** Довгий шматок — по межах речень, а задовге речення — по пробілах. */
function chunks(text: string): string[] {
  const out: string[] = [];
  let current = '';
  const push = (piece: string) => {
    if (current === '') current = piece;
    else if (current.length + 1 + piece.length <= SPEECH_CHUNK) current = `${current} ${piece}`;
    else {
      out.push(current);
      current = piece;
    }
  };
  for (const sentence of text.split(/(?<=[.!?…])\s+/)) {
    if (sentence.length <= SPEECH_CHUNK) {
      push(sentence);
      continue;
    }
    for (const word of sentence.split(' ')) {
      if (word.length <= SPEECH_CHUNK) push(word);
      else for (let i = 0; i < word.length; i += SPEECH_CHUNK) push(word.slice(i, i + SPEECH_CHUNK));
    }
  }
  if (current !== '') out.push(current);
  return out;
}

/**
 * Що читати: текст запитання й (для single і multi) «Варіанти: А; Б; В.» — без літер A–F, бо голос читає їх дивно.
 * Лише PublicQuestion: правильної відповіді в ньому немає ніколи. null — у запитанні є звук чи відео (не заглушуємо).
 */
export function speechParts(question: PublicQuestion, text: Text = t): string[] | null {
  if (question.audio !== null || question.video !== null || question.melody !== undefined) return null;
  const clean = (value: string) =>
    value
      .replace(/_{3,}/g, ` ${text('speechBlank')} `)
      .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}/gu, '')
      .replace(/[\u{FE0F}\u{200D}]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  const pieces = [clean(question.text)];
  if (question.type === 'single' || question.type === 'multi') {
    const list = question.choices.map((choice) => clean(choice.text)).filter((choice) => choice !== '');
    if (list.length > 0) pieces.push(text('speechOptions', { list: list.join('; ') }));
  }
  return pieces.filter((piece) => piece !== '').flatMap(chunks);
}

/** Що зараз читається: «раунд:запитання» лише на етапі question; вибір блефу — ні (варіанти-вигадки не читаємо). */
export function speechKey(view: StageView): string | null {
  if (view.phase !== 'question' || view.question === null || view.bluff?.stage === 'choice') return null;
  return `${view.round?.index ?? 0}:${view.questionIndex}`;
}

export type SpeechStatus = 'off' | 'unsupported' | 'idle' | 'speaking' | 'no_voice' | 'media';

/** Голоси пристрою: приходять асинхронно (voiceschanged); ready — є голоси або чекали VOICES_WAIT_MS. */
function useVoices(active: boolean): { voices: SpeechSynthesisVoice[]; ready: boolean } {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    if (!active) return;
    const synth = window.speechSynthesis;
    const read = () => setVoices(synth.getVoices());
    read();
    synth.addEventListener('voiceschanged', read);
    const timer = setTimeout(() => setWaited(true), VOICES_WAIT_MS);
    return () => {
      synth.removeEventListener('voiceschanged', read);
      clearTimeout(timer);
    };
  }, [active]);
  return { voices, ready: voices.length > 0 || waited };
}

/**
 * Читає поточне запитання після заставки, не на паузі; замовкає на наступному запитанні, паузі, розкритті, вимкненні й демонтажі.
 * Після паузи саме не перечитує — для цього repeat() («Ще раз»).
 */
export function useStageSpeech({ view, splashing, enabled }: { view: StageView; splashing: boolean; enabled: boolean }): {
  status: SpeechStatus;
  language: Locale | null;
  repeat: () => void;
} {
  const supported = speechSupported();
  const active = supported && enabled;
  const { voices, ready } = useVoices(active);
  const key = speechKey(view);
  const question = key === null ? null : view.question;
  const parts = question === null ? null : speechParts(question);
  const language = question === null ? null : speechLang(question.text, currentLocale());
  const voice = language === null ? null : pickVoice(voices, language);
  const partsText = parts?.join('\n') ?? null;
  const spoken = useRef<string | null>(null);
  const [speaking, setSpeaking] = useState(false);

  const speak = useCallback(
    (lines: string[], chosen: SpeechSynthesisVoice) => {
      const synth = window.speechSynthesis;
      synth.cancel();
      setSpeaking(true);
      lines.forEach((line, index) => {
        const utterance = new window.SpeechSynthesisUtterance(line);
        utterance.lang = chosen.lang;
        utterance.voice = chosen;
        utterance.rate = SPEECH_RATE;
        if (index === lines.length - 1) utterance.onend = () => setSpeaking(false);
        synth.speak(utterance);
      });
    },
    [setSpeaking],
  );

  // Нове запитання (після заставки й не на паузі) читається один раз.
  useEffect(() => {
    if (!active) {
      spoken.current = null;
      return;
    }
    if (key === null || view.paused || splashing || spoken.current === key || !ready) return;
    spoken.current = key;
    if (partsText === null || voice === null) return;
    speak(partsText.split('\n'), voice);
  }, [active, key, view.paused, splashing, ready, voice, partsText, speak]);

  // Скасування: новий ключ, вихід із question (locked, reveal), пауза, вимкнення, демонтаж.
  const live = active && key !== null && !view.paused;
  useEffect(() => {
    if (!live) return;
    return () => {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    };
  }, [live, key]);

  const repeat = useCallback(() => {
    if (!live || splashing || partsText === null || voice === null) return;
    spoken.current = key;
    speak(partsText.split('\n'), voice);
  }, [live, splashing, partsText, voice, key, speak]);

  const status: SpeechStatus = !supported
    ? 'unsupported'
    : !enabled
      ? 'off'
      : key !== null && parts === null
        ? 'media'
        : key !== null && ready && voice === null
          ? 'no_voice'
          : speaking
            ? 'speaking'
            : 'idle';
  return { status, language, repeat };
}
