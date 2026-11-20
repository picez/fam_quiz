import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { adminAction, problemReport, user } from './db/schema';
import { createProblemReport, listProblemReports, myProblemReports, resolveProblem } from './problem-store';
import { ensureProfile } from './profiles';
import { createTestDb } from './testing/test-db';

describe('problem store (64)', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  const NOW = new Date('2026-11-20T12:00:00Z');
  const ids = { admin: 'prob-admin', olya: 'prob-olya' };

  beforeAll(async () => {
    db = await createTestDb();
    for (const [key, id] of Object.entries(ids)) {
      await db.insert(user).values({ id, name: key, email: `${id}@example.com` });
      await ensureProfile(db, id);
    }
  });

  const input = (text: string) => ({ text, page: null });

  it('stores a report and lists it for its author, newest first', async () => {
    const a = await createProblemReport(db, { userId: ids.olya, input: input('перша'), now: NOW });
    await createProblemReport(db, { userId: ids.olya, input: input('друга'), now: new Date(NOW.getTime() + 1000) });
    expect('id' in a).toBe(true);
    expect((await myProblemReports(db, ids.olya)).map((r) => r.text)).toEqual(['друга', 'перша']);
  });

  it('closes once without a reply and logs only the first close', async () => {
    const made = (await createProblemReport(db, { userId: null, input: input('гостьова'), now: NOW })) as { id: string };
    const first = await resolveProblem(db, { adminId: ids.admin, id: made.id, reply: null, now: NOW });
    expect(first).toEqual({ ok: true, userId: null, replied: false });
    const again = await resolveProblem(db, { adminId: ids.admin, id: made.id, reply: null, now: NOW });
    expect(again.ok).toBe(true);
    const logs = (await db.select().from(adminAction)).filter((l) => l.kind === 'problem_resolve');
    expect(logs).toHaveLength(1);
    expect(await resolveProblem(db, { adminId: ids.admin, id: made.id, reply: 'hi', now: NOW })).toEqual({ ok: false, error: 'problem_no_account' });
    expect(await resolveProblem(db, { adminId: ids.admin, id: 'nope', reply: null, now: NOW })).toEqual({ ok: false, error: 'not_found' });
  });

  it('keeps the author as deleted after the account is gone', async () => {
    const made = (await createProblemReport(db, { userId: ids.olya, input: input('від акаунта'), now: NOW })) as { id: string };
    await db.delete(user).where(eq(user.id, ids.olya));
    const list = await listProblemReports(db, { status: 'open', page: 1 });
    expect(list.rows.find((r) => r.id === made.id)?.who).toEqual({ kind: 'deleted' });
    expect((await db.select().from(problemReport).where(eq(problemReport.id, made.id)))[0].userId).toBeNull();
  });
});
