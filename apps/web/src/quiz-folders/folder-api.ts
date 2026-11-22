import type { QuizFolder } from '@quiz/shared';
import { fetchData, request } from '../api';

/** 73: особисті категорії вікторин — бачить і міняє лише автор. */
const folderPath = (id: string) => `/api/quiz-folders/${encodeURIComponent(id)}`;

export const listFolders = () => fetchData<QuizFolder[]>('/api/quiz-folders');
export const createFolder = (name: string) => fetchData<QuizFolder>('/api/quiz-folders', { method: 'POST', body: { name } });
export const renameFolder = (id: string, name: string) => fetchData<QuizFolder>(folderPath(id), { method: 'PUT', body: { name } });
/** Повний новий порядок: рівно всі категорії автора; інакше сервер відповідає folders_changed. */
export const reorderFolders = (ids: string[]) => fetchData<QuizFolder[]>('/api/quiz-folders/order', { method: 'PUT', body: { ids } });
export const deleteFolder = (id: string) => request<object>(folderPath(id), { method: 'DELETE' });
/** Перекладає вікторину в категорію (null — «Без категорії»); дата зміни вікторини від цього не міняється. */
export const moveQuizToFolder = (quizId: string, folderId: string | null) =>
  request<{ folderId: string | null }>(`/api/quizzes/${encodeURIComponent(quizId)}/folder`, { method: 'PUT', body: { folderId } });
