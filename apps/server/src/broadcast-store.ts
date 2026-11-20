import type { BroadcastRecipients } from '@quiz/shared';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { recipientsFor } from './bot-plan-store';
import type { Db } from './db/client';
import { profile, pushSubscription, user } from './db/schema';
import { notHidden } from './feed-store';

/**
 * Хто отримає розсилку (59): адресати 56, з них — лише ті, хто має хоч одну підписку
 * і не вимкнув «Оголошення від адміністраторів» (немає профілю — увімкнено); ніколи не бот і не забанені.
 * Без повторів, у порядку id.
 */
export async function audienceOf(db: Db, to: BroadcastRecipients): Promise<string[]> {
  const ids = await recipientsFor(db, to);
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .leftJoin(profile, eq(profile.userId, user.id))
    .where(
      and(
        inArray(user.id, [...new Set(ids)]),
        sql`exists (select 1 from ${pushSubscription} where ${pushSubscription.userId} = ${user.id})`,
        sql`coalesce(${profile.adminPush}, true)`,
        notHidden(user.id),
      ),
    )
    .orderBy(asc(user.id));
  return rows.map((row) => row.id);
}
