import { LIMITS, rulesOf, thinkKey, thinkStem, type AlikeInfo, type Answer, type HostAlike } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, fail, ok, recordOf, withRecord, withTotals, type AnswerRecord, type GameState, type Play, type Result } from './game';
import { thinkClose } from './think';
import { timeOverFor } from './timing';

// «Думай як усі» (37e): кожен пише одне слово на тему; бали — найбільшій групі схожих (стебла thinkStem, близькі за thinkClose).
// До закриття відповіді лежать з 0; бали ставить scoreAlike при закритті, а правки ведучого на reveal (Play.alike) перераховують їх одразу.

export interface AlikeGroup {
  key: string;
  ids: string[];
  /** Різні написання в порядку гравців. */
  words: string[];
}

/** Слово запису thinkalike; інакше null. */
function wordOf(record: AnswerRecord | undefined): string | null {
  return record?.answer?.type === 'thinkalike' ? record.answer.value : null;
}

/** Запис журналу index, якщо це запитання thinkalike; інакше null. */
function alikePlayAt(state: GameState, index: number): Play | null {
  const play = state.plays[index];
  return play?.question.type === 'thinkalike' ? play : null;
}

/** Ціна для групи-переможця: ціна запитання × множник раунду; без швидкості. */
function priceOf(state: GameState, play: Play): number {
  return Math.round(play.question.points * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
}

/**
 * Групи запитання index: відповідачі в порядку state.players; дві відповіді в одній групі, якщо стебла близькі (thinkClose),
 * — компоненти зв'язності, тож результат не залежить від порядку. Ключ автогрупи — id її першого учасника;
 * після правки ведучого ключ — мітка Play.alike.labels. Порядок — від більших до менших, далі за першим учасником.
 */
export function alikeGroups(state: GameState, index: number): AlikeGroup[] {
  const play = alikePlayAt(state, index);
  if (play === null) return [];
  const entries = state.players.flatMap((player) => {
    const word = wordOf(recordOf(state, index, player.id));
    return word === null ? [] : [{ id: player.id, word, stem: thinkStem(word) }];
  });
  const parent = entries.map((_, i) => i);
  const root = (i: number): number => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (!thinkClose(entries[i].stem, entries[j].stem)) continue;
      const a = root(i);
      const b = root(j);
      // Корінь — найменший індекс: ключ автогрупи — її перший учасник.
      if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
    }
  }
  const labels = play.alike?.labels;
  const groups = new Map<string, AlikeGroup>();
  entries.forEach((entry, i) => {
    const key = labels !== undefined && Object.hasOwn(labels, entry.id) ? labels[entry.id] : entries[root(i)].id;
    const group = groups.get(key) ?? { key, ids: [], words: [] };
    group.ids.push(entry.id);
    if (!group.words.includes(entry.word)) group.words.push(entry.word);
    groups.set(key, group);
  });
  // Сортування стабільне: рівні за розміром лишаються в порядку першого учасника.
  return [...groups.values()].sort((a, b) => b.ids.length - a.ids.length);
}

/** Ключі груп-переможців: усі групи найбільшого розміру; [] — найбільша менша за 2. */
export function alikeTop(groups: readonly AlikeGroup[]): string[] {
  const max = Math.max(0, ...groups.map((g) => g.ids.length));
  return max < 2 ? [] : groups.filter((g) => g.ids.length === max).map((g) => g.key);
}

/** Переписує не overridden записи thinkalike запитання index: переможці — повна ціна (correct), решта — 0 (wrong). */
function rescore(state: GameState, index: number): GameState {
  const play = alikePlayAt(state, index);
  if (play === null) return state;
  const groups = alikeGroups(state, index);
  const top = new Set(alikeTop(groups));
  const winners = new Set(groups.filter((g) => top.has(g.key)).flatMap((g) => g.ids));
  const win = priceOf(state, play);
  const answers: Record<string, AnswerRecord> = { ...play.answers };
  for (const [id, record] of Object.entries(play.answers)) {
    if (record.overridden || wordOf(record) === null) continue;
    const won = winners.has(id);
    answers[id] = { ...record, accepted: won, accuracy: won ? 1 : 0, grade: won ? 'correct' : 'wrong', basePoints: won ? win : 0, streakBonus: 0, points: won ? win : 0 };
  }
  return { ...state, plays: state.plays.map((p, i) => (i === index ? { ...play, answers } : p)) };
}

/** Відповідь гравця (команди): not_found / already_answered / time_over / type_mismatch / think_word; запис з 0, далі autoLock. */
export function submitAlikeAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = state.plays[state.questionIndex];
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (answer.type !== 'thinkalike') return fail('type_mismatch');
  const value = answer.value.replace(/\s+/g, ' ').trim();
  if (value === '' || value.length > LIMITS.thinkWord || thinkKey(value) === '') return fail('think_word');
  // Остаточні бали ставить scoreAlike при закритті: до того відповідь лежить з 0.
  const record: AnswerRecord = {
    answer: { type: 'thinkalike', value },
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

/** На етапі question поточного thinkalike ставить бали за групами; інакше той самий стан. */
export function scoreAlike(state: GameState): GameState {
  if (state.phase !== 'question' || alikePlayAt(state, state.questionIndex) === null) return state;
  return rescore(state, state.questionIndex);
}

/**
 * Правити групи можна лише на reveal поточного thinkalike (wrong_phase) і не в автопілоті (not_allowed); інакше null.
 * byAdmin — пульт адміна в кімнаті бота (68): у ведучого-людини поруч відмови автопілота немає.
 */
function editRefusal(state: GameState, byAdmin = false): 'wrong_phase' | 'not_allowed' | null {
  if (state.phase !== 'reveal' || alikePlayAt(state, state.questionIndex) === null) return 'wrong_phase';
  return state.autopilot === undefined || byAdmin ? null : 'not_allowed';
}

/** Нові мітки груп поточного запитання (перша правка — з поточних груп), бали перераховано одразу. */
function withLabels(state: GameState, groups: readonly AlikeGroup[], change: (labels: Record<string, string>) => void): GameState {
  const labels: Record<string, string> = {};
  for (const group of groups) for (const id of group.ids) labels[id] = group.key;
  change(labels);
  const play = state.plays[state.questionIndex];
  const labelled: GameState = { ...state, plays: state.plays.map((p, i) => (i === state.questionIndex ? { ...play, alike: { labels } } : p)) };
  return withTotals(rescore(labelled, state.questionIndex));
}

/** Ведучий об'єднує групу from з групою to: усі з from отримують мітку to. Невідомий ключ чи from === to — alike_group. */
export function alikeJoin(state: GameState, from: string, to: string, byAdmin = false): Result {
  const refusal = editRefusal(state, byAdmin);
  if (refusal !== null) return fail(refusal);
  const groups = alikeGroups(state, state.questionIndex);
  const source = groups.find((g) => g.key === from);
  if (from === to || source === undefined || !groups.some((g) => g.key === to)) return fail('alike_group');
  return ok(
    withLabels(state, groups, (labels) => {
      for (const id of source.ids) labels[id] = to;
    }),
  );
}

/** Ведучий виносить відповідь гравця в окрему групу (мітка solo:<id>). Без відповіді чи вже сам — alike_group. */
export function alikeSplit(state: GameState, playerId: string, byAdmin = false): Result {
  const refusal = editRefusal(state, byAdmin);
  if (refusal !== null) return fail(refusal);
  const groups = alikeGroups(state, state.questionIndex);
  const own = groups.find((g) => g.ids.includes(playerId));
  if (own === undefined || own.ids.length < 2) return fail('alike_group');
  // Мітку solo:<id> могла взяти інша група (до неї приєднали): нова мітка — вільна.
  const taken = new Set(groups.map((g) => g.key));
  let key = `solo:${playerId}`;
  for (let n = 2; taken.has(key); n++) key = `solo:${playerId}:${n}`;
  return ok(
    withLabels(state, groups, (labels) => {
      labels[playerId] = key;
    }),
  );
}

/**
 * Після вилучення: мітки тих, кого вже немає серед гравців, зникають з усіх записів; поточне запитання на locked чи reveal
 * перераховується (група могла зменшитися), закриті раніше — ні.
 */
export function dropFromAlike(state: GameState): GameState {
  const ids = new Set(state.players.map((p) => p.id));
  let changed = false;
  const plays = state.plays.map((play) => {
    if (play.alike === undefined) return play;
    const kept = Object.entries(play.alike.labels).filter(([id]) => ids.has(id));
    if (kept.length === Object.keys(play.alike.labels).length) return play;
    changed = true;
    return { ...play, alike: { labels: Object.fromEntries(kept) } };
  });
  const dropped = changed ? { ...state, plays } : state;
  const live = (state.phase === 'locked' || state.phase === 'reveal') && alikePlayAt(state, state.questionIndex) !== null;
  return live ? withTotals(rescore(dropped, state.questionIndex)) : dropped;
}

/** Групи поточного запитання для зрізу; null — не thinkalike. */
function infoOf(state: GameState): AlikeInfo | null {
  const play = alikePlayAt(state, state.questionIndex);
  if (play === null) return null;
  const nickname = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? '';
  const groups = alikeGroups(state, state.questionIndex);
  const top = new Set(alikeTop(groups));
  const win = priceOf(state, play);
  return {
    groups: groups.map((g) => ({ key: g.key, words: g.words, members: g.ids.map((id) => ({ id, nickname: nickname(id) })), top: top.has(g.key), points: top.has(g.key) ? win : 0 })),
    silent: state.players.filter((p) => recordOf(state, state.questionIndex, p.id) === undefined).map((p) => ({ id: p.id, nickname: p.nickname })),
  };
}

/** Сцена й телефони: лише reveal поточного thinkalike; до нього чужих слів немає. */
export function alikeInfo(state: GameState): AlikeInfo | undefined {
  return state.phase === 'reveal' ? (infoOf(state) ?? undefined) : undefined;
}

/** Пульт: locked і reveal поточного thinkalike; editable — reveal і не автопілот (пульт адміна в кімнаті бота — byAdmin, 68). */
export function hostAlike(state: GameState, byAdmin = false): HostAlike | undefined {
  if (state.phase !== 'locked' && state.phase !== 'reveal') return undefined;
  const info = infoOf(state);
  return info === null ? undefined : { ...info, editable: editRefusal(state, byAdmin) === null };
}
