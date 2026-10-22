import { z } from 'zod';
import type { PlayedGame } from './history';
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

export const ACHIEVEMENTS = [
  'first_game', 'first_win', 'games_10', 'streak_5', 'perfect_game', 'host', 'games_50', 'wins_10',
  'games_100', 'host_10', 'streak_10', 'win_streak_3', 'blitz_win', 'final_hit', 'comeback', 'friends_5',
] as const;
export type AchievementId = (typeof ACHIEVEMENTS)[number];
export interface Achievement {
  id: AchievementId;
  earned: boolean;
}

export interface ProfileStats {
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
  nickname: string;
  avatar: string | null;
}

export interface PublicProfile extends ProfileCard {
  stats: ProfileStats;
  achievements: Achievement[];
  /** Чи підписаний той, хто дивиться; null — не увійшов або це його власний профіль. */
  following: boolean | null;
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
  email: string;
  stats: ProfileStats;
  achievements: Achievement[];
  quizzes: { id: string; title: string }[];
  wins: ProfileWin[];
  friends: ProfileCard[];
}

type Counted = Pick<PlayedGame, 'status' | 'rank' | 'score' | 'playerCount' | 'correct' | 'questionsPlayed'>;

/**
 * Перемога: перше місце в завершеній грі, де було кого випередити і є хоч якісь бали.
 * Інакше «перемогою» стала б гра наодинці чи гра, яку закрили до першої відповіді.
 */
export function isWin(game: Counted): boolean {
  return game.status === 'finished' && game.rank === 1 && game.score > 0 && game.playerCount > 1;
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
