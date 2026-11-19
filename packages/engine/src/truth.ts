import {
  isStorable,
  isTruthFake,
  LIMITS,
  TRUTH_FAKE_OPTION,
  TRUTH_FAKE_PREFIX,
  TRUTH_FAKE_TEXT,
  TRUTH_QUESTION_PREFIX,
  truthText,
  type Phase,
  type Question,
  type TruthRound,
} from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { currentRound, fail, ok, shuffle, type AnswerRecord, type GameState, type Play, type Result, type Rng, type TruthFake, type TruthPlay } from './game';
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

/**
 * Вигадка ведучого в лобі (52): id null і текст — додати; id і текст — змінити (позначка preset знімається); id і '' — прибрати.
 * Порожнє додавання, той самий текст і прибирання неіснуючої — без змін. truth_closed / not_allowed (гра без ведучого:
 * події ведучого там шлють гравці) / truth_text / truth_fakes_full / not_found (зміна неіснуючої).
 */
export function setTruthFake(state: GameState, id: string | null, raw: string): Result {
  const truth = state.truth;
  if (truth === undefined || !truthOpen(state)) return fail('truth_closed');
  if (state.autopilot !== undefined) return fail('not_allowed');
  const text = truthText(raw);
  if (text.length > LIMITS.truthText || !isStorable(text)) return fail('truth_text');
  const fakes = truth.fakes ?? [];
  const withFakes = (list: TruthFake[]): GameState => {
    const { fakes: _old, ...rest } = truth;
    return { ...state, truth: list.length === 0 ? rest : { ...rest, fakes: list } };
  };
  if (id === null) {
    if (text === '') return ok(state);
    if (fakes.length >= LIMITS.truthFakes) return fail('truth_fakes_full');
    const top = fakes.reduce((max, f) => Math.max(max, Number(f.id.slice(TRUTH_FAKE_PREFIX.length)) || 0), 0);
    return ok(withFakes([...fakes, { id: `${TRUTH_FAKE_PREFIX}${top + 1}`, text }]));
  }
  const old = fakes.find((f) => f.id === id);
  if (text === '') return old === undefined ? ok(state) : ok(withFakes(fakes.filter((f) => f.id !== id)));
  if (old === undefined) return fail('not_found');
  if (old.text === text) return ok(state);
  return ok(withFakes(fakes.map((f) => (f.id === id ? { id, text } : f))));
}

/** У колоді є вигадки ведучого (52): тоді в кожному запитанні раунду є варіант «Вигадка». */
export function truthFaked(state: GameState): boolean {
  return state.truth?.deck?.some(isTruthFake) === true;
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

/**
 * Колода: id людей із нехованим фактом, що ще в грі, і вигадки ведучого (52) — перші за списком, не більше, ніж справжніх фактів, —
 * у порядку shuffle(rng). Жодного справжнього — колода порожня (вигадки не грають). Уже роздано чи раунду немає — стан без змін.
 */
export function dealTruth(state: GameState, rng: Rng): GameState {
  const truth = state.truth;
  if (truth === undefined || truth.deck !== undefined) return state;
  const authors = Object.entries(truth.facts)
    .filter(([id, fact]) => !fact.hidden && inGame(state, id))
    .map(([id]) => id);
  const fakes = (truth.fakes ?? []).slice(0, authors.length).map((f) => f.id);
  // Без вигадок виклик той самий, що до 52: колода з тим самим rng не міняється.
  return { ...state, truth: { ...truth, deck: shuffle(fakes.length === 0 ? authors : [...authors, ...fakes], rng) } };
}

/**
 * Згенероване single для deck[k] (id 'truth-k'); null — колоди, факту чи автора вже немає або факт сховано.
 * Запис fake-N — вигадка ведучого (52; немає в state.truth.fakes — null). У раунді з вигадками варіант «Вигадка» — останній у кожному запитанні.
 */
export function truthQuestion(state: GameState, k: number): Question | null {
  const round = truthRoundOf(state);
  const authorId = state.truth?.deck?.[k];
  if (round === null || authorId === undefined || state.truth === undefined) return null;
  const fake = isTruthFake(authorId);
  const text = fake ? truthFakeText(state, authorId) : truthFactText(state, authorId);
  if (text === null) return null;
  // Варіанти — усі люди гри на цю мить, за нікнеймом; порядок не перемішується (shuffles).
  const people = teamsOn(state)
    ? state.teams.members.filter((m) => m.teamId !== null && state.players.some((p) => p.id === m.teamId))
    : state.players;
  const options = [...people].sort((a, b) => a.nickname.localeCompare(b.nickname)).map((p) => ({ id: p.id, text: p.nickname }));
  if (truthFaked(state)) options.push({ id: TRUTH_FAKE_OPTION, text: TRUTH_FAKE_TEXT });
  return {
    id: `${TRUTH_QUESTION_PREFIX}${k}`,
    type: 'single',
    text,
    options,
    correctId: fake ? TRUTH_FAKE_OPTION : authorId,
    points: round.points,
    timeLimit: round.timeLimit,
    imageUrl: null,
    video: null,
  };
}

/** Текст вигадки ведучого; null — її вже немає. */
function truthFakeText(state: GameState, fakeId: string): string | null {
  return (state.truth?.fakes ?? []).find((f) => f.id === fakeId)?.text ?? null;
}

/** Текст нехованого факту людини, що ще в грі; інакше null. */
function truthFactText(state: GameState, personId: string): string | null {
  const facts = state.truth?.facts ?? {};
  const fact = Object.hasOwn(facts, personId) ? facts[personId] : undefined;
  return fact === undefined || fact.hidden || !inGame(state, personId) ? null : fact.text;
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

/** Етапи раунду, на яких підсумок truth може бути ще попереду. */
const HELD_PHASES: readonly Phase[] = ['intro', 'question', 'locked', 'reveal', 'leaderboard', 'duel'];

/**
 * Підсумок раунду truth ще попереду: раунд іде, у ньому вже є запитання, а колоду не вичерпано (чи останнє ще відкрите).
 * Тоді сцена й телефони не бачать автора, правильності й балів раунду — інакше під кінець автори вгадувались би методом виключення.
 * Розкриття останнього запитання (і все після нього) — уже підсумок.
 */
export function truthHeld(state: GameState): boolean {
  if (truthRoundOf(state) === null || !HELD_PHASES.includes(state.phase)) return false;
  if (!state.plays.some((p) => p.truth !== undefined && p.roundIndex === state.roundIndex)) return false;
  const exhausted = state.truth?.deck !== undefined && nextTruthQuestion(state) === undefined;
  return !exhausted || state.phase === 'question' || state.phase === 'locked';
}

/** Нехованих справжніх фактів до роздачі (у лобі — усіх, після старту — лише людей, що грають); вигадки ведучого (52) не рахуються. */
export function truthRealCount(state: GameState): number {
  const truth = state.truth;
  if (truth === undefined) return 0;
  return Object.entries(truth.facts).filter(([id, fact]) => !fact.hidden && (state.phase === 'lobby' || inGame(state, id))).length;
}

/**
 * Скільки запитань дає раунд truth: до роздачі — нехованих фактів (після старту — лише людей, що грають), а поза лобі ще й вигадок,
 * що зіграються (52: не більше, ніж фактів, — як у dealTruth; заставка раунду й «Факт 1 з N» кажуть те саме; «Фактів: N» у лобі — лише справжні);
 * після роздачі — зіграні запитання + ще не зіграні записи колоди, що досі зіграються (truthQuestion не null).
 */
export function truthCount(state: GameState): number {
  const truth = state.truth;
  if (truth === undefined) return 0;
  if (truth.deck === undefined) {
    const real = truthRealCount(state);
    return state.phase === 'lobby' ? real : real + Math.min((truth.fakes ?? []).length, real);
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

/**
 * play.truth для запитання, що відкривається: автор, його учасник рушія, присутні вгадувачі без нього.
 * Вигадка (52; запис колоди за номером з question.id): автор і учасник — fake-N, вгадують усі присутні.
 */
export function truthPlayFor(state: GameState, question: Question): TruthPlay {
  const entry = state.truth?.deck?.[Number(question.id.slice(TRUTH_QUESTION_PREFIX.length))];
  if (entry !== undefined && isTruthFake(entry)) return { authorId: entry, actorId: entry, guessers: presentPlayers(state).map((p) => p.id), fake: true };
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
