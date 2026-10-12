import { z } from 'zod';
import type { Answer } from './answer';
import type { ErrorCode } from './game';
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
export const overrideSchema = z.object({ playerId, accepted: z.boolean() });
export const kickSchema = z.object({ playerId });
export const joinSchema = z.object({ nickname: z.string().max(100) });

export interface ClientToServerEvents {
  'player:answer': (answer: Answer, ack: Ack) => void;
  'host:start': (ack: Ack) => void;
  'host:lock': (ack: Ack) => void;
  'host:next': (ack: Ack) => void;
  'host:pause': (ack: Ack) => void;
  'host:resume': (ack: Ack) => void;
  'host:end': (ack: Ack) => void;
  'host:override': (payload: z.infer<typeof overrideSchema>, ack: Ack) => void;
  'host:kick': (payload: z.infer<typeof kickSchema>, ack: Ack) => void;
}

export interface ServerToClientEvents {
  /** Повний зріз стану для ролі цього з'єднання та поточний час сервера. */
  state: (view: GameView, serverNow: number) => void;
  closed: (reason: CloseReason) => void;
}
