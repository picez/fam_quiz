import { isBotUser, type EditorTimeInput } from '@quiz/shared';
import { sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { activityDay } from './db/schema';
import { kyivDay } from './xp-rules';

/** 71: стеля активного часу в редакторі за київський день — 16 год. */
export const EDITOR_DAY_MAX_SEC = 57_600;

/** 71: людина була на сайті цього київського дня; повтор — нічого. Бот — не людина. */
export async function markActiveDay(db: Db, userId: string, now: Date): Promise<void> {
  if (isBotUser(userId)) return;
  await db.insert(activityDay).values({ userId, day: kyivDay(now) }).onConflictDoNothing();
}

/** 71: + активні секунди редактора за київський день (стеля EDITOR_DAY_MAX_SEC); start — нова сесія. */
export async function addEditorTime(db: Db, userId: string, input: EditorTimeInput, now: Date): Promise<void> {
  if (isBotUser(userId)) return;
  const sessions = input.start ? 1 : 0;
  await db
    .insert(activityDay)
    .values({ userId, day: kyivDay(now), editorSec: Math.min(EDITOR_DAY_MAX_SEC, input.seconds), editorSessions: sessions })
    .onConflictDoUpdate({
      target: [activityDay.userId, activityDay.day],
      set: {
        editorSec: sql`least(${EDITOR_DAY_MAX_SEC}, ${activityDay.editorSec} + excluded.editor_sec)`,
        editorSessions: sql`${activityDay.editorSessions} + excluded.editor_sessions`,
      },
    });
}
