import { isObjectLike } from '@quiz/shared';
import type { AdminBroadcast, AdminBroadcasts, BroadcastInput, BroadcastPreview, BroadcastRecipients } from '@quiz/shared';
import type { AdminBackups, AdminProblemReport, AdminProblemsBadge, AdminServerError } from '@quiz/shared';
import type { AchievementId, AdminBot, AdminBotHostAccess, AdminRevokeManyResult, AdminBotLobby, AdminBotPerson, AdminBotPlan, BotCommand, BotPlanInput, GameDetail, GameReplay } from '@quiz/shared';
import type { Announcement, AnnouncementInput, AdminHealth, AdminLiveList, AdminList, AdminMetricPeriod, AdminMetrics, AdminReportItem, AdminLogExport, AdminLogGroup, AdminLogPage, AdminQuizCheck, AdminQuizRow, AdminQuizView, AdminStats, AdminUserDetail, AdminUserRow } from '@quiz/shared';
import type { AccountMergePreview, MergeSummary } from '@quiz/shared';
import type { AdminFeedKind, AdminFeedRow, AdminGroupDetail, AdminGroupMemberAdded, AdminGroupRow, GroupItemInput } from '@quiz/shared';
import { fetchData, request, type ApiData, type ApiResult } from '../api';

const id = encodeURIComponent;
const list = (path: string, q: string, page: number) => `/api/admin/${path}?q=${id(q)}&page=${page}`;

export const adminStats = (): Promise<ApiData<AdminStats>> => fetchData<AdminStats>('/api/admin/stats');
export const adminUsers = (q: string, page: number): Promise<ApiData<AdminList<AdminUserRow>>> => fetchData(list('users', q, page));
export const adminUser = (userId: string): Promise<ApiData<AdminUserDetail>> => fetchData<AdminUserDetail>(`/api/admin/users/${id(userId)}`);
export const banUser = (userId: string, reason: string): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/users/${id(userId)}/ban`, { method: 'POST', body: { reason } });
export const unbanUser = (userId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/users/${id(userId)}/ban`, { method: 'DELETE' });
export const adminQuizzes = (q: string, page: number): Promise<ApiData<AdminList<AdminQuizRow>>> => fetchData(list('quizzes', q, page));
export const adminQuiz = (quizId: string): Promise<ApiData<AdminQuizView>> => fetchData<AdminQuizView>(`/api/admin/quizzes/${id(quizId)}`);
export const deleteQuizAsAdmin = (quizId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/quizzes/${id(quizId)}`, { method: 'DELETE' });
/** Перевірка вікторини (57): сервер ходить за файлами й відео, тому довго; 404 — як в інших адмін-запитах. */
export const checkQuiz = (quizId: string): Promise<ApiData<AdminQuizCheck>> => fetchData<AdminQuizCheck>(`/api/admin/quizzes/${id(quizId)}/check`, { method: 'POST' });
export const deleteQuestionAsAdmin = (quizId: string, questionId: string): Promise<ApiData<AdminQuizView>> =>
  fetchData<AdminQuizView>(`/api/admin/quizzes/${id(quizId)}/questions/${id(questionId)}`, { method: 'DELETE' });
export const deletePrizeAsAdmin = (prizeId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/prizes/${id(prizeId)}`, { method: 'DELETE' });
export const deleteAwardAsAdmin = (awardId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/awards/${id(awardId)}`, { method: 'DELETE' });
/** Фільтри журналу (63): у запиті лише задані; groups — без порожнього значення (сервер його відхиляє). */
export interface LogFilter { admin?: string; groups: readonly AdminLogGroup[]; from?: string; to?: string; q?: string }
export function logParams(filter: LogFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.admin) params.set('admin', filter.admin);
  if (filter.groups.length > 0) params.set('groups', filter.groups.join(','));
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.q) params.set('q', filter.q);
  return params;
}
export function adminLog(filter: LogFilter, page: number): Promise<ApiData<AdminLogPage>> {
  const params = logParams(filter);
  params.set('page', String(page));
  return fetchData(`/api/admin/log?${params.toString()}`);
}
export function adminLogExport(filter: LogFilter): Promise<ApiData<AdminLogExport>> {
  const query = logParams(filter).toString();
  return fetchData(`/api/admin/log/export${query === '' ? '' : `?${query}`}`);
}
export const adminReports = (page: number): Promise<ApiData<AdminList<AdminReportItem>>> => fetchData(`/api/admin/reports?page=${page}`);
/** Знімок із каталогу, на який скаржаться (не поточна вікторина автора); лише для перегляду. */
export const adminReportedQuiz = (entryId: string): Promise<ApiData<AdminQuizView>> => fetchData<AdminQuizView>(`/api/admin/reports/quiz/${id(entryId)}`);
export const actOnQuizReport = (entryId: string, action: 'hide' | 'restore' | 'dismiss'): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/reports/quiz/${id(entryId)}`, { method: 'POST', body: { action } });
export const actOnProfileReport = (userId: string, action: 'reset_nickname' | 'reset_avatar' | 'dismiss'): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/reports/profile/${id(userId)}`, { method: 'POST', body: { action } });
export const adminLive = (): Promise<ApiData<AdminLiveList>> => fetchData<AdminLiveList>('/api/admin/live');
/** Закриває гру, як її ведучий: лобі зникає, гра посеред запитання завершується. */
export const closeLiveGame = (code: string): Promise<ApiResult<object>> => request<object>(`/api/admin/live/${id(code)}/close`, { method: 'POST' });
/** 71: метрики за період (7/30/90/365). */
export const adminMetrics = (period: AdminMetricPeriod): Promise<ApiData<AdminMetrics>> => fetchData<AdminMetrics>(`/api/admin/metrics?period=${period}`);
export const adminHealth = (): Promise<ApiData<AdminHealth>> => fetchData<AdminHealth>('/api/admin/health');
export const adminAnnouncement = (): Promise<ApiData<{ announcement: Announcement | null }>> => fetchData<{ announcement: Announcement | null }>('/api/admin/announcement');
export const saveAnnouncement = (input: AnnouncementInput): Promise<ApiData<Announcement>> =>
  fetchData<Announcement>('/api/admin/announcement', { method: 'PUT', body: input });
export const clearAnnouncement = (): Promise<ApiResult<object>> => request<object>('/api/admin/announcement', { method: 'DELETE' });
/** «Бот» (54): його вікторини й кімнати. */
export const adminBot = (): Promise<ApiData<AdminBot>> => fetchData<AdminBot>('/api/admin/bot');
export const startBotGame = (quizId: string): Promise<ApiResult<{ code: string; stageUrl: string }>> =>
  request<{ code: string; stageUrl: string }>(`/api/admin/bot/quizzes/${id(quizId)}/games`, { method: 'POST' });
/** Копія своєї вікторини адміна — боту; оригінал не змінюється. */
export const copyToBot = (quizId: string): Promise<ApiResult<{ id: string }>> => request<{ id: string }>('/api/admin/bot/copies', { method: 'POST', body: { quizId } });
export const deleteBotQuiz = (quizId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/bot/quizzes/${id(quizId)}`, { method: 'DELETE' });
/** 62: команда кімнаті бота — тип у шляху, решта (playerId, form) у тілі; дії без даних — без тіла. */
export const botRoomCommand = (code: string, command: BotCommand): Promise<ApiResult<object>> => {
  const { type, ...body } = command;
  return request<object>(`/api/admin/bot/rooms/${id(code)}/${type}`, Object.keys(body).length === 0 ? { method: 'POST' } : { method: 'POST', body });
};
/** 68: токени пульта адміна в кімнаті бота (лише для цієї вкладки; кожен виклик — той самий токен адміна). */
export const botHostAccess = (code: string): Promise<ApiResult<AdminBotHostAccess>> => request<AdminBotHostAccess>(`/api/admin/bot/rooms/${id(code)}/host-access`, { method: 'POST' });
/** 68: «Взяти керування» (on) і «Віддати боту». */
export const botManual = (code: string, on: boolean): Promise<ApiResult<object>> => request<object>(`/api/admin/bot/rooms/${id(code)}/manual`, { method: 'PUT', body: { on } });
/** 62: лобі кімнати бота — у списку лобі чи лише за кодом, і пароль (null — без пароля). */
export const saveBotLobby = (code: string, input: AdminBotLobby): Promise<ApiResult<AdminBotLobby>> =>
  request<AdminBotLobby>(`/api/admin/bot/rooms/${id(code)}/lobby`, { method: 'PUT', body: input });
/** Розклад бота (56): план гри на київську дату й час; скасування зупиняє й щотижневий повтор. */
export const createBotPlan = (input: BotPlanInput): Promise<ApiResult<AdminBotPlan>> => request<AdminBotPlan>('/api/admin/bot/plans', { method: 'POST', body: input });
export const updateBotPlan = (planId: string, input: BotPlanInput): Promise<ApiResult<AdminBotPlan>> =>
  request<AdminBotPlan>(`/api/admin/bot/plans/${id(planId)}`, { method: 'PUT', body: input });
export const cancelBotPlan = (planId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/bot/plans/${id(planId)}/cancel`, { method: 'POST' });
/** Люди за ніком для «Вибраним людям»; відповідь — список, тому цілою (ApiData). */
export const searchBotPeople = (q: string): Promise<ApiData<AdminBotPerson[]>> => fetchData<AdminBotPerson[]>(`/api/admin/bot/people?q=${id(q)}`);
/** Картка гравця (58): досягнення, ручний досвід, подарунок, видалення акаунта, адмінський перегляд будь-якої гри. */
export const grantAchievement = (userId: string, achievementId: AchievementId): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/users/${id(userId)}/achievements`, { method: 'POST', body: { achievementId } });
/** 69: «Відібрати вибрані» — один запит на кілька досягнень. */
export const revokeAchievements = (userId: string, achievementIds: AchievementId[]): Promise<ApiResult<AdminRevokeManyResult>> =>
  request<AdminRevokeManyResult>(`/api/admin/users/${id(userId)}/achievements/revoke`, { method: 'POST', body: { achievementIds } });
export const adjustXp = (userId: string, amount: number, reason: string): Promise<ApiResult<{ xp: number; level: number }>> =>
  request<{ xp: number; level: number }>(`/api/admin/users/${id(userId)}/xp`, { method: 'POST', body: { amount, reason } });
export const giftPrize = (userId: string, prizeId: string, note: string | null): Promise<ApiResult<{ id: string }>> =>
  request<{ id: string }>(`/api/admin/users/${id(userId)}/gifts`, { method: 'POST', body: { prizeId, note } });
export const revokeGift = (awardId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/gifts/${id(awardId)}`, { method: 'DELETE' });
/** `confirm` — нік (чи email без ніку), набраний адміном; сервер порівнює точно, після обрізання країв. */
export const deleteUserAsAdmin = (userId: string, confirm: string): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/users/${id(userId)}`, { method: 'DELETE', body: { confirm } });
/** 66: що перейде з secondaryId на primaryId; відмова (адмін, бан, жива гра) — у refusal, не помилкою. */
export const mergePreview = (primaryId: string, secondaryId: string): Promise<ApiData<AccountMergePreview>> =>
  fetchData<AccountMergePreview>(`/api/admin/users/${id(primaryId)}/merge/${id(secondaryId)}`);
/** 66: об'єднання; `confirm` — мітка акаунта, що зникне (нік чи email), сервер порівнює після обрізання країв. */
export const mergeAccounts = (primaryId: string, secondaryId: string, confirm: string): Promise<ApiResult<{ primaryId: string; summary: MergeSummary }>> =>
  request<{ primaryId: string; summary: MergeSummary }>(`/api/admin/users/${id(primaryId)}/merge`, { method: 'POST', body: { secondaryId, confirm } });
export const adminGame = (gameId: string): Promise<ApiData<GameDetail>> => fetchData<GameDetail>(`/api/admin/games/${id(gameId)}`);
/** 65: повтор гри по кроках; гра ще йде — 409 replay_running. */
export const adminGameReplay = (gameId: string): Promise<ApiData<GameReplay>> => fetchData<GameReplay>(`/api/admin/games/${id(gameId)}/replay`);
/** Розсилка (59): історія, ліміти й групи; скільки людей отримають; відправка. */
export const adminBroadcasts = (): Promise<ApiData<AdminBroadcasts>> => fetchData<AdminBroadcasts>('/api/admin/broadcasts');
export const previewBroadcast = (recipients: BroadcastRecipients): Promise<ApiData<BroadcastPreview>> =>
  fetchData<BroadcastPreview>('/api/admin/broadcasts/preview', { method: 'POST', body: { recipients } });
/** Відмова за лімітом (409) каже й `nextAt` — коли вже можна; інші помилки — як у request. */
export type BroadcastSent = ({ ok: true } & AdminBroadcast) | { ok: false; error: string; nextAt?: string };
export async function sendBroadcast(input: BroadcastInput): Promise<BroadcastSent> {
  try {
    const response = await fetch('/api/admin/broadcasts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    if (response.status === 429) return { ok: false, error: 'too_many' };
    const data: unknown = await response.json().catch(() => null);
    if (response.ok && isObjectLike(data)) return { ok: true, ...(data as unknown as AdminBroadcast) };
    const error = isObjectLike(data) && typeof data.error === 'string' ? data.error : 'unknown';
    const nextAt = isObjectLike(data) && typeof data.nextAt === 'string' ? data.nextAt : undefined;
    return nextAt === undefined ? { ok: false, error } : { ok: false, error, nextAt };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** 64: «Збої» — бейдж нових; збої сервера й скарги гравців з фільтром і сторінками; вирішити; відповісти автору. */
export const adminProblemsBadge = (): Promise<ApiData<AdminProblemsBadge>> => fetchData<AdminProblemsBadge>('/api/admin/problems/badge');
export const adminErrors = (status: AdminServerError['status'], page: number): Promise<ApiData<AdminList<AdminServerError>>> => fetchData(`/api/admin/errors?status=${status}&page=${page}`);
export const resolveServerError = (errorId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/errors/${id(errorId)}/resolve`, { method: 'POST', body: {} });
export const adminProblems = (status: AdminProblemReport['status'], page: number): Promise<ApiData<AdminList<AdminProblemReport>>> => fetchData(`/api/admin/problems?status=${status}&page=${page}`);
export const resolveProblem = (reportId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/problems/${id(reportId)}/resolve`, { method: 'POST', body: {} });
export const replyProblem = (reportId: string, text: string): Promise<ApiResult<{ pushed: boolean; inbox: boolean }>> =>
  request<{ pushed: boolean; inbox: boolean }>(`/api/admin/problems/${id(reportId)}/reply`, { method: 'POST', body: { text } });

/** 64: «Копії» — список і стан; `error` — сервер не зміг прочитати список зі сховища (рядків тоді немає). */
export type AdminBackupsView = AdminBackups & { error?: true };
export const adminBackups = (): Promise<ApiData<AdminBackupsView>> => fetchData<AdminBackupsView>('/api/admin/backups');
export type BackupStarted = { ok: true } | { ok: false; error: string; nextAt?: string };
/** «Зробити копію зараз»: 202 — пішла у фоні; 409 `backup_recent` каже й `nextAt`, 409 `backup_busy`; 503 `backup_off`; 429 — `too_many`. */
export async function startBackup(): Promise<BackupStarted> {
  try {
    const response = await fetch('/api/admin/backups', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    if (response.status === 429) return { ok: false, error: 'too_many' };
    if (response.ok) return { ok: true };
    const data: unknown = await response.json().catch(() => null);
    const error = isObjectLike(data) && typeof data.error === 'string' ? data.error : 'unknown';
    const nextAt = isObjectLike(data) && typeof data.nextAt === 'string' ? data.nextAt : undefined;
    return nextAt === undefined ? { ok: false, error } : { ok: false, error, nextAt };
  } catch {
    return { ok: false, error: 'offline' };
  }
}

/** Модерація (63): усі події стрічки з фільтрами за людиною й видом. */
export function adminFeed(query: { page: number; user?: string; kind?: AdminFeedKind }): Promise<ApiData<AdminList<AdminFeedRow>>> {
  const params = new URLSearchParams();
  if (query.user !== undefined) params.set('user', query.user);
  if (query.kind !== undefined) params.set('kind', query.kind);
  params.set('page', String(query.page));
  return fetchData(`/api/admin/feed?${params.toString()}`);
}
type Changed = { changed: boolean };
export const setFeedHidden = (eventId: string, hidden: boolean): Promise<ApiData<Changed>> => fetchData<Changed>(`/api/admin/feed/${id(eventId)}/hidden`, { method: 'PUT', body: { hidden } });
/** Сімейні групи (63): пошук за назвою чи ніком власника; картка групи з записами сторінками. */
export const adminGroups = (query: { q: string; page: number }): Promise<ApiData<AdminList<AdminGroupRow>>> => fetchData(list('groups', query.q, query.page));
export const adminGroup = (groupId: string, page: number): Promise<ApiData<AdminGroupDetail>> => fetchData<AdminGroupDetail>(`/api/admin/groups/${id(groupId)}?page=${page}`);
/** Причину шле лише ховання і лише непорожню (порожню сервер і так робить null). */
export const setGroupHidden = (groupId: string, hidden: boolean, reason: string): Promise<ApiData<Changed>> =>
  fetchData<Changed>(`/api/admin/groups/${id(groupId)}/hidden`, { method: 'PUT', body: hidden && reason.trim() !== '' ? { hidden, reason: reason.trim() } : { hidden } });
export const removeGroupMember = (groupId: string, userId: string): Promise<ApiData<Changed>> =>
  fetchData<Changed>(`/api/admin/groups/${id(groupId)}/members/${id(userId)}`, { method: 'DELETE' });
export const passGroupOwner = (groupId: string, userId: string): Promise<ApiData<Changed>> => fetchData<Changed>(`/api/admin/groups/${id(groupId)}/owner`, { method: 'PUT', body: { userId } });
/** `name` — назва, набрана адміном; сервер порівнює після обрізання країв, з урахуванням регістру; успіх — 204. */
export const deleteGroupAsAdmin = (groupId: string, name: string): Promise<ApiData<object>> => fetchData<object>(`/api/admin/groups/${id(groupId)}`, { method: 'DELETE', body: { name } });
/** 72: людина одразу в групі; pushed — пуш пішов (сповіщення у «Вхідних» є завжди). */
export const addGroupMember = (groupId: string, userId: string): Promise<ApiData<AdminGroupMemberAdded>> =>
  fetchData<AdminGroupMemberAdded>(`/api/admin/groups/${id(groupId)}/members`, { method: 'POST', body: { userId } });
/** 72: запис від Квіз-бота (без фото й сюрпризу); успіх — 201 { id }. */
export const addGroupItem = (groupId: string, item: GroupItemInput): Promise<ApiData<{ id: string }>> =>
  fetchData<{ id: string }>(`/api/admin/groups/${id(groupId)}/items`, { method: 'POST', body: item });
export const setGroupItemHidden = (groupId: string, itemId: string, hidden: boolean): Promise<ApiData<Changed>> =>
  fetchData<Changed>(`/api/admin/groups/${id(groupId)}/items/${id(itemId)}/hidden`, { method: 'PUT', body: { hidden } });
