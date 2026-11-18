import type { AdminList, AdminReportItem, AdminLogEntry, AdminQuizRow, AdminQuizView, AdminStats, AdminUserDetail, AdminUserRow } from '@quiz/shared';
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
export const deleteQuestionAsAdmin = (quizId: string, questionId: string): Promise<ApiData<AdminQuizView>> =>
  fetchData<AdminQuizView>(`/api/admin/quizzes/${id(quizId)}/questions/${id(questionId)}`, { method: 'DELETE' });
export const deletePrizeAsAdmin = (prizeId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/prizes/${id(prizeId)}`, { method: 'DELETE' });
export const deleteAwardAsAdmin = (awardId: string): Promise<ApiResult<object>> => request<object>(`/api/admin/awards/${id(awardId)}`, { method: 'DELETE' });
export const adminLog = (page: number): Promise<ApiData<AdminList<AdminLogEntry>>> => fetchData(`/api/admin/log?page=${page}`);
export const adminReports = (page: number): Promise<ApiData<AdminList<AdminReportItem>>> => fetchData(`/api/admin/reports?page=${page}`);
export const actOnQuizReport = (entryId: string, action: 'hide' | 'restore' | 'dismiss'): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/reports/quiz/${id(entryId)}`, { method: 'POST', body: { action } });
export const actOnProfileReport = (userId: string, action: 'reset_nickname' | 'reset_avatar' | 'dismiss'): Promise<ApiResult<object>> =>
  request<object>(`/api/admin/reports/profile/${id(userId)}`, { method: 'POST', body: { action } });
