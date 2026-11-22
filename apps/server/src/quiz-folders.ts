import { QUIZ_FOLDER_LIMITS, type QuizFolder } from '@quiz/shared';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from './db/client';
import { quiz, quizFolder, user } from './db/schema';
import { isForeignKeyViolation, isUniqueViolation } from './db/unique';

/**
 * 73: особисті категорії (папки) вікторин. Бачить і міняє лише автор: кожен запит обмежено owner_id.
 * Кожна зміна — у транзакції: спершу рядки категорій автора FOR UPDATE (за id), потім свіже читання набору й перевірки
 * (межа 30, назва, позиції); унікальний індекс без огляду на регістр — остання лінія (23505 → folder_name_taken).
 * Назви приходять уже нормалізовані (quizFolderNameSchema у маршрутах).
 */

type Fail<E extends string> = { ok: false; error: E };
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type FolderRow = typeof quizFolder.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const folderOf = (row: FolderRow): QuizFolder => ({ id: row.id, name: row.name, position: row.position, createdAt: row.createdAt.toISOString() });

const ordered = (db: Db | Tx, ownerId: string) =>
  db.select().from(quizFolder).where(eq(quizFolder.ownerId, ownerId)).orderBy(asc(quizFolder.position), asc(quizFolder.createdAt), asc(quizFolder.id));

/**
 * Замок усього набору категорій автора, далі — свіже читання (новий знімок бачить те, що встигла записати інша транзакція).
 * Спершу — рядок user автора: коли категорій ще немає, FOR UPDATE по них нічого не замикає, і дві перші категорії
 * одночасно отримали б ту саму позицію. Той самий порядок замків — у правилі об'єднання акаунтів.
 */
async function lockedFolders(tx: Tx, ownerId: string): Promise<FolderRow[]> {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, ownerId)).for('update');
  await tx.select({ id: quizFolder.id }).from(quizFolder).where(eq(quizFolder.ownerId, ownerId)).orderBy(asc(quizFolder.id)).for('update');
  return ordered(tx, ownerId);
}

const sameName = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Позиції 0..n−1 за поточним порядком (після видалення — без дірок). */
async function renumber(tx: Tx, rows: readonly FolderRow[], now: Date | null): Promise<void> {
  for (const [index, row] of rows.entries()) {
    if (row.position === index) continue;
    await tx
      .update(quizFolder)
      .set(now === null ? { position: index } : { position: index, updatedAt: now })
      .where(eq(quizFolder.id, row.id));
  }
}

export async function listFolders(db: Db, ownerId: string): Promise<QuizFolder[]> {
  return (await ordered(db, ownerId)).map(folderOf);
}

export async function createFolder(db: Db, ownerId: string, name: string, now: Date): Promise<{ ok: true; folder: QuizFolder } | Fail<'folder_name_taken' | 'folders_full'>> {
  try {
    return await db.transaction(async (tx) => {
      const rows = await lockedFolders(tx, ownerId);
      if (rows.some((row) => sameName(row.name, name))) return { ok: false as const, error: 'folder_name_taken' as const };
      if (rows.length >= QUIZ_FOLDER_LIMITS.perOwner) return { ok: false as const, error: 'folders_full' as const };
      const [row] = await tx.insert(quizFolder).values({ ownerId, name, position: rows.length, createdAt: now, updatedAt: now }).returning();
      return { ok: true as const, folder: folderOf(row!) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'folder_name_taken' };
    throw error;
  }
}

export async function renameFolder(db: Db, ownerId: string, id: string, name: string, now: Date): Promise<{ ok: true; folder: QuizFolder } | Fail<'not_found' | 'folder_name_taken'>> {
  if (!UUID.test(id)) return { ok: false, error: 'not_found' };
  try {
    return await db.transaction(async (tx) => {
      const rows = await lockedFolders(tx, ownerId);
      if (!rows.some((row) => row.id === id)) return { ok: false as const, error: 'not_found' as const };
      if (rows.some((row) => row.id !== id && sameName(row.name, name))) return { ok: false as const, error: 'folder_name_taken' as const };
      const [row] = await tx
        .update(quizFolder)
        .set({ name, updatedAt: now })
        .where(and(eq(quizFolder.id, id), eq(quizFolder.ownerId, ownerId)))
        .returning();
      return { ok: true as const, folder: folderOf(row!) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, error: 'folder_name_taken' };
    throw error;
  }
}

/** ids — рівно всі категорії автора в новому порядку; інакше folders_changed і нічого не змінюється. */
export async function reorderFolders(db: Db, ownerId: string, ids: readonly string[], now: Date): Promise<{ ok: true; folders: QuizFolder[] } | Fail<'folders_changed'>> {
  return db.transaction(async (tx) => {
    const rows = await lockedFolders(tx, ownerId);
    const byId = new Map(rows.map((row) => [row.id, row]));
    const unique = new Set(ids);
    if (unique.size !== ids.length || ids.length !== rows.length || ids.some((id) => !byId.has(id))) {
      return { ok: false as const, error: 'folders_changed' as const };
    }
    const next = ids.map((id) => byId.get(id)!);
    await renumber(tx, next, now);
    return { ok: true as const, folders: next.map((row, index) => folderOf({ ...row, position: index })) };
  });
}

/** Вікторини з категорії стають «Без категорії» (ON DELETE SET NULL; updated_at не змінюється); решта категорій — без дірок. */
export async function deleteFolder(db: Db, ownerId: string, id: string): Promise<boolean> {
  if (!UUID.test(id)) return false;
  return db.transaction(async (tx) => {
    const rows = await lockedFolders(tx, ownerId);
    if (!rows.some((row) => row.id === id)) return false;
    await tx.delete(quizFolder).where(and(eq(quizFolder.id, id), eq(quizFolder.ownerId, ownerId)));
    await renumber(
      tx,
      rows.filter((row) => row.id !== id),
      null,
    );
    return true;
  });
}

/** Перекласти власну вікторину у власну категорію (чи null — без категорії); updated_at не чіпаємо. false — чуже, невідоме чи не-UUID. */
export async function moveQuiz(db: Db, ownerId: string, quizId: string, folderId: string | null): Promise<boolean> {
  if (!UUID.test(quizId) || (folderId !== null && !UUID.test(folderId))) return false;
  const folderOk =
    folderId === null ? sql`true` : sql`exists (select 1 from ${quizFolder} where ${quizFolder.id} = ${folderId} and ${quizFolder.ownerId} = ${ownerId})`;
  try {
    const moved = await db
      .update(quiz)
      .set({ folderId })
      .where(and(eq(quiz.id, quizId), eq(quiz.ownerId, ownerId), folderOk))
      .returning({ id: quiz.id });
    return moved.length > 0;
  } catch (error) {
    // Категорію щойно видалили в іншій вкладці — як невідома.
    if (isForeignKeyViolation(error)) return false;
    throw error;
  }
}
