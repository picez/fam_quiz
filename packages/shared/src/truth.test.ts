import { describe, expect, it } from 'vitest';
import { truthFactSchema, truthFakeSchema, truthHideSchema } from './events';
import { LIMITS } from './quiz';
import { TRUTH_FAKE_OPTION, TRUTH_FAKE_PREFIX, TRUTH_FAKE_TEXT, TRUTH_QUESTION_PREFIX, isTruthFake, truthText } from './truth';

describe('truth fact text (28b)', () => {
  it('a fact is trimmed and spaces collapse', () => {
    expect(truthText('  Я  був\nу Перу ')).toBe('Я був у Перу');
    expect(truthText('   ')).toBe('');
  });

  it('keeps the question id prefix', () => {
    expect(TRUTH_QUESTION_PREFIX).toBe('truth-');
  });
});

describe('truth payload schemas (28b)', () => {
  it('a fact payload: any text up to twice the limit (the engine trims and measures), storable only', () => {
    expect(truthFactSchema.safeParse({ text: '' }).success).toBe(true);
    expect(truthFactSchema.safeParse({ text: 'Я стрибала з парашутом' }).success).toBe(true);
    expect(truthFactSchema.safeParse({ text: 'а'.repeat(LIMITS.truthText * 2) }).success).toBe(true);
    expect(truthFactSchema.safeParse({ text: 'а'.repeat(LIMITS.truthText * 2 + 1) }).success).toBe(false);
    expect(truthFactSchema.safeParse({ text: 'a\u0000b' }).success).toBe(false);
    expect(truthFactSchema.safeParse({ text: 5 }).success).toBe(false);
    expect(truthFactSchema.safeParse({}).success).toBe(false);
  });

  it('a hide payload: a player id and a boolean', () => {
    expect(truthHideSchema.safeParse({ playerId: 'p1', hidden: true }).success).toBe(true);
    expect(truthHideSchema.safeParse({ playerId: 'p1', hidden: false }).success).toBe(true);
    expect(truthHideSchema.safeParse({ playerId: 'p1', hidden: 'yes' }).success).toBe(false);
    expect(truthHideSchema.safeParse({ playerId: 'p1' }).success).toBe(false);
    expect(truthHideSchema.safeParse({ hidden: true }).success).toBe(false);
  });
});

describe('host fakes (52)', () => {
  it('a fake payload: id or null, text up to twice the limit, storable only', () => {
    expect(truthFakeSchema.safeParse({ id: null, text: 'Я вмію жонглювати' }).success).toBe(true);
    expect(truthFakeSchema.safeParse({ id: 'fake-1', text: '' }).success).toBe(true);
    expect(truthFakeSchema.safeParse({ text: 'Я вмію жонглювати' }).success).toBe(false);
    expect(truthFakeSchema.safeParse({ id: '', text: 'x' }).success).toBe(false);
    expect(truthFakeSchema.safeParse({ id: null, text: 'а'.repeat(LIMITS.truthText * 2) }).success).toBe(true);
    expect(truthFakeSchema.safeParse({ id: null, text: 'а'.repeat(LIMITS.truthText * 2 + 1) }).success).toBe(false);
    expect(truthFakeSchema.safeParse({ id: null, text: 'a\u0000b' }).success).toBe(false);
  });

  it('fake ids start with fake-; the «made up» option id is not a fake id', () => {
    expect(TRUTH_FAKE_PREFIX).toBe('fake-');
    expect(TRUTH_FAKE_OPTION).toBe('fake');
    expect(TRUTH_FAKE_TEXT).toBe('Вигадка');
    expect(isTruthFake('fake-3')).toBe(true);
    expect(isTruthFake('3f2a9c1e-7b4d-4e2a-9f1c-2d3e4f5a6b7c')).toBe(false);
    expect(isTruthFake('fake')).toBe(false);
  });
});
