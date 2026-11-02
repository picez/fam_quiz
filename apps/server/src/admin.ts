import { eq } from 'drizzle-orm';
import type { Db } from './db/client';
import { user } from './db/schema';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** emails.has(email.trim().toLowerCase()) && verified. */
export function isAdminEmail(emails: ReadonlySet<string>, email: string, verified: boolean): boolean {
  return verified && emails.has(email.trim().toLowerCase());
}

/** Порожній набір → false без запиту; інакше читає user.email, email_verified. Немає користувача → false. */
export async function isAdmin(db: Db | Tx, emails: ReadonlySet<string>, userId: string): Promise<boolean> {
  if (emails.size === 0) return false;
  const [row] = await db.select({ email: user.email, verified: user.emailVerified }).from(user).where(eq(user.id, userId));
  return row !== undefined && isAdminEmail(emails, row.email, row.verified);
}
