import { BOT_EMAIL, BOT_NICKNAME, BOT_USER_ID } from '@quiz/shared';
import type { Db } from './db/client';
import { user } from './db/schema';
import { ensureProfile } from './profiles';

/**
 * Рядок user «Квіз-бота» і його профіль (54); повторний виклик нічого не змінює.
 * Рядка account не буває ніколи: ні пароля, ні Google, а email у домені .invalid, тож листа (скидання пароля) не дістати.
 */
export async function ensureBotAccount(db: Db): Promise<void> {
  await db.insert(user).values({ id: BOT_USER_ID, name: BOT_NICKNAME, email: BOT_EMAIL, emailVerified: false }).onConflictDoNothing();
  await ensureProfile(db, BOT_USER_ID);
}
