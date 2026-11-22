import { useState, type FormEvent, type JSX } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ADMIN_LOG_EXPORT_MAX, ADMIN_LOG_GROUPS, ADMIN_QUERY_MAX, isDay, type AdminLogGroup } from '@quiz/shared';
import { formatDate } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { intlTag } from '../locales/current';
import { AdminPager } from './Admin';
import { adminLog, adminLogExport, logParams, type LogFilter } from './admin-api';
import { logLine } from './admin-text';
import { logCsv, logFileName } from './log-csv';
import { useAdminData } from './useAdminData';

/** Фільтри з адреси: невідоме значення відкидається, як і порожнє. */
function filterFrom(params: URLSearchParams): LogFilter {
  const groups = ADMIN_LOG_GROUPS.filter((group) => (params.get('groups') ?? '').split(',').includes(group));
  const day = (key: string) => {
    const value = params.get(key) ?? '';
    return isDay(value) ? value : undefined;
  };
  const admin = params.get('admin') ?? '';
  const q = (params.get('q') ?? '').trim().slice(0, ADMIN_QUERY_MAX);
  return { ...(admin ? { admin } : {}), groups, ...(day('from') ? { from: day('from') } : {}), ...(day('to') ? { to: day('to') } : {}), ...(q ? { q } : {}) };
}

/** «Журнал»: фільтри за адміном, групами видів, днями (за Києвом) і текстом — в адресі; вивантаження CSV вибраного. */
export function AdminLog(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const filter = filterFrom(params);
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState(filter.q ?? '');
  const [busy, setBusy] = useState(false);
  const [exportNote, setExportNote] = useState<{ error: string } | { capped: number } | null>(null);
  const key = logParams(filter).toString();
  const state = useAdminData(() => adminLog(filter, page), `${key}:${page}`);

  const change = (next: LogFilter) => {
    setParams(logParams(next), { replace: true });
    setPage(1);
    setExportNote(null);
  };
  const toggle = (group: AdminLogGroup) => change({ ...filter, groups: filter.groups.includes(group) ? filter.groups.filter((one) => one !== group) : ADMIN_LOG_GROUPS.filter((one) => one === group || filter.groups.includes(one)) });
  const setDay = (name: 'from' | 'to', value: string) => {
    const { [name]: _old, ...rest } = filter;
    void _old;
    change(isDay(value) ? { ...rest, [name]: value } : rest);
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    const { q: _old, ...rest } = filter;
    void _old;
    const q = draft.trim();
    change(q ? { ...rest, q } : rest);
  };
  const clear = () => {
    setDraft('');
    change({ groups: [] });
  };

  const download = async () => {
    setBusy(true);
    setExportNote(null);
    const result = await adminLogExport(filter);
    setBusy(false);
    if (!result.ok) {
      setExportNote({ error: errorText(result.error) });
      return;
    }
    const blob = new Blob([logCsv(result.data.rows)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = logFileName(new Date());
    document.body.append(link);
    link.click();
    link.remove();
    // Firefox і Safari скасовують завантаження, якщо посилання звільнити в той самий такт.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (result.data.total > result.data.rows.length) setExportNote({ capped: ADMIN_LOG_EXPORT_MAX });
  };

  const admins = state.status === 'ready' ? state.data.admins : [];
  const filtered = key !== '';
  return (
    <>
      <form className="admin-filters" aria-label={t('adminLogFilters')} onSubmit={search}>
        <label className="field">
          <span>{t('adminLogWho')}</span>
          <select value={filter.admin ?? ''} onChange={(event) => change({ ...filter, admin: event.target.value || undefined })}>
            <option value="">{t('adminLogWhoAll')}</option>
            {admins.map((admin) => (
              <option key={admin.id} value={admin.id}>
                {admin.nickname}
              </option>
            ))}
            {filter.admin !== undefined && !admins.some((admin) => admin.id === filter.admin) && <option value={filter.admin}>{filter.admin}</option>}
          </select>
        </label>
        <fieldset>
          <legend>{t('adminLogWhat')}</legend>
          {ADMIN_LOG_GROUPS.map((group) => (
            <label key={group} className="check">
              <input type="checkbox" checked={filter.groups.includes(group)} onChange={() => toggle(group)} />
              <span>{t(`adminLogGroup_${group}` as TextKey)}</span>
            </label>
          ))}
        </fieldset>
        <label className="field">
          <span>{t('adminLogFrom')}</span>
          <input type="date" value={filter.from ?? ''} max={filter.to} onChange={(event) => setDay('from', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('adminLogTo')}</span>
          <input type="date" value={filter.to ?? ''} min={filter.from} onChange={(event) => setDay('to', event.target.value)} />
        </label>
        <label className="field">
          <span>{t('adminLogSearch')}</span>
          <input type="search" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={ADMIN_QUERY_MAX} />
        </label>
        <div className="admin-actions">
          <button type="submit" className="btn">
            {t('adminSearch')}
          </button>
          {filtered && (
            <button type="button" className="btn" onClick={clear}>
              {t('adminLogClear')}
            </button>
          )}
          <button type="button" className="btn" disabled={busy} onClick={() => void download()}>
            {t('adminLogCsv')}
          </button>
        </div>
      </form>
      {exportNote !== null && 'error' in exportNote && (
        <p className="error" role="alert">
          {exportNote.error}
        </p>
      )}
      {exportNote !== null && 'capped' in exportNote && (
        <p className="meta" role="status">
          {t('adminLogCsvCapped', { count: exportNote.capped.toLocaleString(intlTag()) })}
        </p>
      )}
      {state.status === 'home' && <Navigate to="/" replace />}
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <>
          <p className="error" role="alert">
            {state.message}
          </p>
          <button type="button" className="btn" onClick={state.reload}>
            {t('prizesRetry')}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          {state.data.rows.length === 0 ? (
            <p className="meta">{filtered ? t('adminLogNothing') : t('adminLogEmpty')}</p>
          ) : (
            <ul className="admin-list is-rows">
              {state.data.rows.map((entry) => (
                <li key={entry.id} className="admin-card">
                  <p className="meta">{formatDate(entry.at)}</p>
                  <p>{logLine(entry)}</p>
                </li>
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={setPage} />
        </>
      )}
    </>
  );
}
