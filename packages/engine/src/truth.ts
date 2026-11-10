import { isStorable, LIMITS, TRUTH_QUESTION_PREFIX, truthText, type Question, type TruthRound } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { currentRound, fail, ok, shuffle, type AnswerRecord, type GameState, type Play, type Result, type Rng, type TruthPlay } from './game';
import { presentPlayers } from './present';
import { memberOf, teamsOn } from './teams';
import { limitMsOf } from './timing';

// «Правда про гравця» (28b): у лобі кожна людина пише один факт про себе; на старті раунду гра робить з фактів запитання.

/** Поточний раунд, якщо це «Правда про гравця». */
export function truthRoundOf(state: GameState): TruthRound | null {
  const round = currentRound(state);
  return round?.type === 'truth' ? round : null;
}

/** Чи приймаються факти: є state.truth, колоду не роздано, гра не скінчилась і раунд truth ще попереду (не завершений без роздачі). */
export function truthOpen(state: GameState): boolean {
  if (state.truth === undefined || state.truth.deck !== undefined || state.phase === 'finished') return false;
  if (state.phase === 'lobby') return true;
  const index = state.quiz.rounds.findIndex((r) => r.type === 'truth');
  return state.roundIndex < index || (state.roundIndex === index && state.phase !== 'round_end');
}

/** Людина гри: соло — гравець, командна гра — учасник (зокрема без команди). */
function isPerson(state: GameState, personId: string): boolean {
  return teamsOn(state) ? memberOf(state, personId) !== undefined : state.players.some((p) => p.id === personId);
}

/** Факт людини: '' прибирає; новий текст скидає hidden. truth_closed / truth_text / not_found. */
export function submitTruth(state: GameState, personId: string, raw: string, now: number): Result {
  const truth = state.truth;
  if (truth === undefined || !truthOpen(state)) return fail('truth_closed');
  if (!isPerson(state, personId)) return fail('not_found');
  const text = truthText(raw);
  if (text.length > LIMITS.truthText || !isStorable(text)) return fail('truth_text');
  const old = Object.hasOwn(truth.facts, personId) ? truth.facts[personId] : undefined;
  if (text === '') {
    if (old === undefined) return ok(state);
    const { [personId]: _gone, ...facts } = truth.facts;
    return ok({ ...state, truth: { ...truth, facts } });
  }
  if (old?.text === text) return ok(state);
  // Новий текст ведучий ще не бачив: «сховано» знімається, сховати можна знову.
  return ok({ ...state, truth: { ...truth, facts: { ...truth.facts, [personId]: { text, hidden: false, at: now, ...(old === undefined ? {} : { revised: true as const }) } } } });
}

/** Ведучий ховає чи показує факт, поки запитання про нього не відкрилося. truth_closed / not_found. */
export function hideTruth(state: GameState, personId: string, hidden: boolean): Result {
  const truth = state.truth;
  if (truth === undefined || state.phase === 'finished') return fail('truth_closed');
  const fact = Object.hasOwn(truth.facts, personId) ? truth.facts[personId] : undefined;
  if (fact === undefined) return fail('not_found');
  // Запитання про цей факт уже відкрито чи зіграно.
  if (state.plays.some((play) => play.truth?.authorId === personId)) return fail('truth_closed');
  // Після роздачі факт поза колодою (сховано до роздачі, автор без команди) вже не зіграється: «Показати» нічого не дасть.
  if (!inTruthDeck(state, personId)) return fail('truth_closed');
  // Будь-яка дія ведучого з фактом знімає позначку «новий текст».
  if (fact.hidden === hidden && fact.revised === undefined) return ok(state);
  const { revised: _seen, ...rest } = fact;
  return ok({ ...state, truth: { ...truth, facts: { ...truth.facts, [personId]: { ...rest, hidden } } } });
}

/**
 * Вилучені люди до роздачі втрачають факт; після роздачі факт лишається, а автор просто не зіграється (nextQuestion).
 * Внутрішня функція рушія: для removeFromGame, dropMember і withoutTeam.
 */
export function dropTruthFacts<S extends GameState>(state: S, personIds: readonly string[]): S {
  const truth = state.truth;
  if (truth === undefined || truth.deck !== undefined || !personIds.some((id) => Object.hasOwn(truth.facts, id))) return state;
  const facts = Object.fromEntries(Object.entries(truth.facts).filter(([id]) => !personIds.includes(id)));
  return { ...state, truth: { ...truth, facts } };
}

/** Людина ще в грі: соло — серед гравців, командна гра — учасник з командою, що грає. */
function inGame(state: GameState, personId: string): boolean {
  if (!teamsOn(state)) return state.players.some((p) => p.id === personId);
  const teamId = memberOf(state, personId)?.teamId ?? null;
  return teamId !== null && state.players.some((p) => p.id === teamId);
}

/** Колода: id людей із нехованим фактом, що ще в грі, у порядку shuffle(rng). Уже роздано чи раунду немає — стан без змін. */
export function dealTruth(state: GameState, rng: Rng): GameState {
  const truth = state.truth;
  if (truth === undefined || truth.deck !== undefined) return state;
  const authors = Object.entries(truth.facts)
    .filter(([id, fact]) => !fact.hidden && inGame(state, id))
    .map(([id]) => id);
  return { ...state, truth: { ...truth, deck: shuffle(authors, rng) } };
}

/** Згенероване single для deck[k] (id 'truth-k'); null — колоди, факту чи автора вже немає або факт сховано. */
export function truthQuestion(state: GameState, k: number): Question | null {
  const round = truthRoundOf(state);
  const authorId = state.truth?.deck?.[k];
  if (round === null || authorId === undefined || state.truth === undefined) return null;
  const fact = Object.hasOwn(state.truth.facts, authorId) ? state.truth.facts[authorId] : undefined;
  if (fact === undefined || fact.hidden || !inGame(state, authorId)) return null;
  // Варіанти — усі люди гри на цю мить, за нікнеймом; порядок не перемішується (shuffles).
  const people = teamsOn(state)
    ? state.teams.members.filter((m) => m.teamId !== null && state.players.some((p) => p.id === m.teamId))
    : state.players;
  const options = [...people].sort((a, b) => a.nickname.localeCompare(b.nickname)).map((p) => ({ id: p.id, text: p.nickname }));
  return {
    id: `${TRUTH_QUESTION_PREFIX}${k}`,
    type: 'single',
    text: fact.text,
    options,
    correctId: authorId,
    points: round.points,
    timeLimit: round.timeLimit,
    imageUrl: null,
    video: null,
  };
}

/** Наступне запитання раунду: перше deck[k], ще не зігране, з фактом і автором у грі; undefined — колоду вичерпано чи не роздано. */
export function nextTruthQuestion(state: GameState): Question | undefined {
  const deck = state.truth?.deck ?? [];
  const played = new Set(state.plays.filter((p) => p.roundIndex === state.roundIndex).map((p) => p.question.id));
  for (let k = 0; k < deck.length; k++) {
    if (played.has(`${TRUTH_QUESTION_PREFIX}${k}`)) continue;
    const question = truthQuestion(state, k);
    if (question !== null) return question;
  }
  return undefined;
}

/**
 * Скільки запитань дає раунд truth: до роздачі — нехованих фактів (після старту — лише людей, що грають);
 * після роздачі — зіграні запитання + ще не зіграні записи колоди, що досі зіграються (truthQuestion не null).
 */
export function truthCount(state: GameState): number {
  const truth = state.truth;
  if (truth === undefined) return 0;
  if (truth.deck === undefined) {
    return Object.entries(truth.facts).filter(([id, fact]) => !fact.hidden && (state.phase === 'lobby' || inGame(state, id))).length;
  }
  const played = new Set(state.plays.filter((p) => p.truth !== undefined).map((p) => p.question.id));
  return played.size + truth.deck.filter((_, k) => !played.has(`${TRUTH_QUESTION_PREFIX}${k}`) && truthQuestion(state, k) !== null).length;
}

/** Колоду роздано, а запитань з неї немає й не буде: раунд пропущено. */
export function truthSkipped(state: GameState): boolean {
  return state.truth?.deck !== undefined && truthCount(state) === 0;
}

/** Факт іде в колоду: до роздачі — будь-який, після — лише той, чий автор у колоді. */
export function inTruthDeck(state: GameState, personId: string): boolean {
  const deck = state.truth?.deck;
  return deck === undefined || deck.includes(personId);
}

/** play.truth для запитання, що відкривається: автор, його учасник рушія, присутні вгадувачі без нього. */
export function truthPlayFor(state: GameState, question: Question): TruthPlay {
  const authorId = question.type === 'single' ? question.correctId : '';
  const actorId = teamsOn(state) ? (memberOf(state, authorId)?.teamId ?? authorId) : authorId;
  return { authorId, actorId, guessers: presentPlayers(state).map((p) => p.id).filter((id) => id !== actorId) };
}

/** Поточний запис раунду truth; null — поза ним. */
export function truthPlayOf(state: GameState): (Play & { truth: TruthPlay }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.truth === undefined || play.roundIndex !== state.roundIndex) return null;
  return { ...play, truth: play.truth };
}

/** Хто вгадує запитання (типово поточне): guessers ∪ хто відповів, без вилучених і без actorId, у порядку гравців. */
export function truthGuessers(state: GameState, play: Play | undefined = state.plays[state.questionIndex]): string[] {
  const truth = play?.truth;
  if (play === undefined || truth === undefined) return [];
  const ids = new Set([...truth.guessers, ...Object.keys(play.answers)]);
  return state.players.map((p) => p.id).filter((id) => id !== truth.actorId && ids.has(id));
}

/**
 * Записи авторів закритих запитань truth. На першому розрахунку після закриття заморожуються guessers (truthGuessers на закритті)
 * і right (хто з них вгадав): вилучення після закриття частки не міняє. Оцінка ведучим присутнього вгадувача оновлює right.
 * Частка — round(ціна × не вгадали / вгадували); вгадувати нікому — 0; автора (actorId) вже немає — запису немає.
 * Внутрішня функція рушія: для withTotals.
 */
export function withTruthPoints(state: GameState): GameState {
  if (state.truth === undefined || !state.plays.some((p) => p.truth !== undefined)) return state;
  const closedCount = state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
  const plays = state.plays.map((play, index) => {
    const truth = play.truth;
    if (truth === undefined || index >= closedCount) return play;
    const correct = (id: string) => Object.hasOwn(play.answers, id) && play.answers[id].grade === 'correct';
    const frozen = truth.right !== undefined;
    const guessers = frozen ? truth.guessers : truthGuessers(state, play);
    const present = new Set(state.players.map((p) => p.id));
    // Присутні — за записом (оцінка ведучого), вилучені — як було на закритті.
    const right = guessers.filter((id) => (present.has(id) ? correct(id) : (truth.right ?? []).includes(id)));
    const closed: Play = { ...play, truth: { ...truth, guessers, right } };
    if (!present.has(truth.actorId)) return closed;
    const points = play.question.points;
    const total = guessers.length;
    const share = total === 0 ? 0 : Math.round((points * (total - right.length)) / total);
    const record: AnswerRecord = {
      answer: null,
      timeMs: limitMsOf(play) ?? 0,
      accepted: share > 0,
      accuracy: points === 0 ? 0 : share / points,
      grade: share === points && share > 0 ? 'correct' : share > 0 ? 'partial' : 'wrong',
      basePoints: share,
      streakBonus: 0,
      points: share,
      overridden: false,
    };
    return { ...closed, answers: { ...play.answers, [truth.actorId]: record } };
  });
  return { ...state, plays };
}
