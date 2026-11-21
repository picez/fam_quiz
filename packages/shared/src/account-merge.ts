import { z } from 'zod';

/** 66: способи входу, що переходять на головний акаунт. */
export const MERGE_LOGINS = ['google', 'credential', 'other'] as const;
export type MergeLogin = (typeof MERGE_LOGINS)[number];

/** 66: чому об'єднання неможливе. */
export const MERGE_REFUSALS = ['merge_same', 'merge_admin', 'merge_banned', 'merge_live'] as const;
export type MergeRefusal = (typeof MERGE_REFUSALS)[number];

/** 66: скільки всього переходить на головний акаунт. */
export interface MergeCounts {
  games: number;
  hosted: number;
  quizzes: number;
  achievements: number;
  xp: number;
  friends: number;
  groups: number;
  prizes: number;
  likes: number;
  calendar: number;
  challenges: number;
  league: number;
}

export const MERGE_COUNT_KEYS: readonly (keyof MergeCounts)[] = ['games', 'hosted', 'quizzes', 'achievements', 'xp', 'friends', 'groups', 'prizes', 'likes', 'calendar', 'challenges', 'league'];

export interface MergeSummary extends MergeCounts {
  sameGames: number;
  sameGroups: number;
  sameFriends: number;
  sameAchievements: number;
  logins: MergeLogin[];
  passwordDropped: boolean;
}

export function emptyMergeSummary(): MergeSummary {
  return {
    games: 0, hosted: 0, quizzes: 0, achievements: 0, xp: 0, friends: 0, groups: 0, prizes: 0, likes: 0, calendar: 0, challenges: 0, league: 0,
    sameGames: 0, sameGroups: 0, sameFriends: 0, sameAchievements: 0, logins: [], passwordDropped: false,
  };
}

export interface MergeSide { id: string; nickname: string | null; email: string; avatar: string | null; level: number; xp: number; logins: MergeLogin[] }

/** 66: попередній перегляд; при відмові `summary` і `after` — null. */
export interface AccountMergePreview {
  primary: MergeSide;
  secondary: MergeSide;
  /** мітка другорядного акаунта (нік чи email), яку треба ввести для підтвердження */
  confirm: string;
  refusal: MergeRefusal | null;
  summary: MergeSummary | null;
  after: { level: number; xp: number } | null;
}

export const adminMergeSchema = z.object({ secondaryId: z.string().min(1).max(64), confirm: z.string().max(200) }).strict();
export type AdminMergeBody = z.infer<typeof adminMergeSchema>;
