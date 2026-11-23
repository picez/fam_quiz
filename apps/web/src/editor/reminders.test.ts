import { describe, expect, it } from 'vitest';
import { newBoardRound, newClassicRound, newLadderRound, newQuestion, newQuiz, newSurvivalRound, problemsOf } from './draft';
import { remindersOf, roundLayout } from './reminders';
import type { Question, Quiz } from '@quiz/shared';

const withQuestions = (questions: Question[], description = 'Про щось'): Quiz => {
  const quiz = newQuiz();
  return { ...quiz, description, rounds: [{ ...newClassicRound(), questions }] };
};
const boolean = (correct: boolean): Question => ({ ...newQuestion('boolean'), text: 'Так?', correct }) as Question;
const timed = (type: 'single' | 'text', timeLimit: number): Question => ({ ...newQuestion(type), timeLimit });

describe('remindersOf (74)', () => {
  it('reminds about a missing description', () => {
    const quiz = withQuestions([], '   ');
    expect(remindersOf(quiz)).toEqual([{ text: 'У вікторини немає опису — додай кілька слів, про що вона.', place: { kind: 'general', card: 'about' } }]);
    expect(remindersOf(withQuestions([]))).toEqual([]);
  });

  it('reminds about a timer under 25 s only where the timer field is shown', () => {
    const [fast, ok] = [timed('single', 15), timed('single', 25)];
    const found = remindersOf(withQuestions([fast, ok]));
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({ text: 'Запитання 1: таймер 15 с — менше за 25 с, гравці можуть не встигнути.', place: { kind: 'question', round: 0, question: 0, card: 'time' } });
    // Драбина без таймера: поле часу не показується.
    const ladder = newLadderRound();
    const quiz = { ...withQuestions([]), rounds: [{ ...ladder, timer: false, questions: ladder.questions.map((q) => ({ ...q, timeLimit: 15 })) }] };
    expect(remindersOf(quiz)).toEqual([]);
    expect(remindersOf({ ...quiz, rounds: [{ ...quiz.rounds[0], timer: true } as Quiz['rounds'][number]] }).length).toBeGreaterThan(0);
    // Запитання з відео в межах часу: таймер схований.
    const video = { ...timed('single', 15), video: { id: 'dQw4w9WgXcQ', start: 0, end: 30 } } as unknown as Question;
    expect(remindersOf(withQuestions([video]))).toEqual([]);
  });

  it('prefixes the round when there are several and words a board cell like a problem', () => {
    const board = newBoardRound();
    board.categories[1].cells[2].question.timeLimit = 15;
    const quiz: Quiz = { ...withQuestions([timed('text', 10)]), rounds: [{ ...newClassicRound(), questions: [timed('text', 10)] }, board] };
    const texts = remindersOf(quiz).map((r) => r.text);
    expect(texts).toEqual([
      'Раунд 1: Запитання 1: таймер 10 с — менше за 25 с, гравці можуть не встигнути.',
      'Раунд 2: Категорія 2, запитання 3: таймер 15 с — менше за 25 с, гравці можуть не встигнути.',
    ]);
    expect(remindersOf(quiz)[1].place).toEqual({ kind: 'cell', round: 1, category: 1, index: 2, card: 'time' });
  });

  it('reminds when four or more yes/no questions share the answer', () => {
    const four = remindersOf(withQuestions([boolean(true), boolean(true), boolean(true), boolean(true)]));
    expect(four).toEqual([{ text: 'Усі запитання «так чи ні» (4) мають відповідь «Так» — зроби частину з відповіддю «Ні».', place: { kind: 'round', round: 0, settings: false } }]);
    expect(remindersOf(withQuestions([boolean(false), boolean(false), boolean(false), boolean(false)]))[0].text).toContain('«Ні»');
    expect(remindersOf(withQuestions([boolean(true), boolean(true), boolean(true)]))).toEqual([]);
    expect(remindersOf(withQuestions([boolean(true), boolean(true), boolean(true), boolean(false)]))).toEqual([]);
  });

  it('counts a whole board for yes/no and ignores spares', () => {
    const board = newBoardRound();
    const cells = board.categories.flatMap((category) => category.cells);
    cells.slice(0, 4).forEach((cell) => {
      cell.question = boolean(true);
    });
    const quiz = { ...withQuestions([]), rounds: [board] };
    expect(remindersOf(quiz).map((r) => r.text)).toEqual(['Усі запитання «так чи ні» (4) мають відповідь «Так» — зроби частину з відповіддю «Ні».']);
    const spared = { ...withQuestions([boolean(true), boolean(true), boolean(true)]), spares: [boolean(true), boolean(true)] };
    expect(remindersOf(spared)).toEqual([]);
  });

  it('reminds about survival trial timers at the round settings', () => {
    const round = newSurvivalRound();
    const quiz = { ...withQuestions([]), rounds: [{ ...round, trial: 'question' as const, trials: [timed('single', 10)] }] };
    expect(remindersOf(quiz).map((r) => r.place)).toContainEqual({ kind: 'round', round: 0, settings: true });
  });

  it('skips survival trial timers when the trial is luck', () => {
    const round = newSurvivalRound();
    const quiz = { ...withQuestions([]), rounds: [{ ...round, trial: 'luck' as const, trials: [timed('single', 10)] }] };
    expect(remindersOf(quiz).map((r) => r.place)).not.toContainEqual({ kind: 'round', round: 0, settings: true });
  });

  it('never blocks saving', () => {
    const quiz = { ...withQuestions([{ ...timed('text', 10), text: 'Q', accepted: ['a'] } as Question], ''), title: 'Назва' };
    expect(remindersOf(quiz).length).toBeGreaterThan(0);
    expect(problemsOf(quiz)).toEqual([]);
  });

  it('mirrors the QuizEditor layout flags per round type', () => {
    expect(roundLayout(newClassicRound())).toMatchObject({ showPoints: true, showReveal: true, showTime: true });
    expect(roundLayout(newLadderRound())).toMatchObject({ showPoints: false, showReveal: false, showTime: false });
  });
});
