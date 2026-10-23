import { describe, expect, it } from 'vitest';
import { takeBuff } from './buffs';
import { chooserOf } from './board-turns';
import { end, lock, next, pause, resume, setConnected, submitAnswer, tick, type GameState } from './game';
import { GAME_STATE_VERSION, suspend } from './restore';
import { T0, toBuffCell, toBuffQuestion, toOthersQuestion } from './testing/buffs';
import { toDuelQuestion } from './testing/duel';
import { classicRound, makeQuiz, makeRoundsQuiz, single, withId } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

const HOUR = 3_600_000;
const kyiv = { type: 'single', optionId: 'b' } as const;
const roundTrip = (s: GameState): GameState => JSON.parse(JSON.stringify(s)) as GameState;

describe('suspend after a restart', () => {
  it('pauses a running question at the moment it was saved, so the downtime costs nobody time', () => {
    const answered = must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000));
    const s = suspend(answered, T0 + 5000);
    expect(s.paused).toBe(true);
    expect(s.pausedAt).toBe(T0 + 5000);
    expect(s.remainingMs).toBe(15_000);
    expect(s.players.every((p) => !p.connected)).toBe(true);
    // відповідь Петра й бали ті самі
    expect(s.plays[0]).toEqual(answered.plays[0]);
    expect(s.players.map((p) => p.score)).toEqual(answered.players.map((p) => p.score));
    // година простою: після «Продовжити» лишається ті самі 15 с
    const resumed = must(resume(s, T0 + 5000 + HOUR));
    expect(resumed.endsAt).toBe(T0 + 5000 + HOUR + 15_000);
    expect(submitAnswer(resumed, 'p1', kyiv, T0 + HOUR + 19_000).ok).toBe(true);
  });

  it('a deadline that passed before the save is applied first', () => {
    const s = suspend(toBuffQuestion(), T0 + 20_001);
    expect(s.phase).toBe('locked');
    expect(s.paused).toBe(true);
  });

  it('a vote clock and extra time move with the pause', () => {
    // зал голосує серед тих, хто вже відповів: Петро
    const voted = must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 1000));
    const asked = must(takeBuff(voted, 'p1', 'audience', T0 + 5000, () => 0));
    const resumed = must(resume(suspend(asked, T0 + 6000), T0 + 6000 + HOUR));
    expect(resumed.plays[0].buffs?.p1.vote?.endsAt).toBe(asked.plays[0].buffs!.p1.vote!.endsAt! + HOUR);
  });

  it('a splash that was playing finishes after the pause, and the timer starts after it', () => {
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')])]);
    const open = openAt(lobbyWithSplash(quiz, 'Анна', 'Богдан'), T0);
    expect(open.splash?.until).toBe(T0 + 1200);
    // збереження посеред заставки: 700 мс заставки й увесь час запитання ще попереду
    const resumed = must(resume(suspend(open, T0 + 500), T0 + 500 + HOUR));
    expect(resumed.splash?.until).toBe(T0 + 1200 + HOUR);
    expect(resumed.startedAt).toBe(T0 + 1200 + HOUR);
    expect(resumed.endsAt).toBe(T0 + 21_200 + HOUR);
  });

  it('keeps a state that was already paused as it was, apart from the connections', () => {
    const paused = must(pause(toBuffQuestion(), T0 + 4000));
    const s = suspend(paused, T0 + 9000);
    expect(s.pausedAt).toBe(T0 + 4000);
    expect(s.remainingMs).toBe(16_000);
    expect({ ...s, players: paused.players }).toEqual(paused);
    expect(s.players.every((p) => !p.connected)).toBe(true);
    // «Продовжити» через годину: ті самі 16 с
    expect(must(resume(s, T0 + 9000 + HOUR)).endsAt).toBe(T0 + 9000 + HOUR + 16_000);
  });

  it('leaves the lobby and the finished game unpaused', () => {
    const lobby = lobbyWith(makeQuiz([single]), 'Оля', 'Петро');
    const s = suspend(lobby, T0);
    expect(s.paused).toBe(false);
    expect(s.players.map((p) => p.connected)).toEqual([false, false]);
    const finished = suspend(must(end(toBuffQuestion(), T0 + 1000)), T0 + 2000);
    expect(finished.phase).toBe('finished');
    expect(finished.paused).toBe(false);
    expect(finished.players.every((p) => !p.connected)).toBe(true);
  });

  it('pauses a board cell and a duel too', () => {
    expect(suspend(toBuffCell(), T0 + 1000).paused).toBe(true);
    const duel = suspend(toDuelQuestion(), T0 + 61_000);
    expect(duel.paused).toBe(true);
    expect(duel.remainingMs).toBe(19_000);
    // година простою: дуель продовжується з тими самими 19 с
    expect(must(resume(duel, T0 + 61_000 + HOUR)).endsAt).toBe(T0 + 61_000 + HOUR + 19_000);
  });

  it('a board turn does not skip the absent chooser: the 30 seconds start afresh after «Продовжити»', () => {
    // Оля відповідає на клітинку, розкриття — і знову вибір; Оля поза зв'язком після перезапуску
    const answered = must(submitAnswer(toBuffCell(), 'p1', kyiv, T0 + 1000));
    let board = must(lock(answered));
    while (board.phase !== 'board') board = must(next(board, T0 + 2000));
    const s = suspend(board, T0 + 3000);
    expect(s.paused).toBe(true);
    expect(s.board?.awaySince ?? null).toBeNull();
    const back = T0 + 3000 + HOUR;
    const resumed = must(resume(s, back));
    expect(resumed.phase).toBe('board');
    const chooser = chooserOf(resumed);
    // хто ще не повернувся — отримує повні 30 с від «Продовжити», а не від миті збереження
    expect(resumed.board?.awaySince).toBe(back);
    expect(chooserOf(tick(resumed, back + 29_000))).toBe(chooser);
    expect(chooserOf(tick(resumed, back + 30_000))).not.toBe(chooser);
    // повернувся — відлік знято
    expect(must(setConnected(resumed, chooser!, true, back)).board?.awaySince).toBeNull();
  });
});

describe('the saved state', () => {
  it('survives JSON unchanged, and so do its views', () => {
    const states = [
      toBuffQuestion(),
      toBuffCell(),
      toOthersQuestion(),
      toDuelQuestion(),
      must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, () => 0)),
      must(takeBuff(must(submitAnswer(toOthersQuestion(), 'p2', kyiv, T0 + 1000)), 'p1', 'audience', T0 + 5000, () => 0)),
      suspend(must(submitAnswer(toBuffQuestion(), 'p2', kyiv, T0 + 3000)), T0 + 5000),
    ];
    for (const s of states) {
      expect(roundTrip(s)).toEqual(s);
      expect(hostView(roundTrip(s))).toEqual(hostView(s));
      expect(stageView(roundTrip(s))).toEqual(stageView(s));
      expect(playerView(roundTrip(s), 'p1')).toEqual(playerView(s, 'p1'));
    }
  });

  it('the state format is pinned to GAME_STATE_VERSION', () => {
    // Ключі верхнього рівня стану, гравця й запису запитання з кількох станів (класика, поле з бафом, дуель).
    // Якщо тест упав, бо змінився формат: підніміть GAME_STATE_VERSION і додайте новий рядок у KEYS.
    const KEYS: Record<number, string> = {
      1:
        'adjustmentSeq,adjustments,board,buffSeq,debuffs,duel,duelUsed,duelsDeclared,endsAt,final,guidePage,heldAt,paused,pausedAt,phase,players,plays,presented,questionIndex,quiz,remainingMs,roundIndex,sparesUsed,splash,startedAt,transitions' +
        ' | connected,id,nickname,score,streak,totalTimeMs' +
        ' | answers,board,buffs,extraMs,question,roundIndex',
    };
    const states = [toBuffQuestion(), must(takeBuff(toBuffCell(), 'p1', 'fifty', T0 + 1000, () => 0)), toDuelQuestion()];
    const keys = (objects: object[]) => [...new Set(objects.flatMap((o) => Object.keys(o)))].sort().join(',');
    const shape = [keys(states), keys(states.flatMap((s) => s.players)), keys(states.flatMap((s) => s.plays))].join(' | ');
    expect(shape).toBe(KEYS[GAME_STATE_VERSION]);
  });
});
