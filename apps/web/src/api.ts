import { AUDIO_LIMITS } from '@quiz/shared';
import type { NickLooks, PrizeContent, PrizeItem, PrizePlacesInfo, AchievementsPage, AutopilotCheck, ContinueResponse, FeedBadge, FeedPage, GameDetail, GameInvite, GameSummary, OwnProfile, Phase, PlayedGame, ProfileCard, ProfileUpdate, PublicProfile, Quiz, QuizLikes, ResumeOption, SlotsResponse, Versus } from '@quiz/shared';
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
  const { error, code, reason } = data as Record<string, unknown>;
  if (typeof code === 'string') {
    const known = AUTH_CODES.find(([prefix]) => code.startsWith(prefix));
    if (known !== undefined) return known[1];
  }
  // Сервер може пояснити 400: «invalid_payload» + reason; сторінка знає читабельний текст причини.
  if (error === 'invalid_payload' && typeof reason === 'string') return `${error}:${reason}`;
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
/** Лічильники лайків для редактора; збій чи не 200 — null, і редактор просто не показує сердець. */
export async function fetchQuizLikes(id: string): Promise<QuizLikes | null> {
  const result = await fetchData<QuizLikes>(`${quizUrl(id)}/likes`);
  return result.ok ? result.data : null;
}
export const createQuiz = (quiz: Quiz) => request<{ id: string }>('/api/quizzes', { body: quiz });
export const updateQuiz = (id: string, quiz: Quiz) => request<{ id: string }>(quizUrl(id), { method: 'PUT', body: quiz });
export const deleteQuiz = (id: string) => request<object>(quizUrl(id), { method: 'DELETE' });

export const createGame = (quizId: string) =>
  request<{ gameId: string; code: string } & HostTokens>('/api/games', { body: { quizId } });
export const getAutopilotCheck = (quizId: string) => request<AutopilotCheck>(`${quizUrl(quizId)}/autopilot`);
export const createAutopilotGame = (quizId: string, nickname: string) =>
  request<{ gameId: string; code: string; stageToken: string; token: string; playerId: string }>('/api/games', {
    body: { quizId, autopilot: true, nickname },
  });
export const hostAccess = (code: string) => request<HostTokens>(`${gameUrl(code)}/host-access`);
/** Недавні власні ігри цієї вікторини для «Підставити з попередньої гри» (12r), найновіша перша. */
export const resumeOptions = (code: string) => fetchData<ResumeOption[]>(`${gameUrl(code)}/resume`);
export const checkCode = (code: string) => request<{ phase: Phase; title: string }>(gameUrl(code));
export const joinGame = (code: string, nickname: string) =>
  request<{ token: string; playerId: string }>(`${gameUrl(code)}/join`, { body: { nickname } });

/** Надсилає зображення до запитання; тілом запиту є сам файл. */
export async function uploadImage(file: File): Promise<ApiResult<{ url: string }>> {
  const result = await send('/api/uploads', { method: 'POST', headers: { 'content-type': file.type }, body: file });
  return result.ok ? { ok: true, ...(result.data as { url: string }) } : result;
}

/** Тип за розширенням для файлів, яким браузер не дав типу або дав невідомий маршрутові. */
function audioTypeByName(name: string): string {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'ogg' ? 'audio/ogg' : ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg';
}

/** Надсилає аудіофайл до запитання; тілом запиту є сам файл. */
export async function uploadAudio(file: File): Promise<ApiResult<{ url: string }>> {
  // Невідомий маршрутові тип (напр. application/octet-stream) замінюється типом за розширенням.
  const known = (AUDIO_LIMITS.types as readonly string[]).includes(file.type);
  const contentType = known ? file.type : audioTypeByName(file.name);
  const result = await send('/api/uploads/audio', { method: 'POST', headers: { 'content-type': contentType }, body: file });
  return result.ok ? { ok: true, ...(result.data as { url: string }) } : result;
}

const prizeUrl = (id: string) => `/api/me/prizes/${encodeURIComponent(id)}`;
export const myPrizes = () => fetchData<PrizeItem[]>('/api/me/prizes');
export const createPrize = (content: PrizeContent) => request<PrizeItem>('/api/me/prizes', { body: content });
export const updatePrize = (id: string, content: PrizeContent) => request<PrizeItem>(prizeUrl(id), { method: 'PUT', body: content });
export const deletePrize = (id: string) => request<object>(prizeUrl(id), { method: 'DELETE' });
/** Призи, які ведучий може покласти в лобі, і що лежить на місцях зараз. */
export const gamePrizes = (code: string) => fetchData<PrizePlacesInfo>(`${gameUrl(code)}/prizes`);
export const placePrizes = (code: string, places: (string | null)[]) =>
  fetchData<PrizePlacesInfo>(`${gameUrl(code)}/prizes`, { method: 'PUT', body: { places } });

export const listGames = () => fetchData<GameSummary[]>('/api/games');
export const getGame = (id: string) => fetchData<GameDetail>(`/api/games/${encodeURIComponent(id)}`);
export const myHistory = () => fetchData<PlayedGame[]>('/api/me/history');
/** «Продовжити» збережену гру (13b): нова кімната; ведучий отримує пульт і сцену, автор автопілота — сцену й свій токен гравця. */
export const continueGame = (id: string) => request<ContinueResponse>(`/api/games/${encodeURIComponent(id)}/continue`, { body: {} });
export const deleteSavedGame = (id: string) => request<object>(`/api/games/${encodeURIComponent(id)}`, { method: 'DELETE' });
/** Вільні місця збереженої гри для форми входу й місце акаунта того, хто питає (13b). */
export const gameSlots = (code: string) => fetchData<SlotsResponse>(`${gameUrl(code)}/slots`);
export const claimSlot = (code: string, slotId: string) => request<{ token: string; playerId: string }>(`${gameUrl(code)}/claim`, { body: { slotId } });

export const getMyProfile = () => fetchData<OwnProfile>('/api/me/profile');
export const getMyCard = () => fetchData<ProfileCard>('/api/me/card');
export const saveMyProfile = (update: ProfileUpdate) => fetchData<ProfileCard>('/api/me/profile', { method: 'PUT', body: update });
export const saveLooks = (looks: NickLooks) => fetchData<{ looks: NickLooks }>('/api/me/looks', { method: 'PUT', body: looks });
export const getProfile = (id: string) => fetchData<PublicProfile>(`/api/profiles/${encodeURIComponent(id)}`);
export const getMyAchievements = () => fetchData<AchievementsPage>('/api/me/achievements');
export const getAchievements = (id: string) => fetchData<AchievementsPage>(`/api/profiles/${encodeURIComponent(id)}/achievements`);
export const getVersus = (id: string) => fetchData<Versus>(`/api/me/versus/${encodeURIComponent(id)}`);
export const findProfile = (nickname: string) => fetchData<ProfileCard>(`/api/profiles?nickname=${encodeURIComponent(nickname)}`);
export const searchProfiles = (query: string) => fetchData<ProfileCard[]>(`/api/profiles/search?q=${encodeURIComponent(query)}`);
export const follow = (id: string) => request<object>(`/api/me/friends/${encodeURIComponent(id)}`, { method: 'PUT' });
export const unfollow = (id: string) => request<object>(`/api/me/friends/${encodeURIComponent(id)}`, { method: 'DELETE' });

export const getMyFriends = () => fetchData<ProfileCard[]>('/api/me/friends');
export const inviteFriends = (code: string, userIds: string[]) => fetchData<{ invited: string[] }>(`${gameUrl(code)}/invites`, { body: { userIds } });
export const getRoomInvites = (code: string) => fetchData<{ invited: string[] }>(`${gameUrl(code)}/invites`);
export const getMyInvites = () => fetchData<GameInvite[]>('/api/me/invites');
export const getFeed = (cursor?: string) => request<FeedPage>(`/api/me/feed${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`);
export const getFeedBadge = () => request<FeedBadge>('/api/me/feed/badge');
export const markFeedSeen = (upTo: string) => request<object>('/api/me/feed/seen', { method: 'POST', body: { upTo } });
export const likeFeedEvent = (id: string, liked: boolean) =>
  request<{ liked: boolean; likes: number }>(`/api/feed/${encodeURIComponent(id)}/like`, { method: 'POST', body: { liked } });
export const dismissInvite = (code: string) => request<object>(`/api/me/invites/${encodeURIComponent(code)}`, { method: 'DELETE' });

/** Улюблені стікери власного профілю (13a); гість отримує unauthorized. */
export const getFavoriteStickers = () => request<{ favorites: string[] }>('/api/me/stickers');
/** Зберігає весь список (не більше 40 — його обрізає toggleFavorite). */
export const saveFavoriteStickers = (favorites: string[]) => request<{ favorites: string[] }>('/api/me/stickers', { method: 'PUT', body: { favorites } });
