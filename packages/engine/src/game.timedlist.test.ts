import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, type Question, type TimedListItem } from '@quiz/shared';
import { pickCell } from './board';
import { lock, next, override, pause, recordOf, removePlayer, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { actorOf } from './team-act';
import { listHit, listEntry, listPlayers, timedListOf } from './timedlist';
import { boardRound, classicRound, makeQuiz, makeRoundsQuiz, timedlist, withPoints } from './testing/fixtures';
import { lobbyWith, lobbyWithSplash, must, openAt, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

const PLAYERS = ['Олена', 'Тарас', 'Віра', 'Хосе'];
const fresh = (question: Question = timedlist, options: Parameters<typeof makeQuiz>[1] = {}, nicknames: string[] = PLAYERS) =>
  startRound(lobbyWith(makeQuiz([question], options), ...nicknames), 0);
const record = (s: GameState, playerId: string) => recordOf(s, s.questionIndex, playerId);
const points = (s: GameState, playerId: string) => record(s, playerId)?.points;

/** Послідовні listEntry одного гравця в мить now. */
function enter(s: GameState, id: string, words: string[], now = 1000, withEnter = true): GameState {
  return words.reduce((current, word) => {
    const result = listEntry(current, id, word, withEnter, now);
    if (!result.ok) throw new Error(`listEntry ${word}: ${result.error}`);
    return result.state;
  }, s);
}

const ALL = timedlist.items.map((i) => i.text);
const items = timedlist.items as readonly TimedListItem[];

describe('timed list', () => {
  it('listHit prefers exact, then typos among unfound items', () => {
    expect(listHit(items, [], 'ЮПІТЕР')).toEqual({ kind: 'found', id: 'l5' });
    expect(listHit(items, [], 'Юпітр')).toEqual({ kind: 'found', id: 'l5' });
    expect(listHit(items, [], 'червона  планета')).toEqual({ kind: 'found', id: 'l4' });
    expect(listHit(items, ['l5'], 'Юпітер')).toEqual({ kind: 'repeat', id: 'l5' });
    expect(listHit(items, ['l5'], 'Юпітр')).toEqual({ kind: 'repeat', id: 'l5' });
    expect(listHit(items, [], 'Плутон')).toEqual({ kind: 'miss' });
    expect(listHit(items, [], '')).toEqual({ kind: 'miss' });
    expect(listHit(items, [], '   ')).toEqual({ kind: 'miss' });
    // цифри описок не мають
    expect(listHit([{ id: 'n1', text: '1991', accepted: [] }, ...items], [], '1992')).toEqual({ kind: 'miss' });
    const saturns: TimedListItem[] = [
      { id: 's1', text: 'Сатурн', accepted: [] },
      { id: 's2', text: 'Сатурнія', accepted: [] },
    ];
    expect(listHit(saturns, ['s1'], 'Сатурнія')).toEqual({ kind: 'found', id: 's2' });
    // «Сатурні» однаково близьке до обох пунктів — не зараховується нікому
    expect(listHit(saturns, ['s1'], 'Сатурні')).toEqual({ kind: 'miss' });
    expect(listHit(saturns, [], 'Сатурні')).toEqual({ kind: 'miss' });
    // «Сатурнії» ближче до «Сатурнія» (1), ніж до «Сатурн» (2)
    expect(listHit(saturns, [], 'Сатурнії')).toEqual({ kind: 'found', id: 's2' });
  });

  it('listHit forgives at most one typo and takes the nearest item', () => {
    const countries: TimedListItem[] = [
      { id: 'c1', text: 'Австралія', accepted: [] },
      { id: 'c2', text: 'Ісландія', accepted: [] },
      { id: 'c3', text: 'Нідерланди', accepted: ['Голландія'] },
    ];
    // дві описки до «Австралії» — у списку вже інше слово
    expect(listHit(countries, [], 'Австрія')).toEqual({ kind: 'miss' });
    expect(listHit(countries, [], 'Австралия')).toEqual({ kind: 'found', id: 'c1' });
    expect(listHit(countries, [], 'Австрaлія')).toEqual({ kind: 'found', id: 'c1' });
    expect(listHit(countries, [], 'Нидерланды')).toEqual({ kind: 'miss' });
    expect(listHit(countries, [], 'Голандія')).toEqual({ kind: 'found', id: 'c3' });
    // точний збіг іншого написання знайденого пункту й описка знайденого — повтор
    expect(listHit(countries, ['c3'], 'голландія')).toEqual({ kind: 'repeat', id: 'c3' });
    expect(listHit(countries, ['c1'], 'Австралия')).toEqual({ kind: 'repeat', id: 'c1' });
    // точний збіг перемагає описку сусіда; слово за одну описку від двох пунктів — нікому
    const islands = [...countries, { id: 'c4', text: 'Ірландія', accepted: [] }];
    expect(listHit(islands, [], 'Ірландія')).toEqual({ kind: 'found', id: 'c4' });
    expect(listHit(islands, [], 'Ісландія')).toEqual({ kind: 'found', id: 'c2' });
    expect(listHit(islands, [], 'Іландія')).toEqual({ kind: 'miss' });
    expect(listHit(islands, ['c2'], 'Іландія')).toEqual({ kind: 'miss' });
  });

  it('a found word takes its place and a repeat changes nothing', () => {
    const s = enter(fresh(), 'p1', ['Юпітер', 'венера']);
    expect(timedListOf(s, 'p1').found).toEqual(['l5', 'l2']);
    expect(timedListOf(s, 'p2')).toEqual({ found: [], wrong: 0 });
    expect(s.plays[0].timedlist?.progress.p2).toBeUndefined();
    const again = listEntry(s, 'p1', 'ЮПІТЕР', true, 1500);
    expect(again.ok && again.hit).toBe('repeat');
    expect(again.ok && again.index).toBe(5);
    const typo = listEntry(s, 'p1', 'Юпітр', false, 1500);
    expect(typo).toMatchObject({ ok: true, hit: 'repeat', index: 5 });
    expect(again.ok && again.state).toBe(s);
    const found = listEntry(s, 'p1', 'Марс', false, 1500);
    expect(found.ok && found.hit).toBe('found');
  });

  it('a miss costs only on enter and only with a minus', () => {
    const s = fresh();
    const live = listEntry(s, 'p1', 'Плутон', false, 1000);
    expect(live.ok && live.hit).toBe('miss');
    expect(live.ok && live.state).toBe(s);
    expect(timedListOf(enter(s, 'p1', ['Плутон'], 1000, false), 'p1').wrong).toBe(0);
    const missed = enter(s, 'p1', ['Плутон'], 1000, true);
    expect(timedListOf(missed, 'p1').wrong).toBe(1);
    // порожнє слово не рахується ніколи
    expect(listEntry(s, 'p1', '  ', true, 1000)).toMatchObject({ ok: true, hit: 'miss', state: s });
    // без мінуса стан не змінюється
    const free = fresh({ ...timedlist, minus: null });
    const freeMiss = listEntry(free, 'p1', 'Плутон', true, 1000);
    expect(freeMiss.ok && freeMiss.state).toBe(free);
    // повтор з Enter — без мінуса
    const found = enter(s, 'p1', ['Юпітер']);
    const repeat = enter(found, 'p1', ['Юпітер', 'Юпітр'], 1000, true);
    expect(timedListOf(repeat, 'p1')).toEqual({ found: ['l5'], wrong: 0 });
  });

  it('refuses after time, on pause, before the start and for other questions', () => {
    const s = enter(fresh(), 'p1', ['Юпітер']);
    expect(listEntry(s, 'p1', 'Марс', true, 90_001)).toEqual({ ok: false, error: 'time_over' });
    expect(listEntry(s, 'p1', 'Марс', true, 90_000).ok).toBe(true);
    const paused = must(pause(s, 2000));
    expect(listEntry(paused, 'p1', 'Марс', true, 2000)).toEqual({ ok: false, error: 'paused' });
    const splash = openAt(lobbyWithSplash(makeQuiz([timedlist]), 'Олена', 'Тарас'), 0);
    expect(splash.splash).not.toBeNull();
    expect(listEntry(splash, 'p1', 'Марс', true, 100)).toEqual({ ok: false, error: 'not_started' });
    const other = startRound(lobbyWith(makeQuiz(), 'Олена'), 0);
    expect(listEntry(other, 'p1', 'Марс', true, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(listEntry(s, 'p9', 'Марс', true, 1000)).toEqual({ ok: false, error: 'not_found' });
    const locked = must(lock(s, 2000));
    expect(listEntry(locked, 'p1', 'Марс', true, 2000)).toEqual({ ok: false, error: 'wrong_phase' });
    expect(timedListOf(s, 'p1').found).toEqual(['l5']);
  });

  it('finding everything records at once and the question closes when everyone has', () => {
    const s = enter(fresh(timedlist, {}, ['Олена', 'Тарас']), 'p1', ALL, 2000);
    expect(record(s, 'p1')).toMatchObject({
      answer: { type: 'timedlist', found: ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8'], total: 8, wrong: 0 },
      timeMs: 2000,
      accepted: true,
      points: 0,
    });
    expect(s.phase).toBe('question');
    expect(listEntry(s, 'p1', 'Марс', true, 2500)).toEqual({ ok: false, error: 'already_answered' });
    // таймер закриває: Олена отримує справжні бали (N = 2, кожен пункт лише в неї)
    const timed = tick(s, 90_001);
    expect(timed.phase).toBe('locked');
    expect(points(timed, 'p1')).toBe(800);
    expect(record(timed, 'p2')).toBeUndefined();
    // знайшли всі — запитання закривається одразу
    const both = enter(s, 'p2', ALL, 3000);
    expect(both.phase).toBe('locked');
    expect([points(both, 'p1'), points(both, 'p2')]).toEqual([400, 400]);
  });

  describe('scores by rarity among the players present', () => {
    /** Юпітер у всіх; Венера в Олени й Тараса; Марс в Олени; Меркурій у Тараса; Олена — один промах з Enter. */
    function played(s: GameState): GameState {
      let t = enter(s, 'p1', ['Юпітер', 'Венера', 'Марс', 'Плутон']);
      t = enter(t, 'p2', ['Юпітер', 'Венера', 'Меркурій']);
      t = enter(t, 'p3', ['Юпітер']);
      return enter(t, 'p4', ['Юпітер']);
    }

    it('the main case', () => {
      const s = must(lock(played(fresh()), 5000));
      expect(['p1', 'p2', 'p3', 'p4'].map((id) => points(s, id))).toEqual([150, 200, 25, 25]);
      expect(record(s, 'p1')).toMatchObject({
        answer: { type: 'timedlist', found: ['l5', 'l2', 'l4'], total: 8, wrong: 1 },
        timeMs: 90_000,
        accuracy: 3 / 8,
        grade: 'partial',
        accepted: false,
        basePoints: 150,
        streakBonus: 0,
      });
      expect(s.players.find((p) => p.id === 'p1')?.score).toBe(150);
    });

    it('a present player who typed nothing has no record but counts in N', () => {
      let t = enter(fresh(), 'p1', ['Юпітер']);
      t = enter(t, 'p2', ['Юпітер']);
      t = enter(t, 'p3', ['Юпітер']);
      const s = must(lock(t, 5000));
      expect(record(s, 'p4')).toBeUndefined();
      expect(points(s, 'p1')).toBe(50);
      expect(listPlayers(s, s.plays[0])).toEqual(['p1', 'p2', 'p3', 'p4']);
    });

    it('a late player raises N', () => {
      const lobby = lobbyWith(makeQuiz([timedlist]), ...PLAYERS, 'Ігор');
      const away = must(setConnected(lobby, 'p5', false, 0));
      const open = must(next(must(start(away)), 0));
      expect(open.plays[0].timedlist?.present).toEqual(['p1', 'p2', 'p3', 'p4']);
      const back = must(setConnected(open, 'p5', true, 500));
      const s = must(lock(enter(enter(back, 'p5', ['Марс']), 'p1', ['Марс']), 5000));
      expect(points(s, 'p1')).toBe(80);
      expect(points(s, 'p5')).toBe(80);
    });

    it('a late player with only a miss does not raise N but still pays the minus', () => {
      const lobby = lobbyWith(makeQuiz([timedlist]), ...PLAYERS, 'Ігор');
      const away = must(setConnected(lobby, 'p5', false, 0));
      const open = must(setConnected(must(next(must(start(away)), 0)), 'p5', true, 500));
      const s = must(lock(enter(enter(open, 'p5', ['Плутон']), 'p1', ['Марс']), 5000));
      expect(listPlayers(s, s.plays[0])).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(points(s, 'p1')).toBe(100);
      expect(points(s, 'p5')).toBe(-50);
    });

    it('a removed player lowers N', () => {
      let t = fresh();
      for (const id of ['p1', 'p2', 'p3', 'p4']) t = enter(t, id, ['Юпітер']);
      const s = must(lock(must(removePlayer(t, 'p4')), 5000));
      expect(points(s, 'p1')).toBe(33);
    });

    it('the round multiplier and the price round every item', () => {
      const doubled = { rules: { ...DEFAULT_RULES, multiplier: 2 as const } };
      const s = must(lock(enter(fresh(withPoints(timedlist, 333), doubled), 'p1', ['Марс']), 5000));
      expect(points(s, 'p1')).toBe(666);
      const minus = must(lock(enter(fresh(timedlist, doubled), 'p1', ['Плутон']), 5000));
      expect(points(minus, 'p1')).toBe(-100);
      // три знахідники з 4: 333 × 2/4 = 166.5 → 167 на кожен пункт окремо, разом 334 (а не round(333) = 333)
      const shared = must(lock(enter(enter(enter(fresh(withPoints(timedlist, 333)), 'p1', ['Марс', 'Уран']), 'p2', ['Марс', 'Уран']), 'p3', ['Марс', 'Уран']), 5000));
      expect(points(shared, 'p1')).toBe(334);
    });

    it('a total of only misses is negative', () => {
      const s = must(lock(enter(fresh(), 'p1', ['Плутон']), 5000));
      expect(record(s, 'p1')).toMatchObject({ points: -50, accuracy: 0, grade: 'wrong', answer: { found: [], wrong: 1 } });
    });

    it('the total minus is capped at the full price of the question', () => {
      const misses = Array.from({ length: 17 }, () => 'Плутон');
      // 8 пунктів × 100 = 800; 17 × 50 = 850 → −800
      const s = must(lock(enter(fresh(), 'p1', misses), 5000));
      expect(points(s, 'p1')).toBe(-800);
      expect(record(s, 'p1')?.answer).toMatchObject({ wrong: 17 });
      // знахідки додаються до обмеженого мінуса: 100 − 800
      const found = must(lock(enter(enter(fresh(), 'p1', misses), 'p1', ['Марс']), 5000));
      expect(points(found, 'p1')).toBe(100 - 800);
      // множник раунду множить і стелю: 1600
      const doubled = { rules: { ...DEFAULT_RULES, multiplier: 2 as const } };
      expect(points(must(lock(enter(fresh(timedlist, doubled), 'p1', misses), 5000)), 'p1')).toBe(-1600);
      // 16 промахів — рівно 800, без обмеження
      expect(points(must(lock(enter(fresh(), 'p1', misses.slice(1)), 5000)), 'p1')).toBe(-800);
      expect(points(must(lock(enter(fresh(), 'p1', misses.slice(2)), 5000)), 'p1')).toBe(-750);
    });

    it('a removed player after the close keeps everyone else as scored', () => {
      const s = must(lock(played(fresh()), 5000));
      const removed = must(removePlayer(s, 'p4'));
      expect(removed.plays[0].timedlist?.present).toEqual(['p1', 'p2', 'p3', 'p4']);
      expect(['p1', 'p2', 'p3'].map((id) => points(removed, id))).toEqual([150, 200, 25]);
    });

    it('speed, partial and the round minus change nothing', () => {
      const rules = { speedBonus: true, rules: { ...DEFAULT_RULES, penalty: 'minus' as const, partial: 50 } };
      const s = must(lock(played(fresh(timedlist, rules)), 5000));
      expect(['p1', 'p2', 'p3', 'p4'].map((id) => points(s, id))).toEqual([150, 200, 25, 25]);
    });
  });

  it('teammates fill one list', () => {
    const LAYOUT = [
      ['Оля', 'Петро'],
      ['Віра', 'Ігор'],
    ];
    const s = must(next(teamGame(teamQuiz([classicRound('r1', [timedlist])]), LAYOUT), 0));
    expect(['m1', 'm2', 'm3', 'm4'].map((m) => actorOf(s, m, 'answer'))).toEqual([
      { ok: true, id: 't1' },
      { ok: true, id: 't1' },
      { ok: true, id: 't2' },
      { ok: true, id: 't2' },
    ]);
    let t = enter(s, 't1', ['Юпітер']);
    t = enter(t, 't1', ['Венера']);
    expect(t.plays[0].timedlist?.progress).toEqual({ t1: { found: ['l5', 'l2'], wrong: 0 } });
    const repeat = listEntry(t, 't1', 'Юпітер', true, 1000);
    expect(repeat.ok && repeat.hit).toBe('repeat');
    t = enter(t, 't2', ['Юпітер']);
    const locked = must(lock(t, 5000));
    expect(listPlayers(locked, locked.plays[0])).toEqual(['t1', 't2']);
    expect([points(locked, 't1'), points(locked, 't2')]).toEqual([150, 50]);
  });

  it('on a board cell only the chooser plays and the cell mark multiplies', () => {
    const round = boardRound('b1', [{ title: 'Космос', cells: [{ mark: 'x3', answerMode: 'phone', question: timedlist }] }]);
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    const s = must(pickCell(lobby, 'p1', 'q11', 0, () => 0));
    expect(s.plays[0].timedlist?.present).toEqual(['p1']);
    expect(listEntry(s, 'p2', 'Марс', true, 1000)).toEqual({ ok: false, error: 'not_your_turn' });
    const one = enter(s, 'p1', ['Марс']);
    expect(one.phase).toBe('question');
    const done = enter(one, 'p1', ALL.filter((w) => w !== 'Марс'));
    expect(done.phase).toBe('reveal');
    expect(points(done, 'p1')).toBe(2400);
    expect(record(done, 'p1')).toMatchObject({ accepted: true, grade: 'correct', accuracy: 1 });
    // один пункт і закриття таймером: 100 × 3
    const timed = tick(one, 90_001);
    expect(points(timed, 'p1')).toBe(300);
  });

  it('on a board cell with a minus the silent chooser gets a record with 0', () => {
    const round = boardRound('b1', [{ title: 'Космос', cells: [{ answerMode: 'phone', question: timedlist }] }], {
      rules: { ...DEFAULT_RULES, penalty: 'minus' },
    });
    const lobby = must(next(must(start(lobbyWith(makeRoundsQuiz([round], { leaderboard: 'end' }), 'Олена', 'Тарас'))), 0));
    const s = must(pickCell(lobby, 'p1', 'q11', 0, () => 0));
    const timed = tick(s, 90_001);
    expect(record(timed, 'p1')).toMatchObject({ points: 0, grade: 'wrong', answer: { type: 'timedlist', found: [], wrong: 0 } });
    const revealed = must(next(timed, 91_000));
    expect(record(revealed, 'p1')).toMatchObject({ points: 0, grade: 'wrong' });
    expect(revealed.players.find((p) => p.id === 'p1')?.score).toBe(0);
  });

  it('the plain answer event and the host grade do not apply', () => {
    const s = fresh();
    expect(submitAnswer(s, 'p1', { type: 'timedlist', found: ['l5'], total: 8, wrong: 0 }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    expect(submitAnswer(s, 'p1', { type: 'text', value: 'Юпітер' }, 1000)).toEqual({ ok: false, error: 'type_mismatch' });
    const locked = must(lock(enter(s, 'p1', ['Юпітер']), 2000));
    expect(override(locked, 'p1', 'correct')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('removing a player drops their finds', () => {
    const s = enter(enter(fresh(), 'p2', ['Юпітер']), 'p1', ['Марс']);
    const removed = must(removePlayer(s, 'p2'));
    expect(removed.plays[0].timedlist).toEqual({ present: ['p1', 'p3', 'p4'], progress: { p1: { found: ['l4'], wrong: 0 } } });
  });
});
