import { describe, expect, it } from 'vitest';
import { WORDLE_KEYBOARD, playedText, wordleCandidates, wordleKey, wordleKeyboard, wordleLeak, wordleLetters, wordleMarks, wordlePoints, wordleWordIssue } from './index';

const L = (w: string) => wordleLetters(wordleKey(w)!);

describe('wordle rules', () => {
  it('marks with repeated letters', () => {
    expect(wordleMarks(L('колос'), L('сосна'))).toEqual(['miss', 'hit', 'miss', 'miss', 'near']);
    expect(wordleMarks(L('сосна'), L('колос'))).toEqual(['near', 'hit', 'miss', 'miss', 'miss']);
    expect(wordleMarks(L('посол'), L('колос'))).toEqual(['miss', 'hit', 'near', 'hit', 'near']);
    expect(wordleMarks(L('колос'), L('колос'))).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
    expect(wordleMarks(L('сало'), L("м'ясо"))).toEqual(['near', 'miss', 'miss', 'hit']);
    expect(() => wordleMarks(L('сало'), L('колос'))).toThrow();
  });

  it('the apostrophe is not a letter', () => {
    expect(wordleLetters("м'ясо")).toEqual(['м', 'я', 'с', 'о']);
    expect(wordleKey('М’ЯСО')).toBe("м'ясо");
    expect(wordleCandidates(['м', 'я', 'с', 'о'])).toEqual(['мясо', "м'ясо", "мя'со", "мяс'о"]);
  });

  it('the host word is 4 to 7 letters', () => {
    expect(wordleWordIssue('кіт')).toBe('wordle_word');
    for (const w of ['вежа', 'черешня', "м'ясо"]) expect(wordleWordIssue(w)).toBeNull();
    for (const w of ['соняшник', 'kolos', 'ко лос', '']) expect(wordleWordIssue(w)).toBe('wordle_word');
  });

  it('a leak: the word as a whole word, with any apostrophe or without it', () => {
    expect(wordleLeak('колос', 'Слово — колос?')).toBe(true);
    expect(wordleLeak('колос', 'Колоски в полі')).toBe(false);
    expect(wordleLeak("пір'я", 'Що таке пірря?')).toBe(true);
    expect(wordleLeak("пір'я", 'Що таке піря?')).toBe(true);
    expect(wordleLeak("пір'я", 'Що таке пір’я?')).toBe(true);
    expect(wordleLeak("пір'я", 'Що таке ПІРʼЯ?')).toBe(true);
    expect(wordleLeak("пір'я", 'Пір’ячко на вітрі')).toBe(false);
    expect(wordleLeak('', 'будь-що')).toBe(false);
  });

  it('points by try', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => wordlePoints(1000, n))).toEqual([1000, 833, 667, 500, 333, 167]);
    expect(wordlePoints(600, 2)).toBe(500);
  });

  it('keyboard keeps the best mark', () => {
    const t = L('сосна');
    const rows = [L('колос'), L('сосна')].map((letters) => ({ letters, marks: wordleMarks(letters, t) }));
    const k = wordleKeyboard(rows);
    expect(k['о']).toBe('hit');
    expect(k['к']).toBe('miss');
    expect(k['с']).toBe('hit');
  });

  it('the keyboard has every Ukrainian letter once', () => {
    const all = WORDLE_KEYBOARD.flat();
    expect(all.length).toBe(33);
    expect(new Set(all).size).toBe(33);
    for (const c of ['ґ', 'ї', 'є', 'і']) expect(all).toContain(c);
    expect(all).not.toContain("'");
  });
});

describe('playedText (61)', () => {
  it('a wordle is named by its word in capitals, other questions by their text', () => {
    expect(playedText({ type: 'wordle', text: 'Ягода з колючого куща', word: "м'ясо" })).toBe("М'ЯСО");
    expect(playedText({ type: 'wordle', text: '', word: 'колос' })).toBe('КОЛОС');
    expect(playedText({ type: 'text', text: 'Столиця Франції?' })).toBe('Столиця Франції?');
  });
});
