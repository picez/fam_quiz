import { LIMITS, thinkKey, thinkStem, thinkWordsIssue, type Answer, type Question, type ThinkPlaceRow, type ThinkRound, type ThinkVerdict, type ThinkWord } from '@quiz/shared';
import { addAdjustment } from './adjust';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { autoLock, currentRound, fail, ok, recordOf, withCurrentPlay, withRecord, type AnswerRecord, type GameState, type Play, type Result, type ThinkPlay } from './game';
import { typoDistance } from './check';
import { presentPlayers } from './present';
import { teamMembers, teamsOn } from './teams';
import { timeOverFor } from './timing';

// «Думай інакше» (35): життя, вибування й місця виводяться з журналу (Play.think кожного запитання раунду), без полів GameState.

/**
 * Скільки одруківок прощається стеблу слова ведучого: коротші за 7 літер — жодної (банан ≠ баран, яблуко ≠ яблуня),
 * 7–9 — одна, від 10 — дві. Суворіше, ніж typoBudget типу text: тут сусідні слова — різні відповіді, а не описки.
 */
function thinkTypoBudget(stem: string): number {
  const length = [...stem].length;
  return length >= 10 ? 2 : length >= 7 ? 1 : 0;
}

/** Стебло відповіді близьке до стебла слова ведучого: рівне, або (без цифр, та сама перша літера) у межах thinkTypoBudget. */
function closeStems(host: string, typed: string): boolean {
  if (host === typed) return true;
  const budget = thinkTypoBudget(host);
  if (budget === 0 || /\d/u.test(host) || /\d/u.test(typed) || [...host][0] !== [...typed][0]) return false;
  return Math.abs([...host].length - [...typed].length) <= budget && typoDistance(host, typed) <= budget;
}

/**
 * Індекс першого слова ведучого, з яким збігається відповідь; порожня — null.
 * Збіг — стебло всієї відповіді близьке (closeStems) до стебла слова чи синоніма; а для однослівного слова ведучого — ще й
 * будь-яке слово відповіді («дуже червоний», «червоний колір» → «червоний»). Багатослівне слово ведучого («темно синій») — лише вся відповідь.
 * Навмисна описка в довгому слові не рятує.
 */
export function thinkHit(words: readonly ThinkWord[], value: string): number | null {
  const typed = thinkStem(value);
  if (typed === '') return null;
  const parts = typed.split(' ');
  const index = words.findIndex((w) =>
    [w.word, ...w.synonyms].some((spelling) => {
      const stem = thinkStem(spelling);
      if (stem === '') return false;
      if (closeStems(stem, typed)) return true;
      return !stem.includes(' ') && parts.length > 1 && parts.some((part) => closeStems(stem, part));
    }),
  );
  return index === -1 ? null : index;
}

/** Поточний раунд, якщо це «Думай інакше». */
export function thinkRoundOf(state: GameState): ThinkRound | null {
  const round = currentRound(state);
  return round?.type === 'think' ? round : null;
}

/** Запис запитання think: типово поточне (лише в поточному раунді); з index — будь-яке запитання журналу. null — не think. */
export function thinkPlayOf(state: GameState, index?: number): (Play & { think: ThinkPlay }) | null {
  const play = state.plays[index ?? state.questionIndex];
  if (play?.think === undefined) return null;
  if (index === undefined && play.roundIndex !== state.roundIndex) return null;
  return { ...play, think: play.think };
}

/** Індекси записів think раунду roundIndex у журналі (за порядком). */
export function thinkRoundPlays(state: GameState, roundIndex: number): number[] {
  return state.plays.flatMap((play, index) => (play.think !== undefined && play.roundIndex === roundIndex ? [index] : []));
}

/** Автор автопілота — глядач раунду: соло — його гравець; командна гра — команда, де він єдиний учасник. */
export function thinkWatches(state: GameState, actorId: string): boolean {
  const authorId = state.autopilot?.authorId;
  if (authorId === undefined) return false;
  if (!teamsOn(state)) return actorId === authorId;
  const members = teamMembers(state, actorId);
  return members.length > 0 && members.every((m) => m.id === authorId);
}

/**
 * ThinkPlay нового запитання: words — копія question.words; lives — знімок на мить відкриття.
 * Перше запитання раунду — кожен учасник (крім автора-глядача автопілота) отримує round.lives; далі — життя після попереднього;
 * новенький (пізній гравець чи нова команда) — найменше з життів живих (≥ 1). Вилучені зникають (фільтр за state.players).
 * Учасник, що став глядачем посеред раунду (у команді лишився сам автор), лишається з тими самими життями в watch.
 */
export function openThink(state: GameState, question: Extract<Question, { type: 'think' }>): ThinkPlay {
  const round = thinkRoundOf(state);
  const start = round?.lives ?? LIMITS.defaultThinkLives;
  const previous = thinkRoundPlays(state, state.roundIndex).at(-1);
  const all = state.players.map((p) => p.id);
  if (previous === undefined) {
    const ids = all.filter((id) => !thinkWatches(state, id));
    return { words: question.words, lives: Object.fromEntries(ids.map((id) => [id, start])), revealed: false };
  }
  const known = all.flatMap((id) => {
    const after = thinkLivesAfter(state, previous, id);
    return after === null ? [] : [[id, after] as const];
  });
  const living = known.map(([, lives]) => lives).filter((lives) => lives > 0);
  const weakest = Math.max(1, Math.min(...living, start));
  const lives: Record<string, number> = {};
  const watch: string[] = [];
  for (const id of all) {
    const found = known.find(([k]) => k === id);
    const watching = thinkWatches(state, id);
    // Глядач-новенький не грає; Якщо живих немає, раунд уже скінчився (thinkOver): новенький сюди не потрапить.
    if (found === undefined && watching) continue;
    lives[id] = found !== undefined ? found[1] : weakest;
    if (watching && lives[id] > 0) watch.push(id);
  }
  return { words: question.words, lives, revealed: false, ...(watch.length === 0 ? {} : { watch }) };
}

/** Учасник на запитанні лише дивиться (ThinkPlay.watch). */
function watching(think: ThinkPlay, id: string): boolean {
  return think.watch?.includes(id) ?? false;
}

/** Слова ведучого, зведені: обрізано, пробіли зведено, порожні синоніми відкинуто. null — слово порожнє, задовге, забагато слів чи синонімів, повтор. */
function cleanWords(words: readonly ThinkWord[]): ThinkWord[] | null {
  const squeeze = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (words.length > LIMITS.maxThinkWords) return null;
  const cleaned = words.map((w) => ({ word: squeeze(w.word), synonyms: w.synonyms.map(squeeze).filter((s) => s !== '') }));
  for (const w of cleaned) {
    if (w.word === '' || w.synonyms.length > LIMITS.maxThinkSynonyms) return null;
    if ([w.word, ...w.synonyms].some((s) => s.length > LIMITS.thinkWord || thinkKey(s) === '')) return null;
  }
  return thinkWordsIssue(cleaned) === null ? cleaned : null;
}

/**
 * Слова ведучого замінюють увесь список: на question — будь-який (0–3), на locked — лише порожній на непорожній (раз після таймера),
 * далі — think_words_closed; не запитання think — wrong_phase; погані слова — think_word; той самий список — стан без змін.
 */
export function setThinkWords(state: GameState, words: ThinkWord[]): Result {
  const play = thinkPlayOf(state);
  if (play === null) return fail('wrong_phase');
  if (state.phase !== 'question' && state.phase !== 'locked') return fail('think_words_closed');
  const cleaned = cleanWords(words);
  if (state.phase === 'locked' && (play.think.words.length > 0 || (cleaned !== null && cleaned.length === 0))) return fail('think_words_closed');
  if (cleaned === null) return fail('think_word');
  if (JSON.stringify(cleaned) === JSON.stringify(play.think.words)) return ok(state);
  const { think, ...rest } = play;
  return ok(withThinkGrades(withCurrentPlay(state, { ...rest, think: { ...think, words: cleaned } })));
}

/** Відповідь гравця: think_spectator / think_out / already_answered / time_over / type_mismatch / think_word. */
export function submitThinkAnswer(state: GameState, playerId: string, answer: Answer, now: number): Result {
  const play = thinkPlayOf(state);
  if (play === null) return fail('wrong_phase');
  const lives = Object.hasOwn(play.think.lives, playerId) ? play.think.lives[playerId] : undefined;
  if (lives === undefined || watching(play.think, playerId)) return fail('think_spectator');
  if (lives === 0) return fail('think_out');
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return fail('already_answered');
  if (state.startedAt === null || timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (answer.type !== 'think') return fail('type_mismatch');
  const value = answer.value.replace(/\s+/g, ' ').trim();
  if (value === '' || value.length > LIMITS.thinkWord || thinkKey(value) === '') return fail('think_word');
  const hit = thinkHit(play.think.words, value) !== null;
  // Без балів: місця платять коригуванням на кінці раунду; grade — «в безпеці» чи «збіг», не правильність (у статистику не йде).
  const record: AnswerRecord = {
    answer: { type: 'think', value },
    timeMs: Math.max(0, now - state.startedAt),
    accepted: false,
    accuracy: 0,
    grade: hit ? 'wrong' : 'correct',
    basePoints: 0,
    streakBonus: 0,
    points: 0,
    overridden: false,
  };
  return ok(autoLock(withRecord(state, playerId, record), now));
}

/**
 * Вердикт запису: ручна оцінка чи розкрите запитання — за grade (після розкриття вердикт заморожено: інше порівняння після деплою
 * не перевертає зіграного); інакше thinkHit з поточних слів.
 */
function recordVerdict(think: ThinkPlay, record: AnswerRecord): 'safe' | 'hit' {
  const words = think.words;
  if (record.overridden || think.revealed) return record.grade === 'wrong' ? 'hit' : 'safe';
  const value = record.answer?.type === 'think' ? record.answer.value : '';
  return thinkHit(words, value) !== null ? 'hit' : 'safe';
}

/** Вердикт кожного учасника з lives > 0 на запитанні index (у порядку state.players): запис overridden — за grade; інакше thinkHit; немає запису — 'empty'. */
export function thinkVerdicts(state: GameState, index: number): Record<string, ThinkVerdict> {
  const play = thinkPlayOf(state, index);
  if (play === null) return {};
  const verdicts: Record<string, ThinkVerdict> = {};
  for (const { id } of state.players) {
    if (!Object.hasOwn(play.think.lives, id) || play.think.lives[id] === 0 || watching(play.think, id)) continue;
    const record = recordOf(state, index, id);
    verdicts[id] = record === undefined ? 'empty' : recordVerdict(play.think, record);
  }
  return verdicts;
}

/** Перераховує grade записів запитань think (не overridden): hit → 'wrong', safe → 'correct'; points завжди 0. Без змін — той самий стан. */
export function withThinkGrades(state: GameState): GameState {
  let changed = false;
  const plays = state.plays.map((play) => {
    const think = play.think;
    // Розкрите запитання не перераховується: вердикти заморожено.
    if (think === undefined || think.revealed) return play;
    let answers: Record<string, AnswerRecord> | null = null;
    for (const [id, record] of Object.entries(play.answers)) {
      if (record.overridden) continue;
      const grade = recordVerdict(think, record) === 'hit' ? 'wrong' : 'correct';
      if (record.grade === grade) continue;
      answers ??= { ...play.answers };
      answers[id] = { ...record, grade };
    }
    if (answers === null) return play;
    changed = true;
    return { ...play, answers };
  });
  return changed ? { ...state, plays } : state;
}

/** Життя учасника після запитання index (розкрите — мінус втрата за збіг чи мовчання; ні — як на відкритті); не учасник — null. */
export function thinkLivesAfter(state: GameState, index: number, actorId: string): number | null {
  const think = state.plays[index]?.think;
  if (think === undefined || !Object.hasOwn(think.lives, actorId)) return null;
  const lives = think.lives[actorId];
  if (!think.revealed || lives === 0 || watching(think, actorId)) return lives;
  const record = recordOf(state, index, actorId);
  const lost = record === undefined || recordVerdict(think, record) === 'hit';
  return lost ? lives - 1 : lives;
}

/** Живі зараз у поточному раунді think (у порядку state.players): за останнім запитанням раунду; поза раундом — []. */
export function thinkAlive(state: GameState): string[] {
  if (thinkRoundOf(state) === null) return [];
  const last = thinkRoundPlays(state, state.roundIndex).at(-1);
  if (last === undefined) return [];
  return state.players.map((p) => p.id).filter((id) => (thinkLivesAfter(state, last, id) ?? 0) > 0);
}

/**
 * Раунд скінчено достроково: після останнього запитання живих 0, або раунд почали ≥ 2 учасники (ключі lives першого запитання),
 * а живих ≤ 1. Соло (один на першому запитанні) грає, поки є життя; новенькі режиму не міняють.
 */
export function thinkOver(state: GameState): boolean {
  if (thinkRoundOf(state) === null) return false;
  const indices = thinkRoundPlays(state, state.roundIndex);
  const first = indices[0];
  // Ще не почали: раунду немає з ким грати (в автопілоті лише автор) — кінець одразу, без порожнього запитання.
  if (first === undefined) return state.players.every((p) => thinkWatches(state, p.id));
  const alive = thinkAlive(state).length;
  if (alive === 0) return true;
  const started = Object.keys(state.plays[first].think?.lives ?? {}).length;
  return started >= 2 && alive <= 1;
}

/**
 * Очки місця: один учасник — P, якщо дожив і пройшов увесь шлях (complete: розкрито кожне запитання раунду), інакше 0;
 * інакше round(P × (n − place) / (n − 1)).
 */
export function thinkPoints(total: number, n: number, place: number, alive: boolean, complete = true): number {
  if (n <= 1) return alive && complete ? total : 0;
  return Math.round((total * (n - place)) / (n - 1));
}

/**
 * Місця раунду roundIndex (порядок: місце, потім state.players), з очками thinkPoints. Учасники — ключі lives хоч одного запитання раунду, ще в грі.
 * Дожили — вище за вибулих (більше життів — вище); вибулі — пізніше вибув — вище; рівні — спільне місце (1, 1, 3).
 */
export function thinkPlaces(state: GameState, roundIndex: number = state.roundIndex): ThinkPlaceRow[] {
  const round = state.quiz.rounds[roundIndex];
  if (round?.type !== 'think') return [];
  const indices = thinkRoundPlays(state, roundIndex);
  const stats: { id: string; lives: number; outAt: number | null }[] = [];
  for (const { id } of state.players) {
    let lives: number | null = null;
    let outAt: number | null = null;
    for (let k = 0; k < indices.length; k++) {
      const after = thinkLivesAfter(state, indices[k], id);
      if (after === null) continue;
      const opened = state.plays[indices[k]].think?.lives[id] ?? 0;
      if (outAt === null && after === 0 && opened > 0) outAt = k + 1;
      lives = after;
    }
    if (lives !== null) stats.push({ id, lives, outAt });
  }
  // Ключ порівняння: дожив — (1, життя), вибув — (0, номер вибування); більше — вище.
  const rank = (s: { lives: number; outAt: number | null }): [number, number] => (s.lives > 0 ? [1, s.lives] : [0, s.outAt ?? 0]);
  const better = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const n = stats.length;
  // Соло «має пройти весь шлях»: кожне запитання раунду зіграно й розкрито (ведучий не завершив раунд раніше).
  const complete = indices.length === round.questions.length && indices.every((i) => state.plays[i].think?.revealed === true);
  const rows = stats.map((s) => {
    const place = 1 + stats.filter((o) => better(rank(o), rank(s))).length;
    return { ...s, outAt: s.lives > 0 ? null : s.outAt, place, points: thinkPoints(round.points, n, place, s.lives > 0, complete) };
  });
  return rows.map((row, order) => ({ row, order })).sort((a, b) => a.row.place - b.row.place || a.order - b.order).map(({ row }) => row);
}

/** Кінець раунду think: коригування 'think' на очки місць; ідемпотентно (коригування think цього раунду вже є — без нових); поза раундом — стан без змін. */
export function awardThinkPlaces(state: GameState, now: number): GameState {
  if (thinkRoundOf(state) === null) return state;
  if (state.adjustments.some((a) => a.source === 'think' && a.roundIndex === state.roundIndex)) return state;
  return thinkPlaces(state).reduce((s, row) => (row.points > 0 ? addAdjustment(s, row.id, row.points, now, 'think') : s), state);
}

/** Живі (lives > 0 на відкритті) присутні учасники поточного запитання think — кого чекає раннє закриття автопілота; null — не think. */
export function thinkPresent(state: GameState): string[] | null {
  const play = thinkPlayOf(state);
  if (play === null) return null;
  const lives = play.think.lives;
  return presentPlayers(state)
    .map((p) => p.id)
    .filter((id) => Object.hasOwn(lives, id) && lives[id] > 0 && !watching(play.think, id));
}
