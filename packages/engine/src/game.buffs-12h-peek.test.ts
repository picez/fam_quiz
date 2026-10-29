import type { Answer, Question } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { buffBlock, buffOf, peekTargets, takeBuff } from './buffs';
import { lock, next, pause, removePlayer, submitAnswer, type GameState } from './game';
import { actAnswer, actorOf } from './team-act';
import { T0, toBuffCell, toOthersQuestion, toPowersQuestion } from './testing/buffs';
import { bluff, classicRound, makeQuiz, order, single4 } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';
import { playerView, stageView } from './views';

const rng0 = () => 0;
const B: Answer = { type: 'single', optionId: 'b' };
const answer = (s: GameState, id: string, a: Answer, at: number) => must(submitAnswer(s, id, a, at));
const play = (s: GameState) => s.plays[s.questionIndex];

describe('peek (12h)', () => {
  it('peek shows the answer of someone who answered, without a verdict, and tells them', () => {
    let s = answer(toPowersQuestion(), 'p3', B, T0 + 800);
    expect(buffBlock(s, 'p2', 'peek')).toBeNull();
    s = must(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p3'));
    expect(buffOf(play(s), 'p2')?.peek).toBe('p3');
    const active = playerView(s, 'p2')?.me.buffs?.active;
    expect(active?.peek).toEqual({ target: { playerId: 'p3', nickname: 'Іра' }, answer: B });
    expect(JSON.stringify(active)).not.toMatch(/accepted|grade|points"/);
    expect(playerView(s, 'p3')?.me.peekedBy).toEqual({ seq: 1, at: T0 + 1000, nickname: 'Петро' });
    expect(playerView(s, 'p1')?.me.peekedBy).toBeNull();
    expect(playerView(s, 'p2')?.me.peekedBy).toBeNull();
  });

  it('nobody answered yet: no_answers, and taking it is buff_unfit', () => {
    const s = toPowersQuestion();
    expect(buffBlock(s, 'p2', 'peek')).toBe('no_answers');
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p3')).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('the target must be someone else who answered; a missing target is peek_target', () => {
    const s = answer(toPowersQuestion(), 'p3', B, T0 + 800);
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0)).toEqual({ ok: false, error: 'peek_target' });
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p2')).toEqual({ ok: false, error: 'peek_target' });
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p1')).toEqual({ ok: false, error: 'peek_target' });
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'ghost')).toEqual({ ok: false, error: 'peek_target' });
    expect(peekTargets(s, play(s), 'p2')).toEqual(['p3']);
    // Сам себе — ніколи.
    expect(peekTargets(s, play(s), 'p3')).toEqual([]);
  });

  it('targets come in player order', () => {
    let s = answer(toPowersQuestion(), 'p3', B, T0 + 500);
    s = answer(s, 'p1', { type: 'single', optionId: 'a' }, T0 + 700);
    expect(peekTargets(s, play(s), 'p2')).toEqual(['p1', 'p3']);
  });

  it('whoever answered a spare question is not a target', () => {
    let s = toOthersQuestion({ buffs: ['swap', 'peek'] });
    s = must(takeBuff(s, 'p3', 'swap', T0 + 300, rng0));
    s = answer(s, 'p3', { type: 'boolean', value: true }, T0 + 600);
    expect(peekTargets(s, play(s), 'p2')).toEqual([]);
    expect(buffBlock(s, 'p2', 'peek')).toBe('no_answers');
    s = answer(s, 'p1', B, T0 + 700);
    expect(peekTargets(s, play(s), 'p2')).toEqual(['p1']);
  });

  it('a first try held by «Ще спроба» is not a submitted answer, so it cannot be peeked', () => {
    let s = toPowersQuestion({ buffs: ['retry', 'peek'] });
    s = must(takeBuff(s, 'p3', 'retry', T0 + 300, rng0));
    s = answer(s, 'p3', { type: 'single', optionId: 'a' }, T0 + 600);
    expect(buffOf(play(s), 'p3')?.retry).toBe('again');
    expect(peekTargets(s, play(s), 'p2')).toEqual([]);
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p3')).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('after answering, peek is answered', () => {
    let s = answer(toPowersQuestion(), 'p3', B, T0 + 800);
    s = answer(s, 'p2', B, T0 + 900);
    expect(buffBlock(s, 'p2', 'peek')).toBe('answered');
    expect(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p3')).toEqual({ ok: false, error: 'already_answered' });
  });

  it('not on order or bluff questions, and never on the board', () => {
    const open = (q: Question) => startRound(lobbyWith(makeQuiz([q], { buffs: ['peek'] }), 'Оля', 'Петро'), T0, rng0);
    expect(buffBlock(open(order), 'p1', 'peek')).toBe('unfit_type');
    expect(buffBlock(open(bluff), 'p1', 'peek')).toBe('unfit_bluff');
    const cell = toBuffCell({}, 'auto', ['peek']);
    // На полі відповідає лише той, хто вибрав клітинку: своя причина, а не «ще немає відповідей».
    expect(buffBlock(cell, 'p1', 'peek')).toBe('unfit_board');
    expect(takeBuff(cell, 'p1', 'peek', T0 + 500, rng0, 'p2')).toEqual({ ok: false, error: 'buff_unfit' });
  });

  it('a team peeks at another team: the team id is the target, the answer is the team’s, and the whole target team is told', () => {
    const base = teamQuiz([classicRound('r1', [single4])], 2, 'chosen');
    const quiz = { ...base, settings: { ...base.settings, buffs: ['peek' as const] } };
    // m1 Оля, m2 Петро — t1; m3 Марко, m4 Ната — t2.
    let s = teamGame(quiz, [
      ['Оля', 'Петро'],
      ['Марко', 'Ната'],
    ]);
    while (s.phase !== 'question') s = must(next(s, T0, rng0));
    s = must(actAnswer(s, 'm3', B, T0 + 500));
    const who = actorOf(s, 'm1', 'answerer');
    expect(who).toEqual({ ok: true, id: 't1' });
    if (!who.ok) return;
    expect(peekTargets(s, play(s), 't1')).toEqual(['t2']);
    s = must(takeBuff(s, who.id, 'peek', T0 + 800, rng0, 't2'));
    const t2 = s.players.find((p) => p.id === 't2')!.nickname;
    const peek = playerView(s, 'm1')?.me.buffs?.active?.peek;
    expect(peek).toEqual({ target: { playerId: 't2', nickname: t2 }, answer: B });
    expect(playerView(s, 'm2')?.me.buffs?.active?.peek?.target.nickname).toBe(t2);
    const t1 = s.players.find((p) => p.id === 't1')!.nickname;
    expect(playerView(s, 'm3')?.me.peekedBy).toMatchObject({ nickname: t1 });
    expect(playerView(s, 'm4')?.me.peekedBy).toMatchObject({ nickname: t1 });
    expect(playerView(s, 'm1')?.me.peekedBy).toBeNull();
    // Відповідь іде лише команді, що підглянула.
    expect(JSON.stringify(playerView(s, 'm3')?.me.buffs ?? null)).not.toContain('"optionId":"b"');
  });

  it('when the target is kicked, the peek view and the stage target are null', () => {
    let s = answer(toPowersQuestion(), 'p3', B, T0 + 800);
    s = must(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p3'));
    s = must(removePlayer(s, 'p3', T0 + 1200));
    expect(playerView(s, 'p2')?.me.buffs?.active?.peek).toBeNull();
    expect(stageView(s).buffs).toEqual([{ playerId: 'p2', nickname: 'Петро', kind: 'peek', target: null }]);
    expect(stageView(s).buffNotice?.target).toBeNull();
  });

  it('the peek target stays on the stage through locked and reveal', () => {
    let s = answer(toPowersQuestion(), 'p3', B, T0 + 800);
    s = must(takeBuff(s, 'p2', 'peek', T0 + 1000, rng0, 'p3'));
    s = must(lock(s));
    expect(stageView(s).buffs[0]?.target).toEqual({ playerId: 'p3', nickname: 'Іра' });
    expect(playerView(s, 'p3')?.me.peekedBy).toMatchObject({ nickname: 'Петро' });
    s = must(next(s, T0 + 5000, rng0));
    expect(s.phase).toBe('reveal');
    expect(playerView(s, 'p3')?.me.peekedBy).toMatchObject({ nickname: 'Петро' });
  });

  it('while peek is blocked, nobody is peekable', () => {
    let s = must(submitAnswer(toPowersQuestion(), 'p3', { type: 'single', optionId: 'b' }, T0 + 800));
    expect(playerView(s, 'p2')?.me.buffs?.peekable).toEqual([{ playerId: 'p3', nickname: 'Іра' }]);
    s = must(pause(s, T0 + 900));
    expect(buffBlock(s, 'p2', 'peek')).toBe('paused');
    expect(playerView(s, 'p2')?.me.buffs?.peekable).toEqual([]);
  });
});
