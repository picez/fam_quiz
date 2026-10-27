import { describe, expect, it } from 'vitest';
import { draftSchema, liveWatchSchema } from './events';
import { DRAFT_TEXT_MAX, DRAFTS_PER_SECOND, HOST_DRAFTS_MS, clipDraft, draftQuestionType, draftValueSchema, isAnswerDraft } from './drafts';

describe('live drafts', () => {
  it('takes every answer of the phone plus wall tiles, a chain word and a lie', () => {
    for (const draft of [
      { type: 'single', optionId: 'a' }, { type: 'multi', optionIds: ['a', 'c'] }, { type: 'text', value: 'Оса' },
      { type: 'numeric', value: 7 }, { type: 'slider', value: 3.5 }, { type: 'pin', x: 0.2, y: 0.9 },
      { type: 'order', itemIds: ['b', 'a'] }, { type: 'match', links: [{ left: 'l1', right: 'r2' }] },
      { type: 'survey', values: ['Чай'] }, { type: 'wordcloud', words: ['море'] },
      { type: 'wallPick', tiles: [0, 5] }, { type: 'chainWord', word: 'ліс' }, { type: 'lie', text: 'Вигадка' },
    ]) expect(draftValueSchema.safeParse(draft).data).toEqual(draft);
  });

  it('refuses long text, too many tiles, unknown kinds', () => {
    for (const draft of [
      { type: 'text', value: 'я'.repeat(DRAFT_TEXT_MAX + 1) }, { type: 'clues', value: 'я'.repeat(DRAFT_TEXT_MAX + 1) },
      { type: 'wallPick', tiles: [0, 1, 2, 3, 4] }, { type: 'wallPick', tiles: [16] }, { type: 'chainWord', word: 'я'.repeat(31) },
      { type: 'magic' }, null,
    ]) expect(draftValueSchema.safeParse(draft).success).toBe(false);
    expect(draftSchema.safeParse({ draft: null }).success).toBe(true);
  });

  it('names the question type, tells plain answers and clips text', () => {
    expect(draftQuestionType({ type: 'wallPick', tiles: [] })).toBe('wall');
    expect(draftQuestionType({ type: 'chainWord', word: 'ліс' })).toBe('chain');
    expect(draftQuestionType({ type: 'lie', text: 'x' })).toBe('bluff');
    expect(draftQuestionType({ type: 'boolean', value: true })).toBe('boolean');
    expect(isAnswerDraft({ type: 'text', value: 'x' })).toBe(true);
    expect(isAnswerDraft({ type: 'lie', text: 'x' })).toBe(false);
    expect(clipDraft({ type: 'text', value: 'я'.repeat(150) })).toEqual({ type: 'text', value: 'я'.repeat(DRAFT_TEXT_MAX) });
    expect(clipDraft({ type: 'lie', text: 'abc' })).toEqual({ type: 'lie', text: 'abc' });
  });

  it('limits and the watch payload', () => {
    expect([DRAFTS_PER_SECOND, HOST_DRAFTS_MS, DRAFT_TEXT_MAX]).toEqual([8, 300, 100]);
    expect(liveWatchSchema.safeParse({ on: false }).success).toBe(true);
    expect(liveWatchSchema.safeParse({ on: 'yes' }).success).toBe(false);
  });
});
