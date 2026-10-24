import { LIMITS, type Question } from '@quiz/shared';
import { textMatches } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  fail,
  lockNow,
  ok,
  shuffle,
  withCurrentPlay,
  type BluffOption,
  type BluffPlay,
  type GameState,
  type Play,
  type Result,
  type Rng,
} from './game';
import { normalizeText } from './normalize';
import { presentPlayers } from './present';
import { notStarted } from './splash';
import { closesAt, timeOver } from './timing';

type BluffQuestion = Extract<Question, { type: 'bluff' }>;

/** mulberry32: детермінований генератор з 32-бітного зерна. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Поточне запитання-блеф з його грою; null поза ним. */
export function bluffPlayOf(state: GameState): (Play & { bluff: BluffPlay; question: BluffQuestion }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.bluff === undefined || play.question.type !== 'bluff') return null;
  return play as Play & { bluff: BluffPlay; question: BluffQuestion };
}

/**
 * Вигадка гравця (фаза lies): обрізано, пробіли зведено; збіг з правдою (textMatches(accepted)) — bluff_truth.
 * Помилки: wrong_phase, paused, not_started, not_found, time_over, type_mismatch (порожньо), already_answered.
 * Усі присутні написали — одразу фаза вибору від now.
 */
export function writeLie(state: GameState, playerId: string, text: string, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  const play = bluffPlayOf(state);
  if (play === null || play.bluff.stage !== 'lies') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  // Одна вигадка на гравця: змінити не можна.
  if (Object.hasOwn(play.bluff.lies, playerId)) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  const value = text.trim().replace(/\s+/g, ' ');
  if (normalizeText(value) === '') return fail('type_mismatch');
  // Збіг з чужою вигадкою не повідомляється (видав би її): однакові вигадки зводяться на старті вибору.
  if (textMatches(play.question.accepted, value)) return fail('bluff_truth');
  const written = withCurrentPlay(state, { ...play, bluff: { ...play.bluff, lies: { ...play.bluff.lies, [playerId]: { text: value, at: now } } } });
  return ok(bluffAuto(written, now));
}

/**
 * Фаза вибору: варіанти (зведені за answerKey вигадки + правда accepted[0] + запасні до LIMITS.bluffOptions,
 * вибір запасних і порядок — seededRng(seed)), id b1…bN, таймер choiceTime від now, extraMs = 0.
 * Поза фазою lies — стан без змін.
 */
export function startChoice(state: GameState, now: number): GameState {
  const play = bluffPlayOf(state);
  if (play === null || play.bluff.stage !== 'lies') return state;
  const { question } = play;
  const rng = seededRng(play.bluff.seed);
  const rank = (id: string) => {
    const index = state.players.findIndex((p) => p.id === id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  // Найраніша вигадка дає варіанту текст (за рівності — порядок гравців); автори — у порядку гравців.
  const written = Object.entries(play.bluff.lies).sort(([a, x], [b, y]) => x.at - y.at || rank(a) - rank(b));
  const groups = new Map<string, { text: string; authors: string[] }>();
  for (const [playerId, lie] of written) {
    const key = normalizeText(lie.text);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { text: lie.text, authors: [playerId] });
    else group.authors.push(playerId);
  }
  type Draft = Omit<BluffOption, 'id' | 'removed'>;
  const lies: Draft[] = [...groups.values()].map((g) => ({ text: g.text, kind: 'lie', authors: [...g.authors].sort((a, b) => rank(a) - rank(b)) }));
  const truth: Draft = { text: question.accepted[0], kind: 'truth', authors: [] };
  // Запасна, що збігається з вигадкою гравця, уже є варіантом.
  const need = Math.max(0, LIMITS.bluffOptions - (groups.size + 1));
  const candidates = question.lies.filter((spare) => !groups.has(normalizeText(spare)));
  const spares: Draft[] = shuffle(candidates, rng)
    .slice(0, need)
    .map((text) => ({ text, kind: 'spare', authors: [] }));
  const options: BluffOption[] = shuffle([...lies, truth, ...spares], rng).map((o, index) => ({ id: `b${index + 1}`, ...o, removed: false }));
  // Зміни ведучого «±15 с» фази вигадок у вибір не переходять.
  const choice = withCurrentPlay(state, { ...play, extraMs: 0, bluff: { ...play.bluff, stage: 'choice', options } });
  const choiceMs = question.choiceTime * 1000;
  if (state.paused) return { ...choice, remainingMs: choiceMs, startedAt: null, endsAt: null };
  // Посеред заставки запитання вибір стартує після неї.
  const from = Math.max(now, state.startedAt ?? now);
  return { ...choice, startedAt: from, endsAt: from + choiceMs, remainingMs: null };
}

/** autoLock для блефу: lies — час сплив або всі присутні написали (лише з now) → startChoice; choice — час сплив або всі присутні вибрали → lockNow. */
export function bluffAuto(state: GameState, now: number | null): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  const play = bluffPlayOf(state);
  if (play === null) return state;
  const present = presentPlayers(state);
  // Строго «>», як у timeOver: рівно на кінці ще можна.
  const closes = closesAt(state);
  const expired = now !== null && closes !== null && state.heldAt === null && now > closes;
  if (play.bluff.stage === 'lies') {
    // Без now (вилучення гравця) фаза не перемикається: її перемкне tick за дедлайном або ведучий.
    if (now === null) return state;
    const everyoneWrote = present.length > 0 && present.every((p) => Object.hasOwn(play.bluff.lies, p.id));
    return expired || everyoneWrote ? startChoice(state, now) : state;
  }
  if (expired) return lockNow(state);
  if (present.length === 0) return state;
  return present.every((p) => Object.hasOwn(play.bluff.picks, p.id)) ? lockNow(state) : state;
}
