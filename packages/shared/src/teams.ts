import type { Quiz, TeamsSettings } from './quiz';

/** Як формуються команди: ведучий сам, гравці самі, випадково, кубик. */
export const TEAM_FORMS = ['host', 'pick', 'random', 'dice'] as const;
export type TeamForm = (typeof TEAM_FORMS)[number];

/** Типовий спосіб у лобі: гравці обирають самі. */
export const DEFAULT_TEAM_FORM: TeamForm = 'pick';

/** Типові назви за позицією (кольори — та сама позиція). */
export const DEFAULT_TEAM_NAMES = ['Червоні', 'Сині', 'Зелені', 'Жовті', 'Фіолетові', 'Помаранчеві'] as const;

/** Налаштування для count команд: перші count типових назв. */
export function defaultTeams(count: number): TeamsSettings {
  return { count, names: DEFAULT_TEAM_NAMES.slice(0, count) };
}

/** Чи вікторина командна. */
export function teamsOf(quiz: Pick<Quiz, 'settings'>): TeamsSettings | null {
  return quiz.settings.teams ?? null;
}

/**
 * Розміри смуг: n учасників на k команд — floor(n / k), перші n mod k команд на одного більше.
 * Приклад: bandSizes(5, 2) → [3, 2]; bandSizes(7, 3) → [3, 2, 2].
 */
export function bandSizes(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  const extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Хто відповідає за команду (12g): капітан; кого вибере капітан; по черзі (капітан може перебити вибором). */
export const ANSWERER_MODES = ['captain', 'chosen', 'rotate'] as const;
export type AnswererMode = (typeof ANSWERER_MODES)[number];

/** Обсяг вибору капітана (12g): одне наступне запитання чи до кінця раунду. */
export const ANSWERER_SCOPES = ['question', 'round'] as const;
export type AnswererScope = (typeof ANSWERER_SCOPES)[number];

/** Скільки виборів player:pick-answerer людина може надіслати за секунду; понад — too_soon. */
export const ANSWERER_PICKS_PER_SECOND = 4;

/** Режим вікторини; немає поля чи соло — 'captain' (як до 12g). */
export function answererModeOf(teams: Pick<TeamsSettings, 'answerer'> | undefined | null): AnswererMode {
  return teams?.answerer ?? 'captain';
}
