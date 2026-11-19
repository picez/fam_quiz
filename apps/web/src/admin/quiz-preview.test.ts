import { QUESTION_TYPES, videoLink, type Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { t } from '../i18n';
import { questionLines } from './admin-text';
import { questionPreview } from './quiz-preview';

const IMG_A = '/uploads/aaaaaaaaaaaaaaaa.jpg';
const IMG_B = '/uploads/bbbbbbbbbbbbbbbb.png';
const SOUND = '/uploads/cccccccccccccccc.mp3';
const base = { imageUrl: null, video: null, timeLimit: 30, points: 1000 };
const single: Question = { ...base, id: 'q1', type: 'single', text: 'Найдовша річка України?', options: [{ id: 'a', text: 'Дніпро' }, { id: 'b', text: 'Десна' }, { id: 'c', text: 'Буг' }], correctId: 'a' };

describe('questionPreview', () => {
  it('marks the one correct option of a single choice', () => {
    const preview = questionPreview(single);
    expect(preview.text).toBe('Найдовша річка України?');
    expect(preview.items).toEqual([
      { text: 'Дніпро', correct: true },
      { text: 'Десна', correct: false },
      { text: 'Буг', correct: false },
    ]);
    expect(preview.points).toBe(1000);
    expect(preview.timeLimit).toBe(30);
  });

  it('marks both correct options of a multi choice', () => {
    const multi: Question = { ...base, id: 'q2', type: 'multi', text: 'Які міста на Дніпрі?', options: [{ id: 'a', text: 'Київ' }, { id: 'b', text: 'Львів' }, { id: 'c', text: 'Дніпро' }], correctIds: ['a', 'c'] };
    expect(questionPreview(multi).items.filter((item) => item.correct === true).map((item) => item.text)).toEqual(['Київ', 'Дніпро']);
  });

  it('a poll has no correct options', () => {
    const poll: Question = { ...base, points: 0, id: 'q3', type: 'poll', text: 'Улюблена пора року?', options: [{ id: 'a', text: 'Літо' }, { id: 'b', text: 'Зима' }] };
    expect(questionPreview(poll).items.map((item) => item.correct)).toEqual([null, null]);
  });

  it('a yes/no question says its answer', () => {
    const no: Question = { ...base, id: 'q4', type: 'boolean', text: 'Говерла вища за 2100 м?', correct: false };
    expect(questionPreview(no).answer).toBe(t('no'));
    expect(questionPreview({ ...no, correct: true }).answer).toBe(t('yes'));
  });

  it('a text question lists its spellings in order and carries the hint', () => {
    const text: Question = { ...base, id: 'q5', type: 'text', text: 'Найвища гора України?', accepted: ['Говерла', 'гора Говерла'], hint: 'Чорногора' };
    const preview = questionPreview(text);
    expect(preview.accepted).toEqual(['Говерла', 'гора Говерла']);
    expect(preview.hint).toBe('Чорногора');
    expect(preview.items).toEqual([]);
    expect(questionPreview(single).hint).toBeNull();
  });

  it('collects the question picture and the option pictures', () => {
    const pictured: Question = { ...single, imageUrl: IMG_A, options: [{ id: 'a', text: 'Дніпро', imageUrl: IMG_B }, { id: 'b', text: 'Десна', imageUrl: IMG_A }] };
    expect(questionPreview(pictured).images).toEqual([IMG_A, IMG_B]);
  });

  it('a video gives its link and takes the timer away', () => {
    const video = { id: 'dQw4w9WgXcQ', start: 75 };
    const preview = questionPreview({ ...single, video });
    expect(preview.video).toEqual({ url: videoLink(video), start: 75 });
    expect(preview.timeLimit).toBeNull();
    expect(preview.audio).toBeNull();
  });

  it('an audio file keeps its start and length and is not a picture', () => {
    const preview = questionPreview({ ...single, audio: { source: 'file', url: SOUND, start: 12, duration: 20 } });
    expect(preview.audio).toEqual({ url: SOUND, start: 12, duration: 20 });
    expect(preview.images).toEqual([]);
  });

  it('a type without its own rule shows the lines of questionLines', () => {
    const order: Question = { ...base, id: 'q6', type: 'order', text: 'Від найдовшої', items: [{ id: 'a', text: 'Дніпро' }, { id: 'b', text: 'Дністер' }, { id: 'c', text: 'Десна' }] };
    expect(questionPreview(order).items).toEqual(questionLines(order).slice(1).map((text) => ({ text, correct: null })));
  });

  it('numbers and the word game give one answer', () => {
    expect(questionPreview({ ...base, id: 'n', type: 'numeric', text: 'Скільки областей?', correct: 24, tolerance: 0 }).answer).toBe('24');
    expect(questionPreview({ ...base, id: 'w', type: 'wordle', text: 'Слово', word: 'КАВУН' }).answer).toBe('КАВУН');
  });

  it('never throws on a question of any type, even with fields missing', () => {
    for (const type of QUESTION_TYPES) {
      const broken = { id: 'x', type, text: 'Щось', points: 10 } as unknown as Question;
      const preview = questionPreview(broken);
      expect(preview.text, type).toBe('Щось');
      expect(Array.isArray(preview.items), type).toBe(true);
    }
    expect(() => questionPreview({} as unknown as Question)).not.toThrow();
  });
});
