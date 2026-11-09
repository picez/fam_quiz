import { LIMITS, ladderKey, oneLetterApart, rulesOf, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, ok, recordOf, withFinalPoints, type AnswerRecord, type GameState, type Play, type Result, type WordLadderProgress } from './game';
import { finalPoints, wordLadderShare } from './score';
import { limitMsOf, timeOverFor } from './timing';
import { notStarted } from './splash';

// «Словесна драбина» (26c): хід словом, крок назад і бали за найкращим фінішером. Словника рушій не знає: isNoun дає сервер.

const UNTOUCHED: WordLadderProgress = { words: [] };

type LadderPlay = Play & { question: Extract<Question, { type: 'wordladder' }> };

/** Поточне запитання, якщо воно драбина. */
function ladderPlay(state: GameState): LadderPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'wordladder' ? (play as LadderPlay) : null;
}

/** Поступ гравця; без запису — { words: [] }. */
export function wordLadderOf(state: GameState, playerId: string): WordLadderProgress {
  const progress = state.plays[state.questionIndex]?.wordladder;
  return progress !== undefined && Object.hasOwn(progress, playerId) ? progress[playerId] : UNTOUCHED;
}

/** Ключі шляху ведучого; схема гарантує, що кожне слово шляху має ключ. */
function pathKeys(play: LadderPlay): string[] {
  return play.question.path.map((word) => ladderKey(word) ?? word);
}

type Checked = { ok: true; play: LadderPlay; progress: WordLadderProgress; startedAt: number } | { ok: false; result: Result };

/** Спільні перевірки ходу й кроку назад, по черзі. */
function checkTurn(state: GameState, playerId: string, now: number): Checked {
  if (state.phase !== 'question') return { ok: false, result: fail('wrong_phase') };
  if (state.paused) return { ok: false, result: fail('paused') };
  if (notStarted(state, now)) return { ok: false, result: fail('not_started') };
  if (!state.players.some((p) => p.id === playerId)) return { ok: false, result: fail('not_found') };
  const play = ladderPlay(state);
  if (play === null) return { ok: false, result: fail('type_mismatch') };
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return { ok: false, result: fail('already_answered') };
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return { ok: false, result: fail('time_over') };
  return { ok: true, play, progress: wordLadderOf(state, playerId), startedAt: state.startedAt };
}

/** Поступ гравця на запитанні; без слів гравця в play.wordladder немає. */
function withProgress(state: GameState, play: Play, playerId: string, words: string[]): GameState {
  const { [playerId]: _old, ...others } = play.wordladder ?? {};
  return withPlay(state, { ...play, wordladder: words.length === 0 ? others : { ...others, [playerId]: { words } } });
}

/** Чи зіграно запитання в раунді фіналу. */
function isFinal(state: GameState, play: Play): boolean {
  return state.quiz.rounds[play.roundIndex]?.type === 'final';
}

function wagerOf(play: Play, playerId: string): number {
  const wagers = play.final?.wagers;
  return wagers !== undefined && Object.hasOwn(wagers, playerId) ? wagers[playerId] : 0;
}

/**
 * Наступне слово драбини: рівно одна літера від попереднього, і слово є в шляху ведучого або isNoun.
 * Хибна спроба стану не змінює. Слово, що дорівнює цілі, дає запис: у класиці з тимчасовими 0 балів
 * (бали рахує scoreWordLadder при закритті), у фіналі «правильно» лише в межах maxSteps і одразу бали за ставками.
 */
export function ladderWord(state: GameState, playerId: string, word: string, now: number, isNoun: (key: string) => boolean): Result {
  const checked = checkTurn(state, playerId, now);
  if (!checked.ok) return checked.result;
  const { play, progress, startedAt } = checked;
  if (progress.words.length >= LIMITS.maxWordLadderWords) return fail('word_too_many');
  const key = ladderKey(word);
  if (key === null) return fail('word_unknown');
  const keys = pathKeys(play);
  const previous = progress.words.at(-1) ?? keys[0];
  if (key === previous) return fail('word_repeat');
  if (!oneLetterApart(previous, key)) return fail('word_one_letter');
  if (!keys.includes(key) && !isNoun(key)) return fail('word_unknown');
  const words = [...progress.words, key];
  const advanced = withProgress(state, play, playerId, words);
  if (key !== keys.at(-1)) return ok(advanced);

  const final = isFinal(state, play);
  const within = words.length <= play.question.maxSteps;
  const correct = within;
  const points = final ? finalPoints(wagerOf(play, playerId), within) : 0;
  const timeMs = Math.max(0, now - startedAt);
  const record: AnswerRecord = {
    answer: { type: 'wordladder', words, steps: words.length, finished: true },
    timeMs,
    accepted: correct,
    accuracy: correct ? 1 : 0,
    grade: correct ? 'correct' : 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  const current = advanced.plays[advanced.questionIndex];
  // У фіналі бали рахуються за типом ставок (спільний банк залежить від інших записів).
  return ok(autoLock(withFinalPoints(withPlay(advanced, { ...current, answers: { ...current.answers, [playerId]: record } })), now));
}

/** «Крок назад»: прибирає останнє прийняте слово; без слів — word_none. */
export function ladderBack(state: GameState, playerId: string, now: number): Result {
  const checked = checkTurn(state, playerId, now);
  if (!checked.ok) return checked.result;
  const { play, progress } = checked;
  if (progress.words.length === 0) return fail('word_none');
  return ok(withProgress(state, play, playerId, progress.words.slice(0, -1)));
}

/**
 * На етапі question: бали фінішерам за найкращим (найменше кроків у межах maxSteps) і записи тим, хто має поступ без фінішу;
 * інакше стан без змін. Швидкість, «частково», мінус-штраф і бафи не діють; множник раунду діє.
 */
export function scoreWordLadder(state: GameState): GameState {
  const play = ladderPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const { maxSteps } = play.question;
  const final = isFinal(state, play);
  const answers = { ...play.answers };

  if (!final) {
    const finishers = Object.values(answers).flatMap((r) => (r.answer?.type === 'wordladder' && r.answer.finished ? [r.answer.steps] : []));
    const best = Math.min(...finishers.filter((steps) => steps <= maxSteps));
    const multiplier = rulesOf(state.quiz.rounds[play.roundIndex]).multiplier;
    for (const [playerId, record] of Object.entries(answers)) {
      if (record.answer?.type !== 'wordladder' || !record.answer.finished) continue;
      // Ніхто не дійшов у межах maxSteps — best нескінченний, і частка 0 у кожного.
      const share = Number.isFinite(best) ? wordLadderShare(record.answer.steps, best, maxSteps) : 0;
      const points = Math.round(play.question.points * multiplier * share);
      const correct = share > 0;
      answers[playerId] = { ...record, accepted: correct, accuracy: share, grade: correct ? 'correct' : 'wrong', basePoints: points, streakBonus: 0, points };
    }
  }

  const limitMs = limitMsOf(play) ?? 0;
  for (const [playerId, progress] of Object.entries(play.wordladder ?? {})) {
    if (Object.hasOwn(answers, playerId)) continue;
    const points = final ? finalPoints(wagerOf(play, playerId), false) : 0;
    answers[playerId] = {
      answer: { type: 'wordladder', words: progress.words, steps: progress.words.length, finished: false },
      timeMs: limitMs,
      accepted: false,
      accuracy: 0,
      grade: 'wrong',
      basePoints: points,
      streakBonus: 0,
      points,
      overridden: false,
    };
  }
  return withPlay(state, { ...play, answers });
}
