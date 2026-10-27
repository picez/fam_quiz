import { describe, expect, it } from 'vitest';
import type { AdjustmentNotice, GameDetail, UndoNotice, UndoRound, UndoRow } from '@quiz/shared';
import { activePlayers, historyUndoLines, roundRows, undoNoticeText, undoRowText, undoWho } from './undo-panel';

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

describe('undoNoticeText', () => {
  const notice = (over: Partial<AdjustmentNotice> = {}, undo: Partial<UndoNotice> = {}): AdjustmentNotice & { undo: UndoNotice } => ({
    seq: 1,
    at: 0,
    nickname: 'Петро',
    points: 100,
    ...over,
    undo: { redo: false, players: 1, round: 1, question: 1, ...undo },
  });

  it('names one player, the round (only in a multi-round quiz) and the question', () => {
    expect(undoNoticeText(notice(), { teams: false, rounds: 2 })).toBe('Ведучий скасував бали: Петро +100 (раунд 1, запитання 1)');
    expect(undoNoticeText(notice(), { teams: false, rounds: 1 })).toBe('Ведучий скасував бали: Петро +100 (запитання 1)');
  });

  it('counts players or teams when several are hit', () => {
    expect(undoNoticeText(notice({}, { players: 3, question: null }), { teams: false, rounds: 2 })).toBe('Ведучий скасував бали 3 гравців (раунд 1)');
    expect(undoNoticeText(notice({}, { players: 3, question: null }), { teams: true, rounds: 2 })).toBe('Ведучий скасував бали 3 команд (раунд 1)');
  });

  it('tells a return', () => {
    expect(undoNoticeText(notice({ points: -100 }, { redo: true }), { teams: false, rounds: 2 })).toBe('Ведучий повернув бали: Петро −100 (раунд 1, запитання 1)');
  });
});

describe('historyUndoLines', () => {
  const game = {
    questions: [{ index: 0, roundIndex: 0 }],
    adjustments: [
      { seq: 1, roundIndex: 0, afterQuestion: 1, nickname: 'Тарас', points: 50, source: 'host' },
      { seq: 2, roundIndex: 0, afterQuestion: 1, nickname: 'Олена', points: -1000, source: 'undo', undoes: { question: 0 } },
      { seq: 3, roundIndex: 0, afterQuestion: 1, nickname: 'Тарас', points: -50, source: 'undo', undoes: { seq: 1 } },
      { seq: 4, roundIndex: 0, afterQuestion: 1, nickname: 'Тарас', points: 50, source: 'undo', undoes: { seq: 3 } },
    ],
  } as unknown as Pick<GameDetail, 'adjustments' | 'questions'>;

  it('lists each undo of the round with what it undid and whether it was returned', () => {
    expect(historyUndoLines(game, 0)).toEqual([
      { seq: 2, text: '↶ Скасовано: Олена −1000 (запитання 1)', returned: false },
      { seq: 3, text: '↶ Скасовано: Тарас −50 (бали ведучого)', returned: true },
      { seq: 4, text: '↶ Повернуто: Тарас +50 (бали ведучого)', returned: false },
    ]);
    expect(historyUndoLines(game, 1)).toEqual([]);
  });
});
