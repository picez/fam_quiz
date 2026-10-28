import type { Answer } from './answer';
import type { BuffKind } from './game';
import { answerWindowMs, type Question, type Round } from './quiz';

/** Пороги цікавинок (12d). */
export const FACT_LIMITS = {
  /** «Снайпер»: щонайменше відповідей у межах (раунд чи гра). */
  sniperAnswers: 3,
  /** «Серія»: найкоротша серія, що варта картки. */
  streak: 3,
  /** «Довірлива душа»: щонайменше виборів вигадки. */
  gullible: 2,
  /** «Самотній геній»: щонайменше поданих відповідей на запитання. */
  geniusAnswers: 4,
  /** «Найважче запитання»: щонайменше поданих відповідей. */
  hardestAnswers: 2,
  /** «Залізні нерви»: правильна відповідь в останні стільки мс. */
  nervesMs: 3000,
  /** Карток після раунду й нагород наприкінці. */
  roundCards: 3,
  awards: 6,
} as const;

/** Карусель «Нагороди гри» на сцені (12d): п'єдестал в автопілоті перед першою нагородою й кожен слайд, мс. */
export const AWARDS_MS = { podium: 10_000, slide: 4000 } as const;

/** Види цікавинок (12d). */
export const FACT_KINDS = ['lightning', 'sniper', 'streak', 'comeback', 'bluffer', 'nerves', 'risk', 'gullible', 'genius', 'hardest'] as const;
export type FactKind = (typeof FACT_KINDS)[number];
/** Порядок карток після раунду — як таблиця специфікації 12d. */
export const ROUND_FACT_ORDER: readonly FactKind[] = ['lightning', 'sniper', 'streak', 'bluffer', 'gullible', 'genius', 'hardest'];
/** Порядок нагород гри (рішення плану 12d). */
export const AWARD_ORDER: readonly FactKind[] = ['lightning', 'sniper', 'streak', 'comeback', 'bluffer', 'nerves', 'risk', 'gullible', 'genius', 'hardest'];

/** Зігране запитання (12d): index — індекс у plays і answer.question_index. */
export interface FactQuestion {
  index: number;
  roundIndex: number;
  /** Номер у раунді з 1. */
  number: number;
  text: string;
  /** Межа часу відповіді, мс (factLimitMs); null — час не справжній (відео, драбина без таймера, усна клітинка). */
  limitMs: number | null;
  /** З балами (не опитування й не хмара). */
  scored: boolean;
  /** Клітинка поля: відповідає той, хто вибрав; відповіді на запасне теж рахуються. */
  board: boolean;
  /** Бліц (раунд чи бліц-клітинка). */
  blitz: boolean;
  bluff: boolean;
  final: boolean;
}

/** Рядок «учасник × спроба» (12d): як рядок answer без штрафів і голосів. */
export interface FactRow {
  playerId: string;
  questionIndex: number;
  roundIndex: number;
  /** Номер спроби з 0 (бліц — кілька). */
  attempt: number;
  timeMs: number;
  accepted: boolean;
  buff: BuffKind | null;
  /** Відповідь на запасне запитання. */
  spare: boolean;
  /** Ставка фіналу; null поза фіналом. */
  wager: number | null;
  /** Блеф (bluffFact); null поза блефом. */
  bluff: { pick: boolean; truth: boolean; fooled: number } | null;
}

/** Усе, з чого рахуються цікавинки (12d). */
export interface FactInput {
  /** Учасники в порядку таблиці; rank null — місць ще немає (історія незавершеної гри). */
  players: { id: string; nickname: string; rank: number | null; score: number; rounds: number[] }[];
  /** Зіграні (закриті) запитання в порядку журналу; запитання, якого немає (зіпсований знімок), просто відсутнє. */
  questions: FactQuestion[];
  rows: FactRow[];
  /** Куплені дебафи: хто купив і на кого (null — ціль вилучено). */
  debuffs: { by: string; target: string | null }[];
  /** Позначки «відволікався» (12e): учасник рушія × запитання. */
  away: { playerId: string; questionIndex: number }[];
}

/** Запитання в картці: раунд, номер у раунді, текст. */
export interface FactQuestionRef {
  roundIndex: number;
  number: number;
  text: string;
}

/** Картка цікавинки: після раунду чи нагорода гри (12d). Нічия — усі імена в порядку таблиці, числа — першого. */
export type FactCard =
  | { kind: 'lightning'; names: string[]; timeMs: number; question: FactQuestionRef }
  | { kind: 'sniper'; names: string[]; correct: number; answered: number }
  | { kind: 'streak'; names: string[]; length: number }
  | { kind: 'comeback'; names: string[]; from: number; to: number }
  | { kind: 'bluffer'; names: string[]; fooled: number }
  | { kind: 'nerves'; names: string[]; count: number }
  | { kind: 'risk'; names: string[]; wager: number | null; buffs: number | null }
  | { kind: 'gullible'; names: string[]; picks: number }
  | { kind: 'genius'; names: string[]; count: number; question: FactQuestionRef | null }
  | { kind: 'hardest'; question: FactQuestionRef; accepted: number; answered: number };

/** Рядок під правильною відповіддю (12d). */
export interface RevealFacts {
  accepted: number;
  answered: number;
  /** Найшвидша правильна відповідь; null — немає правильної з часом. */
  fastest: { names: string[]; timeMs: number } | null;
  /** Блеф: вигадка з найбільшою кількістю голосів (≥ 1) — її автори; null — не блеф або ніхто не повівся. */
  bluff: { names: string[]; votes: number } | null;
}

/** Рядок розкриття на телефоні: місце своєї правильної відповіді за швидкістю або частка правильних. */
export type OwnRevealFact = { kind: 'fastest'; place: number } | { kind: 'share'; percent: number };

/** «Твій раунд» (12d). */
export interface RoundCard {
  correct: number;
  answered: number;
  avgMs: number | null;
  /** Найшвидша правильна відповідь з часом. */
  fastestMs: number | null;
  /** Серія правильних на кінець раунду. */
  streak: number;
  /** before null — перший раунд; place null — місць немає. */
  place: { before: number | null; now: number } | null;
  /** Скільки разів учасник вибрав вигадку; null — у раунді не було блефу. */
  fooledBy: number | null;
}

/** «Твоя гра» (12d); 12e/12f додадуть «відволікався» й апеляції. */
export interface GameCard {
  /** Бали за раундами (стовпчики). */
  rounds: number[];
  correct: number;
  answered: number;
  bestStreak: number;
  /** Найшвидша правильна відповідь з часом. */
  fastestMs: number | null;
  buffs: number;
  debuffs: { sent: number; got: number };
  /** null — у грі не було блефу. */
  bluff: { fooled: number; fooledBy: number } | null;
  /** На скількох запитаннях учасник відволікався (12e). */
  away: number;
}

/** Рядок таблиці учасників в історії (12d). */
export interface FactTableRow {
  playerId: string;
  nickname: string;
  correct: number;
  answered: number;
  avgMs: number | null;
  bestStreak: number;
}

/** Частка правильних одного запитання раунду (пульт, 12d). */
export interface RoundShare {
  number: number;
  text: string;
  accepted: number;
  answered: number;
}

/** Межа часу відповіді для цікавинок: без «±15 с» ведучого, щоб гра й історія збігалися. */
export function factLimitMs(question: Question, round: Round | undefined, voice: boolean): number | null {
  if (voice || question.video != null) return null;
  if (round?.type === 'ladder' && round.timer === false) return null;
  if (question.type === 'bluff') return question.choiceTime * 1000;
  return answerWindowMs(question);
}

/** Блеф з payload відповіді: pick — вибрав будь-що, truth — правду, fooled — скільки обдурила власна вигадка; не блеф — null. */
export function bluffFact(answer: Answer | null): FactRow['bluff'] {
  if (answer?.type !== 'bluff') return null;
  return { pick: answer.pick !== null, truth: answer.truth, fooled: answer.fooled };
}

/** Відповідь «учасник × запитання»: спроби зведено в одну. */
interface FactAnswer {
  playerId: string;
  questionIndex: number;
  roundIndex: number;
  /** Запитання; undefined — його немає в questions (тоді без часу й поза запитаннями). */
  question: FactQuestion | undefined;
  accepted: boolean;
  timeMs: number;
  buff: BuffKind | null;
  spare: boolean;
  wager: number | null;
  bluff: FactRow['bluff'];
  /** Подана відповідь: блеф без вибору — ні. */
  answered: boolean;
}

/** Серії учасника: поточна на кінець кожного раунду й найкраща. */
interface Streaks {
  end: Map<number, number>;
  best: number;
}

interface Derived {
  /** Відповіді учасників таблиці в порядку запитань, без запитань без балів. */
  answers: FactAnswer[];
  questions: Map<number, FactQuestion>;
  byQuestion: Map<number, FactAnswer[]>;
  byPlayer: Map<string, FactAnswer[]>;
  streaks: Map<string, Streaks>;
  players: Map<string, FactInput['players'][number]>;
}

const cache = new WeakMap<FactInput, Derived>();

/**
 * Відповіді з рядків: accepted — будь-яка спроба прийнята, timeMs — прийнятої (інакше першої), решта — з першого рядка.
 * Рядки учасників, яких немає в таблиці (вилучені), не рахуються: рушій їх уже не має, а історія ще має.
 * Кеш — WeakMap за input: input вважається незмінним, після першого виклику його не змінюють.
 */
function derived(input: FactInput): Derived {
  const hit = cache.get(input);
  if (hit) return hit;
  const questions = new Map(input.questions.map((q) => [q.index, q]));
  const players = new Map(input.players.map((p) => [p.id, p]));
  const groups = new Map<string, FactRow[]>();
  for (const row of input.rows) {
    if (!players.has(row.playerId)) continue;
    const key = `${row.playerId}:${row.questionIndex}`;
    const group = groups.get(key);
    if (group) group.push(row);
    else groups.set(key, [row]);
  }
  const answers: FactAnswer[] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => a.attempt - b.attempt);
    const first = sorted[0]!;
    const question = questions.get(first.questionIndex);
    if (question && !question.scored) continue;
    const hitRow = sorted.find((r) => r.accepted);
    answers.push({
      playerId: first.playerId,
      questionIndex: first.questionIndex,
      roundIndex: first.roundIndex,
      question,
      accepted: hitRow !== undefined,
      timeMs: (hitRow ?? first).timeMs,
      buff: first.buff,
      spare: first.spare,
      wager: first.wager,
      bluff: first.bluff,
      answered: first.bluff === null || first.bluff.pick,
    });
  }
  answers.sort((a, b) => a.questionIndex - b.questionIndex);
  const byQuestion = new Map<number, FactAnswer[]>();
  const byPlayer = new Map<string, FactAnswer[]>();
  const push = <K>(map: Map<K, FactAnswer[]>, key: K, a: FactAnswer) => {
    const list = map.get(key);
    if (list) list.push(a);
    else map.set(key, [a]);
  };
  for (const a of answers) {
    push(byQuestion, a.questionIndex, a);
    push(byPlayer, a.playerId, a);
  }
  const streaks = new Map<string, Streaks>();
  for (const [id, own] of byPlayer) {
    const end = new Map<number, number>();
    let best = 0;
    for (const a of own) {
      if (!a.answered) continue;
      const now = a.accepted ? (end.get(a.roundIndex) ?? 0) + 1 : 0;
      end.set(a.roundIndex, now);
      best = Math.max(best, now);
    }
    streaks.set(id, { end, best });
  }
  const result = { answers, questions, byQuestion, byPlayer, streaks, players };
  cache.set(input, result);
  return result;
}

/** Межа: номер раунду або null — уся гра. */
type Scope = number | null;

const inScope = (a: { roundIndex: number }, scope: Scope) => scope === null || a.roundIndex === scope;
const timed = (a: FactAnswer) => a.question !== undefined && a.question.limitMs !== null;
const ref = (q: FactQuestion): FactQuestionRef => ({ roundIndex: q.roundIndex, number: q.number, text: q.text });

/** Основні відповіді запитання: подані, без запасних (крім поля). */
function mainAnswers(input: FactInput, q: FactQuestion): FactAnswer[] {
  return (derived(input).byQuestion.get(q.index) ?? []).filter((a) => a.answered && (!a.spare || q.board));
}

/** Відповіді в межах: усіх або одного учасника. */
function scopedAnswers(input: FactInput, scope: Scope, playerId?: string): FactAnswer[] {
  const d = derived(input);
  const source = playerId === undefined ? d.answers : (d.byPlayer.get(playerId) ?? []);
  return scope === null ? source : source.filter((a) => a.roundIndex === scope);
}

/** Найбільше значення серед учасників у порядку таблиці (null — не рахується); ids — усі з ним. */
function top(input: FactInput, value: (id: string) => number | null): { names: string[]; ids: string[]; value: number } | null {
  let best: { names: string[]; ids: string[]; value: number } | null = null;
  for (const p of input.players) {
    const v = value(p.id);
    if (v === null) continue;
    if (best === null || v > best.value) best = { names: [p.nickname], ids: [p.id], value: v };
    else if (v === best.value) {
      best.names.push(p.nickname);
      best.ids.push(p.id);
    }
  }
  return best;
}

/** Серія: раунд — на його кінець, гра — найкраща в будь-якому раунді; пропущене запитання серію не обриває. */
function bestStreak(input: FactInput, playerId: string, scope: Scope): number {
  const own = derived(input).streaks.get(playerId);
  if (!own) return 0;
  return scope === null ? own.best : (own.end.get(scope) ?? 0);
}

/** Чи був блеф у межах — лише за запитаннями: рядок блефу без запитання (зіпсований знімок) блефу не додає. */
function hasBluff(input: FactInput, scope: Scope): boolean {
  return input.questions.some((q) => q.bluff && inScope(q, scope));
}

/** Запитання для «Самотнього генія» й «Найважчого»: з балами, без поля й бліцу. */
function plainQuestions(input: FactInput, scope: Scope): FactQuestion[] {
  return input.questions.filter((q) => inScope(q, scope) && q.scored && !q.board && !q.blitz);
}

/** Імена в порядку таблиці. */
function namesOf(input: FactInput, ids: Set<string>): string[] {
  return input.players.filter((p) => ids.has(p.id)).map((p) => p.nickname);
}

/** Найменший час прийнятих відповідей і перелік відповідей з ним. */
function fastestOf(answers: FactAnswer[]): { timeMs: number; with: FactAnswer[] } | null {
  const hits = answers.filter((a) => a.accepted && timed(a));
  if (hits.length === 0) return null;
  const timeMs = Math.min(...hits.map((a) => a.timeMs));
  return { timeMs, with: hits.filter((a) => a.timeMs === timeMs) };
}

type CardFn = (scope: Scope, input: FactInput) => FactCard | null;

/** ⚡ Блискавка: найшвидша правильна відповідь із часом. */
const lightning: CardFn = (scope, input) => {
  const fastest = fastestOf(scopedAnswers(input, scope));
  if (fastest === null) return null;
  const names = namesOf(input, new Set(fastest.with.map((a) => a.playerId)));
  if (names.length === 0) return null;
  const earliest = fastest.with[0]!.question!;
  return { kind: 'lightning', names, timeMs: fastest.timeMs, question: ref(earliest) };
};

/** 🎯 Снайпер: найбільша частка правильних серед тих, хто подав ≥ sniperAnswers; нічия — лише з тими самими числами. */
const sniper: CardFn = (scope, input) => {
  const tally = (id: string) => {
    const own = scopedAnswers(input, scope, id).filter((a) => a.answered);
    return { correct: own.filter((a) => a.accepted).length, answered: own.length };
  };
  let best: { names: string[]; correct: number; answered: number } | null = null;
  for (const p of input.players) {
    const t = tally(p.id);
    if (t.answered < FACT_LIMITS.sniperAnswers || t.correct === 0) continue;
    const cmp = best === null ? 1 : t.correct * best.answered - best.correct * t.answered;
    if (best === null || cmp > 0) best = { names: [p.nickname], ...t };
    else if (t.correct === best.correct && t.answered === best.answered) best.names.push(p.nickname);
  }
  return best && { kind: 'sniper', ...best };
};

/** 🔥 Серія: раунд — на кінець раунду, гра — найкраща в будь-якому раунді. */
const streak: CardFn = (scope, input) => {
  const best = top(input, (id) => bestStreak(input, id, scope));
  return best && best.value >= FACT_LIMITS.streak ? { kind: 'streak', names: best.names, length: best.value } : null;
};

/**
 * Місце за балами раундів 0…count−1, спільне за рівних.
 * Це місце за сумою балів (рівні — спільне місце), а rank гравця — місце таблиці (rankPlayers: рівні бали ділить час).
 * Тож «до» в «Твоєму раунді» й «з» у камбеку — за сумою, «зараз» і «на» — за таблицею; за рівних балів вони можуть різнитися на кілька місць.
 */
function placeAfter(input: FactInput, playerId: string, count: number): number {
  const sum = (rounds: number[]) => rounds.slice(0, count).reduce((s, n) => s + n, 0);
  const mine = sum(derived(input).players.get(playerId)?.rounds ?? []);
  return 1 + input.players.filter((p) => sum(p.rounds) > mine).length;
}

/** 📈 Камбек гри: місце після першого раунду мінус фінальне; ≥ 2 раунди й місця в усіх; нічия — лише з тими самими місцями. */
const comeback: CardFn = (scope, input) => {
  if (scope !== null || input.players.length === 0) return null;
  if (!input.players.every((p) => p.rounds.length >= 2 && p.rank !== null)) return null;
  let best: { names: string[]; from: number; to: number } | null = null;
  for (const p of input.players) {
    const from = placeAfter(input, p.id, 1);
    const to = p.rank!;
    if (from - to <= 0) continue;
    if (best === null || from - to > best.from - best.to) best = { names: [p.nickname], from, to };
    else if (from === best.from && to === best.to) best.names.push(p.nickname);
  }
  return best && { kind: 'comeback', ...best };
};

/** 🎭 Майстер блефу: найбільше обдурених власними вигадками. */
const bluffer: CardFn = (scope, input) => {
  if (!hasBluff(input, scope)) return null;
  const best = top(input, (id) => scopedAnswers(input, scope, id).reduce((s, a) => s + (a.bluff?.fooled ?? 0), 0));
  return best && best.value >= 1 ? { kind: 'bluffer', names: best.names, fooled: best.value } : null;
};

/** 🧊 Залізні нерви (лише гра): правильні в останні nervesMs. */
const nerves: CardFn = (scope, input) => {
  if (scope !== null) return null;
  const late = (a: FactAnswer) => {
    const limit = a.question?.limitMs ?? null;
    return a.accepted && limit !== null && limit > FACT_LIMITS.nervesMs && a.timeMs >= limit - FACT_LIMITS.nervesMs;
  };
  const best = top(input, (id) => scopedAnswers(input, null, id).filter(late).length);
  return best && best.value >= 1 ? { kind: 'nerves', names: best.names, count: best.value } : null;
};

/** 🎲 Ризикант (лише гра): найбільша ставка фіналу, без ставок — найбільше бафів. */
const risk: CardFn = (scope, input) => {
  if (scope !== null) return null;
  const wager = top(input, (id) => Math.max(0, ...scopedAnswers(input, null, id).map((a) => a.wager ?? 0)));
  if (wager && wager.value > 0) return { kind: 'risk', names: wager.names, wager: wager.value, buffs: null };
  const buffs = top(input, (id) => scopedAnswers(input, null, id).filter((a) => a.buff !== null).length);
  return buffs && buffs.value >= 1 ? { kind: 'risk', names: buffs.names, wager: null, buffs: buffs.value } : null;
};

/** 🐑 Довірлива душа: найбільше виборів вигадки, ≥ gullible. */
const gullible: CardFn = (scope, input) => {
  if (!hasBluff(input, scope)) return null;
  const best = top(input, (id) => scopedAnswers(input, scope, id).filter((a) => a.bluff !== null && a.bluff.pick && !a.bluff.truth).length);
  return best && best.value >= FACT_LIMITS.gullible ? { kind: 'gullible', names: best.names, picks: best.value } : null;
};

/** 🧠 Самотній геній: єдина правильна серед ≥ geniusAnswers поданих. */
const genius: CardFn = (scope, input) => {
  const counts = new Map<string, { count: number; question: FactQuestion }>();
  for (const q of plainQuestions(input, scope)) {
    const main = mainAnswers(input, q);
    const hits = main.filter((a) => a.accepted);
    if (main.length < FACT_LIMITS.geniusAnswers || hits.length !== 1) continue;
    const id = hits[0]!.playerId;
    const prev = counts.get(id);
    counts.set(id, { count: (prev?.count ?? 0) + 1, question: prev?.question ?? q });
  }
  const best = top(input, (id) => counts.get(id)?.count ?? null);
  if (best === null) return null;
  const question = best.names.length === 1 && best.value === 1 ? ref(counts.get(best.ids[0]!)!.question) : null;
  return { kind: 'genius', names: best.names, count: best.value, question };
};

/** 🧗 Найважче запитання: найменша частка правильних серед ≥ hardestAnswers; нічия — більше відповідей, далі раніше. */
const hardest: CardFn = (scope, input) => {
  let best: { q: FactQuestion; accepted: number; answered: number } | null = null;
  for (const q of plainQuestions(input, scope)) {
    const main = mainAnswers(input, q);
    if (main.length < FACT_LIMITS.hardestAnswers) continue;
    const cur = { q, accepted: main.filter((a) => a.accepted).length, answered: main.length };
    const cmp = best === null ? -1 : cur.accepted * best.answered - best.accepted * cur.answered;
    if (best === null || cmp < 0 || (cmp === 0 && cur.answered > best.answered)) best = cur;
  }
  return best && { kind: 'hardest', question: ref(best.q), accepted: best.accepted, answered: best.answered };
};

const CARDS: Record<FactKind, CardFn> = { lightning, sniper, streak, comeback, bluffer, nerves, risk, gullible, genius, hardest };

function firstCards(order: readonly FactKind[], scope: Scope, input: FactInput, limit: number): FactCard[] {
  const cards: FactCard[] = [];
  for (const kind of order) {
    if (cards.length >= limit) break;
    const card = CARDS[kind](scope, input);
    if (card) cards.push(card);
  }
  return cards;
}

/** Рядок розкриття: запитання з балами, не бліц і не фінал, основних відповідей ≥ 2; інакше null. */
export function revealFacts(input: FactInput, questionIndex: number): RevealFacts | null {
  const q = derived(input).questions.get(questionIndex);
  if (!q || !q.scored || q.blitz || q.final) return null;
  const main = mainAnswers(input, q);
  if (main.length < 2) return null;
  const fast = q.limitMs === null ? null : fastestOf(main);
  const fastest = fast && { names: namesOf(input, new Set(fast.with.map((a) => a.playerId))), timeMs: fast.timeMs };
  let bluff: RevealFacts['bluff'] = null;
  if (q.bluff) {
    const own = derived(input).answers.filter((a) => a.questionIndex === q.index);
    const votes = Math.max(0, ...own.map((a) => a.bluff?.fooled ?? 0));
    if (votes >= 1) bluff = { names: namesOf(input, new Set(own.filter((a) => a.bluff?.fooled === votes).map((a) => a.playerId))), votes };
  }
  return { accepted: main.filter((a) => a.accepted).length, answered: main.length, fastest, bluff };
}

/** Відсоток part із whole цілим числом; не всі й не жоден — ніколи не 100 % і не 0 % від округлення. */
export function factPercent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  const percent = Math.round((part / whole) * 100);
  return part > 0 && part < whole ? Math.min(99, Math.max(1, percent)) : percent;
}

/**
 * Рядок розкриття на телефоні: місце своєї прийнятої відповіді з часом або частка правильних; null — рядка розкриття немає.
 * facts — уже пораховане revealFacts того самого запитання (рушій передає спільне, щоб не рахувати на кожен телефон).
 */
export function ownRevealFact(input: FactInput, questionIndex: number, playerId: string, facts: RevealFacts | null = revealFacts(input, questionIndex)): OwnRevealFact | null {
  if (facts === null) return null;
  const q = derived(input).questions.get(questionIndex)!;
  const main = mainAnswers(input, q);
  const own = main.find((a) => a.playerId === playerId);
  if (own && own.accepted && q.limitMs !== null) {
    return { kind: 'fastest', place: 1 + main.filter((a) => a.accepted && a.timeMs < own.timeMs).length };
  }
  return { kind: 'share', percent: factPercent(facts.accepted, facts.answered) };
}

/** Цікавинки раунду: перші FACT_LIMITS.roundCards за ROUND_FACT_ORDER; менше двох учасників — жодної. */
export function roundFacts(input: FactInput, roundIndex: number): FactCard[] {
  if (input.players.length < 2) return [];
  return firstCards(ROUND_FACT_ORDER, roundIndex, input, FACT_LIMITS.roundCards);
}

/** Нагороди гри: перші FACT_LIMITS.awards за AWARD_ORDER; менше двох учасників — жодної. */
export function gameAwards(input: FactInput): FactCard[] {
  if (input.players.length < 2) return [];
  return firstCards(AWARD_ORDER, null, input, FACT_LIMITS.awards);
}

/** Особисті числа учасника в межах: правильні, подані, середній час поданих із часом, найшвидша правильна. */
function tally(input: FactInput, playerId: string, scope: Scope) {
  const own = scopedAnswers(input, scope, playerId);
  const answered = own.filter((a) => a.answered);
  const times = answered.filter(timed).map((a) => a.timeMs);
  const fastest = fastestOf(own);
  return {
    own,
    correct: answered.filter((a) => a.accepted).length,
    answered: answered.length,
    avgMs: times.length === 0 ? null : Math.round(times.reduce((s, n) => s + n, 0) / times.length),
    fastestMs: fastest?.timeMs ?? null,
  };
}

const pickedLie = (a: FactAnswer) => a.bluff !== null && a.bluff.pick && !a.bluff.truth;

/** «Твій раунд»; null — учасника немає. */
export function roundCard(input: FactInput, playerId: string, roundIndex: number): RoundCard | null {
  const player = derived(input).players.get(playerId);
  if (!player) return null;
  const t = tally(input, playerId, roundIndex);
  return {
    correct: t.correct,
    answered: t.answered,
    avgMs: t.avgMs,
    fastestMs: t.fastestMs,
    streak: bestStreak(input, playerId, roundIndex),
    place: player.rank === null ? null : { before: roundIndex === 0 ? null : placeAfter(input, playerId, roundIndex), now: player.rank },
    fooledBy: hasBluff(input, roundIndex) ? t.own.filter(pickedLie).length : null,
  };
}

/** «Твоя гра»; null — учасника немає. */
export function gameCard(input: FactInput, playerId: string): GameCard | null {
  const player = derived(input).players.get(playerId);
  if (!player) return null;
  const t = tally(input, playerId, null);
  return {
    rounds: player.rounds,
    correct: t.correct,
    answered: t.answered,
    bestStreak: bestStreak(input, playerId, null),
    fastestMs: t.fastestMs,
    buffs: t.own.filter((a) => a.buff !== null).length,
    debuffs: { sent: input.debuffs.filter((d) => d.by === playerId).length, got: input.debuffs.filter((d) => d.target === playerId).length },
    bluff: hasBluff(input, null) ? { fooled: t.own.reduce((s, a) => s + (a.bluff?.fooled ?? 0), 0), fooledBy: t.own.filter(pickedLie).length } : null,
    away: new Set(input.away.filter((a) => a.playerId === playerId).map((a) => a.questionIndex)).size,
  };
}

/** Таблиця учасників в історії: усі учасники в порядку таблиці. */
export function factTable(input: FactInput): FactTableRow[] {
  return input.players.map((p) => {
    const t = tally(input, p.id, null);
    return { playerId: p.id, nickname: p.nickname, correct: t.correct, answered: t.answered, avgMs: t.avgMs, bestStreak: bestStreak(input, p.id, null) };
  });
}

/** Частки правильних запитань раунду з балами в порядку журналу (основні відповіді). */
export function roundShares(input: FactInput, roundIndex: number): RoundShare[] {
  return input.questions
    .filter((q) => q.roundIndex === roundIndex && q.scored)
    .map((q) => {
      const main = mainAnswers(input, q);
      return { number: q.number, text: q.text, accepted: main.filter((a) => a.accepted).length, answered: main.length };
    });
}
