import type { ClientToServerEvents } from '@quiz/shared';

/** index — з list_repeat (27c): номер уже знайденого пункту; з moreless_stale (28a): done сервера — як в AckResult. */
export type SendResult = { ok: true } | { ok: false; error: string; index?: number };

/** Надсилає подію на сервер і чекає на підтвердження. */
export type Send = (event: keyof ClientToServerEvents, payload?: unknown) => Promise<SendResult>;
