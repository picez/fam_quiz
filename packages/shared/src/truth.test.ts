import { describe, expect, it } from 'vitest';
import { truthFactSchema, truthHideSchema } from './events';
import { LIMITS } from './quiz';
import { TRUTH_QUESTION_PREFIX, truthText } from './truth';

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
