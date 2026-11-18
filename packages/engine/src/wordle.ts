import { LIMITS, rulesOf, wordleCandidates, wordleKey, wordleLetters, wordleMarks, wordlePoints, type PlayerWordle, type Question, type WordleInfo, type WordleMark } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { betsRefusal } from './bets';
import { autoLock, fail, ok, recordOf, type AnswerRecord, type GameState, type Play, type Result, type WordleProgress } from './game';
import { limitMsOf, timeOverFor } from './timing';
import { notStarted } from './splash';

// «Вгадай слово» (48): шість спроб словами з словника, класичні кольори, бали за номер спроби. Словника рушій не знає: isNoun дає сервер.

const UNTOUCHED: WordleProgress = { guesses: [] };

type WordlePlay = Play & { question: Extract<Question, { type: 'wordle' }> };

/** Поточне запитання, якщо воно wordle. */
function wordlePlay(state: GameState): WordlePlay | null {
  const play = state.plays[state.questionIndex];
  return play?.question.type === 'wordle' ? (play as WordlePlay) : null;
}

/** Поступ гравця (команди); без запису — { guesses: [] }. */
export function wordleOf(state: GameState, playerId: string): WordleProgress {
  const progress = state.plays[state.questionIndex]?.wordle;
  return progress !== undefined && Object.hasOwn(progress, playerId) ? progress[playerId] : UNTOUCHED;
}

/** Ключ слова ведучого; схема гарантує, що він є. */
function targetKey(play: WordlePlay): string {
  return wordleKey(play.question.word) ?? play.question.word;
}

function wordleRecord(guesses: string[], solved: boolean, points: number, timeMs: number): AnswerRecord {
  return {
    answer: { type: 'wordle', guesses, tries: guesses.length, solved },
    timeMs,
    accepted: solved,
    accuracy: solved ? 1 : 0,
    grade: solved ? 'correct' : 'wrong',
    basePoints: points,
    streakBonus: 0,
    points,
    overridden: false,
  };
}

/**
 * Спроба гравця (команди). Перевірки — як у ходу драбини, далі wordle_word / wordle_length / wordle_unknown / wordle_repeat;
 * хибна спроба стану не змінює й спробою не рахується. Слово шукається в словнику як є й з апострофом (wordleCandidates);
 * слово ведучого зараховується завжди. Вгадав зі спроби N — запис correct і wordlePoints(ціна × множник, N);
 * шоста невдала — запис wrong, 0. Швидкості, серії й мінуса немає.
 */
export function wordleGuess(state: GameState, playerId: string, word: string, now: number, isNoun: (key: string) => boolean): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  const skipped = betsRefusal(state, playerId);
  if (skipped !== null) return fail(skipped);
  const play = wordlePlay(state);
  if (play === null) return fail('type_mismatch');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');

  const typed = wordleKey(word);
  if (typed === null) return fail('wordle_word');
  const letters = wordleLetters(typed);
  const target = targetKey(play);
  if (letters.length !== wordleLetters(target).length) return fail('wordle_length');
  const key = wordleCandidates(letters).find((candidate) => candidate === target || isNoun(candidate));
  if (key === undefined) return fail('wordle_unknown');
  const { guesses: before } = wordleOf(state, playerId);
  if (before.includes(key)) return fail('wordle_repeat');

  const guesses = [...before, key];
  const advanced = withPlay(state, { ...play, wordle: { ...play.wordle, [playerId]: { guesses } } });
  const solved = key === target;
  if (!solved && guesses.length < LIMITS.wordleTries) return ok(advanced);

  const price = play.question.points * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier;
  const points = solved ? wordlePoints(price, guesses.length) : 0;
  const record = wordleRecord(guesses, solved, points, Math.max(0, now - state.startedAt));
  const current = advanced.plays[advanced.questionIndex];
  return ok(autoLock(withPlay(advanced, { ...current, answers: { ...current.answers, [playerId]: record } }), now));
}

/** На етапі question: запис wrong з 0 кожному, хто має спроби без запису; хто не пробував — без запису. Інакше той самий стан. */
export function scoreWordle(state: GameState): GameState {
  const play = wordlePlay(state);
  if (state.phase !== 'question' || play === null) return state;
  const limitMs = limitMsOf(play) ?? 0;
  const answers = { ...play.answers };
  let changed = false;
  for (const [playerId, progress] of Object.entries(play.wordle ?? {})) {
    if (Object.hasOwn(answers, playerId)) continue;
    answers[playerId] = wordleRecord(progress.guesses, false, 0, limitMs);
    changed = true;
  }
  return changed ? withPlay(state, { ...play, answers }) : state;
}

/** Етапи, на яких зрізи несуть сітки: лише саме запитання wordle. */
const SHOWN_PHASES: readonly GameState['phase'][] = ['question', 'locked', 'reveal'];

/** Відкрите (question, locked, reveal) поточне запитання wordle; інакше null. */
function shownWordle(state: GameState): WordlePlay | null {
  return SHOWN_PHASES.includes(state.phase) ? wordlePlay(state) : null;
}

/** Літери й кольори кожної прийнятої спроби (у стані — лише ключі). */
function wordleRows(play: WordlePlay, guesses: readonly string[]): { letters: string[]; marks: WordleMark[] }[] {
  const target = wordleLetters(targetKey(play));
  return guesses.map((key) => {
    const letters = wordleLetters(key);
    return { letters, marks: wordleMarks(letters, target) };
  });
}

function solvedBy(state: GameState, playerId: string): boolean {
  const answer = recordOf(state, state.questionIndex, playerId)?.answer;
  return answer?.type === 'wordle' && answer.solved;
}

/**
 * Сітки всіх гравців (команд) у порядку state.players. Сцена й телефони (forHost false) до reveal бачать лише кольори:
 * ні слова, ні літер спроб; на reveal — слово, літери й бали. Пульт бачить слово й літери з відкриття.
 */
export function wordleInfo(state: GameState, forHost: boolean): WordleInfo | undefined {
  const play = shownWordle(state);
  if (play === null) return undefined;
  const revealed = state.phase === 'reveal';
  const open = forHost || revealed;
  return {
    letters: wordleLetters(targetKey(play)).length,
    tries: LIMITS.wordleTries,
    word: open ? play.question.word : null,
    rows: state.players.map((player) => {
      const rows = wordleRows(play, wordleOf(state, player.id).guesses);
      const record = recordOf(state, state.questionIndex, player.id);
      return {
        playerId: player.id,
        nickname: player.nickname,
        marks: rows.map((row) => row.marks),
        guesses: open ? rows.map((row) => row.letters) : null,
        solved: solvedBy(state, player.id),
        tries: rows.length,
        points: revealed && record !== undefined ? record.points : null,
      };
    }),
  };
}

/** Власна сітка гравця (команди): літери й кольори своїх спроб; слово — лише на reveal. Поза запитанням wordle — undefined. */
export function playerWordle(state: GameState, playerId: string): PlayerWordle | undefined {
  const play = shownWordle(state);
  if (play === null) return undefined;
  const record = recordOf(state, state.questionIndex, playerId);
  return {
    letters: wordleLetters(targetKey(play)).length,
    tries: LIMITS.wordleTries,
    rows: wordleRows(play, wordleOf(state, playerId).guesses),
    solved: solvedBy(state, playerId),
    canGuess: state.phase === 'question' && !state.paused && record === undefined,
    word: state.phase === 'reveal' ? play.question.word : null,
  };
}
