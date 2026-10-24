import type { GameDetail, GameInvite, GameSummary, OwnProfile, Phase, PlayedGame, ProfileCard, ProfileUpdate, PublicProfile, Quiz, Versus } from '@quiz/shared';
import type { HostTokens } from './storage';

export type ApiResult<T> = ({ ok: true } & T) | { ok: false; error: string };
export type ApiData<T> = { ok: true; data: T } | { ok: false; error: string };

export interface Account {
  id: string;
  name: string;
  email: string;
}

export interface QuizSummary {
  id: string;
  title: string;
  description: string;
  questionCount: number;
  updatedAt: string;
}

interface Options {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: unknown;
}

/** Коди помилок бібліотеки авторизації, перекладені в наші. */
const AUTH_CODES: [prefix: string, code: string][] = [
  ['USER_ALREADY_EXISTS', 'email_taken'],
  ['INVALID_EMAIL_OR_PASSWORD', 'bad_credentials'],
  ['PASSWORD_TOO_SHORT', 'password_short'],
  ['INVALID_EMAIL', 'bad_email'],
  ['INVALID_ORIGIN', 'wrong_address'],
  ['MISSING_OR_NULL_ORIGIN', 'wrong_address'],
];

function errorCode(data: unknown): string {
  if (typeof data !== 'object' || data === null) return 'unknown';
  const { error, code } = data as Record<string, unknown>;
  if (typeof code === 'string') {
    const known = AUTH_CODES.find(([prefix]) => code.startsWith(prefix));
    if (known !== undefined) return known[1];
  }
  return typeof error === 'string' ? error : 'unknown';
}

async function send(url: string, init: RequestInit): Promise<ApiData<unknown>> {
  try {
    const response = await fetch(url, init);
    if (response.status === 429) return { ok: false, error: 'too_many' };
    const data: unknown = response.status === 204 ? {} : await response.json().catch(() => null);
    if (!response.ok || data === null) return { ok: false, error: errorCode(data) };
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

function call(url: string, options: Options): Promise<ApiData<unknown>> {
  const hasBody = options.body !== undefined;
  return send(url, {
    method: options.method ?? (hasBody ? 'POST' : 'GET'),
    headers: hasBody ? { 'content-type': 'application/json' } : undefined,
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });
}

/** Запит, відповідь якого є об'єктом: його поля лежать поруч з ok. */
async function request<T>(url: string, options: Options = {}): Promise<ApiResult<T>> {
  const result = await call(url, options);
  return result.ok ? { ok: true, ...(result.data as T) } : result;
}

/** Запит, відповідь якого потрібна цілою (наприклад, список). */
async function fetchData<T>(url: string, options: Options = {}): Promise<ApiData<T>> {
  const result = await call(url, options);
  return result.ok ? { ok: true, data: result.data as T } : result;
}

const quizUrl = (id: string) => `/api/quizzes/${encodeURIComponent(id)}`;
const gameUrl = (code: string) => `/api/games/by-code/${encodeURIComponent(code)}`;

export const me = () => request<Account>('/api/me');
export const signUp = (name: string, email: string, password: string) =>
  request<object>('/api/auth/sign-up/email', { body: { name, email, password } });
export const signIn = (email: string, password: string) =>
  request<object>('/api/auth/sign-in/email', { body: { email, password } });
// Порожнє тіло з типом JSON сервер відхиляє, тому надсилається порожній об'єкт.
export const signOut = () => request<object>('/api/auth/sign-out', { body: {} });
export const authProviders = () => request<{ google: boolean }>('/api/auth-providers');
/** Адреса сторінки входу Google; після входу браузер повернеться на next. */
export const googleSignIn = (next: string) =>
  request<{ url: string }>('/api/auth/sign-in/social', {
    body: { provider: 'google', callbackURL: next, errorCallbackURL: '/login' },
  });

export const listQuizzes = () => fetchData<QuizSummary[]>('/api/quizzes');
export const getQuiz = (id: string) => fetchData<Quiz>(quizUrl(id));
export const createQuiz = (quiz: Quiz) => request<{ id: string }>('/api/quizzes', { body: quiz });
export const updateQuiz = (id: string, quiz: Quiz) => request<{ id: string }>(quizUrl(id), { method: 'PUT', body: quiz });
export const deleteQuiz = (id: string) => request<object>(quizUrl(id), { method: 'DELETE' });

export const createGame = (quizId: string) =>
  request<{ gameId: string; code: string } & HostTokens>('/api/games', { body: { quizId } });
export const hostAccess = (code: string) => request<HostTokens>(`${gameUrl(code)}/host-access`);
export const checkCode = (code: string) => request<{ phase: Phase; title: string }>(gameUrl(code));
export const joinGame = (code: string, nickname: string) =>
  request<{ token: string; playerId: string }>(`${gameUrl(code)}/join`, { body: { nickname } });

/** Надсилає зображення до запитання; тілом запиту є сам файл. */
export async function uploadImage(file: File): Promise<ApiResult<{ url: string }>> {
  const result = await send('/api/uploads', { method: 'POST', headers: { 'content-type': file.type }, body: file });
  return result.ok ? { ok: true, ...(result.data as { url: string }) } : result;
}

/** Тип за розширенням для файлів, яким браузер не дав типу. */
function audioTypeByName(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
}

/** Надсилає аудіофайл до запитання; тілом запиту є сам файл. */
export async function uploadAudio(file: File): Promise<ApiResult<{ url: string }>> {
  const result = await send('/api/uploads/audio', { method: 'POST', headers: { 'content-type': file.type || audioTypeByName(file.name) }, body: file });
  return result.ok ? { ok: true, ...(result.data as { url: string }) } : result;
}

export const listGames = () => fetchData<GameSummary[]>('/api/games');
export const getGame = (id: string) => fetchData<GameDetail>(`/api/games/${encodeURIComponent(id)}`);
export const myHistory = () => fetchData<PlayedGame[]>('/api/me/history');

export const getMyProfile = () => fetchData<OwnProfile>('/api/me/profile');
export const saveMyProfile = (update: ProfileUpdate) => fetchData<ProfileCard>('/api/me/profile', { method: 'PUT', body: update });
export const getProfile = (id: string) => fetchData<PublicProfile>(`/api/profiles/${encodeURIComponent(id)}`);
export const getVersus = (id: string) => fetchData<Versus>(`/api/me/versus/${encodeURIComponent(id)}`);
export const findProfile = (nickname: string) => fetchData<ProfileCard>(`/api/profiles?nickname=${encodeURIComponent(nickname)}`);
export const follow = (id: string) => request<object>(`/api/me/friends/${encodeURIComponent(id)}`, { method: 'PUT' });
export const unfollow = (id: string) => request<object>(`/api/me/friends/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getMyFriends = () => fetchData<ProfileCard[]>('/api/me/friends');
export const inviteFriends = (code: string, userIds: string[]) => fetchData<{ invited: string[] }>(`${gameUrl(code)}/invites`, { body: { userIds } });
export const getRoomInvites = (code: string) => fetchData<{ invited: string[] }>(`${gameUrl(code)}/invites`);
export const getMyInvites = () => fetchData<GameInvite[]>('/api/me/invites');
export const dismissInvite = (code: string) => request<object>(`/api/me/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });
