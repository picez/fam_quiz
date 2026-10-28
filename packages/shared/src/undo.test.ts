import { describe, expect, it } from 'vitest';
import { undoSchema } from './events';
import { UNDOABLE_ROUNDS, UNDOABLE_SOURCES, undoAnswerKey, undoLedger, type UndoEntry } from './undo';

const host = (seq: number, who: string): UndoEntry => ({ seq, who, source: 'host' });
const undo = (seq: number, who: string, undoes: UndoEntry['undoes']): UndoEntry => ({ seq, who, source: 'undo', undoes });

describe('undo ledger', () => {
  it('an answer undo and an adjustment undo are in force until returned', () => {
    const ledger = undoLedger([host(1, 'p3'), undo(2, 'p2', { question: 0 }), undo(3, 'p3', { seq: 1 })]);
    expect([...ledger.answers]).toEqual([[undoAnswerKey('p2', 0), 2]]);
    expect([...ledger.adjustments]).toEqual([[1, 3]]);
    expect(ledger.redone.size).toBe(0);
  });

  it('«Повернути» stops the undo; undoing again makes a new one; the entry order does not matter', () => {
    const entries = [undo(2, 'p2', { question: 0 }), undo(3, 'p2', { seq: 2 }), undo(4, 'p2', { question: 0 }), host(1, 'p3'), undo(5, 'p3', { seq: 1 }), undo(6, 'p3', { seq: 5 })];
    const ledger = undoLedger([...entries].reverse());
    expect([...ledger.answers]).toEqual([[undoAnswerKey('p2', 0), 4]]);
    expect(ledger.adjustments.size).toBe(0);
    expect([...ledger.redone]).toEqual([[2, 3], [5, 6]]);
  });

  it('skips rows of other sources and rows without a target', () => {
    expect(undoLedger([{ seq: 1, who: 'p1', source: 'duel' }, { seq: 2, who: 'p1', source: 'undo' }]).answers.size).toBe(0);
  });

  it('lists what can be undone', () => {
    expect(UNDOABLE_SOURCES).toEqual(['host', 'away']);
    expect(UNDOABLE_ROUNDS).toEqual(['classic', 'blitz', 'board', 'final']);
  });

  it('the host:undo payload takes the four targets and nothing else', () => {
    for (const target of [{ question: 0, playerId: 'p1' }, { seq: 1 }, { question: 3 }, { round: 0 }]) {
      expect(undoSchema.safeParse({ target }).data).toEqual({ target });
    }
    for (const target of [{}, { seq: 0 }, { question: -1 }, { round: 1.5 }, { seq: '1' }, null]) {
      expect(undoSchema.safeParse({ target }).success).toBe(false);
    }
  });
});
