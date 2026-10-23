import { rulesOf, type ChainMask, type Question } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { presentPlayers } from './present';
import { autoLock, fail, ok, recordOf, withFinalPoints, type AnswerRecord, type ChainProgress, type GameState, type Play, type Result } from './game';
import { normalizeText } from './normalize';
import { chainFactor, finalPoints } from './score';
import { limitMsOf } from './timing';
import { notStarted } from './splash';

const LETTER = /\p{L}/u;

/** Кількість літер слова, без розділювачів. */
export function letterCount(word: string): number {
  return Array.from(word).filter((char) => LETTER.test(char)).length;
}

/** Маска слова: перші `shown` літер і всі розділювачі видно, решта null. */
export function maskWord(word: string, shown: number): ChainMask {
  let letters = 0;
  return Array.from(word).map((char) => {
    if (!LETTER.test(char)) return char;
    letters += 1;
    return letters <= shown ? char : null;
  });
}

const UNTOUCHED: ChainProgress = { solved: 0, shown: 1, hints: 0 };

type ChainPlay = Play & { question: Extract<Question, { type: 'chain' }> };

/** Поточне запитання, якщо воно ланцюжок. */
function chainPlay(state: GameState): ChainPlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'chain' ? (play as ChainPlay) : null;
}

/** Поступ гравця; без запису — { solved: 0, shown: 1, hints: 0 }. */
export function chainOf(state: GameState, playerId: string): ChainProgress {
  const progress = state.plays[state.questionIndex]?.chain;
  return progress !== undefined && Object.hasOwn(progress, playerId) ? progress[playerId] : UNTOUCHED;
}

export function hintMsOf(question: Question): number {
  return question.type === 'chain' ? question.hintSeconds * 1000 : 0;
}

/** endsAt − штраф гравця; null без endsAt (пауза, поза question). */
export function chainDeadline(state: GameState, playerId: string): number | null {
  const play = chainPlay(state);
  if (state.phase !== 'question' || play === null || state.endsAt === null) return null;
  return state.endsAt - chainOf(state, playerId).hints * hintMsOf(play.question);
}

type Checked = { ok: true; play: ChainPlay; progress: ChainProgress; startedAt: number } | { ok: false; result: Result };

/** Спільні перевірки вгадування й підказки, по черзі. */
function checkTurn(state: GameState, playerId: string, now: number): Checked {
  if (state.phase !== 'question') return { ok: false, result: fail('wrong_phase') };
  if (state.paused) return { ok: false, result: fail('paused') };
  if (notStarted(state, now)) return { ok: false, result: fail('not_started') };
  if (!state.players.some((p) => p.id === playerId)) return { ok: false, result: fail('not_found') };
  const play = chainPlay(state);
  if (play === null) return { ok: false, result: fail('type_mismatch') };
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return { ok: false, result: fail('already_answered') };
  const deadline = chainDeadline(state, playerId);
  if ((deadline !== null && now > deadline) || state.startedAt === null) return { ok: false, result: fail('time_over') };
  return { ok: true, play, progress: chainOf(state, playerId), startedAt: state.startedAt };
}

function withProgress(state: GameState, play: Play, playerId: string, progress: ChainProgress): GameState {
  return withPlay(state, { ...play, chain: { ...play.chain, [playerId]: progress } });
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
 * Наступне слово ланцюжка. Хибне слово стану не змінює. Після останнього слова гравець отримує запис:
 * у класиці з тимчасовими 0 балів (бали рахує scoreChain при закритті), у фіналі одразу бали за типом ставок.
 */
export function guessWord(state: GameState, playerId: string, word: string, now: number): Result {
  const checked = checkTurn(state, playerId, now);
  if (!checked.ok) return checked.result;
  const { play, progress, startedAt } = checked;
  if (normalizeText(word) !== normalizeText(play.question.words[progress.solved + 1])) return fail('wrong_word');
  const solved = progress.solved + 1;
  const advanced = withProgress(state, play, playerId, { solved, shown: 1, hints: progress.hints });
  if (solved < play.question.words.length - 1) return ok(advanced);

  const timeMs = Math.max(0, now - startedAt) + progress.hints * hintMsOf(play.question);
  const points = isFinal(state, play) ? finalPoints(wagerOf(play, playerId), true) : 0;
  const record: AnswerRecord = {
    answer: { type: 'chain', solved, hints: progress.hints, timeMs },
    timeMs,
    accepted: true,
    accuracy: 1,
    grade: 'correct',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
  const current = advanced.plays[advanced.questionIndex];
  // У фіналі бали рахуються за типом ставок (спільний банк залежить від інших записів).
  return ok(autoLock(withFinalPoints(withPlay(advanced, { ...current, answers: { ...current.answers, [playerId]: record } })), now));
}

/** Відкриває гравцеві наступну літеру поточного слова (ніколи останню) і додає до його часу секунди підказки. */
export function takeHint(state: GameState, playerId: string, now: number): Result {
  const checked = checkTurn(state, playerId, now);
  if (!checked.ok) return checked.result;
  const { play, progress, startedAt } = checked;
  if (progress.shown >= letterCount(play.question.words[progress.solved + 1]) - 1) return fail('no_hint');
  const hints = progress.hints + 1;
  if (now - startedAt + hints * hintMsOf(play.question) >= (limitMsOf(play) ?? Infinity)) return fail('hint_late');
  return ok(withProgress(state, play, playerId, { ...progress, shown: progress.shown + 1, hints }));
}

/** Кожен підключений (і хоч один) пройшов або, якщо now не null, вичерпав свій час. */
export function chainDone(state: GameState, now: number | null): boolean {
  if (state.phase !== 'question' || chainPlay(state) === null) return false;
  const connected = presentPlayers(state);
  return (
    connected.length > 0 &&
    connected.every((p) => {
      if (recordOf(state, state.questionIndex, p.id) !== undefined) return true;
      const deadline = chainDeadline(state, p.id);
      return now !== null && deadline !== null && now >= deadline;
    })
  );
}

/** На етапі question: бали тим, хто пройшов, і записи тим, хто грав, але не пройшов; інакше стан без змін. */
export function scoreChain(state: GameState): GameState {
  const play = chainPlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const final = isFinal(state, play);
  const answers = { ...play.answers };

  if (!final) {
    const times = Object.values(answers).filter((r) => r.accepted).map((r) => r.timeMs);
    const fastest = Math.min(...times);
    const multiplier = rulesOf(state.quiz.rounds[play.roundIndex]).multiplier;
    for (const [playerId, record] of Object.entries(answers)) {
      if (!record.accepted) continue;
      const points = Math.round(play.question.points * multiplier * chainFactor(record.timeMs, fastest, limitMs));
      answers[playerId] = { ...record, basePoints: points, streakBonus: 0, points };
    }
  }

  for (const [playerId, progress] of Object.entries(play.chain ?? {})) {
    if (Object.hasOwn(answers, playerId)) continue;
    const points = final ? finalPoints(wagerOf(play, playerId), false) : 0;
    answers[playerId] = {
      answer: { type: 'chain', solved: progress.solved, hints: progress.hints, timeMs: limitMs },
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
