import type { Locale } from '@quiz/shared';

/**
 * Слова таблиці вікторини для всіх мов одразу: імпорт має розуміти заголовки й назви типів будь-якої мови,
 * тож вони живуть окремо від i18n (той самий підхід, що й push/push-strings.ts). [0] — каноничне слово,
 * його пише експорт мовою інтерфейсу; решта — синоніми для імпорту.
 */
export type ColumnKey = 'round' | 'type' | 'question' | 'answer' | 'option' | 'points' | 'timer' | 'hint' | 'explanation';
export type TableType = 'single' | 'boolean' | 'text' | 'numeric';

export interface TableWords {
  columns: Record<ColumnKey, string[]>;
  types: Record<TableType, string[]>;
  yes: string[];
  no: string[];
}

export const TABLE_WORDS: Record<Locale, TableWords> = {
  uk: {
    columns: {
      round: ['Раунд'],
      type: ['Тип'],
      question: ['Запитання', 'Питання'],
      answer: ['Правильна відповідь', 'Відповідь'],
      option: ['Варіант'],
      points: ['Бали', 'Очки'],
      timer: ['Таймер (с)', 'Таймер', 'Час'],
      hint: ['Підказка'],
      explanation: ['Пояснення'],
    },
    types: {
      single: ['варіанти', 'варіант'],
      boolean: ['так-ні', 'так/ні', 'так або ні'],
      text: ['текст'],
      numeric: ['число'],
    },
    yes: ['так'],
    no: ['ні'],
  },
  en: {
    columns: {
      round: ['Round'],
      type: ['Type'],
      question: ['Question'],
      answer: ['Correct answer', 'Answer'],
      option: ['Option'],
      points: ['Points'],
      timer: ['Timer (s)', 'Timer', 'Time'],
      hint: ['Hint'],
      explanation: ['Explanation'],
    },
    types: {
      single: ['choice', 'options', 'single'],
      boolean: ['yes-no', 'yes/no', 'yes or no', 'boolean'],
      text: ['text'],
      numeric: ['number', 'numeric'],
    },
    yes: ['yes'],
    no: ['no'],
  },
  pl: {
    columns: {
      round: ['Runda'],
      type: ['Typ'],
      question: ['Pytanie'],
      answer: ['Poprawna odpowiedź', 'Odpowiedź'],
      option: ['Opcja', 'Wariant'],
      points: ['Punkty'],
      timer: ['Czasomierz (s)', 'Czasomierz', 'Czas'],
      hint: ['Podpowiedź'],
      explanation: ['Wyjaśnienie'],
    },
    types: {
      single: ['wybór', 'wybor'],
      boolean: ['tak-nie', 'tak/nie', 'tak lub nie'],
      text: ['tekst'],
      numeric: ['liczba'],
    },
    yes: ['tak'],
    no: ['nie'],
  },
  de: {
    columns: {
      round: ['Runde'],
      type: ['Typ'],
      question: ['Frage'],
      answer: ['Richtige Antwort', 'Antwort'],
      option: ['Option', 'Variante'],
      points: ['Punkte'],
      timer: ['Timer (s)', 'Timer', 'Zeit'],
      hint: ['Hinweis'],
      explanation: ['Erklärung'],
    },
    types: {
      single: ['auswahl', 'optionen'],
      boolean: ['ja-nein', 'ja/nein', 'ja oder nein'],
      text: ['text'],
      numeric: ['zahl'],
    },
    yes: ['ja'],
    no: ['nein'],
  },
  es: {
    columns: {
      round: ['Ronda'],
      type: ['Tipo'],
      question: ['Pregunta'],
      answer: ['Respuesta correcta', 'Respuesta'],
      option: ['Opción', 'Opcion'],
      points: ['Puntos'],
      timer: ['Temporizador (s)', 'Temporizador', 'Tiempo'],
      hint: ['Pista'],
      explanation: ['Explicación'],
    },
    types: {
      single: ['opciones', 'elección'],
      boolean: ['sí-no', 'si-no', 'sí/no', 'sí o no'],
      text: ['texto'],
      numeric: ['número', 'numero'],
    },
    yes: ['sí', 'si'],
    no: ['no'],
  },
  it: {
    columns: {
      round: ['Round'],
      type: ['Tipo'],
      question: ['Domanda'],
      answer: ['Risposta corretta', 'Risposta'],
      option: ['Opzione', 'Variante'],
      points: ['Punti'],
      timer: ['Timer (s)', 'Timer', 'Tempo'],
      hint: ['Suggerimento'],
      explanation: ['Spiegazione'],
    },
    types: {
      single: ['opzioni', 'scelta'],
      boolean: ['sì-no', 'si-no', 'sì/no', 'sì o no'],
      text: ['testo'],
      numeric: ['numero'],
    },
    yes: ['sì', 'si'],
    no: ['no'],
  },
  ar: {
    columns: {
      round: ['الجولة'],
      type: ['النوع'],
      question: ['السؤال'],
      answer: ['الإجابة الصحيحة', 'الإجابة'],
      option: ['الخيار'],
      points: ['النقاط'],
      timer: ['المؤقت (ث)', 'المؤقت', 'الوقت'],
      hint: ['تلميح'],
      explanation: ['الشرح'],
    },
    types: {
      single: ['اختيار من متعدد', 'خيارات'],
      boolean: ['نعم/لا', 'صح/خطأ', 'نعم أو لا'],
      text: ['نص'],
      numeric: ['رقم', 'عدد'],
    },
    yes: ['نعم', 'صح'],
    no: ['لا', 'خطأ'],
  },
};

/** NFC, нижній регістр, пробіли (зокрема нерозривні) згорнуто, хвіст у дужках «(с)» прибрано. */
export function normalizeWord(value: string): string {
  return value
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*[(（][^)）]*[)）]$/, '')
    .trim();
}
