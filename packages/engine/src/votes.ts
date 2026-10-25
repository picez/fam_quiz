import { cloudKey, cloudWords, type Answer } from '@quiz/shared';
import { withPlay } from './blitz';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, ok, recordOf, withRecord, type AnswerRecord, type GameState, type Play, type Result } from './game';
import { voterList } from './team-act';
import { timeOverFor } from './timing';

/**
 * Голос у запитанні без балів (опитування, «хмара слів»): запис з нулями (accepted false, grade 'wrong' — ніде не показується);
 * слова хмари чистить cloudWords. Етап, паузу, заставку й гравця вже перевірив submitAnswer.
 * Помилки: already_answered, time_over, type_mismatch (інший тип відповіді; у хмари не лишилося слів), not_found (варіанта немає).
 */
export function submitVote(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  const { question } = play;
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');
  let vote: Answer;
  if (question.type === 'poll' && answer.type === 'poll') {
    if (!question.options.some((o) => o.id === answer.optionId)) return fail('not_found');
    vote = answer;
  } else if (question.type === 'wordcloud' && answer.type === 'wordcloud') {
    const words = cloudWords(answer.words, question.words);
    if (words.length === 0) return fail('type_mismatch');
    vote = { type: 'wordcloud', words };
  } else return fail('type_mismatch');
  const record: AnswerRecord = {
    answer: vote,
    timeMs: Math.max(0, now - state.startedAt),
    accepted: false,
    accuracy: 0,
    grade: 'wrong',
    basePoints: 0,
    streakBonus: 0,
    points: 0,
    overridden: false,
  };
  return ok(autoLock(withRecord(state, playerId, record), now));
}

/** Слово «хмари» з підрахунком (форма для «100 до 1», 10e). */
export interface CloudEntry {
  /** cloudKey слова. */
  key: string;
  /** Найчастіше написання серед гравців; за рівності — першого за порядком гравців. */
  text: string;
  /** Скільки гравців назвали слово. */
  count: number;
  /** Хто назвав, у порядку гравців. */
  playerIds: string[];
  hidden: boolean;
}

/** Слова гравця в «хмарі»; немає голосу — []. */
function wordsOf(play: Play, playerId: string): string[] {
  const record = Object.hasOwn(play.answers, playerId) ? play.answers[playerId] : undefined;
  return record?.answer?.type === 'wordcloud' ? record.answer.words : [];
}

/**
 * Підрахунок хмари в play (запитання wordcloud): за count спаданням, далі за text (uk). Для інших типів — [].
 * Сховані слова лишаються в переліку з hidden true (для ведучого): публічні споживачі (сцена, дошка 10e) мусять відкидати !hidden.
 */
export function cloudTally(play: Play, players: readonly { id: string }[]): CloudEntry[] {
  if (play.question.type !== 'wordcloud') return [];
  const hidden = new Set(play.cloudHidden ?? []);
  // Гравці йдуть у порядку players (а не Object.keys): порядок playerIds і «перше написання» сталі.
  const found = new Map<string, { playerIds: string[]; spellings: Map<string, number> }>();
  for (const { id } of players) {
    for (const word of wordsOf(play, id)) {
      const key = cloudKey(word);
      const entry = found.get(key) ?? { playerIds: [], spellings: new Map<string, number>() };
      // cloudWords уже відкинув повтори одного гравця, але запис з іншого джерела не має рахуватися двічі.
      if (entry.playerIds.includes(id)) continue;
      entry.playerIds.push(id);
      entry.spellings.set(word, (entry.spellings.get(word) ?? 0) + 1);
      found.set(key, entry);
    }
  }
  const entries: CloudEntry[] = [...found].map(([key, { playerIds, spellings }]) => {
    let text = '';
    let best = 0;
    // Map зберігає порядок додавання: за рівності перемагає написання першого гравця.
    for (const [spelling, count] of spellings) {
      if (count > best) [text, best] = [spelling, count];
    }
    return { key, text, count: playerIds.length, playerIds, hidden: hidden.has(key) };
  });
  return entries.sort((a, b) => b.count - a.count || a.text.localeCompare(b.text, 'uk'));
}

/** Скільки гравців (ще в грі, як і в cloudTally) написали хоч одне слово. */
export function cloudVoters(play: Play, players: readonly { id: string }[]): number {
  return players.filter(({ id }) => wordsOf(play, id).length > 0).length;
}

/**
 * Ведучий ховає (hidden true) або повертає слово хмари поточного запитання.
 * Помилки: wrong_phase — не question/locked/reveal або поточне не wordcloud; not_found — такого ключа в хмарі немає.
 */
export function hideCloudWord(state: GameState, key: string, hidden: boolean): Result {
  if (state.phase !== 'question' && state.phase !== 'locked' && state.phase !== 'reveal') return fail('wrong_phase');
  const play = state.plays[state.questionIndex];
  if (play?.question.type !== 'wordcloud') return fail('wrong_phase');
  const wanted = cloudKey(key);
  if (!cloudTally(play, voterList(state)).some((e) => e.key === wanted)) return fail('not_found');
  const rest = (play.cloudHidden ?? []).filter((k) => k !== wanted);
  return ok(withPlay(state, { ...play, cloudHidden: hidden ? [...rest, wanted] : rest }));
}
