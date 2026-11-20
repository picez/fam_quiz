import type { AdminBot, AdminBotLobby, AdminBotPerson, AdminBotPlan, BotAction, BotCommand, BotPlanInput } from '@quiz/shared';
import type { Announcement, AnnouncementInput, AdminCharts, AdminHealth, AdminLiveList, AdminList, AdminReportItem, AdminLogEntry, AdminQuizCheck, AdminQuizRow, AdminQuizView, AdminStats, AdminUserDetail, AdminUserRow } from '@quiz/shared';
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
export const adminLog = (page: number): Promise<ApiData<AdminList<AdminLogEntry>>> => fetchData(`/api/admin/log?page=${page}`);
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
export const adminCharts = (): Promise<ApiData<AdminCharts>> => fetchData<AdminCharts>('/api/admin/charts');
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
export const botRoomAct = (code: string, action: BotAction): Promise<ApiResult<object>> => botRoomCommand(code, { type: action });
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
