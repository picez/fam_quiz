import { describe, expect, it } from 'vitest';
import type { Question, Quiz } from '@quiz/shared';
import { next, start, submitAnswer, tick, type GameState } from './game';
import { classicRound, makeRoundsQuiz, text } from './testing/fixtures';
import { lobbyWith, must } from './testing/helpers';
import { hostView, playerView, stageView } from './views';

// 30c: зріз не несе вікторини — лише поточне запитання; тут це зафіксовано рамкою, щоб оптимізації транспорту її не порушили.
const T0 = 1_000_000;

/** Довге тіло запитання: щоб вікторина була помітно більшою за сталу «обв'язку» зрізу (правила, налаштування). */
const FILLER = 'Дуже докладний опис запитання, що займає місце. '.repeat(12);

const questions = (count: number): Question[] =>
  Array.from({ length: count }, (_, i) => ({ ...text, id: `m${i}`, text: `Маркер-запитання-${i} ${FILLER}`, accepted: [`Маркер-відповідь-${i}`] }));
const quizOf = (count: number): Quiz => makeRoundsQuiz([classicRound('c1', questions(count))]);

type Views = { host: unknown; stage: unknown; players: unknown[] };
const viewsOf = (state: GameState, now: number): Views => ({
  host: hostView(state),
  stage: stageView(state),
  players: ['p1', 'p2', 'p3'].map((id) => playerView(state, id, now)),
});

/** Проходить гру до кінця й віддає кожен крок. */
function* walk(quiz: Quiz): Generator<{ state: GameState; now: number }> {
  let now = T0;
  let state = must(start(lobbyWith(quiz, 'Олена', 'Тарас', 'Ірина'), now));
  yield { state, now };
  for (let step = 0; step < 400 && state.phase !== 'finished'; step++) {
    now += 40_000;
    state = tick(state, now);
    if (state.phase === 'question' && step % 2 === 0) {
      const play = state.plays[state.questionIndex]?.question;
      if (play?.type === 'text') state = must(submitAnswer(state, 'p1', { type: 'text', value: play.accepted[0] }, now));
    }
    const advanced = next(state, now);
    if (advanced.ok) state = advanced.state;
    yield { state, now };
  }
  expect(state.phase).toBe('finished');
}

describe('snapshot payload (30c)', () => {
  it('never carries the text of a question that is not open yet, nor the current answer before reveal', () => {
    const quiz = quizOf(6);
    for (const { state, now } of walk(quiz)) {
      const views = viewsOf(state, now);
      const current = Math.max(state.questionIndex, 0);
      for (let i = current + 1; i < 6; i++) {
        for (const view of [views.host, views.stage, ...views.players]) {
          expect(JSON.stringify(view)).not.toContain(`Маркер-запитання-${i}`);
        }
      }
      // Відповіді сцени й телефона — лише з розкриття (host бачить відповідь поточного).
      if (state.phase === 'question' || state.phase === 'lobby') {
        for (let i = current; i < 6; i++) {
          for (const view of [views.stage, ...views.players]) expect(JSON.stringify(view)).not.toContain(`Маркер-відповідь-${i}`);
        }
      }
      for (let i = current + 1; i < 6; i++) expect(JSON.stringify(views.host)).not.toContain(`Маркер-відповідь-${i}`);
    }
  });

  it('every view stays well under half of the quiz size', () => {
    const quiz = quizOf(20);
    const quizSize = JSON.stringify(quiz).length;
    for (const { state, now } of walk(quiz)) {
      const views = viewsOf(state, now);
      for (const view of [views.host, views.stage, ...views.players]) expect(JSON.stringify(view).length).toBeLessThan(quizSize / 2);
    }
  });
});
