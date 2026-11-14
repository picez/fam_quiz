import type { GroupItemUse, GroupUsesInput } from '@quiz/shared';
import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { groupItem, groupItemUse, quiz } from './db/schema';
import { visibleItemsWhere } from './group-items';

/** Позначки записів: від найстарішої; title — поточна назва вікторини, mine — вікторина viewerId. */
export async function usesOf(db: Db, itemIds: readonly string[], viewerId: string): Promise<Map<string, GroupItemUse[]>> {
  const found = new Map<string, GroupItemUse[]>();
  if (itemIds.length === 0) return found;
  const rows = await db
    .select({ itemId: groupItemUse.itemId, quizId: groupItemUse.quizId, at: groupItemUse.createdAt, title: quiz.title, ownerId: quiz.ownerId })
    .from(groupItemUse)
    .innerJoin(quiz, eq(quiz.id, groupItemUse.quizId))
    .where(inArray(groupItemUse.itemId, [...itemIds]))
    .orderBy(asc(groupItemUse.createdAt), asc(groupItemUse.quizId));
  for (const row of rows) {
    const list = found.get(row.itemId) ?? [];
    list.push({ quizId: row.quizId, title: row.title, mine: row.ownerId === viewerId, at: row.at.toISOString() });
    found.set(row.itemId, list);
  }
  return found;
}

/** Лише видимі viewer'у записи групи (visibleItemsWhere) і лише своя вікторина; повтор — без змін. */
export async function markUses(
  db: Db,
  groupId: string,
  userId: string,
  input: GroupUsesInput,
  now: Date,
): Promise<{ ok: true; marked: number } | { ok: false; error: 'quiz_not_found' }> {
  const [own] = await db
    .select({ id: quiz.id })
    .from(quiz)
    .where(and(eq(quiz.id, input.quizId), eq(quiz.ownerId, userId)));
  if (own === undefined) return { ok: false, error: 'quiz_not_found' };
  const visible = await db
    .select({ id: groupItem.id })
    .from(groupItem)
    .where(and(eq(groupItem.groupId, groupId), inArray(groupItem.id, input.itemIds), visibleItemsWhere(userId)));
  if (visible.length === 0) return { ok: true, marked: 0 };
  const inserted = await db
    .insert(groupItemUse)
    .values(visible.map((row) => ({ itemId: row.id, quizId: input.quizId, createdAt: now })))
    .onConflictDoNothing()
    .returning({ itemId: groupItemUse.itemId });
  return { ok: true, marked: inserted.length };
}
