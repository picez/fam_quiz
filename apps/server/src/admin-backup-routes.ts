import { BACKUP_LIST_MAX, BACKUP_MANUAL_GAP_MS, type AdminBackups } from '@quiz/shared';
import type { FastifyInstance, FastifyRequest, RouteShorthandOptions } from 'fastify';
import type { CurrentUser } from './account-routes';
import type { AdminDeps } from './admin-routes';
import { logAction } from './bans';
import { parseBackupKey } from './db-backup';
import { reportError } from './log';

const NOT_FOUND = { error: 'not_found' };

interface Guards {
  read: RouteShorthandOptions;
  write: RouteShorthandOptions;
  adminOf: (request: FastifyRequest) => Promise<CurrentUser | null>;
}

/**
 * Вкладка «Копії» (64): список із R2 і копія на вимогу. Відновлення з адмінки немає — лише команди db:restore в тексті сторінки.
 * Усе за воротами адмінки: не-адміну й гостю — та сама 404, що й невідомому маршруту.
 */
export async function registerAdminBackupRoutes(app: FastifyInstance, deps: AdminDeps, guards: Guards): Promise<void> {
  const { db, backups, backupList } = deps;
  const { read, write, adminOf } = guards;
  const now = deps.now ?? (() => new Date());

  app.get('/api/admin/backups', read, async (): Promise<AdminBackups & { error?: true }> => {
    const state = backups?.status() ?? { running: false, last: null };
    const base = { stored: backupList !== undefined, enabled: backups !== undefined, running: state.running, last: state.last };
    if (backupList === undefined) return { ...base, rows: [], nextAt: null };
    let listed;
    try {
      listed = await backupList();
    } catch (error) {
      reportError(error, { where: 'admin-backups' });
      return { ...base, rows: [], nextAt: null, error: true };
    }
    const all = listed
      .flatMap((object) => {
        const parsed = parseBackupKey(object.key);
        return parsed === null ? [] : [{ key: object.key, at: parsed.at.toISOString(), bytes: object.size, level: parsed.level }];
      })
      .sort((a, b) => (a.key < b.key ? 1 : -1));
    const next = all[0] === undefined ? null : new Date(new Date(all[0].at).getTime() + BACKUP_MANUAL_GAP_MS);
    return { ...base, rows: all.slice(0, BACKUP_LIST_MAX), nextAt: next !== null && next.getTime() > now().getTime() ? next.toISOString() : null };
  });

  app.post('/api/admin/backups', write, async (request, reply) => {
    const me = await adminOf(request);
    if (me === null) return reply.code(404).send(NOT_FOUND);
    if (backups === undefined) return reply.code(503).send({ error: 'backup_off' });
    const result = await backups.runNow();
    if (!result.started) {
      if (result.reason === 'busy') return reply.code(409).send({ error: 'backup_busy' });
      return reply.code(409).send({ error: 'backup_recent', nextAt: result.nextAt });
    }
    await logAction(db, { adminId: me.id, kind: 'backup_now', targetUserId: null, details: {}, now: now() });
    return reply.code(202).send({});
  });
}
