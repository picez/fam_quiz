import { LIMITS, rulesOf, type BluffAnswer, type Question } from '@quiz/shared';
import { textMatches } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  autoLock,
  fail,
  lockNow,
  ok,
  shuffle,
  withCurrentPlay,
  withRecord,
  type AnswerRecord,
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
import { closesAt, limitMsOf, timeOver } from './timing';

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
  // Зміни ведучого «±15 с» і особистий додатковий час фази вигадок у вибір не переходять.
  const { overtime: _overtime, ...kept } = play;
  const choice = withCurrentPlay(state, { ...kept, extraMs: 0, bluff: { ...play.bluff, stage: 'choice', options } });
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

/**
 * Вибір варіанта (фаза choice). Помилки: wrong_phase, paused, not_started, not_found (гравця чи варіанта немає або його прибрано),
 * already_answered, time_over, bluff_own. Вибирати може й той, хто не писав вигадки. Усі присутні вибрали — lockNow.
 */
export function pickBluff(state: GameState, playerId: string, optionId: string, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  const play = bluffPlayOf(state);
  if (play === null || play.bluff.stage !== 'choice') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  // Один вибір на гравця: змінити не можна.
  if (Object.hasOwn(play.bluff.picks, playerId)) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  const option = play.bluff.options.find((o) => o.id === optionId && !o.removed);
  if (option === undefined) return fail('not_found');
  if (option.authors.includes(playerId)) return fail('bluff_own');
  const pick = { optionId, timeMs: Math.max(0, now - state.startedAt) };
  const picked = withCurrentPlay(state, { ...play, bluff: { ...play.bluff, picks: { ...play.bluff.picks, [playerId]: pick } } });
  return ok(autoLock(picked, now));
}

/** Ведучий прибирає вигадку гравців (фаза choice): removed, вибори на неї знято. not_allowed — правда чи запасна; wrong_phase — інша фаза; not_found. */
export function removeBluffOption(state: GameState, optionId: string): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  const play = bluffPlayOf(state);
  if (play === null || play.bluff.stage !== 'choice') return fail('wrong_phase');
  const option = play.bluff.options.find((o) => o.id === optionId && !o.removed);
  if (option === undefined) return fail('not_found');
  if (option.kind !== 'lie') return fail('not_allowed');
  const options = play.bluff.options.map((o) => (o.id === optionId ? { ...o, removed: true } : o));
  // Хто вибрав прибраний варіант, вибирає знову.
  const picks = Object.fromEntries(Object.entries(play.bluff.picks).filter(([, p]) => p.optionId !== optionId));
  return ok(withCurrentPlay(state, { ...play, bluff: { ...play.bluff, options, picks } }));
}

/**
 * На етапі question у фазі choice: записи всім, хто писав вигадку або вибирав. Правда — ціна; кожен інший гравець, що вибрав
 * неприбраний варіант серед авторів якого гравець, — ціна / 2 (кожному співавторові); усе × множник раунду; бонусу швидкості немає.
 * Мінус (penalty 'minus') — лише тому, хто вибрав не правду й не заробив нічого. Вигадка без авторів (автора вилучено) нікому не платить.
 * Вердикт: correct — вибір правди. У фазі lies і поза блефом — без змін.
 */
export function scoreBluff(state: GameState): GameState {
  if (state.phase !== 'question') return state;
  const play = bluffPlayOf(state);
  if (play === null || play.bluff.stage !== 'choice') return state;
  const { multiplier, penalty } = rulesOf(state.quiz.rounds[play.roundIndex]);
  const price = play.question.points;
  const limitMs = limitMsOf(play) ?? 0;
  const { lies, picks } = play.bluff;
  const live = new Map(play.bluff.options.filter((o) => !o.removed).map((o) => [o.id, o]));
  const pickOf = (playerId: string): BluffOption | undefined => (Object.hasOwn(picks, playerId) ? live.get(picks[playerId].optionId) : undefined);
  let scored = state;
  for (const player of state.players) {
    const lie = Object.hasOwn(lies, player.id) ? lies[player.id] : undefined;
    const option = pickOf(player.id);
    // Хто не писав і не вибирав — мовчання, без запису.
    if ((lie === undefined && option === undefined) || Object.hasOwn(play.answers, player.id)) continue;
    const truth = option?.kind === 'truth';
    // Кожен гравець вибирає раз, тож рахується раз.
    const fooled = state.players.filter((other) => other.id !== player.id && (pickOf(other.id)?.authors.includes(player.id) ?? false)).length;
    const raw = (truth ? price : 0) + (fooled * price) / 2;
    // 14a: мінус лише за відповідь (вибір), що дала 0 балів; хто лише писав вигадку, без мінуса.
    const minus = penalty === 'minus' && option !== undefined && !truth && raw === 0;
    const basePoints = minus ? -Math.round(price * multiplier) : Math.round(raw * multiplier);
    const answer: BluffAnswer = { type: 'bluff', lie: lie?.text ?? null, pick: option?.text ?? null, truth, fooled };
    const record: AnswerRecord = {
      answer,
      timeMs: option === undefined ? limitMs : picks[player.id].timeMs,
      accepted: truth,
      accuracy: truth ? 1 : 0,
      grade: truth ? 'correct' : 'wrong',
      basePoints,
      streakBonus: 0,
      points: basePoints,
      overridden: false,
    };
    // withRecord застосовує баф: ×2 подвоює додатні бали, щит обнуляє мінус.
    scored = withRecord(scored, player.id, record);
  }
  return scored;
}

/**
 * Порядок розкриття: неприбрані вигадки й запасні за кількістю виборів зростанням (за рівності — порядок показу), правда остання.
 * Вигадка, чийого єдиного автора вилучено (authors: []), лишається вигадкою.
 */
export function bluffOrder(play: Play): BluffOption[] {
  if (play.bluff === undefined) return [];
  const counts = new Map<string, number>();
  for (const pick of Object.values(play.bluff.picks)) counts.set(pick.optionId, (counts.get(pick.optionId) ?? 0) + 1);
  const live = play.bluff.options.filter((o) => !o.removed);
  // sort стабільний: за рівності лишається порядок показу.
  const fakes = live.filter((o) => o.kind !== 'truth').sort((a, b) => (counts.get(a.id) ?? 0) - (counts.get(b.id) ?? 0));
  return [...fakes, ...live.filter((o) => o.kind === 'truth')];
}

/** Ще один варіант на розкритті. */
export function stepBluff(state: GameState): GameState {
  const play = bluffPlayOf(state);
  if (play === null) return state;
  return withCurrentPlay(state, { ...play, bluff: { ...play.bluff, shown: Math.min(bluffOrder(play).length, play.bluff.shown + 1) } });
}

/** «Відкрити всі». Помилки: wrong_phase — не reveal або не блеф; paused. */
export function revealBluffAll(state: GameState): Result {
  if (state.paused) return fail('paused');
  const play = bluffPlayOf(state);
  if (state.phase !== 'reveal' || play === null) return fail('wrong_phase');
  return ok(withCurrentPlay(state, { ...play, bluff: { ...play.bluff, shown: bluffOrder(play).length } }));
}

/** Скільки варіантів відкрито: question/locked — 0; reveal — shown; після reveal (leaderboard, round_end, finished) — усі. */
export function bluffShown(state: GameState, play: Play): number {
  if (play.question.type !== 'bluff') return 0;
  const total = bluffOrder(play).length;
  if (play !== state.plays[state.questionIndex]) return total;
  if (state.phase === 'question' || state.phase === 'locked') return 0;
  if (state.phase === 'reveal') return Math.min(total, play.bluff?.shown ?? 0);
  return total;
}
