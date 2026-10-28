import { z } from 'zod';
import { answerSchema, type Answer } from './answer';
import { draftValueSchema, type HostDrafts } from './drafts';
import { APPEAL_REASONS } from './appeal';
import { AWAY_REPORT_MAX_MS } from './away';
import { BUFF_KINDS, DEBUFF_KINDS, type ErrorCode } from './game';
import { LIFELINES, LIMITS } from './quiz';
import { DOOR_COUNT } from './survival';
import { TEAM_FORMS } from './teams';
import { UNSTORABLE, isStorable } from './text';
import type { GameView } from './views';

export type Role = 'host' | 'stage' | 'player';

export type ServerErrorCode = 'unauthorized' | 'forbidden' | 'invalid_payload' | 'game_not_found' | 'restarting';

export type AckResult = { ok: true } | { ok: false; error: ErrorCode | ServerErrorCode };
export type Ack = (result: AckResult) => void;

export type CloseReason = 'kicked' | 'expired';

export const socketAuthSchema = z.object({
  code: z.string().min(1).max(16),
  role: z.enum(['host', 'stage', 'player']),
  token: z.string().min(1).max(128),
});
export type SocketAuth = z.infer<typeof socketAuthSchema>;

const playerId = z.string().min(1).max(64);
export const overrideSchema = z.object({ playerId, grade: z.enum(['correct', 'partial', 'wrong']) });
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
/** Баф, який гравець бере на поточне запитання. */
export const buffSchema = z.object({ kind: z.enum(BUFF_KINDS) });
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
/** Командна гра (10j): учасник вибирає команду в лобі. */
export const teamPickSchema = z.object({ teamId: playerId });
/** Капітан вибирає дуелянта команди. */
export const duelistSchema = z.object({ memberId: playerId });
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
export const joinSchema = z.object({ nickname: z.string().max(100).refine(isStorable, UNSTORABLE) });

export interface ClientToServerEvents {
  'player:answer': (answer: Answer, ack: Ack) => void;
  'player:guess': (payload: z.infer<typeof guessSchema>, ack: Ack) => void;
  'player:hint': (ack: Ack) => void;
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
  /** Командна гра: вибір команди в лобі (спосіб «гравці обирають самі»). */
  'player:team': (payload: z.infer<typeof teamPickSchema>, ack: Ack) => void;
  /** Командна гра: кидок кубика формування в лобі. */
  'player:team-roll': (ack: Ack) => void;
  /** Командна гра: капітан вибирає дуелянта команди. */
  'player:duelist': (payload: z.infer<typeof duelistSchema>, ack: Ack) => void;
  /** Живий вибір до «Надіслати»: товаришам капітана (10j) і пульту з «наживо» (12b). */
  'player:draft': (payload: z.infer<typeof draftSchema>, ack: Ack) => void;
  /** Антигугл (12e): телефон пішов із гри чи повернувся; час рахує сервер. */
  'player:away': (payload: z.infer<typeof awaySchema>, ack: Ack) => void;
  /** Апеляція (12f): гравець (капітан) просить зал зарахувати відповідь чи зняти штраф за вихід. */
  'player:appeal': (payload: z.infer<typeof appealSchema>, ack: Ack) => void;
  /** Апеляція (12f): голос людини «так» / «ні»; імена голосів не бачить ніхто. */
  'player:appeal-vote': (payload: z.infer<typeof appealVoteSchema>, ack: Ack) => void;
  'host:start': (ack: Ack) => void;
  'host:lock': (ack: Ack) => void;
  'host:next': (ack: Ack) => void;
  'host:pause': (ack: Ack) => void;
  'host:resume': (ack: Ack) => void;
  'host:end-round': (ack: Ack) => void;
  'host:end': (ack: Ack) => void;
  'host:override': (payload: z.infer<typeof overrideSchema>, ack: Ack) => void;
  'host:kick': (payload: z.infer<typeof kickSchema>, ack: Ack) => void;
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
  /** Нахил картки того, хто сортує (11d): лише там, де показ дозволено. */
  'sort:tilt': (tilt: SortTilt) => void;
  /** Живі вибори до «Надіслати» (12b): лише пультам з увімкненим «наживо», не частіше ніж раз на HOST_DRAFTS_MS. */
  'host:drafts': (batch: HostDrafts) => void;
  closed: (reason: CloseReason) => void;
  /** Сервер зупиняється (нова версія) або кімнату веде інший процес: перепідключитися з тим самим токеном. */
  restarting: () => void;
}
