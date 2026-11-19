import { z } from 'zod';
import type { Achievement } from './achievements';
import type { PlayedGame } from './history';
import type { OwnLevel, PublicLevel } from './levels';
import type { LeagueTitle } from './league';
import type { LikeTotals } from './likes';
import type { Showcase } from './prizes';
import { LIMITS } from './quiz';
import { UNSTORABLE, isStorable } from './text';

/** Шлях до завантаженого зображення: лише така форма може бути аватаром. */
export const AVATAR_URL = /^\/uploads\/[a-z0-9]{16,64}\.(jpg|png|webp)$/;

/** Нікнейм профілю: краї обрізано, пробіли стиснуто; 2–20 символів; придатний для бази. */
export const nicknameSchema = z
  .string()
  .max(100)
  .transform((value) => value.replace(/\s+/g, ' ').trim())
  .pipe(z.string().min(LIMITS.nicknameMin).max(LIMITS.nicknameMax).refine(isStorable, UNSTORABLE));

export const profileUpdateSchema = z.object({ nickname: nicknameSchema, avatar: z.string().regex(AVATAR_URL).nullable() }).strict();
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export interface ProfileStats extends PodiumStats {
  games: number;
  wins: number;
  /** Відсоток зарахованих від зіграних запитань; null — запитань не було. */
  accuracy: number | null;
  quizzes: number;
  /** Завершені ігри, де користувач був ведучим. */
  hosted: number;
}

/** Те, що видно про користувача в будь-якому списку. */
export interface ProfileCard {
  id: string;
  nickname: string | null;
  avatar: string | null;
}

/** Друг у списку (беклог 9): ще й коли його востаннє бачили на сайті (ISO); null — ще не бачили. */
export interface FriendCard extends ProfileCard {
  lastSeenAt: string | null;
}

/** Скільки після останнього звернення людина вважається онлайн. */
export const ONLINE_MS = 5 * 60_000;

/** Запрошення в гру, що чекає в лобі. */
export interface GameInvite {
  code: string;
  title: string;
  host: ProfileCard;
  invitedAt: string;
}

export interface PublicProfile extends ProfileCard {
  /** Титули ліги (45): лише назва групи й місяць; найновіші першими. */
  leagueTitles: LeagueTitle[];
  stats: ProfileStats;
  achievements: Achievement[];
  /** Чи підписаний той, хто дивиться; null — не увійшов або це його власний профіль. */
  following: boolean | null;
  showcase: Showcase;
  level: PublicLevel;
  likes: LikeTotals;
  /** Остання форма (49) без назв ігор (publicForm); необов'язкова — старий кеш вебу й фікстури без неї. */
  form?: PublicRecentForm;
}

export interface ProfileWin {
  gameId: string;
  title: string;
  startedAt: string;
  rank: number;
}

export interface VersusGame {
  gameId: string;
  title: string;
  startedAt: string;
  myRank: number | null;
  theirRank: number | null;
}

/** Спільні завершені ігри того, хто дивиться («я»), і іншого користувача. */
export interface Versus {
  together: number;
  /** Ігри, де моє місце краще (менше). */
  myAhead: number;
  theirAhead: number;
  myAccuracy: number | null;
  theirAccuracy: number | null;
  /** Найновіші першими, не більше VERSUS_RECENT. */
  recent: VersusGame[];
}

export interface OwnProfile extends ProfileCard {
  /** Титули ліги (45), найновіші першими. */
  leagueTitles: LeagueTitle[];
  level: OwnLevel;
  likes: LikeTotals;
  email: string;
  stats: ProfileStats;
  achievements: Achievement[];
  /** Найзіграніші першими (plays — завершені ігри цієї вікторини); за рівності — новіші. */
  quizzes: { id: string; title: string; plays: number }[];
  wins: ProfileWin[];
  friends: FriendCard[];
  showcase: Showcase;
  /** Остання форма (49); необов'язкова — старий кеш вебу й фікстури без неї. */
  form?: RecentForm;
}

type Counted = Pick<PlayedGame, 'status' | 'rank' | 'score' | 'playerCount' | 'correct' | 'questionsPlayed'>;

/**
 * Перемога: перше місце в завершеній грі, де було кого випередити і є хоч якісь бали.
 * Інакше «перемогою» стала б гра наодинці чи гра, яку закрили до першої відповіді.
 */
export function isWin(game: Counted): boolean {
  return game.status === 'finished' && game.rank === 1 && game.score > 0 && game.playerCount > 1;
}

/** Останнє місце (12j): завершена гра, ≥ 4 учасники таблиці, rank === playerCount (нічия за останнє — ні). */
export function isLastPlace(game: Pick<Counted, 'status' | 'rank' | 'playerCount'>): boolean {
  return game.status === 'finished' && game.playerCount >= 4 && game.rank === game.playerCount;
}

/** Ігри, перемоги й частка правильних (округлено до цілого відсотка). */
export function gameStats(games: Counted[]): { games: number; wins: number; accuracy: number | null } {
  const asked = games.reduce((sum, game) => sum + game.questionsPlayed, 0);
  const correct = games.reduce((sum, game) => sum + game.correct, 0);
  return {
    games: games.length,
    wins: games.filter(isWin).length,
    accuracy: asked === 0 ? null : Math.round((correct / asked) * 100),
  };
}

/** П'єдестал (11f): 1 — isWin; 2 — завершена, rank 2, бали > 0, ≥ 3 учасників; 3 — те саме з rank 3 і ≥ 4 учасниками; інакше null. */
export function podiumPlace(game: Counted): 1 | 2 | 3 | null {
  if (isWin(game)) return 1;
  if (game.status !== 'finished' || game.score <= 0) return null;
  if (game.rank === 2 && game.playerCount >= 3) return 2;
  if (game.rank === 3 && game.playerCount >= 4) return 3;
  return null;
}

export interface PodiumStats {
  /** Скільки разів 1-е, 2-е і 3-є місце (11f). */
  podium: { first: number; second: number; third: number };
  /** Відсоток ігор із місцем (завершена, є місце, ≥ 2 учасників) на п'єдесталі; null — таких ігор немає. */
  top3: number | null;
  /** Найбільший рахунок у завершеній грі; null — завершених немає. */
  bestScore: number | null;
  /** Середнє місце в іграх із місцем, до десятої; null — таких немає. */
  avgPlace: number | null;
}

/** П'єдестал, «у трійці», найкращий рахунок і середнє місце (11f); пояснення — у плані 11f, «Рішення плану». */
export function podiumStats(games: Counted[]): PodiumStats {
  const podium = { first: 0, second: 0, third: 0 };
  let placed = 0;
  for (const game of games) {
    const place = podiumPlace(game);
    if (place === 1) podium.first += 1;
    else if (place === 2) podium.second += 1;
    else if (place === 3) podium.third += 1;
    if (place !== null) placed += 1;
  }
  const rated = games.filter((game) => game.status === 'finished' && game.rank !== null && game.playerCount > 1);
  const finished = games.filter((game) => game.status === 'finished');
  const rankSum = rated.reduce((sum, game) => sum + (game.rank ?? 0), 0);
  return {
    podium,
    top3: rated.length === 0 ? null : Math.round((placed / rated.length) * 100),
    bestScore: finished.length === 0 ? null : Math.max(...finished.map((game) => game.score)),
    avgPlace: rated.length === 0 ? null : Math.round((rankSum / rated.length) * 10) / 10,
  };
}

/** Скільки останніх ігор у «формі» (49). */
export const RECENT_FORM_SIZE = 10;

export interface FormGame {
  gameId: string;
  title: string;
  startedAt: string;
  place: number;
  medal: 1 | 2 | 3 | null;
  team: string | null;
}

export interface RecentForm {
  games: FormGame[];
  streak: { kind: 'wins' | 'top3'; count: number } | null;
}

/** Публічна гра форми (49): лише місце, медаль і дата — назви гри, команди й id чужим не показуються (рішення власника). */
export type PublicFormGame = Pick<FormGame, 'startedAt' | 'place' | 'medal'>;

export interface PublicRecentForm {
  games: PublicFormGame[];
  streak: RecentForm['streak'];
}

/** Форма для публічного профілю: ті самі ігри й серія без назв, команд і id. */
export function publicForm(form: RecentForm): PublicRecentForm {
  return { games: form.games.map(({ startedAt, place, medal }) => ({ startedAt, place, medal })), streak: form.streak };
}

/** Остання форма (49): games — новіші першими; рахуються завершені ігри з місцем і > 1 учасником. */
export function recentForm(games: readonly PlayedGame[]): RecentForm {
  const rated = games.filter((g) => g.status === 'finished' && g.rank !== null && g.playerCount > 1);
  let wins = 0;
  while (wins < rated.length && isWin(rated[wins])) wins += 1;
  let top3 = 0;
  while (top3 < rated.length && podiumPlace(rated[top3]) !== null) top3 += 1;
  const streak: RecentForm['streak'] =
    wins >= 2 && wins * 2 >= top3 ? { kind: 'wins', count: wins } : top3 >= 2 ? { kind: 'top3', count: top3 } : null;
  return {
    games: rated.slice(0, RECENT_FORM_SIZE).map((g) => ({
      gameId: g.gameId,
      title: g.title,
      startedAt: g.startedAt,
      place: g.rank as number,
      medal: podiumPlace(g),
      team: g.team,
    })),
    streak,
  };
}
