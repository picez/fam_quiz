// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { activateLocaleForTests } from '../i18n';
import { pickVoice, speechKey, speechLang, speechLanguage, speechParts, SPEECH_CHUNK } from './speech';
import { speechQuestion, speechView } from './speech-fixtures';

const voice = (lang: string, localService = true) => ({ lang, name: lang, voiceURI: lang, localService, default: false }) as SpeechSynthesisVoice;

describe('speechLang (31)', () => {
  it('Cyrillic is Ukrainian, Arabic script is Arabic, Latin follows a Latin UI or falls back to English', () => {
    expect(speechLang('Яка річка найдовша?', 'en')).toBe('uk');
    expect(speechLang('Which river?', 'uk')).toBe('en');
    expect(speechLang('Welche Farbe?', 'de')).toBe('de');
    expect(speechLang('ما هي عاصمة مصر؟', 'uk')).toBe('ar');
    expect(speechLang('Which river?', 'ar')).toBe('en');
  });
});

describe('pickVoice (31)', () => {
  it('never hands Cyrillic to a voice of another language', () => {
    expect(pickVoice([voice('ru-RU'), voice('en-US')], 'uk')).toBeNull();
    expect(pickVoice([voice('en-US'), voice('uk-UA')], 'uk')?.lang).toBe('uk-UA');
    expect(pickVoice([voice('uk'), voice('uk-UA')], 'uk')?.lang).toBe('uk-UA');
    expect(pickVoice([voice('uk_UA', false), voice('uk-UA')], 'uk')).toMatchObject({ lang: 'uk-UA', localService: true });
    expect(pickVoice([voice('en-GB')], 'en')?.lang).toBe('en-GB');
    expect(pickVoice([], 'uk')).toBeNull();
  });
});

describe('speechParts (31)', () => {
  it('reads the question and then its options without letters', () => {
    const question = speechQuestion({ text: 'Столиця Польщі?', choices: [{ id: 'a', text: 'Варшава' }, { id: 'b', text: 'Краків' }, { id: 'c', text: 'Гданськ' }] });
    expect(speechParts(question)).toEqual(['Столиця Польщі?', 'Варіанти: Варшава; Краків; Гданськ.']);
  });

  it('a blank is «пропуск», emoji are dropped, other types have no options', () => {
    expect(speechParts(speechQuestion({ type: 'text', text: 'Тарас ___ — поет 🎉🇺🇦', choices: [] }))).toEqual(['Тарас пропуск — поет']);
  });

  it('keeps quiet over sound and video', () => {
    expect(speechParts(speechQuestion({ video: { id: 'dQw4w9WgXcQ', start: 0 } as never }))).toBeNull();
    expect(speechParts(speechQuestion({ audio: { duration: 10, clip: null } as never }))).toBeNull();
    expect(speechParts(speechQuestion({ melody: { source: 'file' } as never }))).toBeNull();
  });

  it('cuts a long text into short phrases and loses nothing', () => {
    const sentence = 'Це довге речення про річки, озера й гори нашого краю.';
    const text = Array.from({ length: 8 }, () => sentence).join(' ');
    expect(text.length).toBeGreaterThan(400);
    const parts = speechParts(speechQuestion({ type: 'text', text, choices: [] }))!;
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(part.length).toBeLessThanOrEqual(SPEECH_CHUNK);
    expect(parts.join(' ')).toBe(text);
    const word = 'слово '.repeat(60).trim();
    const cut = speechParts(speechQuestion({ type: 'text', text: word, choices: [] }))!;
    for (const part of cut) expect(part.length).toBeLessThanOrEqual(SPEECH_CHUNK);
    expect(cut.join(' ')).toBe(word);
  });
});

describe('speechKey (31)', () => {
  it('is round:question only on a question, not on the bluff choice nor outside question', () => {
    expect(speechKey(speechView())).toBe('0:0');
    expect(speechKey(speechView({ questionIndex: 2, round: { index: 1 } as never }))).toBe('1:2');
    expect(speechKey(speechView({ phase: 'reveal' }))).toBeNull();
    expect(speechKey(speechView({ phase: 'locked' }))).toBeNull();
    expect(speechKey(speechView({ question: null }))).toBeNull();
    expect(speechKey(speechView({ bluff: { stage: 'choice' } as never }))).toBeNull();
    expect(speechKey(speechView({ bluff: { stage: 'lies' } as never }))).toBe('0:0');
  });

describe('speech language over everything that is spoken (31)', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('Cyrillic in any option makes it Ukrainian, frame words too', () => {
    const latin = speechQuestion({ text: 'Euro 2012?', choices: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Varsovia' }] });
    expect(speechLanguage(latin, 'uk')).toBe('uk');
    expect(speechParts(latin)).toEqual(['Euro 2012?', 'Варіанти: Київ; Varsovia.']);
    const numbers = speechQuestion({ text: '1991', choices: [{ id: 'a', text: 'Незалежність' }] });
    expect(speechLanguage(numbers, 'en')).toBe('uk');
  });

  it('an English UI with a Cyrillic question reads it in Ukrainian with Ukrainian frame words', () => {
    activateLocaleForTests('en', { ui: { speechOptions: 'Options: {list}.', speechBlank: 'blank' } });
    const question = speechQuestion({ text: 'Тарас ___ — поет?' });
    expect(speechLanguage(question, 'en')).toBe('uk');
    expect(speechParts(question)).toEqual(['Тарас пропуск — поет?', 'Варіанти: Дніпро; Дунай; Десна.']);
  });

  it('a Latin question uses the frame words of a Latin UI, and none when that language is not loaded', () => {
    const english = speechQuestion({ text: 'Which river ___ Kyiv?', choices: [{ id: 'a', text: 'Dnipro' }, { id: 'b', text: 'Danube' }] });
    activateLocaleForTests('en', { ui: { speechOptions: 'Options: {list}.', speechBlank: 'blank' } });
    expect(speechParts(english)).toEqual(['Which river blank Kyiv?', 'Options: Dnipro; Danube.']);
    activateLocaleForTests('uk');
    expect(speechLanguage(english, 'uk')).toBe('en');
    expect(speechParts(english)).toEqual(['Which river Kyiv?', 'Dnipro; Danube.']);
  });
});
});
