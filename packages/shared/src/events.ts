import { z } from 'zod';
import type { Answer } from './answer';
import type { ErrorCode } from './game';
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
export const orderSchema = z.object({ playerIds: z.array(playerId).max(LIMITS.maxPlayers) });
export const joinSchema = z.object({ nickname: z.string().max(100).refine(isStorable, UNSTORABLE) });

export interface ClientToServerEvents {
  'player:answer': (answer: Answer, ack: Ack) => void;
  'player:buzz': (ack: Ack) => void;
  'player:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:start': (ack: Ack) => void;
  'host:lock': (ack: Ack) => void;
  'host:next': (ack: Ack) => void;
  'host:pause': (ack: Ack) => void;
  'host:resume': (ack: Ack) => void;
  'host:end-round': (ack: Ack) => void;
  'host:end': (ack: Ack) => void;
  'host:override': (payload: z.infer<typeof overrideSchema>, ack: Ack) => void;
  'host:kick': (payload: z.infer<typeof kickSchema>, ack: Ack) => void;
  'host:judge': (payload: z.infer<typeof judgeSchema>, ack: Ack) => void;
  'host:time': (payload: z.infer<typeof timeSchema>, ack: Ack) => void;
  'host:accept': (payload: z.infer<typeof pendingSchema>, ack: Ack) => void;
  'host:repick': (payload: z.infer<typeof pendingSchema>, ack: Ack) => void;
  'host:pick': (payload: z.infer<typeof pickSchema>, ack: Ack) => void;
  'host:order': (payload: z.infer<typeof orderSchema>, ack: Ack) => void;
  'host:roll': (ack: Ack) => void;
  'host:skip': (ack: Ack) => void;
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
