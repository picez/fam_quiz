import { describe, expect, it } from 'vitest';
import { lock, next, pause, submitAnswer, type GameState } from './game';
import { hostLive } from './live';
import { snippetOpen } from './snippets';
import { audioOf, hostView, playerView, stageView } from './views';
import { classicRound, single, videoclip, videoclipQuiz } from './testing/fixtures';
import { lobbyWith, must, startRound } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

/** p1 Оля, p2 Тарас, p3 Петро, p4 Ганна. */
const PLAYERS = ['Оля', 'Тарас', 'Петро', 'Ганна'];
const LAYOUT = [
  ['Оля', 'Тарас'],
  ['Петро', 'Ганна'],
];
const rng0 = () => 0;
const TITLES = ['Take On Me', 'Тейк он мі'];

function toClip(s0: GameState, id = 'vc1'): GameState {
  let s = s0;
  if (s.phase === 'question' && s.plays[s.questionIndex].question.id !== id) s = must(lock(s, 1000));
  for (let i = 0; i < 20 && !(s.phase === 'question' && s.plays[s.questionIndex].question.id === id); i++) s = must(s.phase === 'question' ? lock(s, 2000) : next(s, 2000, rng0));
  return s;
}
const fresh = () => toClip(startRound(lobbyWith(videoclipQuiz(), ...PLAYERS), 0));
const teamStart = () => toClip(must(next(teamGame(teamQuiz([classicRound('c0', [{ ...single, timeLimit: 30 }]), classicRound('c1', [videoclip])]), LAYOUT), 0, rng0)));
const T = (s: GameState) => s.startedAt!;
const open = (s: GameState, who: string, step: number, t: number, member = who) => must(snippetOpen(s, who, member, 0, step, t));
const say = (s: GameState, who: string, value: string, t: number) => must(submitAnswer(s, who, { type: 'videoclip', value }, t));
const mine = (s: GameState, id: string, now?: number) => {
  const me = playerView(s, id, now)?.me.videoclip;
  if (me === undefined) throw new Error('no me.videoclip');
  return me;
};
const stageRows = (s: GameState) => {
  const info = stageView(s).videoclip;
  if (info === undefined) throw new Error('no videoclip');
  return info.rows;
};

describe('videoclip views', () => {
  it('the answer never reaches a phone or the stage before reveal', () => {
    const s0 = fresh();
    const t = T(s0);
    const opened = say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Bohemian Rhapsody', t + 700);
    for (const s of [opened, must(lock(opened, t + 5000))]) {
      expect(s.phase === 'question' || s.phase === 'locked').toBe(true);
      const q = playerView(s, 'p1')!.question!;
      expect(q.videoclip).toEqual({ id: 'vc1', clip: { id: 'E2Evideo001', start: 12 }, muted: true, answer: null });
      // PublicQuestion сцени (publicQuestion не експортується; сцена й телефони отримують саме його).
      const pq = stageView(s).question!;
      expect(pq.videoclip?.answer).toBeNull();
      const dumps = [
        JSON.stringify(stageView(s)),
        JSON.stringify(playerView(s, 'p1', t + 800)),
        JSON.stringify(playerView(s, 'p2', t + 800)),
        JSON.stringify(q),
        JSON.stringify(pq),
      ];
      for (const dump of dumps) {
        for (const title of TITLES) expect(dump).not.toContain(title);
        expect(dump).not.toContain('"accepted"');
        expect(dump).toContain('"id":"E2Evideo001"');
        expect(dump).toContain('"start":12');
        expect(dump).toContain('"muted":true');
      }
    }
    const reveal = must(next(must(lock(opened, t + 5000)), t + 6000, rng0));
    expect(reveal.phase).toBe('reveal');
    expect(playerView(reveal, 'p2')!.question!.videoclip!.answer).toBe('Take On Me');
    expect(stageView(reveal).question!.videoclip!.answer).toBe('Take On Me');
    expect(JSON.stringify(stageView(reveal).question)).not.toContain('"accepted"');
  });

  it('the stage sees who answered and on which chunk', () => {
    const s0 = fresh();
    const t = T(s0);
    const s = open(say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Take On Me', t + 700), 'p2', 1, t + 800);
    const rows = stageRows(s);
    expect(rows.map((r) => r.nickname)).toEqual(PLAYERS);
    expect(rows[0]).toMatchObject({ heard: 2, answered: true, correct: null, points: null, timeMs: null });
    expect(rows[1]).toMatchObject({ heard: 1, answered: false });
    expect(rows[2]).toMatchObject({ heard: 0, answered: false });
    for (const row of rows) {
      expect(row).not.toHaveProperty('answer');
      expect(row).not.toHaveProperty('value');
    }
    expect(stageView(s).melody).toBeUndefined();
    expect(hostView(s).melody).toBeUndefined();
    expect(hostView(s).videoclip?.rows).toEqual(rows);
    expect(JSON.stringify(hostView(s).videoclip)).not.toContain('Take On Me');
  });

  it('reveal ranks by chunk', () => {
    const s0 = fresh();
    const t = T(s0);
    let s = say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Take On Me', t + 700);
    s = say(open(s, 'p2', 1, t + 800), 'p2', 'тейк он мі', t + 900);
    s = say(open(s, 'p3', 1, t + 1000), 'p3', 'Bohemian Rhapsody', t + 1100);
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
    expect(playerView(s0, 'p1', t + 500)!.me.melody).toBeUndefined();
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
    const answered = say(one, 'p1', 'Take On Me', t + 900);
    expect(mine(answered, 'p1', t + 950)).toMatchObject({ heard: 1, canOpen: false, canAnswer: false });
    // після часу (60 с)
    expect(mine(one, 'p1', t + 60_001)).toMatchObject({ canOpen: false, canAnswer: false });
    // locked
    expect(mine(must(lock(one, t + 1000)), 'p1', t + 1100)).toMatchObject({ canOpen: false, canAnswer: false });
  });

  it('teammates see the shared chunk and who opened it', () => {
    const s0 = teamStart();
    const t = T(s0);
    const s = must(snippetOpen(must(snippetOpen(s0, 't1', 'm2', 0, 1, t + 500)), 't1', 'm2', 0, 2, t + 550));
    expect(mine(s, 'm1', t + 600)).toMatchObject({ heard: 2, openedBy: 'Тарас' });
    expect(mine(s, 'm2', t + 600)).toMatchObject({ heard: 2, openedBy: 'Тарас' });
    expect(mine(s, 'm3', t + 600)).toMatchObject({ heard: 0, openedBy: null, canAnswer: false });
    expect(playerView(s, 'm1', t + 600)!.me.melody).toBeUndefined();
    const solo = fresh();
    expect(mine(open(solo, 'p1', 1, T(solo) + 500), 'p1', T(solo) + 600).openedBy).toBeNull();
  });

  it('the host sees the chunk in live answers', () => {
    const s0 = fresh();
    const t = T(s0);
    const s = say(open(open(s0, 'p1', 1, t + 500), 'p1', 2, t + 600), 'p1', 'Take On Me', t + 700);
    const row = hostLive(s)!.rows.find((r) => r.id === 'p1')!;
    expect(row.progress).toEqual({ kind: 'videoclip', heard: 2, total: 5 });
    expect(row.answer).toEqual({ type: 'videoclip', value: 'Take On Me', heard: 2 });
    expect(row.verdict).toBe('correct');
    expect(hostLive(s)!.rows.find((r) => r.id === 'p3')!.progress).toEqual({ kind: 'videoclip', heard: 0, total: 5 });
  });

  it('the reveal clip exists only on reveal', () => {
    const s0 = fresh();
    const t = T(s0);
    expect(audioOf(s0)).toBeNull();
    expect(audioOf(must(lock(s0, t + 1000)))).toBeNull();
    const reveal = must(next(must(lock(s0, t + 1000)), t + 2000, rng0));
    expect(audioOf(reveal)).toEqual({ source: 'youtube', id: 'E2Evideo001', start: 12, duration: 30 });
  });
});
