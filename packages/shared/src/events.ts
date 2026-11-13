import { z } from 'zod';
import { answerSchema, type Answer } from './answer';
import { draftValueSchema, type HostDrafts } from './drafts';
import { APPEAL_REASONS } from './appeal';
import { AWAY_REPORT_MAX_MS } from './away';
import { BUFF_KINDS, DEBUFF_KINDS, type ErrorCode } from './game';
import { DRAWING_ERASER, DRAWING_SCALE, DRAWING_WIDTHS, type DrawOp, type DrawingEvent } from './drawing';
import { LIFELINES, LIMITS, MORELESS_SIDES } from './quiz';
import { DOOR_COUNT } from './survival';
import { MELODY_STEP_COUNT } from './melody';
import { MEMORY_MAX_CELLS } from './memory';
import { SPOT_MAX_WIDTH, SPOT_MIN_WIDTH } from './spotdiff';
import { RESUME_POINTS_MAX } from './resume';
import type { Reaction, ReactionItem } from './reactions';
import { perkSchema } from './levels';
import { likeSchema } from './likes';
import { ANSWERER_SCOPES, TEAM_FORMS } from './teams';
import { UNSTORABLE, isStorable } from './text';
import { entryFields } from './lobby';
import type { GameView } from './views';

export type Role = 'host' | 'stage' | 'player';

/** internal (30a) — обробник події сервера впав; стан гри лишився тим, що був до події. rate_limited (30a) — вичерпано загальний ліміт подій сокета. */
export type ServerErrorCode = 'unauthorized' | 'forbidden' | 'invalid_payload' | 'game_not_found' | 'restarting' | 'internal' | 'rate_limited';

/** index — з list_repeat (27c): номер уже знайденого пункту (від 1); з moreless_stale (28a): скільки порівнянь сервер уже має (done). */
export type AckResult = { ok: true } | { ok: false; error: ErrorCode | ServerErrorCode; index?: number };
export type Ack = (result: AckResult) => void;

/** saved — гру збережено (13b); released — ведучий звільнив місце збереженої гри (13b). */
export type CloseReason = 'kicked' | 'expired' | 'saved' | 'released';

export const socketAuthSchema = z.object({
  code: z.string().min(1).max(16),
  role: z.enum(['host', 'stage', 'player']),
  token: z.string().min(1).max(128),
});
export type SocketAuth = z.infer<typeof socketAuthSchema>;

const playerId = z.string().min(1).max(64);
export const overrideSchema = z.object({ playerId, grade: z.enum(['correct', 'partial', 'wrong']) });
/** Продовжити гру (12r): стартовий раунд і бали учасників. */
export const resumeSchema = z
  .object({
    roundIndex: z.number().int().min(0).max(LIMITS.maxRounds - 1),
    points: z
      .record(playerId, z.number().int().min(-RESUME_POINTS_MAX).max(RESUME_POINTS_MAX))
      .refine((points) => Object.keys(points).length <= LIMITS.maxPlayers),
  })
  .strict();
/** host:start: без даних — звичайний старт; resume — продовжити гру (12r). */
export const startSchema = z.object({ resume: resumeSchema.optional() }).strict();
export const kickSchema = z.object({ playerId });
export const judgeSchema = z.object({ playerId, correct: z.boolean() });
/** «Прийняти» й «Перевибрати» називають гравця, чия відповідь чекає: інакше подвійний дотик зачепить наступну. */
export const pendingSchema = z.object({ playerId });
/** Команда звуку від пульта; назва не audioSchema, щоб не плутати зі схемою аудіо запитання. */
export const audioCommandSchema = z.object({ action: z.enum(['replay', 'stop']) });
export const timeSchema = z.object({ seconds: z.union([z.literal(-15), z.literal(15)]) });
export const pickSchema = z.object({ cellId: z.string().min(1).max(64) });
/** allIn — «Ва-банк»: ставиться вся межа, amount тоді ігнорується. */
export const wagerSchema = z.object({ amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), allIn: z.boolean().optional() });
export const orderSchema = z.object({ playerIds: z.array(playerId).max(LIMITS.maxPlayers) });
export const guessSchema = z.object({ word: z.string().max(LIMITS.chainWord).refine(isStorable, UNSTORABLE) });
/** Хід «Словесної драбини» (26c): слово, як його ввели; ключ і перевірки — у рушії. */
export const wordLadderWordSchema = z.object({ word: z.string().max(LIMITS.wordLadderWord).refine(isStorable, UNSTORABLE) });
/** Слово «Списку на час» (27c): enter — підтверджено Enter, лише такий промах вважається словом не зі списку. */
/** «Список на час» (27c): скільки слів на секунду приймає сервер від людини — живому набору (перевірка після паузи 400 мс і Enter) досить, перебору словника — ні. */
export const LIST_WORDS_PER_SECOND = 6;
export const timedListWordSchema = z.object({ word: z.string().max(LIMITS.listWord).refine(isStorable, UNSTORABLE), enter: z.boolean() });
/** Слово «Слів з літер» (27d), як його ввели; ключ і перевірки — у рушії. */
export const letterWordSchema = z.object({ word: z.string().max(LIMITS.letterWord).refine(isStorable, UNSTORABLE) });
/** «Більше чи менше» (28a): скільки виборів на секунду приймає сервер від людини; index — номер порівняння, на яке відповідає телефон. */
export const MORELESS_PICKS_PER_SECOND = 5;
/**
 * «Головоломки» (28d): клітинок в одній події рахує LIMITS.puzzleBatch; значення (цифру чи літеру) перевіряє рушій.
 * questionIndex — номер запитання в поточному раунді, як у зрізі (view.questionIndex), не індекс plays; без верхньої межі,
 * застаріле відсікає puzzle_stale.
 */
export const PUZZLE_BATCHES_PER_SECOND = 6;
export const puzzleFillSchema = z
  .object({
    questionIndex: z.number().int().nonnegative(),
    cells: z
      .array(z.object({ i: z.number().int().min(0).max(143), v: z.string().max(2) }).strict())
      .min(1)
      .max(LIMITS.puzzleBatch),
  })
  .strict();
/**
 * «Пазл» (29c): поставити шматочок (лівий верхній кут ядра в клітинках рамки, rot — чверті оберту) і «тримаю» (командна гра).
 * questionIndex — номер запитання в поточному раунді, як у зрізі; без верхньої межі, застаріле відсікає jigsaw_stale.
 */
export const JIGSAW_MOVES_PER_SECOND = 8;
/** Скільки шматочок, який узяв учасник команди, заблокований для інших (мс), і як часто телефон повторює «тримаю». */
export const JIGSAW_HOLD_MS = 2000;
export const JIGSAW_HOLD_REFRESH_MS = 1000;
export const jigsawPlaceSchema = z
  .object({
    questionIndex: z.number().int().nonnegative(),
    piece: z.number().int().min(0).max(35),
    x: z.number().finite().min(-20).max(20),
    y: z.number().finite().min(-20).max(20),
    rot: z.number().int().min(0).max(3),
  })
  .strict();
export const jigsawHoldSchema = z.object({ questionIndex: z.number().int().nonnegative(), piece: z.number().int().min(0).max(35) }).strict();
/**
 * «Знайди відмінності» (29d): тап (x, y — частки картинки, по якій тапнули) при ширині width (CSS px) на екрані гравця.
 * questionIndex — номер запитання в поточному раунді, як у зрізі; без верхньої межі, застаріле відсікає spotdiff_stale.
 */
export const SPOTDIFF_TAPS_PER_SECOND = 6;
export const SPOTDIFF_MISSES = 3;
export const SPOTDIFF_FREEZE_MS = 1000;
export const SPOTDIFF_MAX_FREEZE_MS = 5000;
/** Заморозка після misses промахів підряд: 0 до SPOTDIFF_MISSES, далі 1 с, 2 с, 3 с… і не більше SPOTDIFF_MAX_FREEZE_MS. */
export function spotdiffFreezeMs(misses: number): number {
  if (misses < SPOTDIFF_MISSES) return 0;
  return Math.min(SPOTDIFF_MAX_FREEZE_MS, (misses - SPOTDIFF_MISSES + 1) * SPOTDIFF_FREEZE_MS);
}
export const spotdiffTapSchema = z
  .object({
    questionIndex: z.number().int().nonnegative(),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().min(SPOT_MIN_WIDTH).max(SPOT_MAX_WIDTH),
  })
  .strict();
/**
 * «Пам'ять» (29f): відкрити клітинку cell (cols·rows ≤ 20). questionIndex — номер запитання в поточному раунді, як у зрізі; без верхньої межі, застаріле відсікає memory_stale.
 * Непара показується MEMORY_SHOW_MS, у команді хід без другої картки спливає за MEMORY_TURN_MS.
 */
export const MEMORY_FLIPS_PER_SECOND = 4;
export const MEMORY_SHOW_MS = 1000;
export const MEMORY_TURN_MS = 5000;
export const memoryFlipSchema = z.object({ questionIndex: z.number().int().nonnegative(), cell: z.number().int().min(0).max(MEMORY_MAX_CELLS - 1) }).strict();
/** «Мелодія за нотами» (29e): відкрити шматок step (1…5). questionIndex — номер запитання в поточному раунді, як у зрізі; без верхньої межі, застаріле відсікає melody_stale. */
export const melodyOpenSchema = z.object({ questionIndex: z.number().int().nonnegative(), step: z.number().int().min(1).max(MELODY_STEP_COUNT) }).strict();
export const puzzleDoneSchema = z.object({ questionIndex: z.number().int().nonnegative() }).strict();
export const moreLessPickSchema = z.object({ index: z.number().int().min(0).max(LIMITS.maxMoreLessPairs - 1), pick: z.enum(MORELESS_SIDES) });
/** «Малюнок» (28c): операцій малювання на секунду від художника (пакет кожні 80 мс + «крок назад»), спроб вгадати на секунду, запитів повного малюнка на секунду з сокета. */
export const DRAW_OPS_PER_SECOND = 25;
export const DRAW_GUESSES_PER_SECOND = 2;
export const DRAW_SYNC_PER_SECOND = 2;
const drawCoords = z
  .array(z.number().int().min(0).max(DRAWING_SCALE))
  .min(2)
  .max(LIMITS.drawBatch * 2)
  .refine((p) => p.length % 2 === 0);
export const drawOpSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('begin'), c: z.number().int().min(0).max(DRAWING_ERASER), w: z.number().int().min(0).max(DRAWING_WIDTHS.length - 1), p: drawCoords }).strict(),
  z.object({ op: z.literal('more'), index: z.number().int().min(0).max(LIMITS.maxStrokes - 1), p: drawCoords }).strict(),
  z.object({ op: z.literal('undo') }).strict(),
  z.object({ op: z.literal('clear') }).strict(),
]);
export const drawGuessSchema = z.object({ text: z.string().max(LIMITS.drawGuess).refine(isStorable, UNSTORABLE) });
/** Перевірка набору редактора словником (27d): POST /api/letterwords/check. */
export const letterCheckSchema = z.object({ letters: z.string().max(40) });
/** Перевірка шляху редактора словником (26c): POST /api/wordladder/check. */
export const wordLadderCheckSchema = z.object({
  words: z.array(z.string().max(LIMITS.wordLadderWord).refine(isStorable, UNSTORABLE)).min(1).max(LIMITS.maxWordLadderSteps + 1),
});
const id64 = z.string().min(1).max(64).refine(isStorable, UNSTORABLE);
/** Хід сортування: слово з поточної картки в категорію; перевіряє рушій. */
export const sortSchema = z.object({ wordId: id64, categoryId: id64 });
/** Нахил картки сортування (11d): категорія, у бік якої тягнуть (null — відпустив без ходу), і наскільки. */
export const sortTiltSchema = z.object({ wordId: id64, categoryId: id64.nullable(), amount: z.number().min(0).max(1) });
/** Нахил для глядачів (11d): sorterId — учасник гри (гравець або команда), seq — ходів на мить нахилу. */
export interface SortTilt {
  sorterId: string;
  wordId: string;
  toward: string | null;
  amount: number;
  seq: number;
}
/** Вибір плиток стіни: позиції в порядку показу (10d). */
export const wallSchema = z.object({ tiles: z.array(z.number().int().min(0).max(15)).min(3).max(4) });
/** Вигадка блефу (10f); правду відхиляє рушій. */
export const lieSchema = z.object({ text: z.string().max(LIMITS.bluffLie).refine(isStorable, UNSTORABLE) });
/** Вибір варіанта блефу або варіант, який прибирає ведучий (10f). */
export const bluffOptionSchema = z.object({ optionId: z.string().min(1).max(16).refine(isStorable, UNSTORABLE) });
/** «Ва-банк»: «Забрати» (true) чи «Далі» (false). */
export const wipeoutSchema = z.object({ take: z.boolean() });
/** «Мільйонер»: учасник бере підказку драбини (10i). */
export const lifelineSchema = z.object({ kind: z.enum(LIFELINES) });
/** «Мільйонер»: «Забрати гроші» (take true) чи «Граю далі» (10i). */
export const ladderDecideSchema = z.object({ take: z.boolean() });
/** «Мільйонер»: ведучий вибирає учасника на заставці раунду (10i). */
export const ladderPickSchema = z.object({ playerId });
/** «Вибування»: відповідь на питання на виживання (10h). */
export const trialSchema = z.object({ answer: answerSchema });
/** «Вибування»: вибір дверей удачі (10h). */
export const doorSchema = z.object({ door: z.number().int().min(0).max(DOOR_COUNT - 1) });
/** Сховати чи повернути слово «хмари» (10d). */
export const cloudHideSchema = z.object({ key: z.string().min(1).max(LIMITS.cloudWord * 2).refine(isStorable, UNSTORABLE), hidden: z.boolean() });
/** Варіант, названий уголос на усній клітинці; null знімає позначку. */
export const nameSchema = z.object({ answer: answerSchema.nullable() });
/** Бали від ведучого: ціле, не нуль, за модулем не більше LIMITS.maxAdjust. */
export const adjustSchema = z.object({
  playerId,
  points: z
    .number()
    .int()
    .min(-LIMITS.maxAdjust)
    .max(LIMITS.maxAdjust)
    .refine((n) => n !== 0),
});
/** Ціль скасування балів (12a): відповідь гравця на запитання, коригування (чи «Повернути»), усе за запитання, усе за раунд. */
export const undoTargetSchema = z.union([
  z.object({ question: z.number().int().min(0), playerId }),
  z.object({ seq: z.number().int().min(1) }),
  z.object({ question: z.number().int().min(0) }),
  z.object({ round: z.number().int().min(0) }),
]);
export type HostUndoTarget = z.infer<typeof undoTargetSchema>;
export const undoSchema = z.object({ target: undoTargetSchema });
/** Дебаф від ведучого. */
export const debuffSchema = z.object({ playerId, kind: z.enum(DEBUFF_KINDS) });
/** Баф гравця; targetId — лише для «Підглянути» (12h): у кого підглянути (у командній грі — команда). */
export const buffSchema = z.object({ kind: z.enum(BUFF_KINDS), targetId: playerId.optional() });
/** Друга спроба після часткової першої: keep — залишити першу, інакше ще спроба. */
export const retrySchema = z.object({ keep: z.boolean() });
/** Купити дебаф для суперника (9c): ціль і вид; покупець — з ідентичності сокета. */
export const buyDebuffSchema = z.object({ targetId: playerId, kind: z.enum(DEBUFF_KINDS) });
export const undebuffSchema = z.object({ playerId });
/** Голос залу за гравця з бафом «Запитання в залі». */
export const voteSchema = z.object({ askerId: playerId, answer: answerSchema });
/** Підказка ведучого: text — текстом, null — «Підказав уголос». */
export const hintSchema = z.object({
  playerId,
  text: z.string().trim().min(1).max(LIMITS.hintText).refine(isStorable, UNSTORABLE).nullable(),
});
/** Оголосити дуель суперникові. */
export const declareSchema = z.object({ opponentId: playerId });
/** Категорія дуелі. */
export const duelPickSchema = z.object({ categoryId: id64 });
/** Відповідь дуелянта; перевіряє рушій, як у типі text. */
export const duelAnswerSchema = z.object({
  text: z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE),
});
/** «Правда про гравця» (28b): факт про себе; рушій зводить пробіли й міряє довжину (порожній прибирає). */
export const truthFactSchema = z.object({ text: z.string().max(LIMITS.truthText * 2).refine(isStorable, UNSTORABLE) });
/** «Квест із кодом» (29g): спроба коду — сирий рядок, нормалізує й перевіряє рушій. */
export const questCodeSchema = z.object({ code: z.string().max(LIMITS.maxQuestInput) }).strict();
/** Ведучий ховає чи повертає факт гравця (28b). */
export const truthHideSchema = z.object({ playerId, hidden: z.boolean() });
/** Командна гра (10j): учасник вибирає команду в лобі. */
export const teamPickSchema = z.object({ teamId: playerId });
/** Капітан вибирає дуелянта команди. */
export const duelistSchema = z.object({ memberId: playerId });
/** Вибір відповідача (12g): людина з команди капітана (null — без вибору: капітан чи черга) і обсяг. */
export const pickAnswererSchema = z.object({ memberId: playerId.nullable(), scope: z.enum(ANSWERER_SCOPES) });
/** Чернетка: поточний стан вводу до «Надіслати» (10j капітан, 12b будь-хто); null — поле порожнє. */
export const draftSchema = z.object({ draft: draftValueSchema.nullable() });
/**
 * Вихід із гри (12e): away true — пішов; false — повернувся, ms — скільки тривав вихід за годинником телефона,
 * sinceReturnMs — скільки мс тому телефон знову став видимим (повернувся без зв'язку й шле звіт лише тепер; інакше 0 чи немає).
 */
export const awaySchema = z.object({
  away: z.boolean(),
  ms: z.number().int().min(0).max(AWAY_REPORT_MAX_MS).optional(),
  sinceReturnMs: z.number().int().min(0).max(AWAY_REPORT_MAX_MS).optional(),
});
/** Апеляція (12f): підстава; хто оскаржує — з ідентичності сокета (у командній грі — капітан). */
export const appealSchema = z.object({ reason: z.enum(APPEAL_REASONS) });
/** Голос в апеляції (12f): номер апеляції (щоб голос не впав на новішу) і «так» / «ні»; змінити можна до кінця. */
export const appealVoteSchema = z.object({ appealId: z.number().int().min(1).max(1_000_000), yes: z.boolean() });
/** Пульт: увімкнути чи вимкнути живі вибори (12b). */
export const liveWatchSchema = z.object({ on: z.boolean() });
/** Ведучий: спосіб формування. */
export const teamFormSchema = z.object({ form: z.enum(TEAM_FORMS) });
/** Ведучий: перемістити учасника (teamId null — без команди). */
export const teamAssignSchema = z.object({ memberId: playerId, teamId: playerId.nullable() });
/** Ведучий: капітан команди. */
export const captainSchema = z.object({ teamId: playerId, memberId: playerId });
export const joinSchema = z.object({ nickname: z.string().max(100).refine(isStorable, UNSTORABLE), ...entryFields });

export interface ClientToServerEvents {
  'player:answer': (answer: Answer, ack: Ack) => void;
  'player:guess': (payload: z.infer<typeof guessSchema>, ack: Ack) => void;
  'player:hint': (ack: Ack) => void;
  /** «Словесна драбина» (26c): наступне слово й «Крок назад». */
  'player:wordladder': (payload: z.infer<typeof wordLadderWordSchema>, ack: Ack) => void;
  'player:wordladder-back': (ack: Ack) => void;
  'player:list': (payload: z.infer<typeof timedListWordSchema>, ack: Ack) => void;
  /** «Слова з літер» (27d): слово гравця (команди). */
  'player:letters': (payload: z.infer<typeof letterWordSchema>, ack: Ack) => void;
  /** «Більше чи менше» (28a): вибір гравця (відповідача команди) у порівнянні index; ack без правильності, moreless_stale — з done. */
  'player:moreless': (payload: z.infer<typeof moreLessPickSchema>, ack: Ack) => void;
  /** «Головоломки» (28d): пакет клітинок; ack — лише ok чи помилка (puzzle_stale, puzzle_done, puzzle_cell, puzzle_given, time_over, too_soon), без правильності. */
  'player:puzzle': (payload: z.infer<typeof puzzleFillSchema>, ack: Ack) => void;
  /** «Головоломки» (28d): кнопка «Готово» (безповоротна; у команді — за всіх). */
  'player:puzzle-done': (payload: z.infer<typeof puzzleDoneSchema>, ack: Ack) => void;
  /** «Пазл» (29c): шматочок поставлено; ack — лише ok чи помилка (jigsaw_stale, jigsaw_done, jigsaw_piece, jigsaw_placed, jigsaw_held, jigsaw_miss, time_over, too_soon). */
  'player:jigsaw': (payload: z.infer<typeof jigsawPlaceSchema>, ack: Ack) => void;
  /** «Пазл» (29c): учасник команди узяв шматочок; блок на JIGSAW_HOLD_MS. */
  'player:jigsaw-hold': (payload: z.infer<typeof jigsawHoldSchema>, ack: Ack) => void;
  /** «Знайди відмінності» (29d): тап; ack ok — влучання, інакше помилка (spotdiff_miss, spotdiff_freeze, spotdiff_frozen, spotdiff_found, spotdiff_stale, spotdiff_done, time_over, too_soon). */
  'player:spotdiff': (payload: z.infer<typeof spotdiffTapSchema>, ack: Ack) => void;
  /** «Пам'ять» (29f): відкрити клітинку; ack ok — прийнято, інакше помилка (memory_stale, memory_done, memory_cell, memory_wait, memory_busy, memory_matched, memory_open, time_over, too_soon). Вміст картки приходить лише зрізом. */
  'player:memory': (payload: z.infer<typeof memoryFlipSchema>, ack: Ack) => void;
  /** «Мелодія за нотами» (29e): відкрити шматок step; ack ok — прийнято (повтор відкритого теж), інакше помилка (melody_stale, melody_step, already_answered, type_mismatch, time_over, paused, wrong_phase). Звук приходить лише як джерело в зрізі. */
  'player:melody': (payload: z.infer<typeof melodyOpenSchema>, ack: Ack) => void;
  /** «Малюнок» (28c): операція художника; ack — лише ok чи помилка (drawing_stale — малюнок розійшовся, просіть draw:sync). */
  'player:draw': (payload: DrawOp, ack: Ack) => void;
  /** «Малюнок» (28c): спроба вгадати слово; ack — лише { ok: true } чи drawing_miss, слово й відстань не повертаються. */
  'player:draw-guess': (payload: z.infer<typeof drawGuessSchema>, ack: Ack) => void;
  /** Будь-яка роль: прошу повний малюнок поточного запитання (подією drawing { kind: 'sync' }). */
  'draw:sync': (ack: Ack) => void;
  /** «Хто я?» у власному темпі (12c): відкрити наступну підказку собі (у командній грі — команді). */
  'player:clue': (ack: Ack) => void;
  'player:sort': (payload: z.infer<typeof sortSchema>, ack: Ack) => void;
  /** Сортування: нахил картки, поки її тягнуть (11d); у стан гри не йде. */
  'player:sort-tilt': (payload: z.infer<typeof sortTiltSchema>, ack: Ack) => void;
  'player:wall': (payload: z.infer<typeof wallSchema>, ack: Ack) => void;
  /** Блеф: вигадка гравця (10f). */
  'player:lie': (payload: z.infer<typeof lieSchema>, ack: Ack) => void;
  /** Блеф: вибір варіанта (10f). */
  'player:bluff': (payload: z.infer<typeof bluffOptionSchema>, ack: Ack) => void;
  /** «Ва-банк»: рішення після розкриття (10g). */
  'player:wipeout': (payload: z.infer<typeof wipeoutSchema>, ack: Ack) => void;
  /** «Мільйонер»: підказка драбини (10i). */
  'player:lifeline': (payload: z.infer<typeof lifelineSchema>, ack: Ack) => void;
  /** «Мільйонер»: «Граю далі» чи «Забрати» (10i). */
  'player:ladder': (payload: z.infer<typeof ladderDecideSchema>, ack: Ack) => void;
  /** «Вибування»: відповідь на питання на виживання (10h). */
  'player:trial': (payload: z.infer<typeof trialSchema>, ack: Ack) => void;
  /** «Вибування»: вибір дверей удачі (10h). */
  'player:door': (payload: z.infer<typeof doorSchema>, ack: Ack) => void;
  /** Узяти баф на поточне запитання. */
  'player:buff': (payload: z.infer<typeof buffSchema>, ack: Ack) => void;
  /** Купити дебаф для суперника за бали. */
  'player:debuff': (payload: z.infer<typeof buyDebuffSchema>, ack: Ack) => void;
  /** Вибір після часткової першої відповіді другої спроби. */
  'player:retry': (payload: z.infer<typeof retrySchema>, ack: Ack) => void;
  /** Голос залу за гравця з бафом «Запитання в залі». */
  'player:vote': (payload: z.infer<typeof voteSchema>, ack: Ack) => void;
  'player:buzz': (ack: Ack) => void;
  'player:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  /** Гравець кидає свій кубик на заставці раунду поля. */
  'player:roll': (ack: Ack) => void;
  'player:wager': (payload: z.infer<typeof wagerSchema>, ack: Ack) => void;
  /** Оголосити дуель суперникові: раз за гру, суперник не відмовляється. */
  'player:duel': (payload: z.infer<typeof declareSchema>, ack: Ack) => void;
  /** Вибір категорії тим, хто оголосив дуель. */
  'player:duel-category': (payload: z.infer<typeof duelPickSchema>, ack: Ack) => void;
  'player:duel-answer': (payload: z.infer<typeof duelAnswerSchema>, ack: Ack) => void;
  /** «Правда про гравця»: написати чи змінити свій факт ('' — прибрати). */
  'player:truth': (payload: z.infer<typeof truthFactSchema>, ack: Ack) => void;
  /** «Квест із кодом» (29g): спроба коду будь-коли в раунді. Помилки: wrong_phase, paused, not_found, quest_closed, quest_solved, quest_tries, quest_length, quest_repeat. Неправильна спроба теж ok (вона згоріла). */
  'player:quest': (payload: z.infer<typeof questCodeSchema>, ack: Ack) => void;
  /** Командна гра: вибір команди в лобі (спосіб «гравці обирають самі»). */
  'player:team': (payload: z.infer<typeof teamPickSchema>, ack: Ack) => void;
  /** Командна гра: кидок кубика формування в лобі. */
  'player:team-roll': (ack: Ack) => void;
  /** Командна гра: капітан вибирає дуелянта команди. */
  'player:duelist': (payload: z.infer<typeof duelistSchema>, ack: Ack) => void;
  /** Командна гра (12g): капітан вибирає, хто відповідає з наступного запитання. */
  'player:pick-answerer': (payload: z.infer<typeof pickAnswererSchema>, ack: Ack) => void;
  /** Живий вибір до «Надіслати»: товаришам капітана (10j) і пульту з «наживо» (12b). */
  'player:draft': (payload: z.infer<typeof draftSchema>, ack: Ack) => void;
  /** Лайк (17a): бажаний стан запитання, вікторини, ведучого чи гравця. */
  'player:like': (payload: z.infer<typeof likeSchema>, ack: Ack) => void;
  /** Антигугл (12e): телефон пішов із гри чи повернувся; час рахує сервер. */
  'player:away': (payload: z.infer<typeof awaySchema>, ack: Ack) => void;
  /** Апеляція (12f): гравець (капітан) просить зал зарахувати відповідь чи зняти штраф за вихід. */
  'player:appeal': (payload: z.infer<typeof appealSchema>, ack: Ack) => void;
  /** Апеляція (12f): голос людини «так» / «ні»; імена голосів не бачить ніхто. */
  'player:appeal-vote': (payload: z.infer<typeof appealVoteSchema>, ack: Ack) => void;
  /** «Почати гру»; з даними — продовжити попередню гру (12r). */
  'host:start': (...args: [ack: Ack] | [payload: z.infer<typeof startSchema>, ack: Ack]) => void;
  'host:lock': (ack: Ack) => void;
  'host:next': (ack: Ack) => void;
  'host:pause': (ack: Ack) => void;
  'host:resume': (ack: Ack) => void;
  'host:end-round': (ack: Ack) => void;
  'host:end': (ack: Ack) => void;
  'host:override': (payload: z.infer<typeof overrideSchema>, ack: Ack) => void;
  'host:kick': (payload: z.infer<typeof kickSchema>, ack: Ack) => void;
  /** Зберегти гру й продовжити пізніше (13b). */
  'host:save': (ack: Ack) => void;
  /** Звільнити місце збереженої гри (13b): гравця відключено, бали лишаються. */
  'host:release': (payload: z.infer<typeof kickSchema>, ack: Ack) => void;
  /** Бали від ведучого: додати або зняти будь-яку цілу суму. */
  'host:adjust': (payload: z.infer<typeof adjustSchema>, ack: Ack) => void;
  /** Скасувати бали чи «Повернути» скасоване (12a). */
  'host:undo': (payload: z.infer<typeof undoSchema>, ack: Ack) => void;
  /** Пульт: увімкнути чи вимкнути живі вибори (12b); лише роль host. */
  'host:live-watch': (payload: z.infer<typeof liveWatchSchema>, ack: Ack) => void;
  /** Наслати дебаф: спрацює в наступному запитанні, у якому гравець відповідає з телефона. */
  'host:debuff': (payload: z.infer<typeof debuffSchema>, ack: Ack) => void;
  /** Скасувати дебаф, що ще чекає. */
  'host:undebuff': (payload: z.infer<typeof undebuffSchema>, ack: Ack) => void;
  /** Підказка гравцеві: текстом або «Підказав уголос» (text: null). */
  'host:hint': (payload: z.infer<typeof hintSchema>, ack: Ack) => void;
  /** «Мільйонер»: ведучий вибирає учасника (10i). */
  'host:ladder-pick': (payload: z.infer<typeof ladderPickSchema>, ack: Ack) => void;
  /** «Мільйонер»: ведучий вирішує замість учасника (10i). */
  'host:ladder-decide': (payload: z.infer<typeof ladderDecideSchema>, ack: Ack) => void;
  'host:judge': (payload: z.infer<typeof judgeSchema>, ack: Ack) => void;
  'host:name': (payload: z.infer<typeof nameSchema>, ack: Ack) => void;
  'host:time': (payload: z.infer<typeof timeSchema>, ack: Ack) => void;
  'host:accept': (payload: z.infer<typeof pendingSchema>, ack: Ack) => void;
  'host:repick': (payload: z.infer<typeof pendingSchema>, ack: Ack) => void;
  'host:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:order': (payload: z.infer<typeof orderSchema>, ack: Ack) => void;
  'host:cloud-hide': (payload: z.infer<typeof cloudHideSchema>, ack: Ack) => void;
  /** Блеф: прибрати образливу вигадку з вибору (10f). */
  'host:bluff-remove': (payload: z.infer<typeof bluffOptionSchema>, ack: Ack) => void;
  /** Блеф: відкрити всі варіанти одразу (10f). */
  'host:bluff-all': (ack: Ack) => void;
  /** «100 до 1»: відкрити всі рядки табло одразу. */
  'host:survey-all': (ack: Ack) => void;
  /** Почати кидки кубиків: кожен гравець кидає сам. */
  'host:dice': (ack: Ack) => void;
  /** Кинути за тих, хто в поточному турі ще не кинув. */
  'host:roll': (ack: Ack) => void;
  'host:skip': (ack: Ack) => void;
  /** Вибрати категорію дуелі за гравця. */
  'host:duel-category': (payload: z.infer<typeof duelPickSchema>, ack: Ack) => void;
  /** Пропустити запитання дуелі: не рахується, береться інше. */
  'host:duel-skip': (ack: Ack) => void;
  /** Скасувати оголошену чи поточну дуель. */
  'host:duel-cancel': (ack: Ack) => void;
  /** «До гри»: пропустити решту «Як грати». */
  'host:guide-skip': (ack: Ack) => void;
  /** «Хто я?» на усній клітинці: відкрити наступну підказку (10c). */
  'host:clue': (ack: Ack) => void;
  /** Командна гра: спосіб формування команд у лобі. */
  'host:team-form': (payload: z.infer<typeof teamFormSchema>, ack: Ack) => void;
  /** «Правда про гравця»: сховати чи повернути факт гравця. */
  'host:truth-hide': (payload: z.infer<typeof truthHideSchema>, ack: Ack) => void;
  /** Командна гра: перемістити учасника в команду або без команди. */
  'host:team-assign': (payload: z.infer<typeof teamAssignSchema>, ack: Ack) => void;
  /** Командна гра: розподілити випадково. */
  'host:team-deal': (ack: Ack) => void;
  /** Командна гра: почати кидки кубиків формування. */
  'host:team-dice': (ack: Ack) => void;
  /** Командна гра: кинути кубик за тих, хто ще не кинув. */
  'host:team-roll': (ack: Ack) => void;
  /** Командна гра: капітан команди. */
  'host:captain': (payload: z.infer<typeof captainSchema>, ack: Ack) => void;
  /** Звук поточного запитання: програти ще раз або зупинити (сцена, а без сцени — пульт). Годинник не змінюється. */
  'host:audio': (payload: z.infer<typeof audioCommandSchema>, ack: Ack) => void;
  /** «Нагороди гри» (12d): наступний слайд каруселі на сцені; лише finished і з нагородами. */
  'host:awards': (ack: Ack) => void;
  /** Реакція (13a): швидке емодзі чи стікер; лише між запитаннями, не частіше ніж раз на REACTION_GAP_MS. */
  'player:react': (payload: ReactionItem, ack: Ack) => void;
  /** Бонус рівня (15a): «+5 с» чи «Підказка рівня». */
  'player:perk': (payload: z.infer<typeof perkSchema>, ack: Ack) => void;
  /** Реакція ведучого (13a): лише справжній пульт. */
  'host:react': (payload: ReactionItem, ack: Ack) => void;
}

export interface StateMeta {
  /** Час сервера на момент надсилання, для поправки годинника клієнта. */
  serverNow: number;
  hostOnline: boolean;
  /** Чи відкрита сцена (є з'єднання ролі stage): без сцени звук грає пульт. */
  stageOnline: boolean;
}

export interface ServerToClientEvents {
  /** Повний зріз стану для ролі цього з'єднання. */
  state: (view: GameView, meta: StateMeta) => void;
  /** Команда звуку від ведучого; seq зростає в межах кімнати. Отримують лише сцена й пульт. */
  audio: (command: { action: 'replay' | 'stop'; seq: number }) => void;
  /** Дотик ведучого «Нагороди на сцені» (12d); seq зростає в межах кімнати. Отримують лише сцени. */
  awards: (step: { seq: number }) => void;
  /** Реакція (13a): усім ролям кімнати; стан гри той самий. */
  reaction: (reaction: Reaction) => void;
  /** «Малюнок» (28c): штрих чи повний знімок малюнка; усім ролям кімнати, стан гри той самий. */
  drawing: (event: DrawingEvent) => void;
  /** Нахил картки того, хто сортує (11d): лише там, де показ дозволено. */
  'sort:tilt': (tilt: SortTilt) => void;
  /** Живі вибори до «Надіслати» (12b): лише пультам з увімкненим «наживо», не частіше ніж раз на HOST_DRAFTS_MS. */
  'host:drafts': (batch: HostDrafts) => void;
  closed: (reason: CloseReason) => void;
  /** Сервер зупиняється (нова версія) або кімнату веде інший процес: перепідключитися з тим самим токеном. */
  restarting: () => void;
}
