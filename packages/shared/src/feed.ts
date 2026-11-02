import { z } from 'zod';
import type { AchievementId } from './achievements';
import type { PrizePlace } from './prizes';
import type { ProfileCard } from './profile';

export const FEED_PAGE_SIZE = 20;
export const FEED_RETENTION_DAYS = 90;
export const FEED_POLL_MS = 30_000;
/** Бейдж показує щонайбільше 99, далі «99+». */
export const FEED_BADGE_CAP = 99;

export const FEED_KINDS = ['game', 'achievement', 'level', 'prize', 'like'] as const;
export type FeedKind = (typeof FEED_KINDS)[number];

export type FeedData =
  | { kind: 'game'; title: string; place: number | null; of: number; team: string | null }
  | { kind: 'achievement'; achievementId: AchievementId }
  | { kind: 'level'; level: number }
  | { kind: 'prize'; place: PrizePlace; name: string; title: string; nickTitle: string | null }
  | { kind: 'like'; title: string | null; questions: number; quiz: boolean; host: boolean; player: boolean };

export interface FeedEvent {
  /** uuid feed_event або `like:<gameId>:<likerId>`. */
  id: string;
  at: string;
  /** Чия подія; для like — хто вподобав. */
  who: ProfileCard;
  /** Подія моя (для like — завжди true: лайк мені). */
  mine: boolean;
  data: FeedData;
  /** null — лише для like. Для своєї події liked завжди false, а веб показує лише лічильник без кнопки. */
  likes: { count: number; liked: boolean } | null;
}

export interface FeedPage {
  events: FeedEvent[];
  next: string | null;
  /** лише на першій сторінці */
  asOf?: string;
}

/** requests / decisions — календар (#21), поки 0. */
export interface FeedBadge {
  events: number;
  requests: number;
  decisions: number;
}

export function feedBadgeTotal(badge: FeedBadge): number {
  return badge.events + badge.requests + badge.decisions;
}

/** "99+" понад FEED_BADGE_CAP, інакше число рядком; 0 → null (бейджа немає). */
export function feedBadgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > FEED_BADGE_CAP ? `${FEED_BADGE_CAP}+` : String(count);
}

/** Курсор "<ISO>|<id>": ISO з Date.parse, id 1…80 символів; разом до 120. */
export const feedCursorSchema = z
  .string()
  .max(120)
  .transform((s, ctx) => {
    const i = s.indexOf('|');
    const at = i > 0 ? Date.parse(s.slice(0, i)) : NaN;
    const id = i > 0 ? s.slice(i + 1) : '';
    if (Number.isNaN(at) || id.length < 1 || id.length > 80) {
      ctx.addIssue({ code: 'custom', message: 'bad cursor' });
      return z.NEVER;
    }
    return { at: new Date(at), id };
  });

export function feedCursor(event: Pick<FeedEvent, 'at' | 'id'>): string {
  return `${event.at}|${event.id}`;
}

export const feedLikeSchema = z.object({ liked: z.boolean() }).strict();

export const feedSeenSchema = z
  .object({ upTo: z.string().max(40).refine((s) => !Number.isNaN(Date.parse(s)), 'bad date') })
  .strict();
