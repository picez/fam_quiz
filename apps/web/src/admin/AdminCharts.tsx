import type { JSX } from 'react';
import type { AdminBackupInfo } from '@quiz/shared';
import { formatDate } from '../format';
import { t, type TextKey } from '../i18n';
import { adminHealth } from './admin-api';
import { bytesText, uptimeText } from './admin-text';
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

function Row({ label, value }: { label: TextKey; value: string }): JSX.Element {
  return (
    <div className="admin-stat">
      <dt>{t(label)}</dt>
      <dd>{value}</dd>
    </div>
  );
}

/** Стан сервера: остання копія бази, час роботи, пам'ять, живі кімнати й з'єднання. */
export function AdminHealth(): JSX.Element {
  const state = useAdminData(adminHealth, 'health');
  return (
    <section className="admin-health" aria-labelledby="admin-health-title">
      <h2 id="admin-health-title">{t('adminHealthTitle')}</h2>
      {state.status === 'ready' ? (
        <dl className="admin-stats">
          <Row label="adminHealthBackup" value={backupText(state.data.backup)} />
          <Row label="adminHealthUptime" value={uptimeText(state.data.uptimeSec)} />
          <Row label="adminHealthMemory" value={t('adminHealthMemoryValue', { rss: bytesText(state.data.memory.rss), heap: bytesText(state.data.memory.heapUsed) })} />
          <Row label="adminHealthRooms" value={String(state.data.rooms)} />
          <Row label="adminHealthConnections" value={String(state.data.connections)} />
        </dl>
      ) : (
        <Failed state={state} />
      )}
    </section>
  );
}
