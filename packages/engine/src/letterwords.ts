import { LIMITS, fitsLetters, ladderKey, rulesOf, wordLetters, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { betsRefusal } from './bets';
import { fail, ok, type AnswerRecord, type GameState, type LetterWordsPlay, type LetterWordsProgress, type Play, type Result } from './game';
import { notStarted } from './splash';
import { limitMsOf, timeOverFor } from './timing';

// «Слова з літер» (27d): гравець (команда) складає слова з набору літер; бали за кожне слово, кожну літеру чи найдовше слово.
// Словника рушій не знає: isNoun дає сервер, він же роздає випадковий набір і найдовші можливі слова (dealLetters).

const UNTOUCHED: LetterWordsProgress = { words: [] };

type LettersPlay = Play & { question: Extract<Question, { type: 'letterwords' }> };

/** Поточне запитання, якщо воно «Слова з літер». */
function lettersPlay(state: GameState): LettersPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'letterwords' ? (play as LettersPlay) : null;
}

/** Що ще треба роздати: свій набір (лише найкращі слова) чи випадковий з count літер. */
export type LettersDue = { letters: string[]; count?: undefined } | { letters?: undefined; count: number };

/** Роздача, якої чекає поточне запитання; роздано чи інше запитання — null. */
export function lettersDue(state: GameState): LettersDue | null {
  const play = lettersPlay(state);
  const letters = play?.letterwords;
  if (play === null || letters === undefined || letters.best !== null) return null;
  if (letters.letters !== null) return { letters: letters.letters };
  return play.question.set.kind === 'random' ? { count: play.question.set.count } : null;
}

/** Роздача сервера в поточне запитання; не потрібна — той самий стан. Свій набір ведучого не переписується. */
export function dealLetters(state: GameState, deal: { letters: string[]; best: string[]; possible: number }): GameState {
  if (lettersDue(state) === null) return state;
  const play = lettersPlay(state) as LettersPlay;
  const current = play.letterwords as LetterWordsPlay;
  return withPlay(state, {
    ...play,
    letterwords: { ...current, letters: current.letters ?? deal.letters, best: deal.best, possible: deal.possible },
  });
}

/** Слова гравця (команди) на поточному запитанні; без запису — { words: [] }. */
export function letterWordsOf(state: GameState, playerId: string): LetterWordsProgress {
  const progress = state.plays[state.questionIndex]?.letterwords?.progress;
  return progress !== undefined && Object.hasOwn(progress, playerId) ? progress[playerId] : UNTOUCHED;
}

/** Літер у найдовшому слові; без слів — 0. */
function longestOf(words: readonly string[]): number {
  return words.reduce((most, w) => Math.max(most, wordLetters(w).length), 0);
}

/** Бали гравця (команди) за словами: сума за одиницю × множник раунду × позначка клітинки (ціна клітинки не діє). */
export function letterPoints(state: GameState, play: Play, words: readonly string[]): number {
  const question = play.question;
  if (question.type !== 'letterwords') return 0;
  const unit = question.points * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier * (play.board?.multiplier ?? 1);
  if (question.goal === 'longest') return Math.round(unit * longestOf(words));
  const count = question.per === 'word' ? words.length : words.reduce((sum, w) => sum + wordLetters(w).length, 0);
  return Math.round(unit * count);
}

/**
 * Слово гравця (команди), по черзі: етап, пауза, старт і роздача, гравець, ставки, тип, черга клітинки, час;
 * далі ключ, довжина, набір, повтор (стан той самий, без кари), словник, межа слів. Прийняте — у кінець progress.
 */
export function letterWord(state: GameState, playerId: string, word: string, now: number, isNoun: (key: string) => boolean): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const play = lettersPlay(state);
  // Поки сервер не роздав набір, слів не приймаємо.
  if (notStarted(state, now) || (play !== null && (play.letterwords?.best ?? null) === null)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const skipped = betsRefusal(state, playerId);
  if (skipped !== null) return fail(skipped);
  if (play === null) return fail('type_mismatch');
  if (play.board !== undefined && play.board.chooserId !== playerId) return fail('not_your_turn');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');

  const letters = play.letterwords as LetterWordsPlay;
  const key = ladderKey(word);
  if (key === null) return fail('word_unknown');
  if (wordLetters(key).length < LIMITS.minLetterWord) return fail('letters_short');
  if (!fitsLetters(key, letters.letters ?? [])) return fail('letters_not_in_set');
  const progress = letterWordsOf(state, playerId);
  if (progress.words.includes(key)) return fail('letters_repeat');
  if (!isNoun(key)) return fail('word_unknown');
  if (progress.words.length >= LIMITS.maxLetterWords) return fail('letters_too_many');
  return ok(withPlay(state, { ...play, letterwords: { ...letters, progress: { ...letters.progress, [playerId]: { words: [...progress.words, key] } } } }));
}

/** Запис гравця (команди): правильно, коли є хоча б одне слово; точність — частка можливих слів чи найдовшого можливого. */
function lettersRecord(state: GameState, play: LettersPlay, words: string[], timeMs: number): AnswerRecord {
  const longest = longestOf(words);
  const { possible, best } = play.letterwords ?? { possible: null, best: null };
  const top = best?.[0];
  const accuracy =
    possible === null || possible === 0 || top === undefined
      ? 0
      : play.question.goal === 'longest'
        ? Math.min(1, longest / wordLetters(top).length)
        : Math.min(1, words.length / possible);
  const correct = words.length > 0;
  const points = letterPoints(state, play, words);
  return {
    answer: { type: 'letterwords', words, longest },
    timeMs,
    accepted: correct,
    accuracy,
    grade: correct ? 'correct' : 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
}

/**
 * На етапі question: записи тим, хто склав хоча б одне слово; на клітинці поля той, хто вибрав і нічого не склав, — запис з 0
 * (як у списку: інакше unansweredIsWrong дав би мінус ціни клітинки). Бали кожного — лише за його слова, тож вилучення інших
 * гравців їх не змінює. Інакше стан той самий. Швидкість, «частково», мінус-штраф раунду й бафи не діють.
 */
export function scoreLetterWords(state: GameState): GameState {
  const play = lettersPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  for (const [playerId, progress] of Object.entries(play.letterwords?.progress ?? {})) {
    if (!state.players.some((p) => p.id === playerId) || progress.words.length === 0) continue;
    answers[playerId] = lettersRecord(state, play, progress.words, limitMs);
  }
  const chooser = play.board?.chooserId;
  if (chooser !== undefined && state.players.some((p) => p.id === chooser) && !Object.hasOwn(answers, chooser)) {
    answers[chooser] = lettersRecord(state, play, [], limitMs);
  }
  return withPlay(state, { ...play, answers });
}
