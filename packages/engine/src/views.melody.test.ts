import { describe, expect, it } from 'vitest';
import { lock, next, pause, submitAnswer, type GameState } from './game';
import { hostLive } from './live';
import { melodyOpen } from './melody';
import { audioOf, hostView, playerView, stageView } from './views';
import { classicRound, melody, melodyQuiz, melodyYoutube, single } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** p1 Оля, p2 Тарас, p3 Петро, p4 Ганна. */
const PLAYERS = ['Оля', 'Тарас', 'Петро', 'Ганна'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;
const TITLES = ['Щедрик', 'Shchedryk', 'Carol of the Bells'];

function toMelody(s0: GameState, id = 'ml1'): GameState {
  let s = s0;
  if (s.phase === 'question' && s.plays[s.questionIndex].question.id !== id) s = must(lock(s, 1000));
  for (let i = 0; i < 20 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === id); i++) s = must(s.phase === 'question' ? lock(s, 2000) : next(s, 2000, rng0));
  return s;
}
const fresh = () => toMelody(startRound(lobbyWith(melodyQuiz(), ...PLAYERS), 0));
const teamStart = () => toMelody(must(next(teamGame(teamQuiz([classicRound('c0', [{ ...single, timeLimit: 30 }]), classicRound('c1', [melody])]), LAYOUT), 0, rng0)));
const T = (s: GameState) => s.startedAt!;
const open = (s: GameState, who: string, step: number, t: number, member = who) => must(melodyOpen(s, who, member, 0, step, t));
const say = (s: GameState, who: string, value: string, t: number) => must(submitAnswer(s, who, { type: 'melody', value }, t));
const mine = (s: GameState, id: string, now?: number) => {
  const me = playerView(s, id, now)?.me.melody;
  if (me === undefined) throw new Error('no me.melody');
  return me;
};
const stageRows = (s: GameState) => {
  const info = stageView(s).melody;
  if (info === undefined) throw new Error('no melody');
  return info.rows;
};

describe('melody views', () => {
  it('the answer never reaches a phone or the stage before reveal', () => {
    const s0 = fresh();
    const t = T(s0);
    const opened = say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Колискова', t + 700);
    for (const s of [opened, must(lock(opened, t + 5000))]) {
      expect(s.phase === 'question' || s.phase === 'locked').toBe(true);
      const q = playerView(s, 'p1')!.question!;
      expect(q.melody).toEqual({ id: 'ml1', track: melody.track, answer: null });
      const dumps = [JSON.stringify(stageView(s)), JSON.stringify(playerView(s, 'p1', t + 800)), JSON.stringify(playerView(s, 'p2', t + 800)), JSON.stringify(q), JSON.stringify(stageView(s).question)];
      for (const dump of dumps) {
        for (const title of TITLES) expect(dump).not.toContain(title);
        expect(dump).not.toContain('"accepted"');
        expect(dump).toContain(melody.track.url);
        expect(dump).toContain('"start":5');
      }
    }
    const reveal = must(next(must(lock(opened, t + 5000)), t + 6000, rng0));
    expect(reveal.phase).toBe('reveal');
    expect(playerView(reveal, 'p2')!.question!.melody!.answer).toBe('Щедрик');
    expect(stageView(reveal).question!.melody!.answer).toBe('Щедрик');
  });

  it('the stage sees who answered and on which chunk', () => {
    const s0 = fresh();
    const t = T(s0);
    const s = open(say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Щедрик', t + 700), 'p2', 1, t + 800);
    const rows = stageRows(s);
    expect(rows.map((r) => r.nickname)).toEqual(PLAYERS);
    expect(rows[0]).toMatchObject({ heard: 2, answered: true, correct: null, points: null, timeMs: null });
    expect(rows[1]).toMatchObject({ heard: 1, answered: false });
    expect(rows[2]).toMatchObject({ heard: 0, answered: false });
    for (const row of rows) {
      expect(row).not.toHaveProperty('answer');
      expect(row).not.toHaveProperty('value');
    }
    expect(hostView(s).melody?.rows).toEqual(rows);
    expect(JSON.stringify(hostView(s).melody)).not.toContain('Щедрик');
  });

  it('reveal ranks by chunk', () => {
    const s0 = fresh();
    const t = T(s0);
    let s = say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Щедрик', t + 700);
    s = say(open(s, 'p2', 1, t + 800), 'p2', 'Shchedryk', t + 900);
    s = say(open(s, 'p3', 1, t + 1000), 'p3', 'Вальс', t + 1100);
    const reveal = must(next(must(lock(s, t + 5000)), t + 6000, rng0));
    const rows = stageRows(reveal);
    expect(rows.map((r) => r.nickname)).toEqual(['Тарас', 'Оля', 'Петро', 'Ганна']);
    expect(rows.map((r) => r.correct)).toEqual([true, true, false, null]);
    expect(rows.map((r) => r.points)).toEqual([1000, 800, 0, null]);
    expect(rows[0].timeMs).not.toBeNull();
    expect(rows[3]).toMatchObject({ answered: false, heard: 0, timeMs: null });
  });

  it('the phone can open and answer only while open', () => {
    const s0 = fresh();
    const t = T(s0);
    expect(mine(s0, 'p1', t + 500)).toEqual({ heard: 0, canOpen: true, canAnswer: false, openedBy: null });
    const one = open(s0, 'p1', 1, t + 500);
    expect(mine(one, 'p1', t + 600)).toMatchObject({ heard: 1, canOpen: true, canAnswer: true });
    const five = [2, 3, 4, 5].reduce((s, k) => open(s, 'p1', k, t + 600), one);
    expect(mine(five, 'p1', t + 700)).toMatchObject({ heard: 5, canOpen: false, canAnswer: true });
    // заставка
    expect(mine(one, 'p1', t - 1)).toMatchObject({ canOpen: false, canAnswer: false });
    // пауза
    const paused = must(pause(one, t + 800));
    expect(mine(paused, 'p1', t + 800)).toMatchObject({ canOpen: false, canAnswer: false });
    // після відповіді
    const answered = say(one, 'p1', 'Щедрик', t + 900);
    expect(mine(answered, 'p1', t + 950)).toMatchObject({ heard: 1, canOpen: false, canAnswer: false });
    // після часу
    expect(mine(one, 'p1', t + 60_001)).toMatchObject({ canOpen: false, canAnswer: false });
    // locked
    expect(mine(must(lock(one, t + 1000)), 'p1', t + 1100)).toMatchObject({ canOpen: false, canAnswer: false });
  });

  it('teammates see the shared chunk and who opened it', () => {
    const s0 = teamStart();
    const t = T(s0);
    const s = must(melodyOpen(must(melodyOpen(s0, 't1', 'm2', 0, 1, t + 500)), 't1', 'm2', 0, 2, t + 550));
    expect(mine(s, 'm1', t + 600)).toMatchObject({ heard: 2, openedBy: 'Тарас' });
    expect(mine(s, 'm2', t + 600)).toMatchObject({ heard: 2, openedBy: 'Тарас' });
    expect(mine(s, 'm3', t + 600)).toMatchObject({ heard: 0, openedBy: null, canAnswer: false });
    const solo = fresh();
    expect(mine(open(solo, 'p1', 1, T(solo) + 500), 'p1', T(solo) + 600).openedBy).toBeNull();
  });

  it('the host sees the chunk in live answers', () => {
    const s0 = fresh();
    const t = T(s0);
    const s = say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Щедрик', t + 700);
    const row = hostLive(s)!.rows.find((r) => r.id === 'p1')!;
    expect(row.progress).toEqual({ kind: 'melody', heard: 2, total: 5 });
    expect(row.answer).toEqual({ type: 'melody', value: 'Щедрик', heard: 2 });
    expect(row.verdict).toBe('correct');
    expect(hostLive(s)!.rows.find((r) => r.id === 'p3')!.progress).toEqual({ kind: 'melody', heard: 0, total: 5 });
  });

  it('the reveal clip goes to the host controls only on reveal', () => {
    const s0 = fresh();
    const t = T(s0);
    expect(audioOf(s0)).toBeNull();
    expect(audioOf(must(lock(s0, t + 1000)))).toBeNull();
    const reveal = must(next(must(lock(s0, t + 1000)), t + 2000, rng0));
    expect(audioOf(reveal)).toEqual({ source: 'file', url: melody.track.url, start: 5, duration: 30 });
    const y0 = toMelody(reveal, 'ml2');
    const y = must(next(must(lock(y0, T(y0) + 1000)), T(y0) + 2000, rng0));
    expect(audioOf(y)).toEqual({ source: 'youtube', id: melodyYoutube.track.id, start: 12, duration: 30 });
  });
});
