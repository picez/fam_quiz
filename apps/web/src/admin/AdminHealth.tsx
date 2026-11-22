import type { JSX, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ADMIN_HEALTH_TABLES, type AdminBackupInfo, type AdminHealth as Health } from '@quiz/shared';
import { formatDate } from '../format';
import { t, type TextKey } from '../i18n';
import { adminHealth } from './admin-api';
import { bytesText, uptimeText } from './admin-text';
import { decimalNumber } from './charts/chart-scale';
import { useAdminData, type AdminData } from './useAdminData';

function Failed({ state }: { state: AdminData<unknown> & { reload: () => void } }): JSX.Element | null {
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status !== 'error') return null;
  return (
    <>
      <p className="error" role="alert">
        {state.message}
      </p>
      <button type="button" className="btn" onClick={state.reload}>
        {t('prizesRetry')}
      </button>
    </>
  );
}

function backupText(backup: AdminBackupInfo): string {
  switch (backup.state) {
    case 'ok':
      return t('adminHealthBackupLine', { date: formatDate(backup.at), size: bytesText(backup.bytes) });
    case 'none':
      return t('adminHealthBackupNone');
    case 'off':
      return t('adminHealthBackupOff');
    default:
      return t('adminHealthBackupError');
  }
}

function Row({ label, value }: { label: TextKey; value: ReactNode }): JSX.Element {
  return (
    <div className="admin-stat">
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Group({ id, title, children }: { id: string; title: TextKey; children: ReactNode }): JSX.Element {
  return (
    <section className="admin-health-group" aria-labelledby={id}>
      <h3 id={id}>{t(title)}</h3>
      {children}
    </section>
  );
}

const ms = (value: number) => decimalNumber(value);

function ServerGroup({ data }: { data: Health }): JSX.Element {
  const { server, memory } = data;
  return (
    <Group id="admin-health-server" title="adminHealthGroupServer">
      <dl className="admin-stats">
        <Row label="adminHealthVersion" value={server.commit ?? t('adminHealthVersionUnknown')} />
        <Row label="adminHealthNode" value={server.node} />
        <Row label="adminHealthStarted" value={t('adminHealthStartedValue', { date: formatDate(server.startedAt), uptime: uptimeText(data.uptimeSec) })} />
        <Row label="adminHealthMemory" value={t('adminHealthMemoryFull', { rss: bytesText(memory.rss), heap: bytesText(memory.heapUsed), total: bytesText(memory.heapTotal), external: bytesText(memory.external) })} />
        <Row label="adminHealthCpu" value={server.cpuPercent === null ? t('adminHealthWaiting') : t('adminHealthCpuValue', { value: decimalNumber(server.cpuPercent) })} />
        <Row label="adminHealthLag" value={server.lagMs === null ? t('adminHealthWaiting') : t('adminHealthLagValue', { p50: ms(server.lagMs.p50), p99: ms(server.lagMs.p99), max: ms(server.lagMs.max) })} />
      </dl>
    </Group>
  );
}

function GamesGroup({ data }: { data: Health }): JSX.Element {
  const { live } = data;
  return (
    <Group id="admin-health-games" title="adminHealthGroupGames">
      {live.restarting && (
        <p className="error" role="status">
          {t('adminHealthRestarting')}
        </p>
      )}
      <dl className="admin-stats">
        <Row label="adminHealthRooms" value={String(data.rooms)} />
        <Row label="adminHealthLobbies" value={String(live.lobby)} />
        <Row label="adminHealthPlaying" value={String(live.playing)} />
        <Row label="adminHealthPaused" value={String(live.paused)} />
        <Row label="adminHealthBotRooms" value={String(live.bot)} />
        <Row label="adminHealthAutopilotRooms" value={String(live.autopilot)} />
        <Row label="adminHealthPlayers" value={t('adminHealthPlayersValue', { online: live.playersOnline, total: live.playersTotal })} />
        <Row label="adminHealthConnections" value={String(data.connections)} />
        <Row label="adminHealthCapacity" value={t('adminHealthCapacityValue', { rooms: data.rooms, max: live.maxRooms })} />
      </dl>
    </Group>
  );
}

function DbGroup({ data }: { data: Health }): JSX.Element {
  const { db, backups } = data;
  return (
    <Group id="admin-health-db" title="adminHealthGroupDb">
      {db === null && <p className="meta">{t('adminHealthDbFailed')}</p>}
      <dl className="admin-stats">
        {db !== null && (
          <>
            <Row label="adminHealthDbSize" value={db.bytes === null ? '—' : bytesText(db.bytes)} />
            <Row
              label="adminHealthRows"
              value={
                <ul className="admin-health-rows">
                  {ADMIN_HEALTH_TABLES.map((table) => (
                    <li key={table}>
                      <span>{t(`adminHealthRow_${table}`)}</span> <span>{decimalNumber(db.rows[table] ?? 0, 0)}</span>
                    </li>
                  ))}
                </ul>
              }
            />
            <Row label="adminHealthPush" value={t('adminHealthPushValue', { subscriptions: db.push.subscriptions, people: db.push.people })} />
          </>
        )}
        <Row label="adminHealthBackup" value={backupText(data.backup)} />
        <Row label="adminHealthBackupsTotal" value={backups === null ? '—' : t('adminHealthBackupsTotalValue', { count: backups.count, size: bytesText(backups.bytes) })} />
      </dl>
    </Group>
  );
}

function ProblemsGroup({ data }: { data: Health }): JSX.Element {
  const { problems } = data;
  return (
    <Group id="admin-health-problems" title="adminHealthGroupProblems">
      {problems === null ? (
        <p className="meta">{t('adminHealthDbFailed')}</p>
      ) : (
        <dl className="admin-stats">
          <Row label="adminHealthErrors24" value={t('adminHealthErrors24Value', { count: problems.errors24h, kinds: problems.errorKinds24h })} />
          <Row label="adminHealthErrorsNew" value={<Link to="/admin/appeals/errors">{problems.errorsNew}</Link>} />
          <Row label="adminHealthProblemsOpen" value={<Link to="/admin/appeals/problems">{problems.problemsOpen}</Link>} />
          <Row label="adminHealthReportsOpen" value={<Link to="/admin/appeals/complaints">{problems.reportsOpen}</Link>} />
        </dl>
      )}
    </Group>
  );
}

/** 71: стан сервера групами — сервер, ігри зараз, база даних, проблеми; «Оновити» перечитує без миготіння. */
export function AdminHealth(): JSX.Element {
  const state = useAdminData(adminHealth, 'health', { keep: true });
  return (
    <section className="admin-health" aria-labelledby="admin-health-title">
      <h2 id="admin-health-title">{t('adminHealthTitle')}</h2>
      {state.status === 'ready' ? (
        <>
          <div className="admin-health-groups">
            <ServerGroup data={state.data} />
            <GamesGroup data={state.data} />
            <DbGroup data={state.data} />
            <ProblemsGroup data={state.data} />
          </div>
          <div className="admin-health-foot">
            <p className="meta">{t('adminHealthChecked', { time: formatDate(state.data.checkedAt) })}</p>
            <button type="button" className="btn btn-small" onClick={state.reload} disabled={state.busy === true} aria-busy={state.busy === true}>
              {state.busy === true ? t('adminHealthRefreshing') : t('adminHealthRefresh')}
            </button>
          </div>
          {state.stale === true && state.busy !== true && (
            <p className="error" role="alert">
              {t('adminHealthRefreshFailed')}
            </p>
          )}
        </>
      ) : (
        <Failed state={state} />
      )}
    </section>
  );
}
