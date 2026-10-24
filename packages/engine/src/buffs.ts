import {
  allSpares,
  allowedBuffs,
  boardSpareSource,
  findCell,
  isUnscored,
  rulesOf,
  type Answer,
  SIMPLE_TYPES,
  type BuffBlock,
  type BuffKind,
  type BuffNotice,
  type BuffTag,
  type Phase,
  type Question,
  type RetryStage,
} from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  autoLock,
  fail,
  ok,
  present,
  recordOf,
  revealNow,
  withCurrentPlay,
  withRecord,
  type AnswerRecord,
  type GameState,
  type Play,
  type Result,
  type Rng,
} from './game';
import { normalizeText } from './normalize';
import { grantOvertime, isTimed, limitMsOf, timeOverFor } from './timing';
import { notStarted } from './splash';

/** Скільки додає «Додатковий час», мс. */
export const EXTRA_TIME_MS = 30_000;

/** Скільки триває голосування залу, мс. */
export const AUDIENCE_MS = 15_000;

/** Запасне запитання дає щонайменше стільки часу, мс. */
export const SWAP_MIN_MS = 20_000;

/** Скільки рядків здогадок показує підсумок голосування. */
const MAX_GUESSES = 6;

/** Баф гравця на одному запитанні. */
export interface BuffPlay {
  kind: BuffKind;
  /** Номер узяття в грі, 1-базовий; після вилучення гравця номери не повторюються. */
  seq: number;
  /** Мить, коли баф узято (час сервера). */
  at: number;
  /** fifty: прибрані неправильні варіанти; інакше []. */
  removed: string[];
  /** retry: стадія; null для інших бафів. */
  retry: RetryStage | null;
  /** retry: перша відповідь (неправильна або часткова), поки друга не зарахована; інакше null. */
  first: AnswerRecord | null;
  /** audience: голосування; лише в бафі audience. */
  vote?: { endsAt: number; ballots: Record<string, Answer> };
  /** hint: text null — чекає ведучого; aloud — ведучий підказав уголос; лише в бафі hint. */
  hint?: { text: string | null; aloud: boolean };
  /** swap: id запасного, порядок його варіантів, мить видачі, межа для бонусу швидкості (null — без таймера). */
  spare?: { id: string; presented: string[]; startedAt: number; limitMs: number | null };
}

/** Баф гравця на запитанні; null — немає. */
export function buffOf(play: Play | undefined, playerId: string): BuffPlay | null {
  const buffs = play?.buffs;
  return buffs !== undefined && Object.hasOwn(buffs, playerId) ? buffs[playerId] : null;
}

/** Бафи, які гравець уже використав у грі, у порядку журналу. */
export function buffsUsed(state: GameState, playerId: string): BuffKind[] {
  return state.plays.flatMap((play) => buffOf(play, playerId)?.kind ?? []);
}

/** Скільки варіантів прибирає 50/50; 0 — не діє (unfit_options або не той тип). multi: ⌈неправильних/2⌉, але один неправильний лишається. */
export function fiftyCount(question: Question): number {
  if (question.type === 'single') {
    const n = question.options.length;
    // З двох варіантів прибраний неправильний просто показав би відповідь.
    return n >= 3 ? n - Math.ceil(n / 2) : 0;
  }
  if (question.type === 'multi') {
    const wrong = question.options.filter((o) => !question.correctIds.includes(o.id)).length;
    // Половина неправильних, округлено вгору, але хоч один неправильний лишається — інакше прибране показало б відповідь.
    return wrong >= 2 ? Math.min(Math.ceil(wrong / 2), wrong - 1) : 0;
  }
  return 0;
}

/** Неправильні варіанти запитання в авторському порядку. */
function wrongOptions(question: Question): string[] {
  if (question.type === 'single') return question.options.filter((o) => o.id !== question.correctId).map((o) => o.id);
  if (question.type === 'multi') return question.options.filter((o) => !question.correctIds.includes(o.id)).map((o) => o.id);
  return [];
}

type PlaceBlock = 'elsewhere' | 'not_chooser' | 'off_blitz' | 'off_blitz_cell' | 'off_final' | 'off_wipeout' | 'off_chain' | 'off_sort' | 'off_wall' | 'off_vote';

/** Де гравець відповідає: null — тут бафи можна; not_chooser — на полі відповідає інший; elsewhere — немає де; off_* — тут бафів немає. */
function placeBlock(state: GameState, play: Play, playerId: string): PlaceBlock | null {
  const round = state.quiz.rounds[play.roundIndex];
  if (round.type === 'board') {
    const board = play.board;
    if (board === undefined) return 'elsewhere';
    if (board.kind === 'blitz') return 'off_blitz_cell';
    // Звичайна клітинка — і з телефона, і вголос: бафи бере лише той, хто вибрав.
    if (board.chooserId !== playerId) return 'not_chooser';
  } else if (play.blitz !== undefined || round.type === 'blitz') return 'off_blitz';
  else if (round.type === 'final') return 'off_final';
  else if (round.type === 'wipeout') return 'off_wipeout';
  // Ланцюжок, сортування й стіна рахуються окремо.
  if (play.question.type === 'chain') return 'off_chain';
  if (play.question.type === 'sort') return 'off_sort';
  if (play.question.type === 'wall') return 'off_wall';
  // Без балів — без бафів.
  if (isUnscored(play.question)) return 'off_vote';
  return null;
}

/** Причина «тут бафів немає взагалі». */
function isOff(place: PlaceBlock | null): place is Exclude<PlaceBlock, 'elsewhere' | 'not_chooser'> {
  return place !== null && place.startsWith('off_');
}

/** Чи гравець може брати бафи на поточному запитанні. */
export function buffsHere(state: GameState, play: Play, playerId: string): boolean {
  return placeBlock(state, play, playerId) === null;
}

/** Чи показувати гравцеві ряд бафів: він відповідає на це запитання з телефона (зокрема там, де бафів немає). */
export function buffRowHere(state: GameState, play: Play, playerId: string): boolean {
  // Вибравший на усній клітинці відповідає вголос, але бафи бере з телефона.
  const place = placeBlock(state, play, playerId);
  return place !== 'elsewhere' && place !== 'not_chooser';
}

/** Відповідь гравця вже надіслана або чекає на ведучого. */
export function hasAnswered(state: GameState, play: Play, playerId: string): boolean {
  if (recordOf(state, state.questionIndex, playerId) !== undefined) return true;
  // Блеф: вигадка — ще не відповідь, баф можна взяти до вибору.
  if (play.question.type === 'bluff') return play.bluff !== undefined && Object.hasOwn(play.bluff.picks, playerId);
  const board = play.board;
  if (board === undefined || board.chooserId !== playerId) return false;
  // Усна відповідь: щойно ведучий позначив названий варіант, відповідь уже прозвучала.
  return board.answer !== null || board.named !== undefined;
}

/** Чи може гравець голосувати за askerId (без перевірки часу й повторного голосу). */
export function canVote(state: GameState, voterId: string, askerId: string): boolean {
  const play = state.plays[state.questionIndex];
  if (play === undefined || voterId === askerId || !state.players.some((p) => p.id === voterId)) return false;
  // На полі голосують усі, крім вибравшого; у класиці — ті, хто вже відповів (перша спроба, що чекає другої, не рахується).
  if (play.board !== undefined) return voterId !== play.board.chooserId;
  // Хто відповідав на запасне, бачив інше запитання: голос за основне від нього нічого не значить.
  if (buffOf(play, voterId)?.spare !== undefined) return false;
  return recordOf(state, state.questionIndex, voterId) !== undefined;
}

/** Чи баф пасує запитанню; null — так. */
function fitBlock(state: GameState, play: Play, playerId: string, kind: BuffKind): BuffBlock | null {
  const round = state.quiz.rounds[play.roundIndex];
  const { question } = play;
  // Блеф: ×2 і щит; час спільний для всіх, підказка видала б правду, заміна зламала б вибір інших.
  if (question.type === 'bluff' && kind !== 'double' && kind !== 'shield') return 'unfit_bluff';
  switch (kind) {
    case 'fifty':
      if (question.type !== 'single' && question.type !== 'multi') return 'unfit_type';
      return fiftyCount(question) === 0 ? 'unfit_options' : null;
    case 'retry':
      // Усну відповідь оцінює ведучий одразу: другої спроби не буває.
      if (play.board?.answerMode === 'voice') return 'unfit_voice';
      // На картинці, що проявляється, відповідь одна.
      if (question.reveal != null) return 'unfit_reveal';
      if (!(SIMPLE_TYPES as readonly string[]).includes(question.type)) return 'unfit_type';
      return round.type === 'board' && round.check === 'manual' ? 'unfit_manual' : null;
    case 'time':
      return isTimed(question) ? null : 'unfit_timer';
    case 'shield':
      return rulesOf(round).penalty === 'none' ? 'unfit_penalty' : null;
    case 'double':
    case 'hint':
      return null;
    case 'audience':
      if (!(SIMPLE_TYPES as readonly string[]).includes(question.type)) return 'unfit_type';
      return state.players.some((p) => p.connected && canVote(state, p.id, playerId)) ? null : 'no_voters';
    case 'swap': {
      const { spares, scope } = sparePool(state, play);
      if (scope === 'category' && spares.length === 0) return 'no_category_spares';
      return nextSpare(state, play) === null ? 'spares_out' : null;
    }
  }
  // Новий вид бафу без власної гілки не пройде перевірку типів.
  const unknown: never = kind;
  return unknown;
}

/**
 * Пул заміни для запитання play: клітинка поля — запасні її категорії, якщо вікторина в режимі 'category'
 * (порожній список, якщо в категорії їх немає); інакше — загальний пул (класика завжди, поле старих вікторин).
 */
export function sparePool(state: GameState, play: Play): { spares: Question[]; scope: 'category' | 'quiz' } {
  const round = state.quiz.rounds[play.roundIndex];
  if (play.board !== undefined && round?.type === 'board' && boardSpareSource(state.quiz) === 'category') {
    return { spares: findCell(round, play.board.cellId)?.category.spares ?? [], scope: 'category' };
  }
  return { spares: state.quiz.spares ?? [], scope: 'quiz' };
}

/** Наступне невикористане запасне з пулу play; null — пулу немає або він вичерпаний. */
export function nextSpare(state: GameState, play: Play): Question | null {
  return sparePool(state, play).spares.find((spare) => !state.sparesUsed.includes(spare.id)) ?? null;
}

/** Запитання, на яке відповідає гравець: запасне після заміни, інакше основне. */
export function questionFor(state: GameState, play: Play, playerId: string): Question {
  const spare = buffOf(play, playerId)?.spare;
  if (spare === undefined) return play.question;
  // Запасне видано з пулу цієї гри; якщо його там немає, лишається основне.
  return allSpares(state.quiz).find((q) => q.id === spare.id) ?? play.question;
}

/** Порядок варіантів того, що бачить гравець: presented запасного або state.presented. */
export function presentedFor(state: GameState, play: Play, playerId: string): string[] {
  return buffOf(play, playerId)?.spare?.presented ?? state.presented;
}

/** Межа для бонусу швидкості: limitMs запасного або limitMsOf(play). */
export function answerLimitMs(play: Play, playerId: string): number | null {
  const spare = buffOf(play, playerId)?.spare;
  return spare === undefined ? limitMsOf(play) : spare.limitMs;
}

/**
 * Чому гравець не може взяти цей баф зараз; null — можна. Дозвіл вікторини не перевіряє.
 * Причини not_started і time видно лише з now (зрізи без часу їх не показують — заставку й сплив час рахує телефон).
 */
export function buffBlock(state: GameState, playerId: string, kind: BuffKind, now?: number): BuffBlock | null {
  if (buffsUsed(state, playerId).includes(kind)) return 'used';
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return 'elsewhere';
  const place = placeBlock(state, play, playerId);
  // Де бафів немає взагалі, причина та сама за будь-якого стану — пауза чи відповідь її не підмінюють.
  if (isOff(place)) return place;
  if (buffOf(play, playerId) !== null) return 'taken';
  if (hasAnswered(state, play, playerId)) return 'answered';
  if (!state.paused && now !== undefined && notStarted(state, now)) return 'not_started';
  if (!state.paused && now !== undefined && timeOverFor(state, play, playerId, now)) return 'time';
  if (state.paused) return 'paused';
  return place ?? fitBlock(state, play, playerId, kind);
}

/** Узяти баф на поточне запитання. fifty тягне rng; time дає гравцеві особистий час понад спільний кінець. */
export function takeBuff(state: GameState, playerId: string, kind: BuffKind, now: number, rng: Rng): Result {
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  if (!allowedBuffs(state.quiz).includes(kind)) return fail('not_allowed');
  if (buffsUsed(state, playerId).includes(kind)) return fail('buff_used');
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  if (play === undefined) return fail('wrong_phase');
  const place = placeBlock(state, play, playerId);
  if (place === 'elsewhere' || isOff(place)) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (place === 'not_chooser') return fail('not_your_turn');
  if (hasAnswered(state, play, playerId)) return fail('already_answered');
  if (timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (buffOf(play, playerId) !== null) return fail('buff_busy');
  if (fitBlock(state, play, playerId, kind) !== null) return fail('buff_unfit');
  const seq = state.buffSeq + 1;
  const buff: BuffPlay = {
    kind,
    seq,
    at: now,
    removed: kind === 'fifty' ? pickRemoved(play.question, rng) : [],
    retry: kind === 'retry' ? 'armed' : null,
    first: null,
    ...(kind === 'audience' ? { vote: { endsAt: now + AUDIENCE_MS, ballots: {} } } : {}),
    ...(kind === 'hint' ? { hint: { text: play.question.hint ?? null, aloud: false } } : {}),
  };
  if (kind === 'swap') return ok(takeSpare(state, play, playerId, buff, now, rng));
  const taken = withCurrentPlay({ ...state, buffSeq: seq }, { ...play, buffs: { ...play.buffs, [playerId]: buff } });
  if (kind === 'time') return ok(grantOvertime(taken, playerId, EXTRA_TIME_MS));
  // Поки зал голосує, гравець не втрачає часу: +15 с особистого, як «Додатковий час». Без таймера часу немає.
  if (kind === 'audience' && isTimed(play.question)) return ok(grantOvertime(taken, playerId, AUDIENCE_MS));
  return ok(taken);
}

/**
 * Заміна: наступне запасне (fitBlock гарантує, що воно є) з власним порядком варіантів і часом
 * щонайменше SWAP_MIN_MS — особистим понад спільний кінець. Без таймера — без особистого часу.
 */
function takeSpare(state: GameState, play: Play, playerId: string, buff: BuffPlay, now: number, rng: Rng): GameState {
  const spare = nextSpare(state, play);
  if (spare === null) return state;
  const round = state.quiz.rounds[play.roundIndex];
  const timed = isTimed(play.question) && state.endsAt !== null;
  const endsAt = state.endsAt ?? now;
  const limitMs = timed ? Math.max(endsAt - now, SWAP_MIN_MS) : null;
  const withSpare: BuffPlay = { ...buff, spare: { id: spare.id, presented: present(spare, round.shuffleOptions, rng), startedAt: now, limitMs } };
  const taken = withCurrentPlay(
    { ...state, buffSeq: buff.seq, sparesUsed: [...state.sparesUsed, spare.id] },
    { ...play, buffs: { ...play.buffs, [playerId]: withSpare } },
  );
  return timed ? grantOvertime(taken, playerId, Math.max(0, now + SWAP_MIN_MS - endsAt)) : taken;
}

/** Змінює баф гравця на поточному запитанні; без бафу стан без змін. */
export function withBuff(state: GameState, playerId: string, patch: Partial<BuffPlay>): GameState {
  const play = state.plays[state.questionIndex];
  const buff = buffOf(play, playerId);
  if (play === undefined || buff === null) return state;
  return withCurrentPlay(state, { ...play, buffs: { ...play.buffs, [playerId]: { ...buff, ...patch } } });
}

/**
 * Друга спроба на першій відповіді: неправильна відкриває стадію again, часткова — choice; запис не робиться.
 * null — перша відповідь іде в запис як завжди (немає бафу retry на стадії armed або відповідь правильна).
 */
export function holdFirstTry(state: GameState, playerId: string, record: AnswerRecord): GameState | null {
  const buff = buffOf(state.plays[state.questionIndex], playerId);
  if (buff?.retry !== 'armed' || record.accuracy >= 1) return null;
  return withBuff(state, playerId, { retry: record.accuracy <= 0 ? 'again' : 'choice', first: record });
}

/** Перша відповідь зарахована або друга надіслана: стадія done. Без бафу retry стан без змін. */
export function finishRetry(state: GameState, playerId: string): GameState {
  const buff = buffOf(state.plays[state.questionIndex], playerId);
  return buff?.retry === 'armed' || buff?.retry === 'again' || buff?.retry === 'choice'
    ? withBuff(state, playerId, { retry: 'done', first: null })
    : state;
}

/** Після часткової першої відповіді (стадія choice): keep — записати першу; інакше стадія again. Інакше wrong_phase. */
export function chooseRetry(state: GameState, playerId: string, keep: boolean, now: number): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  const buff = buffOf(play, playerId);
  if (buff?.kind !== 'retry' || buff.retry !== 'choice' || buff.first === null) return fail('wrong_phase');
  if (timeOverFor(state, play, playerId, now)) return fail('time_over');
  if (!keep) return ok(withBuff(state, playerId, { retry: 'again' }));
  const kept = finishRetry(withRecord(state, playerId, buff.first), playerId);
  // На полі зарахована відповідь одразу розкривається, як після «Прийняти».
  return ok(state.quiz.rounds[play.roundIndex].type === 'board' ? revealNow(kept) : autoLock(kept, now));
}

/** Для lockNow: у кого стадія again або choice і немає запису — перша відповідь стає записом. */
export function settleRetries(state: GameState): GameState {
  const play = state.plays[state.questionIndex];
  if (state.phase !== 'question' || play?.buffs === undefined) return state;
  let settled = state;
  for (const [playerId, buff] of Object.entries(play.buffs)) {
    const pending = buff.retry === 'again' || buff.retry === 'choice';
    if (!pending || buff.first === null || recordOf(state, state.questionIndex, playerId) !== undefined) continue;
    settled = finishRetry(withRecord(settled, playerId, buff.first), playerId);
  }
  return settled;
}

/**
 * Чи голосування гравця відкрите на мить now: етап question, не пізніше endsAt, гравець з бафом ще не відповів.
 * На паузі час стоїть: рахується мить паузи.
 */
export function voteOpen(state: GameState, askerId: string, now: number): boolean {
  const play = state.phase === 'question' ? state.plays[state.questionIndex] : undefined;
  const vote = buffOf(play, askerId)?.vote;
  if (play === undefined || vote === undefined) return false;
  const at = state.paused && state.pausedAt !== null ? state.pausedAt : now;
  return at <= vote.endsAt && !hasAnswered(state, play, askerId);
}

/** Підсумок голосування: counts — за id варіанта (boolean — "true"/"false"); guesses — для text, numeric і slider, не більше шести рядків. */
export function voteTally(
  question: Question,
  ballots: Record<string, Answer>,
): { cast: number; counts: Record<string, number>; guesses: { text: string; count: number }[] } {
  const counts: Record<string, number> = {};
  const groups = new Map<string, { text: string; count: number }>();
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  const guess = (key: string, text: string) => {
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { text, count: 1 });
    else group.count += 1;
  };
  const cast = Object.values(ballots);
  for (const ballot of cast) {
    if (ballot.type !== question.type) continue;
    if (ballot.type === 'single') bump(ballot.optionId);
    else if (ballot.type === 'multi') new Set(ballot.optionIds).forEach(bump);
    else if (ballot.type === 'boolean') bump(String(ballot.value));
    else if (ballot.type === 'text') guess(normalizeText(ballot.value), ballot.value.trim());
    else if (ballot.type === 'numeric') guess(String(ballot.value), String(ballot.value));
    else if (ballot.type === 'slider') guess(String(ballot.value), String(ballot.value));
  }
  // Map зберігає порядок першого голосу, а сортування стабільне: рівні йдуть за першим голосом.
  const guesses = [...groups.values()].sort((a, b) => b.count - a.count).slice(0, MAX_GUESSES);
  return { cast: cast.length, counts, guesses };
}

/** Голос за гравця з бафом audience: голос — відповідь того самого типу, що й запитання; один на голосування. */
export function castVote(state: GameState, voterId: string, askerId: string, answer: Answer, now: number): Result {
  if (!state.players.some((p) => p.id === voterId)) return fail('not_found');
  if (state.phase !== 'question') return fail('wrong_phase');
  if (state.paused) return fail('paused');
  const play = state.plays[state.questionIndex];
  const buff = buffOf(play, askerId);
  if (buff?.kind !== 'audience' || buff.vote === undefined) return fail('not_found');
  if (!canVote(state, voterId, askerId)) return fail('vote_denied');
  if (!voteOpen(state, askerId, now)) return fail('vote_closed');
  if (Object.hasOwn(buff.vote.ballots, voterId)) return fail('already_answered');
  if (answer.type !== play.question.type) return fail('type_mismatch');
  return ok(withBuff(state, askerId, { vote: { ...buff.vote, ballots: { ...buff.vote.ballots, [voterId]: answer } } }));
}

/** Відповідь ведучого на запит підказки: text — підказка текстом, null — «Підказав уголос». Пауза не заважає. */
export function giveHint(state: GameState, playerId: string, text: string | null): Result {
  if (state.phase !== 'question') return fail('wrong_phase');
  const hint = buffOf(state.plays[state.questionIndex], playerId)?.hint;
  // Немає бафу hint, що чекає: уже підказано або підказка з редактора.
  if (hint === undefined || hint.text !== null || hint.aloud) return fail('not_found');
  return ok(withBuff(state, playerId, { hint: { text, aloud: text === null } }));
}

/** Після паузи: endsAt голосувань і startedAt запасних поточного запитання зсуваються на shiftMs. */
export function shiftBuffClocks(state: GameState, shiftMs: number): GameState {
  const play = state.plays[state.questionIndex];
  if (play?.buffs === undefined || shiftMs === 0) return state;
  const shifted = (buff: BuffPlay): BuffPlay => ({
    ...buff,
    ...(buff.vote === undefined ? {} : { vote: { ...buff.vote, endsAt: buff.vote.endsAt + shiftMs } }),
    ...(buff.spare === undefined ? {} : { spare: { ...buff.spare, startedAt: buff.spare.startedAt + shiftMs } }),
  });
  const buffs = Object.fromEntries(Object.entries(play.buffs).map(([id, buff]) => [id, shifted(buff)]));
  return withCurrentPlay(state, { ...play, buffs });
}

/** Вилучений гравець зникає з голосів усіх голосувань запитання. */
export function dropBallots(buffs: Record<string, BuffPlay>, playerId: string): Record<string, BuffPlay> {
  const dropped = (buff: BuffPlay): BuffPlay => {
    if (buff.vote === undefined || !Object.hasOwn(buff.vote.ballots, playerId)) return buff;
    const { [playerId]: _ballot, ...ballots } = buff.vote.ballots;
    return { ...buff, vote: { ...buff.vote, ballots } };
  };
  return Object.fromEntries(Object.entries(buffs).map(([id, buff]) => [id, dropped(buff)]));
}

/** 50/50: fiftyCount разів випадковий неправильний варіант з тих, що лишилися. */
function pickRemoved(question: Question, rng: Rng): string[] {
  const pool = wrongOptions(question);
  const removed: string[] = [];
  for (let i = fiftyCount(question); i > 0; i -= 1) removed.push(...pool.splice(Math.floor(rng() * pool.length), 1));
  return removed;
}

/** Для withRecord: подвійні (+ ×2) і щит (− → 0), позначки buff і spare. Вхід — запис без бафу. */
export function applyBuff(record: AnswerRecord, buff: BuffPlay | null): AnswerRecord {
  const { buff: _stale, spare: _staleSpare, ...raw } = record;
  if (buff === null) return raw;
  const doubled = buff.kind === 'double' && raw.basePoints > 0;
  const shielded = buff.kind === 'shield' && raw.basePoints < 0;
  const basePoints = doubled ? raw.basePoints * 2 : shielded ? 0 : raw.basePoints;
  const spare = buff.kind === 'swap' && buff.spare !== undefined ? { spare: buff.spare.id } : {};
  return { ...raw, basePoints, points: basePoints + raw.streakBonus, buff: buff.kind, ...spare };
}

/** Етапи, на яких значки бафів поточного запитання ще видно. */
const TAGGED: Phase[] = ['question', 'locked', 'reveal'];

/** Хто який баф узяв на поточне запитання, у порядку гравців; поза question, locked і reveal — []. */
export function currentBuffs(state: GameState): BuffTag[] {
  const play = state.plays[state.questionIndex];
  if (!TAGGED.includes(state.phase) || play === undefined) return [];
  return state.players.flatMap((p) => {
    const buff = buffOf(play, p.id);
    return buff === null ? [] : [{ playerId: p.id, nickname: p.nickname, kind: buff.kind }];
  });
}

/**
 * Останній узятий баф у грі — з найбільшим seq серед бафів, що лишилися в журналі.
 * questionIndex — номер його запитання в раунді, як questionIndex зрізу: екрани показують сповіщення лише на тому ж запитанні.
 * Баф з іншого раунду — null: номери в різних раундах збігаються.
 */
export function lastBuff(state: GameState): BuffNotice | null {
  let last: { notice: Omit<BuffNotice, 'questionIndex'>; index: number } | null = null;
  for (const [index, play] of state.plays.entries()) {
    for (const p of state.players) {
      const buff = buffOf(play, p.id);
      if (buff !== null && (last === null || buff.seq > last.notice.seq)) {
        last = { notice: { seq: buff.seq, at: buff.at, playerId: p.id, nickname: p.nickname, kind: buff.kind }, index };
      }
    }
  }
  if (last === null) return null;
  const { notice, index } = last;
  const roundIndex = state.plays[index].roundIndex;
  if (roundIndex !== state.roundIndex) return null;
  const questionIndex = state.plays.slice(0, index + 1).filter((play) => play.roundIndex === roundIndex).length - 1;
  return { ...notice, questionIndex };
}
