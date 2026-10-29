import { describe, expect, it } from 'vitest';
import {
  bluff,
  boardRound,
  chain,
  classicRound,
  clues,
  finalRound,
  ladderRound,
  makeRoundsQuiz,
  single,
  single4,
  sortQ,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  wall,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from '@quiz/engine/testing';
import { GAME_STATE_VERSION, hostLive } from '@quiz/engine';
import { ANSWERER_PICKS_PER_SECOND, defaultTeams, type AckResult, type AnswererMode, type Quiz, type QuizSettings, type Round } from '@quiz/shared';
import { FakeScheduler } from '../testing/fake-scheduler';
import { startTeamGame } from '../testing/team-game';
import { TRIAL_RIGHT } from '../testing/survival-game';
import { RoomManager, type Identity, type Room } from './manager';

const HOST: Identity = { role: 'host', playerId: null };
const RIGHT = { type: 'single', optionId: 'b' } as const;
const WRONG = { type: 'single', optionId: 'a' } as const;
const viaJson = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
/** Червоні — Оля (капітан), Петро, Іра; Сині — Марко (капітан), Ната. */
const LAYOUT = [
  ['Оля', 'Петро', 'Іра'],
  ['Марко', 'Ната'],
];

/** Командна гра з ведучим на заставці першого раунду; режим відповідача mode (без нього — капітан). */
function teamRoom(rounds: Round[], mode?: AnswererMode, settings: Partial<QuizSettings> = {}) {
  const scheduler = new FakeScheduler();
  const manager = new RoomManager(scheduler, () => 0.5);
  const quiz = makeRoundsQuiz(rounds, { ...settings, teams: { ...defaultTeams(2), ...(mode === undefined ? {} : { answerer: mode }) } });
  const { room, members, teams } = startTeamGame(manager, quiz, LAYOUT);
  manager.connect(room, HOST);
  const [olya, petro, ira, marko, nata] = ['Оля', 'Петро', 'Іра', 'Марко', 'Ната'].map((name) => members[name]);
  const [red, blue] = teams;
  const next = () => expect(manager.host(room, { type: 'next' })).toEqual({ ok: true });
  return { scheduler, manager, room, olya, petro, ira, marko, nata, red, blue, next };
}

/** «Вибирає капітан»: на заставці Оля вибирає Петра на раунд; далі — до першого запитання. */
function petroAnswers(rounds: Round[], settings: Partial<QuizSettings> = {}) {
  const ctx = teamRoom(rounds, 'chosen', settings);
  expect(ctx.manager.pickAnswerer(ctx.room, ctx.olya, ctx.petro, 'round')).toEqual({ ok: true });
  ctx.next();
  expect(ctx.room.state.phase).toBe('question');
  return ctx;
}

/** Відмова не через право діяти за команду: дія дійшла до рушія. */
function reached(result: AckResult): void {
  expect(result.ok ? null : result.error).not.toBe('not_answerer');
  expect(result.ok ? null : result.error).not.toBe('not_captain');
}

const NOT_ANSWERER = { ok: false, error: 'not_answerer' };
const NOT_CAPTAIN = { ok: false, error: 'not_captain' };

describe('the picked answerer in a room (12g)', () => {
  it('the captain picks a teammate on the intro; on the question the captain is not_answerer and the teammate answers', () => {
    const { manager, room, olya, petro, red, next } = teamRoom([classicRound('r1', [single, withId(single, 'q2')])], 'chosen');
    expect(manager.pickAnswerer(room, olya, petro, 'question')).toEqual({ ok: true });
    next();
    expect(manager.answer(room, olya, RIGHT)).toEqual(NOT_ANSWERER);
    expect(manager.answer(room, petro, RIGHT)).toEqual({ ok: true });
    expect(room.state.plays[0].answers[red]).toMatchObject({ answer: RIGHT });
  });

  it('chain guess and hint, sort and tilt, wall: the captain is not_answerer, the answerer acts', () => {
    const chained = petroAnswers([classicRound('r1', [chain])]);
    expect(chained.manager.guess(chained.room, chained.olya, 'Риба')).toEqual(NOT_ANSWERER);
    expect(chained.manager.hint(chained.room, chained.olya)).toEqual(NOT_ANSWERER);
    expect(chained.manager.guess(chained.room, chained.petro, 'Риба')).toEqual({ ok: true });
    reached(chained.manager.hint(chained.room, chained.petro));

    const sorted = petroAnswers([classicRound('r1', [sortQ])]);
    const view = sorted.manager.view(sorted.room, { role: 'player', playerId: sorted.petro });
    const wordId = view?.role === 'player' ? view.me.sort?.card?.id : undefined;
    expect(wordId).toBeDefined();
    const tilt = { wordId: wordId!, categoryId: 'c1', amount: 0.5 };
    expect(sorted.manager.tilt(sorted.room, sorted.olya, tilt)).toEqual(NOT_ANSWERER);
    expect(sorted.manager.tilt(sorted.room, sorted.petro, tilt)).toEqual({ ok: true });
    expect(sorted.manager.sort(sorted.room, sorted.olya, wordId!, 'c1')).toEqual(NOT_ANSWERER);
    expect(sorted.manager.sort(sorted.room, sorted.petro, wordId!, 'c1')).toEqual({ ok: true });

    const walled = petroAnswers([classicRound('r1', [wall])]);
    expect(walled.manager.wall(walled.room, walled.olya, [0, 1, 2, 3])).toEqual(NOT_ANSWERER);
    expect(walled.manager.wall(walled.room, walled.petro, [0, 1, 2, 3])).toEqual({ ok: true });
  });

  it('bluff lie and pick: the captain is not_answerer, the answerer writes and picks', () => {
    const { manager, room, olya, petro, marko } = petroAnswers([classicRound('r1', [bluff])]);
    expect(manager.lie(room, olya, 'Варшава')).toEqual(NOT_ANSWERER);
    expect(manager.lie(room, petro, 'Варшава')).toEqual({ ok: true });
    expect(manager.lie(room, marko, 'Відень')).toEqual({ ok: true });
    expect(room.state.plays[0].bluff?.stage).toBe('choice');
    const view = manager.view(room, { role: 'player', playerId: petro });
    const option = view?.role === 'player' ? view.bluff?.options.find((o) => o.text !== 'Варшава') : undefined;
    expect(option).toBeDefined();
    expect(manager.bluff(room, olya, option!.id)).toEqual(NOT_ANSWERER);
    expect(manager.bluff(room, petro, option!.id)).toEqual({ ok: true });
  });

  it('buffs and the retry choice come from the answerer', () => {
    const { manager, room, olya, petro } = petroAnswers([classicRound('r1', [single4, withId(single4, 'q2')])], { buffs: ['fifty', 'retry'] });
    expect(manager.buff(room, olya, 'fifty')).toEqual(NOT_ANSWERER);
    expect(manager.buff(room, petro, 'fifty')).toEqual({ ok: true });
    expect(manager.retry(room, olya, true)).toEqual(NOT_ANSWERER);
    reached(manager.retry(room, petro, true));
  });

  it('ladder lifelines come from the answerer; the play-on decision stays with the captain', () => {
    const { manager, room, olya, petro, red, next } = teamRoom([ladderRound('l1')], 'chosen');
    expect(manager.pickAnswerer(room, olya, petro, 'round')).toEqual({ ok: true });
    expect(manager.hostLadderPick(room, red)).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.phase !== 'question'; guard++) next();
    expect(room.state.phase).toBe('question');
    expect(manager.lifeline(room, olya, 'fifty')).toEqual(NOT_ANSWERER);
    expect(manager.lifeline(room, petro, 'fifty')).toEqual({ ok: true });
    expect(manager.answer(room, petro, { type: 'single', optionId: 'b' })).toEqual({ ok: true });
    if (room.state.phase === 'question') expect(manager.host(room, { type: 'lock' })).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.phase !== 'leaderboard'; guard++) next();
    expect(room.state.plays[0].ladder?.decision).toBeNull();
    expect(manager.ladderDecide(room, petro, false)).toEqual(NOT_CAPTAIN);
    expect(manager.ladderDecide(room, olya, false)).toEqual({ ok: true });
  });

  it('the survival trial and its draft come from the one who answered the question', () => {
    const rounds = [survivalRound('s1', survivalQuestions, survivalTrials)];
    const { manager, room, olya, petro, ira, marko, red, next } = petroAnswers(rounds);
    expect(manager.answer(room, petro, WRONG)).toEqual({ ok: true });
    expect(manager.answer(room, marko, RIGHT)).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.phase !== 'leaderboard'; guard++) next();
    const trial = room.state.plays[0].survival?.trial;
    expect(trial?.stage).toBe('open');
    expect(room.state.plays[0].survival?.edge).toEqual([red]);
    const at = Number(trial?.kind === 'question' ? trial.questionId?.slice(1) : 0) - 1;
    const draft = TRIAL_RIGHT[at].type === 'boolean' ? ({ type: 'boolean', value: true } as const) : ({ type: 'single', optionId: 'b' } as const);
    expect(manager.draft(room, olya, draft)).toEqual(NOT_ANSWERER);
    expect(manager.draft(room, petro, draft)).toEqual({ ok: true });
    const mate = manager.view(room, { role: 'player', playerId: ira });
    expect(mate?.role === 'player' && mate.team?.draft).toEqual(draft);
    expect(manager.liveDrafts(room).drafts).toMatchObject([{ id: red, draft }]);
    expect(manager.trial(room, olya, TRIAL_RIGHT[at])).toEqual(NOT_ANSWERER);
    expect(manager.trial(room, petro, TRIAL_RIGHT[at])).toEqual({ ok: true });
  });

  it('survival doors come from the one who answered the question', () => {
    const rounds = [survivalRound('s1', survivalQuestions, survivalTrials, { trial: 'luck' })];
    const { manager, room, olya, petro, marko, next } = petroAnswers(rounds);
    expect(manager.answer(room, petro, WRONG)).toEqual({ ok: true });
    expect(manager.answer(room, marko, RIGHT)).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && room.state.phase !== 'leaderboard'; guard++) next();
    expect(room.state.plays[0].survival?.trial?.stage).toBe('open');
    expect(manager.door(room, olya, 0)).toEqual(NOT_ANSWERER);
    expect(manager.door(room, petro, 0)).toEqual({ ok: true });
  });

  it('cell picks, wagers, wipeout decisions and debuffs stay with the captain: the answerer is not_captain', () => {
    const cell = (id: string, points: number) => ({ ...withId(single, id), points });
    const board = teamRoom(
      [
        boardRound('g1', [
          { title: 'Міста', cells: [cell('c11', 100), cell('c12', 200)] },
          { title: 'Річки', cells: [cell('c21', 100), cell('c22', 200)] },
        ]),
      ],
      'chosen',
    );
    expect(board.manager.pickAnswerer(board.room, board.olya, board.petro, 'round')).toEqual({ ok: true });
    board.next();
    expect(board.manager.pick(board.room, board.petro, 'c11')).toEqual(NOT_CAPTAIN);
    reached(board.manager.pick(board.room, board.olya, 'c11'));

    const final = teamRoom([finalRound('f1', text)], 'chosen');
    expect(final.manager.pickAnswerer(final.room, final.olya, final.petro, 'round')).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && final.room.state.phase !== 'wager'; guard++) final.next();
    expect(final.room.state.phase).toBe('wager');
    expect(final.manager.wager(final.room, final.petro, 0)).toEqual(NOT_CAPTAIN);
    expect(final.manager.wager(final.room, final.olya, 0)).toEqual({ ok: true });

    const wipeout = petroAnswers([wipeoutRound('w1', wipeoutLadder)]);
    expect(wipeout.manager.answer(wipeout.room, wipeout.petro, RIGHT)).toEqual({ ok: true });
    expect(wipeout.manager.host(wipeout.room, { type: 'lock' })).toEqual({ ok: true });
    for (let guard = 0; guard < 4 && wipeout.room.state.phase !== 'leaderboard'; guard++) wipeout.next();
    expect(wipeout.manager.wipeout(wipeout.room, wipeout.petro, false)).toEqual(NOT_CAPTAIN);
    reached(wipeout.manager.wipeout(wipeout.room, wipeout.olya, false));

    const debuffs = petroAnswers([classicRound('r1', [single, withId(single, 'q2')])], { debuffs: ['fog'] });
    expect(debuffs.manager.buyDebuff(debuffs.room, debuffs.petro, debuffs.blue, 'fog')).toEqual(NOT_CAPTAIN);
    reached(debuffs.manager.buyDebuff(debuffs.room, debuffs.olya, debuffs.blue, 'fog'));
  });

  it('teammates and the host see the answerer draft; a captain draft reaches nobody', () => {
    const { manager, room, olya, petro, ira, red } = petroAnswers([classicRound('r1', [text])]);
    const mine = { type: 'text', value: 'Дніпро' } as const;
    expect(manager.draft(room, olya, { type: 'text', value: 'Говерла' })).toEqual(NOT_ANSWERER);
    expect(manager.draft(room, petro, mine)).toEqual({ ok: true });
    for (const id of [olya, ira]) {
      const view = manager.view(room, { role: 'player', playerId: id });
      expect(view?.role === 'player' && view.team?.draft).toEqual(mine);
    }
    expect(manager.liveDrafts(room).drafts).toMatchObject([{ id: red, draft: mine }]);
  });

  it('own-pace clues are opened by the answerer (12c)', () => {
    const { manager, room, olya, petro } = petroAnswers([classicRound('r1', [{ ...clues, cluePace: 'self' }])]);
    expect(manager.clue(room, olya)).toEqual(NOT_ANSWERER);
    expect(manager.clue(room, petro)).toEqual({ ok: true });
  });
});

describe('player:pick-answerer in a room (12g)', () => {
  it('is wrong_phase during a question and not_captain for a teammate; an outsider is not_found', () => {
    const { manager, room, olya, petro, marko, next } = teamRoom([classicRound('r1', [single, withId(single, 'q2')])], 'chosen');
    expect(manager.pickAnswerer(room, petro, petro, 'question')).toEqual(NOT_CAPTAIN);
    expect(manager.pickAnswerer(room, olya, marko, 'question')).toEqual({ ok: false, error: 'not_found' });
    next();
    expect(manager.pickAnswerer(room, olya, petro, 'question')).toEqual({ ok: false, error: 'wrong_phase' });
  });

  it('captain mode: the pick is wrong_phase and a teammate is not_captain on the question, as before 12g', () => {
    const { manager, room, olya, petro, next } = teamRoom([classicRound('r1', [single, sortQ])]);
    expect(manager.pickAnswerer(room, olya, petro, 'question')).toEqual({ ok: false, error: 'wrong_phase' });
    next();
    expect(manager.answer(room, petro, RIGHT)).toEqual(NOT_CAPTAIN);
    expect(manager.answer(room, olya, RIGHT)).toEqual({ ok: true });
  });

  it(`more than ${ANSWERER_PICKS_PER_SECOND} picks a second are too_soon, per person; the next second counts again; a kick clears the window`, () => {
    const { scheduler, manager, room, olya, petro, ira, marko, nata } = teamRoom([classicRound('r1', [single])], 'chosen');
    for (let i = 0; i < ANSWERER_PICKS_PER_SECOND; i++) {
      expect(manager.pickAnswerer(room, olya, i % 2 === 0 ? petro : ira, 'question')).toEqual({ ok: true });
    }
    expect(manager.pickAnswerer(room, olya, petro, 'question')).toEqual({ ok: false, error: 'too_soon' });
    // Вікно — на людину: капітан синіх вибирає далі.
    expect(manager.pickAnswerer(room, marko, nata, 'question')).toEqual({ ok: true });
    scheduler.advance(1000);
    expect(manager.pickAnswerer(room, olya, petro, 'question')).toEqual({ ok: true });
    expect(room.pickRate.has(olya)).toBe(true);
    expect(manager.host(room, { type: 'kick', playerId: olya })).toEqual({ ok: true });
    expect(room.pickRate.has(olya)).toBe(false);
  });

  it('a stranger opens no rate window', () => {
    const { manager, room } = teamRoom([classicRound('r1', [single])], 'chosen');
    expect(manager.pickAnswerer(room, 'nobody', null, 'question')).toEqual({ ok: false, error: 'not_found' });
    expect(room.pickRate.has('nobody')).toBe(false);
  });
});

/** Кімната-автопілот: автор Марта й Тарас — червоні, Іра й Марко — сині; усі на зв'язку, автор почав гру (заставка раунду). */
function botRoom(manager: RoomManager, quiz: Quiz) {
  const created = manager.createAutopilot(quiz, 'u1', 'q1', 'Марта');
  if (!created.ok) throw new Error(created.error);
  const { room } = created;
  manager.connect(room, { role: 'player', playerId: created.playerId });
  const ids: Record<string, string> = { Марта: created.playerId };
  for (const name of ['Тарас', 'Іра', 'Марко']) {
    const joined = manager.join(room.code, name);
    if (!joined.ok) throw new Error(joined.error);
    manager.connect(room, { role: 'player', playerId: joined.playerId });
    ids[name] = joined.playerId;
  }
  const [red, blue] = room.state.teams!.list.map((t) => t.id);
  for (const [name, team] of [['Марта', red], ['Тарас', red], ['Іра', blue], ['Марко', blue]] as const) {
    expect(manager.teamPick(room, ids[name], team)).toEqual({ ok: true });
  }
  expect(manager.author(room, ids.Марта, { type: 'start' })).toEqual({ ok: true });
  expect(room.state.phase).toBe('intro');
  return { room, ids, red };
}

describe('the answerer across the bot room and a restart (12g)', () => {
  it('a rotate bot room plays the round by itself, the live row actor follows the turn, and the captain may pick from the phone', () => {
    const scheduler = new FakeScheduler();
    const manager = new RoomManager(scheduler, () => 0.5);
    const quiz = makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2'), withId(single, 'q3')])], {
      leaderboard: 'end',
      teams: { ...defaultTeams(2), answerer: 'rotate' },
    });
    const { room, ids, red } = botRoom(manager, quiz);
    const actors: string[] = [];
    for (let guard = 0; guard < 200 && room.state.phase !== 'finished'; guard++) {
      if (room.state.phase === 'question' && actors.length === room.state.questionIndex) {
        actors.push(hostLive(room.state)?.rows.find((row) => row.id === red)?.actor ?? '');
      }
      scheduler.advance(1000);
    }
    expect(room.state.phase).toBe('finished');
    expect(actors).toEqual(['Марта', 'Тарас', 'Марта']);

    // Капітан вибирає з телефона (подія гравця, не крок автопілота).
    const again = botRoom(manager, quiz);
    expect(manager.pickAnswerer(again.room, again.ids.Марта, again.ids.Тарас, 'round')).toEqual({ ok: true });
    for (let guard = 0; guard < 20 && again.room.state.phase !== 'question'; guard++) scheduler.advance(1000);
    expect(hostLive(again.room.state)?.rows.find((row) => row.id === again.red)?.actor).toBe('Тарас');
  });

  it('a room with a round pick and a turn is saved as version 20 and restores with the same answerer', () => {
    const { scheduler, manager, room, olya, petro, ira, red, next } = teamRoom(
      [classicRound('r1', [single, withId(single, 'q2')])],
      'rotate',
    );
    expect(manager.pickAnswerer(room, olya, ira, 'round')).toEqual({ ok: true });
    next();
    expect(room.state.teams?.answerers?.[red]).toMatchObject({ memberId: ira, scope: 'round', roundIndex: 0 });
    expect(room.state.teams?.turns).toBeDefined();
    const saved = viaJson(manager.snapshot(room));
    expect(saved.stateVersion).toBe(GAME_STATE_VERSION);
    expect(GAME_STATE_VERSION).toBe(20);
    manager.freeze();
    const later = new RoomManager(scheduler, () => 0.5);
    const back = later.restore(saved) as Room;
    expect(back.state.teams?.answerers).toEqual(room.state.teams?.answerers);
    expect(back.state.teams?.turns).toEqual(room.state.teams?.turns);
    later.connect(back, HOST);
    for (const id of [olya, petro, ira]) later.connect(back, { role: 'player', playerId: id });
    expect(later.host(back, { type: 'resume' })).toEqual({ ok: true });
    expect(later.answer(back, olya, RIGHT)).toEqual(NOT_ANSWERER);
    expect(later.answer(back, ira, RIGHT)).toEqual({ ok: true });
  });
});
