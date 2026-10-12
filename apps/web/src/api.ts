import type { Phase, Quiz } from '@quiz/shared';

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

async function request<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const response = await fetch(url, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 429) return { ok: false, error: 'too_many' };
    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (!response.ok || data === null) {
      return { ok: false, error: typeof data?.error === 'string' ? data.error : 'unknown' };
    }
    return { ok: true, ...(data as T) };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

export const createGame = (quiz: Quiz) =>
  request<{ gameId: string; code: string; hostToken: string; stageToken: string }>('/api/games', quiz);

export const checkCode = (code: string) =>
  request<{ phase: Phase; title: string }>(`/api/games/by-code/${encodeURIComponent(code)}`);

export const joinGame = (code: string, nickname: string) =>
  request<{ token: string; playerId: string }>(`/api/games/by-code/${encodeURIComponent(code)}/join`, { nickname });
