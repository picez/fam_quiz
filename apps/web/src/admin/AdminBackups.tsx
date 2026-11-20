import { useEffect, useState, type JSX } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { BACKUP_RESTORE_COMMANDS, type AdminBackupRow, type BackupRun } from '@quiz/shared';
import { timeText, viewerZone } from '../calendar/calendar-time';
import { formatDate } from '../format';
import { errorText, t } from '../i18n';
import { bytesText } from './admin-text';
import { adminBackups, startBackup } from './admin-api';
import { useAdminData } from './useAdminData';

/** Поки копія знімається — перечитуємо стан кожні 5 с. */
const RUNNING_REFRESH_MS = 5_000;

const restoreCommand = (key: string): string => BACKUP_RESTORE_COMMANDS.key.replace('{key}', key);

function lastText(last: BackupRun): string {
  const date = formatDate(last.at);
  const who = t(last.by === 'admin' ? 'adminBackupsByAdmin' : 'adminBackupsBySchedule');
  if (last.outcome === 'ok') return t('adminBackupsLastOk', { date, who, size: bytesText(last.bytes ?? Number.NaN) });
  if (last.outcome === 'failed') return t('adminBackupsLastFailed', { date, who });
  return t('adminBackupsLastLocked', { date });
}

function BackupRowItem({ row, onCopy, failed }: { row: AdminBackupRow; onCopy: () => void; failed: boolean }): JSX.Element {
  return (
    <li className="admin-card panel">
      <p className="admin-mark">{formatDate(row.at)}</p>
      <p className="meta">{bytesText(row.bytes)}</p>
      <p className="meta">{t('adminBackupsLevel', { level: row.level })}</p>
      <div className="admin-actions">
        <button type="button" className="btn" onClick={onCopy}>
          {t('adminBackupsCopyCommand')}
        </button>
      </div>
      {/* Буфер обміну недоступний — команда видима, щоб виділити її вручну. */}
      {failed && (
        <p className="admin-backup-command" dir="ltr">
          <code>{restoreCommand(row.key)}</code>
        </p>
      )}
    </li>
  );
}

function RestoreHelp(): JSX.Element {
  return (
    <section className="panel admin-backups-restore" aria-labelledby="backups-restore">
      <h2 id="backups-restore">{t('adminBackupsRestoreTitle')}</h2>
      <p>{t('adminBackupsRestoreLead')}</p>
      <ol>
        <li>{t('adminBackupsRestoreStep1')}</li>
        <li>
          {t('adminBackupsRestoreStep2')}
          <code dir="ltr">{BACKUP_RESTORE_COMMANDS.list}</code>
          <code dir="ltr">{BACKUP_RESTORE_COMMANDS.latest}</code>
        </li>
        <li>
          {t('adminBackupsRestoreStep3')}
          <code dir="ltr">{BACKUP_RESTORE_COMMANDS.key}</code>
        </li>
        <li>{t('adminBackupsRestoreStep4')}</li>
      </ol>
    </section>
  );
}

/**
 * Вкладка «Копії» (64): копії бази в R2 з розміром і рівнем міграцій, «Зробити копію зараз» (не частіше раз на годину),
 * остання спроба й інструкція відновлення з командного рядка. Кнопки відновлення немає й не буде.
 */
export function AdminBackups(): JSX.Element {
  const state = useAdminData(adminBackups, 'backups', { keep: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  const zone = viewerZone();
  const { reload, refresh } = state;
  const data = state.status === 'ready' ? state.data : null;
  const running = data?.running === true;
  const nextAt = data?.nextAt ?? null;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(refresh, RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [running, refresh]);
  /** Коли настане nextAt — перечитуємо, щоб кнопка ожила без оновлення сторінки. */
  useEffect(() => {
    if (nextAt === null) return;
    const timer = setTimeout(reload, Math.max(0, Date.parse(nextAt) - Date.now()) + 1_000);
    return () => clearTimeout(timer);
  }, [nextAt, reload]);

  const start = async () => {
    if (!window.confirm(t('adminBackupsNowConfirm'))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await startBackup();
    setBusy(false);
    if (!result.ok) {
      const when = result.nextAt === undefined ? '' : ` ${t('adminBackupsNextAt', { time: timeText(result.nextAt, zone) })}`;
      setError(`${errorText(result.error)}${when}`);
    }
    reload();
  };
  const copy = async (key: string) => {
    setError(null);
    try {
      await navigator.clipboard.writeText(restoreCommand(key));
      setCopyFailed(null);
      setNotice(t('adminBackupsCopied'));
    } catch {
      setNotice(null);
      setCopyFailed(key);
    }
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  const waiting = nextAt !== null && Date.parse(nextAt) > Date.now();
  const status = running ? t('adminBackupsRunning') : (notice ?? '');

  return (
    <div className="admin-backups">
      <section className="panel" aria-labelledby="backups-title">
        <h2 id="backups-title">{t('adminTabBackups')}</h2>
        {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
        {state.status === 'error' && (
          <>
            <p className="error">{state.message}</p>
            <button type="button" className="btn" onClick={reload}>
              {t('prizesRetry')}
            </button>
          </>
        )}
        {data !== null && (
          <>
            {!data.stored ? (
              <p className="meta">{t('adminBackupsNoStore')}</p>
            ) : data.error === true ? (
              <p className="error">{t('adminBackupsListError')}</p>
            ) : data.rows[0] !== undefined ? (
              <p>{t('adminBackupsLatest', { date: formatDate(data.rows[0].at), size: bytesText(data.rows[0].bytes) })}</p>
            ) : (
              <p className="meta">{t('adminBackupsNone')}</p>
            )}
            {data.last !== null && (
              <p className={data.last.outcome === 'failed' ? 'error' : 'meta'}>
                {lastText(data.last)}
                {data.last.outcome === 'failed' && (
                  <>
                    {' '}
                    <Link to="/admin/errors">{t('adminTabErrors')}</Link>
                  </>
                )}
              </p>
            )}
            {!data.enabled && <p className="meta">{t('adminBackupsOff')}</p>}
            {data.enabled && waiting && nextAt !== null && !running && <p className="meta">{t('adminBackupsNextAt', { time: timeText(nextAt, zone) })}</p>}
          </>
        )}
        <p className="error admin-backups-live" role="alert">
          {error ?? ''}
        </p>
        <p className="meta admin-backups-live" role="status">
          {status}
        </p>
        <div className="admin-actions">
          <button type="button" className="btn btn-primary" disabled={data === null || !data.enabled || running || waiting || busy} onClick={() => void start()}>
            {t('adminBackupsNow')}
          </button>
        </div>
      </section>
      {data !== null && data.rows.length > 0 && (
        <ul className="admin-list" aria-label={t('adminTabBackups')}>
          {data.rows.map((row) => (
            <BackupRowItem key={row.key} row={row} failed={copyFailed === row.key} onCopy={() => void copy(row.key)} />
          ))}
        </ul>
      )}
      <RestoreHelp />
    </div>
  );
}
