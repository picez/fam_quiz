import { describe, expect, it } from 'vitest';
import type { Answer, ThinkRound, ThinkWord } from '@quiz/shared';
import { end, endRound, next, start, submitAnswer, tick, type GameState } from './game';
import { addLatePlayer } from './saved';
import { actAnswer } from './team-act';
import { setThinkWords } from './think';
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
    const added = must(setThinkWords(opened(intro()), [violet], t0 + 100));
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
      { id: 'p1', nickname: 'Олена', answer: 'Червона', hit: true, overridden: false },
      { id: 'p2', nickname: 'Тарас', answer: null, hit: null, overridden: false },
      { id: 'p3', nickname: 'Віра', answer: null, hit: null, overridden: false },
      { id: 'p4', nickname: 'Хосе', answer: 'Зелений', hit: false, overridden: false },
    ]);
    expect(host?.editable).toBe(true);
    expect(host?.canReveal).toBe(false);
    const locked = hostView(lockOf(asked)).think;
    expect(locked?.editable).toBe(false);
    expect(locked?.canReveal).toBe(true);
    // Без слів: після таймера «Показати» неактивне, слово можна вписати один раз.
    const bare = lockOf(opened(intro([])));
    expect(hostView(bare).think).toMatchObject({ draft: [], editable: true, canReveal: false });
    const written = must(setThinkWords(bare, [violet], at(bare, 35_000)));
    expect(hostView(written).think).toMatchObject({ draft: [violet], editable: false, canReveal: true });
  });

  it('the stage row shows hearts and who answered, not what', () => {
    const asked = answer(opened(intro()), { p1: 'Червона' });
    const think = stageView(asked).think;
    expect(think).toMatchObject({ lives: 3, points: 10_000, index: 0, total: 5, words: null, places: null });
    expect(think?.rows[0]).toEqual({ id: 'p1', nickname: 'Олена', lives: 3, out: false, answered: true, answer: null, verdict: null, lost: false });
    expect(think?.rows[1]).toMatchObject({ nickname: 'Тарас', answered: false, answer: null });
  });

  it('reveal shows words, every answer and lost hearts', () => {
    const shown = revealOf(answer(opened(intro()), { p1: 'Червона', p2: 'ксилофон', p4: 'Зелений' }));
    expect(shown.phase).toBe('reveal');
    const think = stageView(shown).think;
    expect(think?.words).toEqual([red, blue]);
    expect(think?.rows.find((r) => r.id === 'p1')).toMatchObject({ answer: 'Червона', verdict: 'hit', lost: true, lives: 2, answered: false });
    expect(think?.rows.find((r) => r.id === 'p3')).toMatchObject({ answer: '', verdict: 'empty', lost: true, lives: 2 });
    expect(think?.rows.find((r) => r.id === 'p4')).toMatchObject({ answer: 'Зелений', verdict: 'safe', lost: false, lives: 3 });
    expect(playerView(shown, 'p2')?.me.think).toEqual({ lives: 3, status: 'alive', verdict: 'safe', place: null });
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
    expect(playerView(s, 'm2')?.me.think).toEqual({ lives: 2, status: 'alive', verdict: null, place: null });
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
    const changed = must(setThinkWords(opened(intro([red])), [blue], t0 + 100));
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
