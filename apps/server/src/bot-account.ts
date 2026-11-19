import { BOT_EMAIL, BOT_NICKNAME, BOT_USER_ID } from '@quiz/shared';
import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { user } from './db/schema';
import { log } from './log';
import { ensureProfile } from './profiles';

/**
 * Рядок user «Квіз-бота» і його профіль (54); повторний виклик нічого не змінює; false — пошту бота займає хтось інший.
 * Рядка account не буває ніколи: ні пароля, ні Google, а email у домені .invalid, тож листа (скидання пароля) не дістати.
 */
export async function ensureBotAccount(db: Db): Promise<boolean> {
  // Чужий рядок із поштою бота (інший id) не вставити: попереджаємо й живемо без бота, а не падаємо на старті.
  const [holder] = await db.select({ id: user.id }).from(user).where(eq(user.email, BOT_EMAIL));
  if (holder !== undefined && holder.id !== BOT_USER_ID) {
    log.warn({ where: 'bot-account' }, 'Пошту бота займає інший користувач: бота не створено');
    return false;
  }
  await db.insert(user).values({ id: BOT_USER_ID, name: BOT_NICKNAME, email: BOT_EMAIL, emailVerified: false }).onConflictDoNothing({ target: user.id });
  await ensureProfile(db, BOT_USER_ID);
  return true;
}
