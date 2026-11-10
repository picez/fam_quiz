import { describe, expect, it } from 'vitest';
import { createGame, end, lock, next, removePlayer, setConnected, start, type GameState } from './game';
import { addLatePlayer } from './saved';
import { dropMember } from './teams';
import { hideTruth, submitTruth, truthOpen } from './truth';
import { classicRound, makeRoundsQuiz, single, truthRound, withId } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamLobby, teamQuiz } from './testing/teams';

// «Правда про гравця» (28b): факти в лобі — один на людину, змінюється до роздачі, ведучий ховає, вилучення прибирає.

const t0 = 1_000_000;
const quiz = makeRoundsQuiz([classicRound('r1', [single]), truthRound('r2')]);
const lobby = () => lobbyWith(quiz, 'Олена', 'Тарас', 'Віра', 'Хосе');
const facts = (s: GameState) => s.truth?.facts ?? {};

describe('player truth facts in the lobby', () => {
  it('the lobby collects one fact per person', () => {
    const s = must(submitTruth(lobby(), 'p1', '  Я стрибала   з парашутом ', t0));
    expect(facts(s).p1).toEqual({ text: 'Я стрибала з парашутом', hidden: false, at: t0 });
    const changed = must(submitTruth(s, 'p1', 'Я плавала з акулами', t0 + 1000));
    expect(facts(changed).p1).toEqual({ text: 'Я плавала з акулами', hidden: false, at: t0 + 1000 });
    expect(Object.keys(facts(changed))).toEqual(['p1']);
    const cleared = must(submitTruth(changed, 'p1', '   ', t0 + 2000));
    expect('p1' in facts(cleared)).toBe(false);
    expect(lobby().truth).toEqual({ facts: {} });
  });

  it('refuses a long fact, a stranger and a quiz without the round', () => {
    const s = lobby();
    expect(submitTruth(s, 'p1', 'я'.repeat(201), t0)).toEqual({ ok: false, error: 'truth_text' });
    expect(facts(must(submitTruth(s, 'p1', 'я'.repeat(200), t0))).p1.text).toHaveLength(200);
    expect(submitTruth(s, 'p9', 'Я тут', t0)).toEqual({ ok: false, error: 'not_found' });
    const plain = lobbyWith(makeRoundsQuiz([classicRound('r1', [single])]), 'Олена');
    expect('truth' in plain).toBe(false);
    expect('truth' in createGame(makeRoundsQuiz([classicRound('r1', [single])]))).toBe(false);
    expect(submitTruth(plain, 'p1', 'Я тут', t0)).toEqual({ ok: false, error: 'truth_closed' });
    expect(hideTruth(plain, 'p1', true)).toEqual({ ok: false, error: 'truth_closed' });
    const result = submitTruth(s, 'p1', 'я'.repeat(201), t0);
    expect(result.ok).toBe(false);
    // відмова не чіпає стану
    expect(lobby()).toEqual(s);
  });

  it('the same text changes nothing', () => {
    const s = must(submitTruth(lobby(), 'p2', 'Я знаю шість мов', t0));
    expect(must(submitTruth(s, 'p2', ' Я знаю  шість мов ', t0 + 5000))).toBe(s);
    expect(must(submitTruth(lobby(), 'p2', '', t0))).toEqual(lobby());
  });

  it('the host hides and shows a fact; a new text unhides', () => {
    const s = must(submitTruth(lobby(), 'p2', 'Я знаю шість мов', t0));
    const hidden = must(hideTruth(s, 'p2', true));
    expect(facts(hidden).p2).toEqual({ text: 'Я знаю шість мов', hidden: true, at: t0 });
    expect(must(hideTruth(hidden, 'p2', true))).toBe(hidden);
    expect(facts(must(hideTruth(hidden, 'p2', false))).p2.hidden).toBe(false);
    const rewritten = must(submitTruth(hidden, 'p2', 'Я знаю сім мов', t0 + 1000));
    expect(facts(rewritten).p2).toEqual({ text: 'Я знаю сім мов', hidden: false, at: t0 + 1000 });
    // той самий текст не знімає «сховано»
    expect(facts(must(submitTruth(hidden, 'p2', 'Я знаю шість мов', t0 + 1000))).p2.hidden).toBe(true);
    expect(hideTruth(s, 'p3', true)).toEqual({ ok: false, error: 'not_found' });
  });

  it('facts stay open after the start until the deal', () => {
    const started = must(start(lobby()));
    expect(started.phase).toBe('intro');
    expect(truthOpen(started)).toBe(true);
    const written = must(submitTruth(started, 'p3', 'Я бачила північне сяйво', t0));
    expect(facts(written).p3.text).toBe('Я бачила північне сяйво');
    expect(must(hideTruth(written, 'p3', true)).truth?.facts.p3.hidden).toBe(true);
    // колоду роздано — факти вже не приймаються
    const dealt: GameState = { ...written, truth: { ...written.truth!, deck: ['p3'] } };
    expect(truthOpen(dealt)).toBe(false);
    expect(submitTruth(dealt, 'p1', 'Я тут', t0)).toEqual({ ok: false, error: 'truth_closed' });
    const finished = must(end(written, t0 + 1000));
    expect(finished.phase).toBe('finished');
    expect(truthOpen(finished)).toBe(false);
    expect(submitTruth(finished, 'p1', 'Я тут', t0 + 2000)).toEqual({ ok: false, error: 'truth_closed' });
  });

  it('a late player of a continued game writes a fact', () => {
    const rng = () => 0;
    const each = lobbyWith(makeRoundsQuiz([classicRound('r1', [single, withId(single, 'q2')]), truthRound('r2')], { leaderboard: 'each' }), 'Олена', 'Тарас');
    const opened = must(next(must(start(each)), t0, rng));
    const reveal = must(next(must(lock(opened)), t0 + 1500, rng));
    const leaderboard = must(next(reveal, t0 + 2000, rng));
    expect(leaderboard.phase).toBe('leaderboard');
    const late = must(addLatePlayer(leaderboard, { id: 'p9', nickname: 'Іра' }));
    expect(facts(must(submitTruth(late, 'p9', 'Я пекла хліб на вогнищі', t0 + 3000))).p9.text).toBe('Я пекла хліб на вогнищі');
  });

  it('removal drops the fact; leaving keeps it', () => {
    let s = lobby();
    for (const id of ['p1', 'p2', 'p3', 'p4']) s = must(submitTruth(s, id, `Факт ${id}`, t0));
    const removed = must(removePlayer(s, 'p3'));
    expect('p3' in facts(removed)).toBe(false);
    const left = must(setConnected(removed, 'p4', false, t0 + 1000));
    expect(facts(left).p4.text).toBe('Факт p4');
    // після старту, до роздачі — так само
    const started = must(removePlayer(must(start(left)), 'p2'));
    expect(Object.keys(facts(started)).sort()).toEqual(['p1', 'p4']);
  });

  it('teams: every member writes, a member without a team too', () => {
    const tq = teamQuiz([classicRound('r1', [single]), truthRound('r2')]);
    const tl = teamLobby(tq, 'Олена', 'Тарас');
    expect(tl.truth).toEqual({ facts: {} });
    expect(tl.teams?.members.every((m) => m.teamId === null)).toBe(true);
    const written = must(submitTruth(must(submitTruth(tl, 'm1', 'Я виростила лимон', t0)), 'm2', 'Я грала в оркестрі', t0));
    expect(Object.keys(facts(written))).toEqual(['m1', 'm2']);
    // id команди — не людина
    expect(submitTruth(written, 't1', 'Ми команда', t0)).toEqual({ ok: false, error: 'not_found' });
    const dropped = must(dropMember(written, 'm1'));
    expect(Object.keys(facts(dropped))).toEqual(['m2']);
    // команду вилучено разом з людьми до роздачі — їхні факти зникають
    let game = teamGame(tq, [['Олена', 'Тарас'], ['Віра']]);
    for (const id of ['m1', 'm2', 'm3']) game = must(submitTruth(game, id, `Факт ${id}`, t0));
    expect(Object.keys(facts(must(removePlayer(game, 't1'))))).toEqual(['m3']);
    // остання людина команди після старту забирає команду — і свій факт
    expect(Object.keys(facts(must(removePlayer(game, 'm3'))))).toEqual(['m1', 'm2']);
  });
});
