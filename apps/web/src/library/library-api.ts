import type {
  LibraryDetail,
  LibraryMine,
  LibraryPage,
  LibrarySort,
  Locale,
  ReportReason,
  ReportTarget,
} from '@quiz/shared';
import { fetchData, request, type ApiData, type ApiResult } from '../api';
import { currentLocale } from '../locales/current';

const quizPath = (quizId: string) => `/api/library/mine/${encodeURIComponent(quizId)}`;
const entryPath = (id: string) => `/api/library/${encodeURIComponent(id)}`;

/** Мої записи бібліотеки — окремим запитом, щоб список вікторин і профіль не важчали. */
export const myLibrary = () => fetchData<LibraryMine[]>('/api/library/mine');
export const openInLibrary = (quizId: string, language: Locale) =>
  fetchData<{ entryId: string }>(quizPath(quizId), { method: 'PUT', body: { language } });
export const closeInLibrary = (quizId: string) => request<object>(quizPath(quizId), { method: 'DELETE' });
export const appealLibrary = (quizId: string) => request<object>(`${quizPath(quizId)}/appeal`, { method: 'POST', body: {} });

export const libraryCatalog = (query: { q: string; sort: LibrarySort; lang: Locale | ''; offset: number }): Promise<ApiData<LibraryPage>> => {
  const params = new URLSearchParams({ sort: query.sort, offset: String(query.offset) });
  if (query.q !== '') params.set('q', query.q);
  if (query.lang !== '') params.set('lang', query.lang);
  return fetchData<LibraryPage>(`/api/library?${params.toString()}`);
};
export const libraryQuiz = (id: string) => fetchData<LibraryDetail>(entryPath(id));
export const likeLibrary = (id: string, liked: boolean) =>
  fetchData<{ likes: number; liked: boolean }>(`${entryPath(id)}/like`, { method: 'PUT', body: { liked } });
export const copyLibrary = (id: string) => fetchData<{ id: string }>(`${entryPath(id)}/copy`, { method: 'POST', body: { locale: currentLocale() } });
export const sendReport = (input: { target: ReportTarget; reason: ReportReason; text?: string }): Promise<ApiResult<object>> =>
  request<object>('/api/reports', { body: input });
