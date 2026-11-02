import { describe, expect, it } from 'vitest';
import { defaultTeams, type Question, type Quiz, type QuizSettings } from '@quiz/shared';
import { adjustScore } from './adjust';
import { buffBlock, takeBuff } from './buffs';
import { buyDebuff, setDebuff } from './debuffs';
import { lock, next, pause, start, submitAnswer, type GameState } from './game';
import { grantPerks, perkBlock, perkFits, perksApply, perksOn, perksView, usePerk, wardReady } from './perks';
import { blitzRound, boardRound, chain, classicRound, finalRound, makeRoundsQuiz, single, withId, withVideo } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame } from './testing/teams';
import { overtimeOf } from './timing';

const T0 = 1_000_000;
const rng0 = () => 0;
const kyiv = { type: 'single', optionId: 'b' } as const;
const ALL = { kinds: ['time', 'hint', 'ward'] as ('time' | 'hint' | 'ward')[], timeMs: 5000 };

const hinted: Question = { ...single, hint: 'Місто Лева', timeLimit: 20 };

function perkQuiz(questions: Question[] = [hinted, withId(single, 'q2')], settings: Partial<QuizSettings> = {}): Quiz {
  return makeRoundsQuiz([classicRound('r1', questions)], { leaderboard: 'end', buffs: ['time', 'hint', 'double'], ...settings });
}

/** Оля p1, Петро p2, Іра p3; гру почато, бонуси видано одразу після start, перше запитання відкрито о T0. */
function opened(quiz: Quiz = perkQuiz(), grants: Parameters<typeof grantPerks>[1] = { p1: ALL }): GameState {
  const started = grantPerks(must(start(lobbyWith(quiz, 'Оля', 'Петро', 'Іра'))), grants);
  return must(next(started, T0, rng0));
}

const toNext = (s: GameState, at: number) => must(next(must(next(must(lock(s)), at, rng0)), at, rng0));

describe('granting level perks', () => {
  it('grants the fitting kinds once per player, never in the lobby', () => {
    const started = must(start(lobbyWith(perkQuiz(), 'Оля', 'Петро', 'Іра')));
    const s = grantPerks(started, { p1: ALL });
    expect(s.perks?.p1).toEqual({ kinds: ['time', 'hint', 'ward'], timeMs: 5000, used: {} });
    // повтор з іншим timeMs нічого не змінює
    expect(grantPerks(s, { p1: { ...ALL, timeMs: 10_000 } }).perks).toEqual(s.perks);
    // у лобі — стан без змін
    const lobby = lobbyWith(perkQuiz(), 'Оля');
    expect(grantPerks(lobby, { p1: ALL })).toBe(lobby);
    // невідомий гравець — без запису
    expect(grantPerks(started, { zz: ALL }).perks).toBeUndefined();
  });

  it('the switch off and a team game grant nothing', () => {
    const off = must(start(lobbyWith(perkQuiz(undefined, { levelBonuses: false }), 'Оля', 'Петро')));
    expect(perksOn(off)).toBe(false);
    expect(grantPerks(off, { p1: ALL }).perks).toBeUndefined();
    const team = teamGame(makeRoundsQuiz([classicRound('r1', [hinted])], { teams: defaultTeams(2) }), [['Оля'], ['Петро']]);
    expect(perksOn(team)).toBe(false);
    expect(grantPerks(team, { m1: ALL, t1: ALL }).perks).toBeUndefined();
  });

  it('perkFits: no hint, no debuffs or only video questions leave that perk out', () => {
    const plain = perkQuiz([single, withId(single, 'q2')]);
    expect(perkFits(plain, 'hint')).toBe(false);
    expect(perkFits({ ...plain, spares: [{ ...withId(single, 's1'), hint: 'Запасна' }] }, 'hint')).toBe(true);
    const noDebuffs = perkQuiz(undefined, { debuffs: [] });
    expect(perkFits(noDebuffs, 'ward')).toBe(false);
    const video = perkQuiz([withVideo(hinted), withVideo(withId(single, 'q2'))]);
    expect(perkFits(video, 'time')).toBe(false);
    expect(perkFits(perkQuiz(), 'time')).toBe(true);
    expect(grantPerks(must(start(lobbyWith(plain, 'Оля'))), { p1: ALL }).perks?.p1.kinds).toEqual(['time', 'ward']);
    expect(grantPerks(must(start(lobbyWith(noDebuffs, 'Оля'))), { p1: ALL }).perks?.p1.kinds).toEqual(['time', 'hint']);
    expect(grantPerks(must(start(lobbyWith(video, 'Оля'))), { p1: ALL }).perks?.p1.kinds).toEqual(['hint', 'ward']);
    // нічого не пасує — без запису
    const bare = perkQuiz([withVideo(single)], { debuffs: [] });
    expect(grantPerks(must(start(lobbyWith(bare, 'Оля'))), { p1: ALL }).perks).toBeUndefined();
  });

  it('perkFits counts only questions where 12h buffs can apply (rounds and question types)', () => {
    // підказка й таймер лише в бліці та фіналі — бонусам там нема де діяти
    const offRounds = makeRoundsQuiz([blitzRound('r1', [hinted]), finalRound('r2', withId(hinted, 'q2'))], { debuffs: [] });
    expect(perkFits(offRounds, 'hint')).toBe(false);
    expect(perkFits(offRounds, 'time')).toBe(false);
    // запасні не рахуються, коли бафам нема де діяти
    expect(perkFits({ ...offRounds, spares: [{ ...withId(single, 's1'), hint: 'Запасна' }] }, 'hint')).toBe(false);
    // ланцюжок рахується окремо — бафів там немає
    expect(perkFits(makeRoundsQuiz([classicRound('r1', [{ ...chain, hint: 'Ланцюжок' } as Question])]), 'hint')).toBe(false);
    // звичайна клітинка поля пасує, бліц-клітинка — ні
    const board = (kind: 'normal' | 'blitz') => makeRoundsQuiz([boardRound('r1', [{ title: 'Міста', cells: [{ question: hinted, kind }] }])]);
    expect(perkFits(board('normal'), 'hint')).toBe(true);
    expect(perkFits(board('blitz'), 'hint')).toBe(false);
    // та сама вікторина — та сама відповідь (кеш за об'єктом)
    expect(perkFits(offRounds, 'hint')).toBe(false);
  });

  it('perksApply: on, not teams, and at least one perk fits', () => {
    const started = (quiz: Quiz) => must(start(lobbyWith(quiz, 'Оля')));
    expect(perksApply(started(perkQuiz()))).toBe(true);
    expect(perksApply(started(perkQuiz(undefined, { levelBonuses: false })))).toBe(false);
    expect(perksApply(started(perkQuiz([withVideo(single)], { debuffs: [] })))).toBe(false);
    const team = teamGame(makeRoundsQuiz([classicRound('r1', [hinted])], { teams: defaultTeams(2) }), [['Оля'], ['Петро']]);
    expect(perksApply(team)).toBe(false);
  });
});

describe('using level perks', () => {
  it('+5 s adds personal time, adds on top of the extra-time buff, once per game', () => {
    const s = must(usePerk(opened(), 'p1', 'time', T0 + 1000));
    expect(overtimeOf(s.plays[0], 'p1')).toBe(5000);
    expect(s.perks?.p1.used.time).toBe(0);
    expect(usePerk(s, 'p1', 'time', T0 + 2000)).toEqual({ ok: false, error: 'perk_used' });
    const buffed = must(takeBuff(opened(), 'p1', 'time', T0 + 1000, rng0));
    expect(overtimeOf(must(usePerk(buffed, 'p1', 'time', T0 + 2000)).plays[0], 'p1')).toBe(35_000);
    // і навпаки: «Додатковий час» після бонуса теж додається
    expect(overtimeOf(must(takeBuff(s, 'p1', 'time', T0 + 2000, rng0)).plays[0], 'p1')).toBe(35_000);
    // used — до наступного запитання і далі
    const later = toNext(s, T0 + 5000);
    expect(perkBlock(later, 'p1', 'time')).toBe('used');
    expect(usePerk(later, 'p1', 'time', T0 + 6000)).toEqual({ ok: false, error: 'perk_used' });
  });

  it('the level hint shows the author hint on this question only', () => {
    const s = must(usePerk(opened(), 'p1', 'hint', T0 + 1000));
    expect(perksView(s, 'p1')?.hint).toBe('Місто Лева');
    expect(perksView(opened(), 'p1')?.hint).toBeNull();
    const later = toNext(s, T0 + 5000);
    expect(perksView(later, 'p1')?.hint).toBeNull();
    expect(perksView(later, 'p1')?.items).toContainEqual({ kind: 'hint', block: 'used' });
  });

  it('the level hint and the hint buff exclude each other on one question', () => {
    const buffed = must(takeBuff(opened(), 'p1', 'hint', T0 + 1000, rng0));
    expect(perkBlock(buffed, 'p1', 'hint')).toBe('unfit');
    expect(usePerk(buffed, 'p1', 'hint', T0 + 2000)).toEqual({ ok: false, error: 'perk_unfit' });
    const perked = must(usePerk(opened(), 'p1', 'hint', T0 + 1000));
    expect(buffBlock(perked, 'p1', 'hint')).toBe('taken');
    expect(takeBuff(perked, 'p1', 'hint', T0 + 2000, rng0)).toEqual({ ok: false, error: 'buff_unfit' });
    // без підказки автора — unfit
    const second = toNext(opened(), T0 + 5000);
    expect(perkBlock(second, 'p1', 'hint')).toBe('unfit');
  });

  it('a perk does not take the buff slot', () => {
    const s = must(usePerk(opened(), 'p1', 'time', T0 + 1000));
    expect(takeBuff(s, 'p1', 'double', T0 + 2000, rng0).ok).toBe(true);
    expect(s.buffSeq).toBe(0);
  });

  it('blocks: blitz, pause, answered, video, no grant', () => {
    // бліц першим, далі класика: бонуси видано, але в бліці їх не натиснути
    const blitz = makeRoundsQuiz([blitzRound('b1', [hinted]), classicRound('r2', [withId(hinted, 'q2')])], { buffs: ['time'] });
    const inBlitz = opened(blitz);
    expect(perkBlock(inBlitz, 'p1', 'time')).toBe('elsewhere');
    expect(usePerk(inBlitz, 'p1', 'time', T0 + 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    const paused = must(pause(opened(), T0 + 1000));
    expect(perkBlock(paused, 'p1', 'time')).toBe('paused');
    expect(usePerk(paused, 'p1', 'time', T0 + 1000)).toEqual({ ok: false, error: 'paused' });
    const answered = must(submitAnswer(opened(), 'p1', kyiv, T0 + 1000));
    expect(perkBlock(answered, 'p1', 'time')).toBe('answered');
    expect(usePerk(answered, 'p1', 'time', T0 + 2000)).toEqual({ ok: false, error: 'already_answered' });
    const video = opened(perkQuiz([withVideo(hinted), withId(single, 'q2')]));
    expect(perkBlock(video, 'p1', 'time')).toBe('unfit');
    expect(usePerk(video, 'p1', 'time', T0 + 1000)).toEqual({ ok: false, error: 'perk_unfit' });
    expect(usePerk(opened(), 'p2', 'time', T0 + 1000)).toEqual({ ok: false, error: 'not_allowed' });
    expect(usePerk(opened(), 'zz', 'time', T0 + 1000)).toEqual({ ok: false, error: 'not_found' });
    expect(usePerk(opened(), 'p1', 'time', T0 + 60_000)).toEqual({ ok: false, error: 'time_over' });
    expect(perkBlock(opened(), 'p1', 'time', T0 + 60_000)).toBe('time');
  });
});

describe('the ward', () => {
  it('quenches the first host debuff; the second one sticks', () => {
    const s = opened();
    expect(wardReady(s, 'p1')).toBe(true);
    const warded = must(setDebuff(s, 'p1', 'fog'));
    expect(warded.debuffs.p1).toBeUndefined();
    expect(typeof warded.perks?.p1.used.ward).toBe('number');
    expect(wardReady(warded, 'p1')).toBe(false);
    expect(must(setDebuff(warded, 'p1', 'fog')).debuffs.p1).toMatchObject({ kind: 'fog', by: null });
    // перевірки до оберегу лишаються: недозволений дебаф — not_allowed, оберіг цілий
    const narrow = opened(perkQuiz(undefined, { debuffs: ['fog'] }));
    expect(setDebuff(narrow, 'p1', 'mud')).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('a bought debuff on a warded target is charged, quenched, and the next purchase sticks', () => {
    const rich = must(adjustScore(opened(), 'p2', 1000, T0 + 500));
    const before = rich.players.find((p) => p.id === 'p2')!.score;
    const bought = must(buyDebuff(rich, 'p2', 'p1', 'fog', T0 + 1000));
    expect(bought.players.find((p) => p.id === 'p2')!.score).toBe(before - 200);
    expect(bought.debuffs.p1).toBeUndefined();
    expect(bought.perks?.p1.used.ward).toBe(0);
    expect(bought.adjustments.at(-1)).toMatchObject({ source: 'debuff', target: 'p1', debuff: 'fog', points: -200 });
    // той самий цикл — уже купив
    expect(buyDebuff(bought, 'p2', 'p1', 'fog', T0 + 1500)).toEqual({ ok: false, error: 'debuff_bought' });
    const nextCycle = toNext(bought, T0 + 5000);
    const again = must(buyDebuff(nextCycle, 'p2', 'p1', 'fog', T0 + 6000));
    expect(again.debuffs.p1).toMatchObject({ kind: 'fog', by: 'p2' });
  });

  it('a state without perks takes debuffs as before 15a', () => {
    const s = opened(perkQuiz(), {});
    expect(s.perks).toBeUndefined();
    expect(wardReady(s, 'p1')).toBe(false);
    expect(must(setDebuff(s, 'p1', 'fog')).debuffs.p1).toEqual({ kind: 'fog', firedAt: null, since: null, by: null });
    const rich = must(adjustScore(s, 'p2', 1000, T0 + 500));
    expect(must(buyDebuff(rich, 'p2', 'p1', 'fog', T0 + 1000)).debuffs.p1).toEqual({ kind: 'fog', firedAt: null, since: null, by: 'p2' });
  });
});
