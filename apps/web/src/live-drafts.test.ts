import { describe, expect, it } from 'vitest';
import type { HostDrafts, LiveDraft, PublicQuestion, Question } from '@quiz/shared';
import { draftMeta, draftsById, draftText } from './live-drafts';

const base = { id: 'q', text: '?', imageUrl: null, video: null, timeLimit: 20, points: 1000 };
const planets = [
  { id: 'a', text: 'Марс' },
  { id: 'b', text: 'Юпітер' },
];
const animals = [
  { id: 'k', text: 'Кит' },
  { id: 'd', text: 'Дельфін' },
  { id: 'a', text: 'Акула' },
];
const single: Question = { ...base, type: 'single', options: planets, correctId: 'b' };
const multi: Question = { ...base, type: 'multi', options: animals, correctIds: ['k', 'd'] };
const order: Question = { ...base, type: 'order', items: [{ id: 'i1', text: 'Ранок' }, { id: 'i2', text: 'День' }, { id: 'i3', text: 'Вечір' }] };
const match = {
  ...base,
  type: 'match',
  pairs: [
    { left: { id: 'l1', text: 'Франція' }, right: { id: 'r1', text: 'Париж' } },
    { left: { id: 'l2', text: 'Італія' }, right: { id: 'r2', text: 'Рим' } },
  ],
} as unknown as Question;
const slider = { ...base, type: 'slider', min: 0, max: 20, step: 1, correct: 9, tolerance: 0, unit: 'см' } as unknown as Question;

const pub = (over: Partial<PublicQuestion> = {}): PublicQuestion =>
  ({ type: 'single', text: '?', imageUrl: null, timeLimit: 20, video: null, points: 1000, choices: [], right: [], orderLabels: null, chain: null, sort: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null, ...over }) as PublicQuestion;

const draft = (over: Partial<LiveDraft> = {}): LiveDraft => ({ id: 'p1', draft: { type: 'text', value: 'Оде' }, changes: 0, at: 10_000, ...over });

describe('draftsById', () => {
  const batch: HostDrafts = { questionIndex: 3, trial: false, drafts: [draft(), draft({ id: 'p2' })] };

  it('is empty for another question, a trial mismatch or no batch', () => {
    expect(draftsById(batch, 4, false)).toEqual({});
    expect(draftsById(batch, 3, true)).toEqual({});
    expect(draftsById(null, 3, false)).toEqual({});
  });

  it('keys the drafts of this question by row id', () => {
    const byId = draftsById(batch, 3, false);
    expect(Object.keys(byId)).toEqual(['p1', 'p2']);
    expect(byId.p2?.id).toBe('p2');
  });
});

describe('draftText', () => {
  it('names a single pick like the answer', () => {
    expect(draftText({ type: 'single', optionId: 'b' }, single, pub({ choices: planets }))).toBe('вибирає Юпітер');
    expect(draftText({ type: 'boolean', value: true }, null, pub({ type: 'boolean' }))).toBe('вибирає Так');
  });

  it('lists the marks of a multi', () => {
    expect(draftText({ type: 'multi', optionIds: ['k', 'd'] }, multi, pub({ type: 'multi', choices: animals }))).toBe('позначає Кит, Дельфін');
  });

  it('quotes what is typed', () => {
    expect(draftText({ type: 'text', value: 'Осака' }, null, null)).toBe('друкує «Осака»');
    expect(draftText({ type: 'clues', value: 'Шевч' }, null, null)).toBe('друкує «Шевч»');
    expect(draftText({ type: 'numeric', value: -12 }, null, null)).toBe('друкує «−12»');
    expect(draftText({ type: 'chainWord', word: 'лі' }, null, null)).toBe('друкує «лі»');
  });

  it('writes the order and the pairs so far', () => {
    expect(draftText({ type: 'order', itemIds: ['i3', 'i1', 'i2'] }, order, null)).toBe('порядок: Вечір → Ранок → День');
    expect(draftText({ type: 'match', links: [{ left: 'l2', right: 'r2' }] }, match, null)).toBe('з’єднав: Італія → Рим');
    expect(draftText({ type: 'match', links: [{ left: 'l1', right: 'r2' }, { left: 'l2', right: 'r1' }] }, match, null)).toBe('з’єднав: Франція → Рим, Італія → Париж');
  });

  it('writes the slider with its unit, from the question or the public slider', () => {
    expect(draftText({ type: 'slider', value: 7 }, slider, null)).toBe('повзунок: 7 см');
    expect(draftText({ type: 'slider', value: 7 }, null, pub({ type: 'slider', slider: { min: 0, max: 20, step: 1, unit: 'см' } }))).toBe('повзунок: 7 см');
  });

  it('says a pin is being placed', () => {
    expect(draftText({ type: 'pin', x: 0.5, y: 0.5 }, null, null)).toBe('ставить точку');
  });

  it('names the picked wall tiles', () => {
    const wall = pub({ type: 'wall', wall: { tiles: ['Дуб', 'Липа', 'Клен', 'Сосна'], size: 2, groupCount: 2, maxMistakes: 3 } });
    expect(draftText({ type: 'wallPick', tiles: [1, 2] }, null, wall)).toBe('виділено: Липа, Клен');
  });

  it('uses plural verbs on a team row and keeps the neutral ones', () => {
    expect(draftText({ type: 'single', optionId: 'b' }, single, pub({ choices: planets }), true)).toBe('вибирають Юпітер');
    expect(draftText({ type: 'multi', optionIds: ['k'] }, multi, null, true)).toBe('позначають Кит');
    expect(draftText({ type: 'text', value: 'Осака' }, null, null, true)).toBe('друкують «Осака»');
    expect(draftText({ type: 'match', links: [{ left: 'l2', right: 'r2' }] }, match, null, true)).toBe('з’єднали: Італія → Рим');
    expect(draftText({ type: 'pin', x: 0.5, y: 0.5 }, null, null, true)).toBe('ставлять точку');
    expect(draftText({ type: 'lie', text: 'Вигадка' }, null, null, true)).toBe('пишуть вигадку «Вигадка»');
    expect(draftText({ type: 'wordcloud', words: ['чай'] }, null, null, true)).toBe('друкують: чай');
    expect(draftText({ type: 'order', itemIds: ['i1'] }, order, null, true)).toBe('порядок: Ранок');
    expect(draftText({ type: 'slider', value: 7 }, slider, null, true)).toBe('повзунок: 7 см');
  });

  it('quotes the lie and lists the typed survey and cloud words', () => {
    expect(draftText({ type: 'lie', text: 'Вигадка' }, null, null)).toBe('пише вигадку «Вигадка»');
    expect(draftText({ type: 'survey', values: ['чай', '', 'кава'] }, null, null)).toBe('друкує: чай, кава');
    expect(draftText({ type: 'wordcloud', words: ['чай', 'кава'] }, null, null)).toBe('друкує: чай, кава');
  });
});

describe('draftMeta', () => {
  it('says how long the player thinks, and how often they changed it from the first change', () => {
    expect(draftMeta(draft({ changes: 0 }), 22_400)).toEqual(['думає 12 с']);
    expect(draftMeta(draft({ changes: 2 }), 22_400)).toEqual(['змінював 2 рази', 'думає 12 с']);
    expect(draftMeta(draft({ changes: 5 }), 22_400)[0]).toBe('змінював 5 разів');
    expect(draftMeta(draft({ changes: 1 }), 22_400)[0]).toBe('змінював 1 раз');
    expect(draftMeta(draft({ changes: 0 }), 9_000)).toEqual(['думає 0 с']);
  });

  it('speaks of a team in the plural', () => {
    expect(draftMeta(draft({ changes: 3 }), 22_400, true)).toEqual(['змінювали 3 рази', 'думають 12 с']);
    expect(draftMeta(draft({ changes: 5 }), 22_400, true)[0]).toBe('змінювали 5 разів');
  });
});
