import { describe, expect, it } from 'vitest';
import type { Answer, ThinkRound, ThinkWord } from '@quiz/shared';
import { addPlayer, createGame, next, pause, removePlayer, setConnected, start, submitAnswer, tick, type GameState } from './game';
import { markThinkOff, thinkBallot, thinkLivesAfter, thinkOffOf, thinkOver, thinkPlaces, voteThinkOff } from './think';
import { classicRound, makeRoundsQuiz, single, think, thinkRound } from './testing/fixtures';
import { must } from './testing/helpers';

// «Думай інакше» (51): відповідь не на тему коштує життя — позначка ведучого на розкритті чи анонімне голосування гравців в автопілоті.

const t0 = 1_000_000;
const rng0 = () => 0;
const red: ThinkWord = { word: 'червоний', synonyms: [] };
const say = (value: string): Answer => ({ type: 'think', value });
const NAMES: Record<string, string> = { olya: 'Оля', petro: 'Петро', vira: 'Віра', ihor: 'Ігор', taras: 'Тарас', marta: 'Марта' };
const FOUR = ['olya', 'petro', 'vira', 'ihor'];
const play = (s: GameState) => s.plays[s.questionIndex];
const vote = (s: GameState) => play(s).think?.vote;
const here = (s: GameState) => s.questionIndex;

function quizOf(options: Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>> = {}) {
  const questions = ['q1', 'q2', 'q3'].map((id) => think(id, [red], { timeLimit: 30 }));
  return makeRoundsQuiz([thinkRound('t', questions, { lives: 2, ...options }), classicRound('r2', [single])], { leaderboard: 'end' });
}

function lobby(ids: string[], options: Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>> = {}): GameState {
  return ids.reduce((s, id) => must(addPlayer(s, { id, nickname: NAMES[id] })), createGame(quizOf(options)));
}

/** Гра з ведучим: q1 відкрито о t0. */
function hosted(ids: string[], options: Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>> = {}): GameState {
  return must(next(must(start(lobby(ids, options))), t0, rng0));
}

/** Автопілот: автор Марта — глядач раунду; q1 відкрито о t0. */
function piloted(ids: string[], options: Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>> = {}): GameState {
  const intro = must(start(lobby(['marta', ...ids], options)));
  return must(next({ ...intro, autopilot: { authorId: 'marta', at: null } }, t0, rng0));
}

function answer(s: GameState, values: Record<string, string>, at = t0 + 1000): GameState {
  return Object.entries(values).reduce((out, [id, value]) => must(submitAnswer(out, id, say(value), at)), s);
}

/** Таймер запитання сплив (строго після кінця). */
const timeUp = (s: GameState) => tick(s, (s.endsAt ?? 0) + 1, rng0);

/** Гра з ведучим: відповіді → таймер → «Показати». */
function hostReveal(s: GameState, values: Record<string, string>): GameState {
  const locked = timeUp(answer(s, values));
  expect(locked.phase).toBe('locked');
  return must(next(locked, t0 + 40_000, rng0));
}

/** Автопілот: типово Оля «синій», Петро «банан», Віра «зелений», Ігор мовчить → таймер (якщо відповіли не всі) → етап голосування. */
function voting(ids = FOUR, values: Record<string, string> = { olya: 'синій', petro: 'банан', vira: 'зелений' }): GameState {
  const answered = answer(piloted(ids), values);
  const s = vote(answered) === undefined ? timeUp(answered) : answered;
  expect(s.phase).toBe('question');
  expect(vote(s)).toBeDefined();
  return s;
}

const mark = (s: GameState, id: string, keys: string[], at = (s.startedAt ?? t0) + 1000) => must(voteThinkOff(s, id, keys, at));

describe('think off-topic marks by the host (51)', () => {
  it('host marks an off-topic answer and takes it back', () => {
    const s = hostReveal(hosted(FOUR), { olya: 'синій', petro: 'банан', vira: 'зелений' });
    expect(s.phase).toBe('reveal');
    expect(thinkOffOf(s, here(s))).toEqual({});
    expect(thinkLivesAfter(s, here(s), 'petro')).toBe(2);
    const marked = must(markThinkOff(s, 'petro', true));
    expect(play(marked).think?.off).toEqual(['petro']);
    expect(thinkOffOf(marked, here(marked))).toEqual({ petro: 'host' });
    expect(thinkLivesAfter(marked, here(marked), 'petro')).toBe(1);
    // повторна позначка — той самий стан
    expect(markThinkOff(marked, 'petro', true)).toEqual({ ok: true, state: marked });
    const back = must(markThinkOff(marked, 'petro', false));
    expect(play(back).think?.off).toBeUndefined();
    expect(thinkOffOf(back, here(back))).toEqual({});
    expect(thinkLivesAfter(back, here(back), 'petro')).toBe(2);
    // наступне запитання відкривається з правильними життями
    const q2 = must(next(marked, t0 + 50_000, rng0));
    expect(play(q2).think?.lives).toEqual({ olya: 2, petro: 1, vira: 2, ihor: 1 });
  });

  it('marks only at reveal, only a written answer, never on autopilot', () => {
    const open = answer(hosted(FOUR), { olya: 'синій', petro: 'банан' });
    expect(markThinkOff(open, 'petro', true)).toEqual({ ok: false, error: 'wrong_phase' });
    const locked = timeUp(open);
    expect(locked.phase).toBe('locked');
    expect(markThinkOff(locked, 'petro', true)).toEqual({ ok: false, error: 'wrong_phase' });
    const shown = must(next(locked, t0 + 40_000, rng0));
    // мовчав — позначати нічого (порожня відповідь і так коштує життя)
    expect(markThinkOff(shown, 'ihor', true)).toEqual({ ok: false, error: 'not_found' });
    expect(markThinkOff(shown, 'nobody', true)).toEqual({ ok: false, error: 'not_found' });
    // автопілот
    let pilot = voting();
    for (const id of FOUR) pilot = mark(pilot, id, []);
    expect(pilot.phase).toBe('locked');
    const pilotShown = must(next(pilot, t0 + 90_000, rng0));
    expect(pilotShown.phase).toBe('reveal');
    expect(markThinkOff(pilotShown, 'petro', true)).toEqual({ ok: false, error: 'not_allowed' });
  });

  it('a match and off-topic cost one life', () => {
    const s = hostReveal(hosted(FOUR), { olya: 'червоний', petro: 'банан', vira: 'зелений' });
    expect(thinkLivesAfter(s, here(s), 'olya')).toBe(1);
    const marked = must(markThinkOff(s, 'olya', true));
    expect(thinkOffOf(marked, here(marked))).toEqual({ olya: 'host' });
    expect(thinkLivesAfter(marked, here(marked), 'olya')).toBe(1);
  });

  it('off-topic on the last life eliminates and may end the round', () => {
    const s = hostReveal(hosted(['olya', 'petro', 'vira'], { lives: 1 }), { olya: 'червоний', petro: 'банан', vira: 'синій' });
    expect(thinkOver(s)).toBe(false);
    const marked = must(markThinkOff(s, 'petro', true));
    expect(thinkLivesAfter(marked, here(marked), 'petro')).toBe(0);
    expect(thinkOver(marked)).toBe(true);
    expect(must(next(marked, t0 + 50_000, rng0)).phase).toBe('round_end');
  });
});

describe('the off-topic vote on autopilot (51)', () => {
  it('the autopilot opens the vote after the timer', () => {
    const open = answer(piloted(FOUR), { olya: 'синій', petro: 'банан', vira: 'зелений' });
    const at = (open.endsAt ?? 0) + 1;
    const s = tick(open, at, rng0);
    expect(s.phase).toBe('question');
    expect(vote(s)).toEqual({ voters: FOUR, marks: {} });
    expect(s.endsAt).toBe(at + 25_000);
    expect(submitAnswer(s, 'ihor', say('жовтий'), at + 1000)).toEqual({ ok: false, error: 'time_over' });
    expect(thinkBallot(s, here(s))).toEqual([
      { key: 'банан', text: 'банан', authors: ['petro'] },
      { key: 'зелений', text: 'зелений', authors: ['vira'] },
      { key: 'синій', text: 'синій', authors: ['olya'] },
    ]);
  });

  it('the vote opens when everyone answered', () => {
    const s = answer(piloted(FOUR), { olya: 'синій', petro: 'банан', vira: 'зелений', ihor: 'Жовтий!' }, t0 + 3000);
    expect(s.phase).toBe('question');
    expect(vote(s)?.voters).toEqual(FOUR);
    expect(s.endsAt).toBe(t0 + 3000 + 25_000);
    // текст — як написав автор, ключ — thinkKey
    expect(thinkBallot(s, here(s)).map((e) => [e.key, e.text])).toEqual([
      ['банан', 'банан'],
      ['жовтий', 'Жовтий!'],
      ['зелений', 'зелений'],
      ['синій', 'синій'],
    ]);
  });

  it('the majority marks off-topic, a tie stays on topic', () => {
    const s = voting();
    expect(thinkOffOf(mark(s, 'olya', ['банан']), here(s))).toEqual({});
    const two = mark(mark(s, 'olya', ['банан']), 'vira', ['банан']);
    expect(thinkOffOf(two, here(two))).toEqual({ petro: 'vote' });
    // решта голосує — запитання закривається, а на розкритті Петро втрачає життя
    const closed = mark(mark(two, 'petro', []), 'ihor', []);
    expect(closed.phase).toBe('locked');
    const shown = must(next(closed, t0 + 90_000, rng0));
    expect(thinkLivesAfter(shown, here(shown), 'petro')).toBe(1);
    expect(thinkLivesAfter(shown, here(shown), 'olya')).toBe(2);
    // п'ятеро: за «банан» голосують четверо — 2 з 4 нічия, 3 з 4 — не на тему
    const five = voting([...FOUR, 'taras']);
    const tie = mark(mark(five, 'olya', ['банан']), 'vira', ['банан']);
    expect(thinkOffOf(tie, here(tie))).toEqual({});
    expect(thinkOffOf(mark(tie, 'taras', ['банан']), here(tie))).toEqual({ petro: 'vote' });
  });

  it('voters cannot mark their own answer or a missing one', () => {
    const s = voting();
    expect(voteThinkOff(s, 'petro', ['банан'], t0 + 40_000)).toEqual({ ok: false, error: 'not_found' });
    expect(voteThinkOff(s, 'olya', ['кавун'], t0 + 40_000)).toEqual({ ok: false, error: 'not_found' });
    expect(voteThinkOff(s, 'marta', [], t0 + 40_000)).toEqual({ ok: false, error: 'think_spectator' });
    expect(voteThinkOff(s, 'nobody', [], t0 + 40_000)).toEqual({ ok: false, error: 'think_spectator' });
    // не етап голосування
    const open = piloted(FOUR);
    expect(voteThinkOff(open, 'olya', [], t0 + 1000)).toEqual({ ok: false, error: 'wrong_phase' });
    // повторне надсилання замінює, дублікати зводяться
    const first = mark(s, 'olya', ['банан', 'банан']);
    expect(vote(first)?.marks).toEqual({ olya: ['банан'] });
    expect(vote(mark(first, 'olya', ['зелений']))?.marks).toEqual({ olya: ['зелений'] });
  });

  it('an eliminated player does not vote', () => {
    // q1: Оля збіглася на останньому житті й вибула
    let s = answer(piloted(FOUR, { lives: 1 }), { olya: 'червоний', petro: 'банан', vira: 'зелений', ihor: 'синій' }, t0 + 1000);
    // усі відповіли → голосування; ніхто нічого не позначив
    s = FOUR.reduce((out, id) => mark(out, id, []), s);
    expect(s.phase).toBe('locked');
    s = must(next(must(next(s, t0 + 90_000, rng0)), t0 + 100_000, rng0));
    expect(play(s).question.id).toBe('q2');
    s = answer(s, { petro: 'банан', vira: 'зелений', ihor: 'синій' }, t0 + 101_000);
    expect(vote(s)?.voters).toEqual(['petro', 'vira', 'ihor']);
    expect(voteThinkOff(s, 'olya', [], (s.startedAt ?? 0) + 1000)).toEqual({ ok: false, error: 'think_spectator' });
  });

  it('the same word by two authors', () => {
    const s = voting(FOUR, { olya: 'синій', petro: 'банан', vira: 'Банан', ihor: 'зелений' });
    expect(thinkBallot(s, here(s))[0]).toEqual({ key: 'банан', text: 'банан', authors: ['petro', 'vira'] });
    expect(voteThinkOff(s, 'vira', ['банан'], t0 + 40_000)).toEqual({ ok: false, error: 'not_found' });
    const marked = mark(mark(s, 'olya', ['банан']), 'ihor', ['банан']);
    expect(thinkOffOf(marked, here(marked))).toEqual({ petro: 'vote', vira: 'vote' });
  });

  it('the vote ends early when every present voter is done', () => {
    const s = voting();
    const three = ['olya', 'petro', 'vira'].reduce((out, id) => mark(out, id, []), s);
    expect(three.phase).toBe('question');
    expect(mark(three, 'ihor', []).phase).toBe('locked');
    // Ігор відключився — чекають лише трьох
    const away = must(setConnected(s, 'ihor', false, t0 + 40_000));
    expect(away.phase).toBe('question');
    expect(['olya', 'petro', 'vira'].reduce((out, id) => mark(out, id, []), away).phase).toBe('locked');
    // таймер голосування сплив
    const start = s.startedAt ?? 0;
    expect(tick(s, start + 25_000, rng0).phase).toBe('question');
    expect(tick(s, start + 25_001, rng0).phase).toBe('locked');
  });

  it('no vote stage', () => {
    // двоє живих
    const two = answer(piloted(['olya', 'petro']), { olya: 'синій', petro: 'банан' });
    expect(two.phase).toBe('locked');
    expect(play(two).think?.vote).toBeUndefined();
    // вимкнене в раунді
    const off = timeUp(answer(piloted(FOUR, { offtopicVote: false }), { olya: 'синій', petro: 'банан' }));
    expect(off.phase).toBe('locked');
    // з ведучим
    const host = timeUp(answer(hosted(FOUR), { olya: 'синій', petro: 'банан' }));
    expect(host.phase).toBe('locked');
    expect(play(host).think?.vote).toBeUndefined();
    // усі мовчали
    expect(timeUp(piloted(FOUR)).phase).toBe('locked');
    // усі написали те саме — чужих відповідей немає
    expect(answer(piloted(['olya', 'petro', 'vira']), { olya: 'синій', petro: 'Синій', vira: 'синій' }).phase).toBe('locked');
  });

  it('a kicked voter counts nowhere', () => {
    const s = mark(mark(voting(), 'olya', ['банан']), 'vira', ['банан']);
    expect(thinkOffOf(s, here(s))).toEqual({ petro: 'vote' });
    const kicked = must(removePlayer(s, 'vira', t0 + 40_000));
    expect(kicked.phase).toBe('question');
    // за «банан» тепер голосують Оля й Ігор: 1 з 2 — нічия
    expect(thinkOffOf(kicked, here(kicked))).toEqual({});
    expect(thinkOffOf(mark(kicked, 'ihor', ['банан']), here(kicked))).toEqual({ petro: 'vote' });
  });

  it('a kick that leaves everyone answered opens the vote', () => {
    const s = answer(piloted([...FOUR, 'taras']), { olya: 'синій', petro: 'банан', vira: 'зелений', ihor: 'жовтий' });
    expect(vote(s)).toBeUndefined();
    const kicked = must(removePlayer(s, 'taras', t0 + 5000));
    expect(kicked.phase).toBe('question');
    expect(vote(kicked)?.voters).toEqual(FOUR);
    expect(kicked.endsAt).toBe(t0 + 5000 + 25_000);
  });

  it('the vote result is frozen when the stage closes', () => {
    // q1: «банан» Петра — 2 з 3 (Оля, Віра); Петро на останньому житті вибуває
    let s = answer(piloted(FOUR, { lives: 1 }), { olya: 'синій', petro: 'банан', vira: 'зелений', ihor: 'жовтий' });
    s = mark(mark(s, 'olya', ['банан']), 'vira', ['банан']);
    s = mark(mark(s, 'petro', []), 'ihor', []);
    expect(s.phase).toBe('locked');
    expect(vote(s)?.off).toEqual(['банан']);
    s = must(next(s, t0 + 90_000, rng0));
    const q1 = here(s);
    expect(thinkOffOf(s, q1)).toEqual({ petro: 'vote' });
    s = must(next(s, t0 + 100_000, rng0));
    expect(play(s).question.id).toBe('q2');
    // q2: Віру (голосувала за «банан») вилучено — наживо було б 1 з 2 (нічия), але результат q1 і місця ті самі
    const placesBefore = thinkPlaces(s, 0).find((r) => r.id === 'petro');
    expect(placesBefore).toMatchObject({ lives: 0, outAt: 1 });
    const kicked = must(removePlayer(s, 'vira', t0 + 101_000));
    expect(thinkOffOf(kicked, q1)).toEqual({ petro: 'vote' });
    expect(thinkLivesAfter(kicked, q1, 'petro')).toBe(0);
    expect(thinkPlaces(kicked, 0).find((r) => r.id === 'petro')).toMatchObject({ lives: 0, outAt: 1 });
    // старий знімок без off — рахується наживо
    const { off: _off, ...live } = s.plays[q1].think?.vote ?? { voters: [], marks: {} };
    void _off;
    const legacy: GameState = { ...s, plays: s.plays.map((p, i) => (i === q1 && p.think !== undefined ? { ...p, think: { ...p.think, vote: live } } : p)) };
    expect(thinkOffOf(legacy, q1)).toEqual({ petro: 'vote' });
  });

  it('no votes while paused', () => {
    const s = voting();
    const paused = must(pause(s, t0 + 40_000));
    expect(voteThinkOff(paused, 'olya', ['банан'], t0 + 41_000)).toEqual({ ok: false, error: 'paused' });
  });
});
