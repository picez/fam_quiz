import { describe, expect, it } from 'vitest';
import type { UndoRound, UndoRow } from '@quiz/shared';
import { activePlayers, roundRows, undoRowText, undoWho } from './undo-panel';

const row = (over: Partial<UndoRow> = {}): UndoRow => ({ kind: 'answer', playerId: 'p1', nickname: 'Оля', points: 200, target: { question: 0, playerId: 'p1' }, undoneBy: null, ...over });

describe('undoRowText', () => {
  it('names the player with signed points, a penalty and host points', () => {
    expect(undoRowText(row())).toBe('Оля +200');
    expect(undoRowText(row({ nickname: 'Петро', points: -100 }))).toBe('Петро −100 (штраф)');
    expect(undoRowText(row({ kind: 'host', nickname: 'Іра', points: 50, target: { seq: 1 } }))).toBe('Ведучий: Іра +50');
    expect(undoRowText(row({ kind: 'host', nickname: 'Іра', points: -50, target: { seq: 2 } }))).toBe('Ведучий: Іра −50');
  });
});

describe('activePlayers', () => {
  it('counts distinct players with rows still standing', () => {
    const rows = [row(), row({ kind: 'host', target: { seq: 3 } }), row({ playerId: 'p2', nickname: 'Петро', undoneBy: 5 })];
    expect(activePlayers(rows)).toBe(1);
    expect(activePlayers([])).toBe(0);
  });
});

describe('roundRows', () => {
  it('puts question rows and loose rows into one list', () => {
    const a = row();
    const b = row({ playerId: 'p2', nickname: 'Петро', target: { question: 1, playerId: 'p2' } });
    const loose = row({ kind: 'host', target: { seq: 7 } });
    const round: UndoRound = {
      index: 0,
      title: 'Розминка',
      type: 'classic',
      loose: [loose],
      questions: [
        { index: 1, number: 2, text: 'Друге', rows: [b] },
        { index: 0, number: 1, text: 'Перше', rows: [a] },
      ],
    };
    expect(roundRows(round)).toEqual([b, a, loose]);
  });
});

describe('undoWho', () => {
  it('declines players and teams by the count', () => {
    expect(undoWho(1, false)).toBe('1 гравця');
    expect(undoWho(3, false)).toBe('3 гравців');
    expect(undoWho(5, false)).toBe('5 гравців');
    expect(undoWho(2, true)).toBe('2 команд');
    expect(undoWho(1, true)).toBe('1 команди');
  });
});
