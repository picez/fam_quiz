import { describe, expect, it } from 'vitest';
import type { Answer, ThinkRound, ThinkWord } from '@quiz/shared';
import { addPlayer, createGame, end, endRound, next, override, start, submitAnswer, tick, type GameState } from './game';
import { addLatePlayer } from './saved';
import { actAnswer } from './team-act';
import { markThinkOff, setThinkWords, voteThinkOff } from './think';
import { hostView, playerView, stageView } from './views';
import { classicRound, makeRoundsQuiz, single, survivalRound, think, thinkRound, truthRound } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { teamGame, teamQuiz } from './testing/teams';

// «Думай інакше» (35): зрізи сцени, телефонів і пульта; слова ведучого й чужі відповіді до reveal — лише на пульті.

const t0 = 1_000_000;
const rng0 = () => 0;
const red: ThinkWord = { word: 'червоний', synonyms: ['багряний'] };
const blue: ThinkWord = { word: 'синій', synonyms: [] };
const violet: ThinkWord = { word: 'фіолетовий', synonyms: [] };
const say = (value: string): Answer => ({ type: 'think', value });
const at = (s: GameState, ms: number) => (s.startedAt ?? 0) + ms;
const FOUR = ['Олена', 'Тарас', 'Віра', 'Хосе'];
const IDS = ['p1', 'p2', 'p3', 'p4'];

type Options = Partial<Omit<ThinkRound, 'id' | 'type' | 'questions'>>;

/** r1 «Думай інакше» (5 запитань зі словами words), r2 класика. */
function quizOf(words: ThinkWord[] = [red, blue], options: Options = {}) {
  const questions = ['t1', 't2', 't3', 't4', 't5'].map((id) => think(id, words));
  return makeRoundsQuiz([thinkRound('r1', questions, { lives: 3, points: 10_000, ...options }), classicRound('r2', [single])], { leaderboard: 'end' });
}

const intro = (words?: ThinkWord[], options?: Options, names = FOUR) => must(start(lobbyWith(quizOf(words, options), ...names)));
const opened = (s: GameState) => must(next(s, t0, rng0));
const answer = (s: GameState, values: Record<string, string>) =>
  Object.entries(values).reduce((out, [id, value]) => must(submitAnswer(out, id, say(value), at(out, 1000))), s);
const lockOf = (s: GameState) => {
  const locked = tick(s, (s.endsAt ?? 0) + 1, rng0);
  expect(locked.phase).toBe('locked');
  return locked;
};
const revealOf = (s: GameState) => must(next(lockOf(s), at(s, 40_000), rng0));
const onward = (s: GameState) => must(next(s, at(s, 50_000), rng0));

/** Усі зрізи, крім пульта: сцена й кожен телефон (id). */
function publicJson(s: GameState, ids: string[] = IDS): string[] {
  return [JSON.stringify(stageView(s)), ...ids.map((id) => JSON.stringify(playerView(s, id)))].map((j) => j.toLowerCase());
}

function expectHidden(s: GameState, words: string[], ids: string[] = IDS) {
  for (const json of publicJson(s, ids)) for (const word of words) expect(json).not.toContain(word);
}

describe('think views (35)', () => {
  it('the stage and phones never see the words before reveal', () => {
    const s0 = intro();
    expectHidden(s0, ['червоний', 'багряний', 'синій']);
    const asked = answer(opened(s0), { p1: 'Червона', p4: 'Зелений' });
    expect(asked.phase).toBe('question');
    // Олена вже відповіла: ні вона, ні решта не бачать слів; чужої відповіді («Зелений») не бачить ніхто, крім Хосе.
    expectHidden(asked, ['червоний', 'багряний', 'синій']);
    expectHidden(asked, ['зелений'], ['p1', 'p2', 'p3']);
    expect(stageView(asked).think?.words).toBeNull();
    expect(stageView(asked).question).not.toHaveProperty('words');
    expect(playerView(asked, 'p1')?.question).not.toHaveProperty('words');
    const locked = lockOf(asked);
    expectHidden(locked, ['червоний', 'багряний', 'синій']);
    expectHidden(locked, ['зелений'], ['p1', 'p2', 'p3']);
    // Дописане ведучим слово — так само.
    const added = must(setThinkWords(opened(intro()), [violet]));
    expectHidden(added, ['фіолетовий']);
    expectHidden(lockOf(added), ['фіолетовий']);
    expect(JSON.stringify(hostView(added))).toContain('фіолетовий');
  });

  it('the eliminated and the autopilot author never see the words before reveal', () => {
    // Віра вибуває на першому запитанні; на другому — глядач, і слів не бачить.
    const second = onward(revealOf(answer(opened(intro(undefined, { lives: 1 })), { p1: 'ксилофон', p2: 'ксилофон', p3: 'червоний', p4: 'ксилофон' })));
    expect(second.phase).toBe('question');
    expect(playerView(second, 'p3')?.me.think?.status).toBe('out');
    expectHidden(second, ['червоний', 'багряний', 'синій']);
    const pilot: GameState = { ...intro(), autopilot: { authorId: 'p4', at: null } };
    const watched = answer(opened(pilot), { p1: 'Зелений' });
    expectHidden(watched, ['червоний', 'багряний', 'синій']);
    expectHidden(watched, ['зелений'], ['p2', 'p3', 'p4']);
  });

  it('the host sees words and live matches', () => {
    const asked = answer(opened(intro()), { p1: 'Червона', p4: 'Зелений' });
    const host = hostView(asked).think;
    expect(host?.draft).toEqual([red, blue]);
    expect(host?.answers).toEqual([
      { id: 'p1', nickname: 'Олена', answer: 'Червона', hit: true, overridden: false, off: null },
      { id: 'p2', nickname: 'Тарас', answer: null, hit: null, overridden: false, off: null },
      { id: 'p3', nickname: 'Віра', answer: null, hit: null, overridden: false, off: null },
      { id: 'p4', nickname: 'Хосе', answer: 'Зелений', hit: false, overridden: false, off: null },
    ]);
    expect(host?.editable).toBe(true);
    expect(host?.canReveal).toBe(false);
    const locked = hostView(lockOf(asked)).think;
    expect(locked?.editable).toBe(false);
    expect(locked?.canReveal).toBe(true);
    // Без слів: після таймера «Показати» неактивне, слово можна вписати один раз.
    const bare = lockOf(opened(intro([])));
    expect(hostView(bare).think).toMatchObject({ draft: [], editable: true, canReveal: false });
    const written = must(setThinkWords(bare, [violet]));
    expect(hostView(written).think).toMatchObject({ draft: [violet], editable: false, canReveal: true });
  });

  it('the stage row shows hearts and who answered, not what', () => {
    const asked = answer(opened(intro()), { p1: 'Червона' });
    const think = stageView(asked).think;
    expect(think).toMatchObject({ lives: 3, points: 10_000, index: 0, total: 5, words: null, places: null });
    expect(think?.rows[0]).toEqual({ id: 'p1', nickname: 'Олена', lives: 3, out: false, answered: true, answer: null, verdict: null, lost: false, overridden: false, matched: null, off: null });
    expect(think?.rows[1]).toMatchObject({ nickname: 'Тарас', answered: false, answer: null });
  });

  it('a hit names the host word it matched; a manual hit names none', () => {
    const shown = revealOf(answer(opened(intro()), { p1: 'Синя', p2: 'ксилофон', p3: 'багряна', p4: 'Зелений' }));
    const rows = () => stageView(marked).think?.rows ?? [];
    const marked = must(override(shown, 'p2', 'wrong'));
    expect(stageView(shown).think?.rows.map((r) => [r.id, r.matched])).toEqual([['p1', 1], ['p2', null], ['p3', 0], ['p4', null]]);
    expect(rows().find((r) => r.id === 'p2')).toMatchObject({ verdict: 'hit', overridden: true, matched: null });
  });

  it('reveal shows words, every answer and lost hearts', () => {
    const shown = revealOf(answer(opened(intro()), { p1: 'Червона', p2: 'ксилофон', p4: 'Зелений' }));
    expect(shown.phase).toBe('reveal');
    const think = stageView(shown).think;
    expect(think?.words).toEqual([red, blue]);
    expect(think?.rows.find((r) => r.id === 'p1')).toMatchObject({ answer: 'Червона', verdict: 'hit', lost: true, lives: 2, answered: false, matched: 0 });
    expect(think?.rows.find((r) => r.id === 'p3')).toMatchObject({ answer: '', verdict: 'empty', lost: true, lives: 2, matched: null });
    expect(think?.rows.find((r) => r.id === 'p4')).toMatchObject({ answer: 'Зелений', verdict: 'safe', lost: false, lives: 3, overridden: false, matched: null });
    // Ручна оцінка ведучого видна всім: «вручну» в рядку.
    const marked = must(override(shown, 'p1', 'correct'));
    expect(stageView(marked).think?.rows.find((r) => r.id === 'p1')).toMatchObject({ verdict: 'safe', lost: false, lives: 3, overridden: true, matched: null });
    expect(playerView(marked, 'p2')?.think?.rows.find((r) => r.id === 'p1')?.overridden).toBe(true);
    expect(playerView(shown, 'p2')?.me.think).toEqual({ lives: 3, status: 'alive', verdict: 'safe', off: null, vote: null, place: null });
    expect(playerView(shown, 'p1')?.me.think?.verdict).toBe('hit');
    // Наступне запитання: знову без слів і відповідей.
    const second = onward(shown);
    expect(stageView(second).think).toMatchObject({ index: 1, words: null });
    expect(stageView(second).think?.rows.find((r) => r.id === 'p1')).toMatchObject({ lives: 2, answer: null, verdict: null });
  });

  it('the eliminated and the spectator see their status', () => {
    const shown = revealOf(answer(opened(intro(undefined, { lives: 1 }, ['Олена', 'Тарас', 'Віра'])), { p1: 'червоний', p2: 'ксилофон', p3: 'ксилофон' }));
    expect(playerView(shown, 'p1')?.me.think).toMatchObject({ lives: 0, status: 'out', verdict: 'hit' });
    // Новенький до відкриття наступного запитання — глядач.
    const late = must(addLatePlayer(shown, { id: 'p4', nickname: 'Хосе' }));
    expect(playerView(late, 'p4')?.me.think?.status).toBe('spectator');
    expect(playerView(onward(late), 'p4')?.me.think).toMatchObject({ status: 'alive', lives: 1 });
    expect(playerView(onward(late), 'p1')?.me.think?.status).toBe('out');
    // Автор автопілота — глядач раунду.
    const pilot = opened({ ...intro(), autopilot: { authorId: 'p4', at: null } });
    expect(playerView(pilot, 'p4')?.me.think?.status).toBe('spectator');
    expect(stageView(pilot).think?.rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
    expect(stageView({ ...intro(), autopilot: { authorId: 'p4', at: null } }).think?.rows.map((r) => r.id)).toEqual(['p1', 'p2', 'p3']);
  });

  it('the round end shows places with points', () => {
    const ended = onward(revealOf(answer(opened(intro(undefined, { lives: 1 })), { p1: 'червоний', p2: 'синя', p4: 'ксилофон' })));
    expect(ended.phase).toBe('round_end');
    expect(stageView(ended).think?.places).toEqual([
      { id: 'p4', nickname: 'Хосе', place: 1, lives: 1, outAt: null, points: 10_000 },
      { id: 'p1', nickname: 'Олена', place: 2, lives: 0, outAt: 1, points: 6667 },
      { id: 'p2', nickname: 'Тарас', place: 2, lives: 0, outAt: 1, points: 6667 },
      { id: 'p3', nickname: 'Віра', place: 2, lives: 0, outAt: 1, points: 6667 },
    ]);
    expect(playerView(ended, 'p4')?.me.think?.place).toEqual({ place: 1, points: 10_000 });
    expect(playerView(ended, 'p1')?.me.think).toMatchObject({ status: 'out', place: { place: 2, points: 6667 } });
    expect(hostView(ended).think).toMatchObject({ draft: [], editable: false, canReveal: false, answers: [] });
  });

  it('teams see team lives', () => {
    const quiz = teamQuiz([thinkRound('r1', ['t1', 't2', 't3'].map((id) => think(id, [red])), { lives: 2, points: 1000 }), classicRound('r2', [single])]);
    let s = opened(teamGame(quiz, [['Олена', 'Тарас'], ['Віра', 'Хосе']]));
    s = must(actAnswer(s, 'm1', say('червоний'), at(s, 1000)));
    const rows = stageView(s).think?.rows ?? [];
    expect(rows.map((r) => [r.id, r.lives, r.answered])).toEqual([
      ['t1', 2, true],
      ['t2', 2, false],
    ]);
    // Товариш по команді бачить життя команди, але не слова ведучого; чужа команда — без відповіді.
    expect(playerView(s, 'm2')?.me.think).toEqual({ lives: 2, status: 'alive', verdict: null, off: null, vote: null, place: null });
    for (const id of ['m2', 'm3', 'm4']) expect(JSON.stringify(playerView(s, id))).not.toContain('багряний');
    for (const id of ['m3', 'm4']) expect(JSON.stringify(playerView(s, id))).not.toContain('червоний');
    const shown = revealOf(s);
    expect(playerView(shown, 'm2')?.me.think).toMatchObject({ lives: 1, verdict: 'hit' });
    expect(playerView(shown, 'm4')?.me.think).toMatchObject({ lives: 1, verdict: 'empty' });
  });

  it('other rounds have no think key', () => {
    const quizzes = [
      makeRoundsQuiz([classicRound('r1', [single])]),
      makeRoundsQuiz([survivalRound('r1', [single, { ...single, id: 'q2' }], [{ ...single, id: 'x1' }])]),
      makeRoundsQuiz([truthRound('r1'), classicRound('r2', [single])]),
    ];
    for (const quiz of quizzes) {
      const lobby = lobbyWith(quiz, 'Олена', 'Тарас');
      const shown = [lobby, must(start(lobby))];
      const asked = next(shown[1], t0, rng0);
      if (asked.ok) shown.push(asked.state);
      for (const s of shown) {
        expect(stageView(s)).not.toHaveProperty('think');
        expect(hostView(s)).not.toHaveProperty('think');
        expect(playerView(s, 'p1')?.me).not.toHaveProperty('think');
      }
    }
  });

  it('the public reveal carries the words the host set, not the prepared ones (review I-1)', () => {
    const changed = must(setThinkWords(opened(intro([red])), [blue]));
    const shown = revealOf(answer(changed, { p1: 'зелений' }));
    expect(shown.phase).toBe('reveal');
    for (const json of publicJson(shown)) {
      expect(json).not.toContain('червоний');
      expect(json).not.toContain('багряний');
      expect(json).toContain('синій');
    }
  });

  it('a question closed without a reveal shows no words at all (review I-1)', () => {
    const asked = answer(opened(intro([red, blue])), { p1: 'зелений' });
    for (const closed of [must(endRound(asked, at(asked, 5000))), must(end(asked, at(asked, 5000)))]) {
      expectHidden(closed, ['червоний', 'багряний', 'синій']);
    }
  });
});

// «Думай інакше» (51): анонімний бюлетень на етапі голосування автопілота й позначки «не на тему» на розкритті.
describe('think off-topic views (51)', () => {
  const NAMES: Record<string, string> = { olya: 'Оля', petro: 'Петро', vira: 'Віра', ihor: 'Ігор', marta: 'Марта' };
  const PLAYERS = ['olya', 'petro', 'vira', 'ihor'];
  const ANSWERS: Record<string, string> = { olya: 'синій', petro: 'банан', vira: 'зелений' };
  const quiz51 = () => {
    const questions = ['q1', 'q2', 'q3'].map((id) => think(id, [red], { timeLimit: 30 }));
    return makeRoundsQuiz([thinkRound('t', questions, { lives: 2 }), classicRound('r2', [single])], { leaderboard: 'end' });
  };
  const lobby51 = (ids: string[]) => ids.reduce((s, id) => must(addPlayer(s, { id, nickname: NAMES[id] })), createGame(quiz51()));
  /** Автопілот: автор Марта — глядач раунду; q1 відкрито о t0. */
  const piloted = () => {
    const intro51 = must(start(lobby51(['marta', ...PLAYERS])));
    return must(next({ ...intro51, autopilot: { authorId: 'marta', at: null } }, t0, rng0));
  };
  const hosted = () => must(next(must(start(lobby51(PLAYERS))), t0, rng0));
  const answer51 = (s: GameState, values: Record<string, string>) =>
    Object.entries(values).reduce((out, [id, value]) => must(submitAnswer(out, id, say(value), (out.startedAt ?? t0) + 1000)), s);
  const timeUp = (s: GameState) => tick(s, (s.endsAt ?? 0) + 1, rng0);
  /** Етап голосування: Оля «синій», Петро «банан», Віра «зелений», Ігор мовчить → таймер. */
  const voting = () => {
    const s = timeUp(answer51(piloted(), ANSWERS));
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].think?.vote).toBeDefined();
    return s;
  };
  const mark = (s: GameState, id: string, keys: string[]) => must(voteThinkOff(s, id, keys, (s.startedAt ?? t0) + 1000));
  const ENTRIES = [
    { key: 'банан', text: 'банан' },
    { key: 'зелений', text: 'зелений' },
    { key: 'синій', text: 'синій' },
  ];

  /** Жоден об'єкт зрізу не має водночас id/ніка автора (крім себе — viewer) і тексту його відповіді. */
  function expectNoAuthorPairs(view: unknown, viewer: string | null = null) {
    const authors = Object.entries(ANSWERS).filter(([id]) => id !== viewer);
    const walk = (node: unknown) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      const values = Object.values(node);
      const strings = values.filter((v): v is string => typeof v === 'string');
      for (const [id, text] of authors) {
        const named = strings.includes(id) || strings.includes(NAMES[id]);
        expect(named && strings.some((v) => v.toLowerCase() === text)).toBe(false);
      }
      values.forEach(walk);
    };
    walk(view);
  }

  it('the ballot reaches the stage and phones without authors', () => {
    const s = voting();
    const stage = stageView(s);
    expect(stage.think?.vote).toEqual({ entries: ENTRIES, voted: [], voters: 4 });
    expect(stage.think?.rows.map((r) => r.answer)).toEqual([null, null, null, null]);
    expect(stage.think?.rows.map((r) => r.off)).toEqual([null, null, null, null]);
    expectNoAuthorPairs(stage);
    for (const id of [...PLAYERS, 'marta']) expectNoAuthorPairs(playerView(s, id), id);
    // ключі — нормалізовані тексти, не id гравців
    for (const json of [JSON.stringify(stage.think?.vote), JSON.stringify(playerView(s, 'olya')?.me.think?.vote)]) {
      for (const id of [...PLAYERS, 'marta']) expect(json).not.toContain(id);
    }
  });

  it('a voter does not see their own answer', () => {
    const s = voting();
    expect(playerView(s, 'petro')?.me.think?.vote).toEqual({ entries: ENTRIES.filter((e) => e.key !== 'банан'), marked: [], canVote: true, done: false });
    // Ігор мовчав — бачить усі відповіді
    expect(playerView(s, 'ihor')?.me.think?.vote).toEqual({ entries: ENTRIES, marked: [], canVote: true, done: false });
    const voted = mark(s, 'petro', ['синій']);
    expect(playerView(voted, 'petro')?.me.think?.vote).toMatchObject({ marked: ['синій'], done: true });
    expect(playerView(voted, 'olya')?.me.think?.vote).toEqual({ entries: ENTRIES.filter((e) => e.key !== 'синій'), marked: [], canVote: true, done: false });
    expect(stageView(voted).think?.vote).toEqual({ entries: ENTRIES, voted: ['petro'], voters: 4 });
    // кількостей позначок ніде немає: ні в сцені, ні в чужих телефонах, ні на пульті
    for (const view of [stageView(voted), hostView(voted), ...['olya', 'vira', 'ihor', 'marta'].map((id) => playerView(voted, id))]) {
      const json = JSON.stringify(view);
      expect(json).not.toContain('"marks":{');
      expect(json).not.toContain('"marked":["');
    }
    expect(JSON.stringify(hostView(voted).think)).not.toContain('vote":{"voters');
  });

  it('non-voters see the list read-only', () => {
    // Віра вибуває на q1 (збіг на останньому житті), на q2 — голосування без неї.
    const s0 = piloted();
    const q1 = s0.plays[s0.questionIndex];
    const oneLife: GameState = withLives(s0, { ...q1.think!.lives, vira: 1 });
    let s = answer51(oneLife, { olya: 'синій', petro: 'банан', vira: 'червоний', ihor: 'жовтий' });
    expect(s.plays[s.questionIndex].think?.vote).toBeDefined();
    for (const id of PLAYERS) s = mark(s, id, []);
    expect(s.phase).toBe('locked');
    s = must(next(s, t0 + 90_000, rng0));
    expect(s.phase).toBe('reveal');
    s = must(next(s, t0 + 100_000, rng0));
    expect(s.phase).toBe('question');
    // живі присутні — Оля, Петро, Ігор: усі відповіли → голосування одразу
    s = answer51(s, { olya: 'синій', petro: 'банан', ihor: 'зелений' });
    expect(s.phase).toBe('question');
    expect(s.plays[s.questionIndex].think?.vote?.voters).toEqual(['olya', 'petro', 'ihor']);
    expect(playerView(s, 'vira')?.me.think).toMatchObject({ status: 'out', vote: { entries: ENTRIES, marked: [], canVote: false, done: false } });
    expect(playerView(s, 'marta')?.me.think).toMatchObject({ status: 'spectator', vote: { entries: ENTRIES, marked: [], canVote: false, done: false } });
  });

  it('a team member who is not the captain cannot vote', () => {
    const quiz = teamQuiz([thinkRound('r1', ['t1', 't2'].map((id) => think(id, [red], { timeLimit: 30 })), { lives: 2 }), classicRound('r2', [single])], 4);
    // t4 — лише автор автопілота (Марта, m5): глядач раунду.
    const intro51 = teamGame(quiz, [['Олена', 'Тарас'], ['Віра'], ['Хосе'], ['Марта']]);
    let s = opened({ ...intro51, autopilot: { authorId: 'm5', at: null } });
    s = must(actAnswer(s, 'm1', say('синій'), at(s, 1000)));
    s = must(actAnswer(s, 'm3', say('банан'), at(s, 1000)));
    s = timeUp(s);
    expect(s.plays[s.questionIndex].think?.vote?.voters).toEqual(['t1', 't2', 't3']);
    const own = [{ key: 'банан', text: 'банан' }];
    expect(playerView(s, 'm1')?.me.think?.vote).toEqual({ entries: own, marked: [], canVote: true, done: false });
    expect(playerView(s, 'm2')?.me.think?.vote).toEqual({ entries: own, marked: [], canVote: false, done: false });
    expect(playerView(s, 'm4')?.me.think?.vote).toMatchObject({ canVote: true });
    expect(playerView(s, 'm5')?.me.think?.vote).toMatchObject({ canVote: false });
  });

  it('the reveal shows off-topic marks', () => {
    let s = voting();
    for (const id of ['olya', 'vira', 'ihor']) s = mark(s, id, ['банан']);
    s = mark(s, 'petro', []);
    expect(s.phase).toBe('locked');
    expect(stageView(s).think?.vote).toBeNull();
    s = must(next(s, t0 + 90_000, rng0));
    expect(s.phase).toBe('reveal');
    const rows = stageView(s).think?.rows ?? [];
    expect(rows.find((r) => r.id === 'petro')).toMatchObject({ answer: 'банан', verdict: 'safe', off: 'vote', lost: true, lives: 1 });
    expect(rows.find((r) => r.id === 'olya')).toMatchObject({ off: null, lost: false });
    expect(rows.find((r) => r.id === 'ihor')).toMatchObject({ verdict: 'empty', off: null, lost: true });
    expect(playerView(s, 'petro')?.me.think).toMatchObject({ off: 'vote', verdict: 'safe', vote: null, lives: 1 });
    expect(playerView(s, 'olya')?.think?.rows.find((r) => r.id === 'petro')?.off).toBe('vote');
    expect(hostView(s).think?.answers.find((a) => a.id === 'petro')?.off).toBe('vote');
    // Ведучий: позначка на розкритті — 'host' усюди й одразу −1 ❤️.
    const shown = revealOf(answer51(hosted(), ANSWERS));
    expect(stageView(shown).think?.rows.find((r) => r.id === 'petro')).toMatchObject({ off: null, lost: false, lives: 2 });
    const marked = must(markThinkOff(shown, 'petro', true));
    expect(stageView(marked).think?.rows.find((r) => r.id === 'petro')).toMatchObject({ off: 'host', lost: true, lives: 1 });
    expect(playerView(marked, 'petro')?.me.think).toMatchObject({ off: 'host', verdict: 'safe', lives: 1 });
    expect(hostView(marked).think?.answers.find((a) => a.id === 'petro')).toMatchObject({ answer: 'банан', off: 'host' });
    expect(hostView(marked).think?.answers.find((a) => a.id === 'olya')?.off).toBeNull();
  });

  it('no vote outside the stage', () => {
    const open = answer51(piloted(), ANSWERS);
    expect(open.phase).toBe('question');
    const s = voting();
    let locked = s;
    for (const id of PLAYERS) locked = mark(locked, id, []);
    expect(locked.phase).toBe('locked');
    const shown = must(next(locked, t0 + 90_000, rng0));
    expect(shown.phase).toBe('reveal');
    for (const state of [open, locked, shown]) {
      expect(stageView(state).think?.vote).toBeNull();
      expect(hostView(state).think?.vote).toBeNull();
      for (const id of [...PLAYERS, 'marta']) expect(playerView(state, id)?.me.think?.vote).toBeNull();
      expect(stageView(state).think?.rows.every((r) => r.off === null)).toBe(true);
    }
    // з ведучим етапу немає
    const hostedLocked = lockOf(answer51(hosted(), ANSWERS));
    expect(stageView(hostedLocked).think?.vote).toBeNull();
  });
});

/** Життя на відкритті поточного запитання think — для сценаріїв вибування. */
function withLives(s: GameState, lives: Record<string, number>): GameState {
  const plays = s.plays.map((p, i) => (i === s.questionIndex && p.think !== undefined ? { ...p, think: { ...p.think, lives } } : p));
  return { ...s, plays };
}
