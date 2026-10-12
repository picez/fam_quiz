import type { ClientToServerEvents } from '@quiz/shared';

export type SendResult = { ok: true } | { ok: false; error: string };

/** Надсилає подію на сервер і чекає на підтвердження. */
export type Send = (event: keyof ClientToServerEvents, payload?: unknown) => Promise<SendResult>;
