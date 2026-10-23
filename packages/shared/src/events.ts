import { z } from 'zod';
import { answerSchema, type Answer } from './answer';
import { BUFF_KINDS, DEBUFF_KINDS, type ErrorCode } from './game';
import { LIMITS } from './quiz';
import { UNSTORABLE, isStorable } from './text';
import type { GameView } from './views';

export type Role = 'host' | 'stage' | 'player';

export type ServerErrorCode = 'unauthorized' | 'forbidden' | 'invalid_payload' | 'game_not_found';

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
export const timeSchema = z.object({ seconds: z.union([z.literal(-15), z.literal(15)]) });
export const pickSchema = z.object({ cellId: z.string().min(1).max(64) });
/** allIn — «Ва-банк»: ставиться вся межа, amount тоді ігнорується. */
export const wagerSchema = z.object({ amount: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), allIn: z.boolean().optional() });
export const orderSchema = z.object({ playerIds: z.array(playerId).max(LIMITS.maxPlayers) });
export const guessSchema = z.object({ word: z.string().max(LIMITS.chainWord).refine(isStorable, UNSTORABLE) });
const id64 = z.string().min(1).max(64).refine(isStorable, UNSTORABLE);
/** Хід сортування: слово з поточної картки в категорію; перевіряє рушій. */
export const sortSchema = z.object({ wordId: id64, categoryId: id64 });
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
/** Дебаф від ведучого. */
export const debuffSchema = z.object({ playerId, kind: z.enum(DEBUFF_KINDS) });
/** Баф, який гравець бере на поточне запитання. */
export const buffSchema = z.object({ kind: z.enum(BUFF_KINDS) });
/** Друга спроба після часткової першої: keep — залишити першу, інакше ще спроба. */
export const retrySchema = z.object({ keep: z.boolean() });
export const undebuffSchema = z.object({ playerId });
/** Оголосити дуель суперникові. */
export const declareSchema = z.object({ opponentId: playerId });
/** Категорія дуелі. */
export const duelPickSchema = z.object({ categoryId: id64 });
/** Відповідь дуелянта; перевіряє рушій, як у типі text. */
export const duelAnswerSchema = z.object({
  text: z.string().trim().min(1).max(LIMITS.answerText).refine(isStorable, UNSTORABLE),
});
export const joinSchema = z.object({ nickname: z.string().max(100).refine(isStorable, UNSTORABLE) });

export interface ClientToServerEvents {
  'player:answer': (answer: Answer, ack: Ack) => void;
  'player:guess': (payload: z.infer<typeof guessSchema>, ack: Ack) => void;
  'player:hint': (ack: Ack) => void;
  'player:sort': (payload: z.infer<typeof sortSchema>, ack: Ack) => void;
  /** Узяти баф на поточне запитання. */
  'player:buff': (payload: z.infer<typeof buffSchema>, ack: Ack) => void;
  /** Вибір після часткової першої відповіді другої спроби. */
  'player:retry': (payload: z.infer<typeof retrySchema>, ack: Ack) => void;
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
  /** Наслати дебаф: спрацює в наступному запитанні, у якому гравець відповідає з телефона. */
  'host:debuff': (payload: z.infer<typeof debuffSchema>, ack: Ack) => void;
  /** Скасувати дебаф, що ще чекає. */
  'host:undebuff': (payload: z.infer<typeof undebuffSchema>, ack: Ack) => void;
  'host:judge': (payload: z.infer<typeof judgeSchema>, ack: Ack) => void;
  'host:name': (payload: z.infer<typeof nameSchema>, ack: Ack) => void;
  'host:time': (payload: z.infer<typeof timeSchema>, ack: Ack) => void;
  'host:accept': (payload: z.infer<typeof pendingSchema>, ack: Ack) => void;
  'host:repick': (payload: z.infer<typeof pendingSchema>, ack: Ack) => void;
  'host:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:order': (payload: z.infer<typeof orderSchema>, ack: Ack) => void;
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
}

export interface StateMeta {
  /** Час сервера на момент надсилання, для поправки годинника клієнта. */
  serverNow: number;
  hostOnline: boolean;
}

export interface ServerToClientEvents {
  /** Повний зріз стану для ролі цього з'єднання. */
  state: (view: GameView, meta: StateMeta) => void;
  closed: (reason: CloseReason) => void;
}
