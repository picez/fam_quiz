import { useState, type JSX } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { ADMIN_FEED_KINDS, type AdminFeedKind, type AdminFeedRow } from '@quiz/shared';
import { feedIcon, feedText } from '../feed/feed-text';
import { formatDate } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { nickText } from '../nick';
import { AdminPager } from './Admin';
import { adminFeed, setFeedHidden } from './admin-api';
import { PeoplePicker, type PickedPerson } from './PeoplePicker';
import { useAdminData } from './useAdminData';

const isKind = (value: string): value is AdminFeedKind => (ADMIN_FEED_KINDS as readonly string[]).includes(value);

interface FeedFilter {
  person: PickedPerson | null;
  kind: AdminFeedKind | '';
  page: number;
}

/** Фільтри з адреси: ?user=&name=&kind=&page= (63); погане — як немає. */
function filterOf(params: URLSearchParams): FeedFilter {
  const user = params.get('user') ?? '';
  const kind = params.get('kind') ?? '';
  const page = Number(params.get('page'));
  return {
    person: user === '' ? null : { id: user, nickname: params.get('name') || user },
    kind: isKind(kind) ? kind : '',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  };
}

function paramsOf(filter: FeedFilter): URLSearchParams {
  const params = new URLSearchParams();
  if (filter.person !== null) {
    params.set('user', filter.person.id);
    params.set('name', filter.person.nickname);
  }
  if (filter.kind !== '') params.set('kind', filter.kind);
  if (filter.page > 1) params.set('page', String(filter.page));
  return params;
}

/**
 * «Стрічка» (63): усі події стрічки, від найновіших, з фільтрами за людиною й видом.
 * «Сховати»/«Показати» — без підтвердження (дія зворотна); після дії список перечитується.
 * Людина, вид і сторінка — в адресі: переживають перезавантаження й «Назад» із картки людини.
 */
export function AdminFeed(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const filter = filterOf(params);
  const { kind, page } = filter;
  const change = (next: FeedFilter) => setParams(paramsOf(next), { replace: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const user = filter.person?.id;
  const query = { page, ...(user === undefined ? {} : { user }), ...(kind === '' ? {} : { kind }) };
  const state = useAdminData(() => adminFeed(query), `${user ?? ''}:${kind}:${page}`, { keep: true });

  const toggle = async (row: AdminFeedRow) => {
    setBusy(true);
    setError(null);
    const result = await setFeedHidden(row.id, row.hidden === null);
    setBusy(false);
    if (!result.ok) setError(errorText(result.error));
    state.reload();
  };

  if (state.status === 'home') return <Navigate to="/" replace />;
  return (
    <>
      <p className="meta">{t('adminFeedLead')}</p>
      <div className="admin-filters">
        <fieldset className="admin-filter-person">
          <legend>{t('adminFeedPerson')}</legend>
          <PeoplePicker
            id="admin-feed-person"
            value={filter.person === null ? [] : [filter.person]}
            max={1}
            onChange={(next) => change({ ...filter, person: next[0] ?? null, page: 1 })}
          />
        </fieldset>
        <label className="field compact" htmlFor="admin-feed-kind">
          <span>{t('adminFeedKind')}</span>
          <select
            id="admin-feed-kind"
            value={kind}
            onChange={(event) => {
              const value = event.target.value;
              change({ ...filter, kind: isKind(value) ? value : '', page: 1 });
            }}
          >
            <option value="">{t('adminFeedKindAll')}</option>
            {ADMIN_FEED_KINDS.map((value) => (
              <option key={value} value={value}>
                {t(`adminFeedKind_${value}` as TextKey)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="error admin-action-line" role="alert">
        {error ?? ''}
      </p>
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <>
          <p className="error">{state.message}</p>
          <button type="button" className="btn" onClick={state.reload}>
            {t('prizesRetry')}
          </button>
        </>
      )}
      {state.status === 'ready' && (
        <>
          {state.data.rows.length === 0 ? (
            <p className="meta">{t('adminFeedEmpty')}</p>
          ) : (
            <ul className="admin-list">
              {state.data.rows.map((row) => (
                <li key={row.id} className="admin-card admin-feed-row">
                  <p className="meta">{formatDate(row.at)}</p>
                  <p>
                    <Link to={`/admin/users/${encodeURIComponent(row.who.id)}`} dir="auto">
                      {nickText(row.who.nickname)}
                    </Link>{' '}
                    <span aria-hidden="true">{feedIcon(row.data)} </span>
                    {feedText(row.data)}
                  </p>
                  <p className="meta">❤️ {row.likes}</p>
                  {row.hidden !== null && <p className="admin-mark is-banned">{t('adminFeedHidden')}</p>}
                  <button type="button" className={row.hidden === null ? 'btn btn-danger' : 'btn'} disabled={busy} onClick={() => void toggle(row)}>
                    {row.hidden === null ? t('adminFeedHide') : t('adminFeedShow')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <AdminPager page={state.data.page} pages={state.data.pages} onPage={(next) => change({ ...filter, page: next })} />
        </>
      )}
    </>
  );
}
