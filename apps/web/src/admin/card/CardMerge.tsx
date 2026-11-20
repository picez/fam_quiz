import { useEffect, useState, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { MERGE_COUNT_KEYS, type AccountMergePreview, type AdminUserRow, type MergeLogin, type MergeSide, type MergeSummary } from '@quiz/shared';
import type { ApiData } from '../../api';
import { errorText, t, type TextKey } from '../../i18n';
import { adminUsers, mergeAccounts, mergePreview } from '../admin-api';
import { mergeSummaryText } from '../admin-text';
import type { CardProps } from '../AdminUser';

/** Пошук другого акаунта: від двох символів, із затримкою (кожна літера — не запит). */
const SEARCH_MIN = 2;
const SEARCH_DELAY_MS = 300;

const LOGIN_KEYS: Record<MergeLogin, TextKey> = { google: 'adminMergeLoginGoogle', credential: 'adminMergeLoginCredential', other: 'adminMergeLoginOther' };
const SAME_KEYS = ['games', 'groups', 'friends', 'achievements'] as const;
const SAME_FIELDS = { games: 'sameGames', groups: 'sameGroups', friends: 'sameFriends', achievements: 'sameAchievements' } as const;

const label = (side: { nickname: string | null; email: string }): string => side.nickname ?? side.email;
const loginsText = (logins: readonly MergeLogin[]): string => logins.map((login) => t(LOGIN_KEYS[login])).join(', ');

/** «Злиються: …» — те, що було в обох і стало одним (та сама гра, спільна група, друг, досягнення); нічого — null. */
function sameText(summary: MergeSummary): string | null {
  const parts = SAME_KEYS.filter((key) => summary[SAME_FIELDS[key]] > 0).map((key) => t(`adminMergeSame_${key}`, { count: summary[SAME_FIELDS[key]] }));
  return parts.length === 0 ? null : parts.join(', ');
}

/**
 * Об'єднання з іншим акаунтом (66): пошук другого акаунта, вибір головного, перегляд «що куди перейде» (сервер проходить
 * об'єднання й відкочує його), відмова — причина замість кнопки; кнопка активна лише, коли набрано точно мітку акаунта,
 * що зникне (як порівнює сервер), далі ще підтвердження. Після успіху — картка головного (ця — перечитується).
 */
export function CardMerge({ detail, act, busy }: CardProps): JSX.Element {
  const { user } = detail;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<ApiData<AdminUserRow[]> | null>(null);
  const [other, setOther] = useState<AdminUserRow | null>(null);
  const [thisPrimary, setThisPrimary] = useState(true);
  const [preview, setPreview] = useState<{ key: string; result: ApiData<AccountMergePreview> } | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);

  const term = query.trim();
  useEffect(() => {
    if (term.length < SEARCH_MIN) {
      setFound(null);
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void adminUsers(term, 1).then((result) => {
        if (current) setFound(result.ok ? { ok: true, data: result.data.rows.filter((row) => row.id !== user.id) } : result);
      });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [term, user.id]);

  const primaryId = other === null ? null : thisPrimary ? user.id : other.id;
  const secondaryId = other === null ? null : thisPrimary ? other.id : user.id;
  const key = `${primaryId ?? ''}:${secondaryId ?? ''}`;
  useEffect(() => {
    if (primaryId === null || secondaryId === null) return;
    let current = true;
    void mergePreview(primaryId, secondaryId).then((result) => {
      if (current) setPreview({ key, result });
    });
    return () => {
      current = false;
    };
  }, [key, primaryId, secondaryId]);

  const choose = (row: AdminUserRow) => {
    setOther(row);
    setThisPrimary(true);
    setTyped('');
    setError(null);
  };
  const swap = (primaryHere: boolean) => {
    setThisPrimary(primaryHere);
    setTyped('');
    setError(null);
  };

  const shown = preview !== null && preview.key === key ? preview.result : null;
  const view = shown !== null && shown.ok ? shown.data : null;

  const merge = async () => {
    if (view === null) return;
    const here = view.primary.id === user.id;
    const done = await act(
      t('adminMergeConfirm', { secondary: label(view.secondary), primary: label(view.primary) }),
      () => mergeAccounts(view.primary.id, view.secondary.id, typed.trim()),
      setError,
      here,
    );
    if (!done) return;
    if (!here) {
      setOpened(view.primary.id);
      return;
    }
    // Другого акаунта вже немає: розділ знову порожній, картка перечитується (act).
    setOther(null);
    setQuery('');
    setTyped('');
    setPreview(null);
  };

  if (opened !== null) return <Navigate to={`/admin/users/${encodeURIComponent(opened)}`} replace />;
  return (
    <section className="panel admin-card-section admin-card-merge">
      <h2>{t('adminMerge')}</h2>
      <p>{t('adminMergeLead')}</p>
      <label className="field">
        <span>{t('adminMergeSearch')}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} autoComplete="off" spellCheck={false} maxLength={100} />
      </label>
      {term.length >= SEARCH_MIN && found !== null && !found.ok && (
        <p className="error" role="alert">
          {errorText(found.error)}
        </p>
      )}
      {term.length >= SEARCH_MIN && found !== null && found.ok && found.data.length === 0 && <p className="meta">{t('adminNothing')}</p>}
      {term.length >= SEARCH_MIN && found !== null && found.ok && found.data.length > 0 && (
        <ul className="admin-card-lines admin-merge-found">
          {found.data.map((row) => (
            <li key={row.id}>
              <button type="button" className={row.id === other?.id ? 'btn admin-merge-pick is-picked' : 'btn admin-merge-pick'} aria-pressed={row.id === other?.id} onClick={() => choose(row)}>
                <span>{label(row)}</span> <span className="meta">{row.email}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {other !== null && (
        <div className="admin-card-form" role="radiogroup">
          <label className="field field-check">
            <input type="radio" name={`merge-primary-${user.id}`} checked={thisPrimary} onChange={() => swap(true)} />
            {t('adminMergePrimary', { nickname: label(user) })}
          </label>
          <label className="field field-check">
            <input type="radio" name={`merge-primary-${user.id}`} checked={!thisPrimary} onChange={() => swap(false)} />
            {t('adminMergePrimary', { nickname: label(other) })}
          </label>
        </div>
      )}
      {other !== null && shown === null && <p className="meta">{t('loading')}</p>}
      {shown !== null && !shown.ok && (
        <p className="error" role="alert">
          {errorText(shown.error)}
        </p>
      )}
      {view !== null && <MergeView view={view} typed={typed} setTyped={setTyped} busy={busy} onMerge={() => void merge()} />}
      <p className="error admin-card-line" role="alert">
        {error ?? ''}
      </p>
    </section>
  );
}

function SideColumn({ side }: { side: MergeSide }): JSX.Element {
  return (
    <div>
      <h3>{label(side)}</h3>
      <p className="meta">{side.email}</p>
      <p>{t('adminCardLevel', { level: side.level, xp: side.xp })}</p>
      {side.logins.length > 0 && <p className="meta">{t('adminMergeLogins', { logins: loginsText(side.logins) })}</p>}
    </div>
  );
}

function MergeView({ view, typed, setTyped, busy, onMerge }: { view: AccountMergePreview; typed: string; setTyped: (value: string) => void; busy: boolean; onMerge: () => void }): JSX.Element {
  const { summary, after, refusal } = view;
  const same = summary === null ? null : sameText(summary);
  const moves = summary !== null && MERGE_COUNT_KEYS.some((key) => summary[key] > 0);
  return (
    <>
      <div className="admin-card-grid admin-merge-sides">
        <SideColumn side={view.primary} />
        <SideColumn side={view.secondary} />
      </div>
      {after !== null && <p className="admin-merge-total">{t('adminMergeTotal', { level: after.level, xp: after.xp })}</p>}
      {refusal !== null ? (
        <p className="error">{errorText(refusal)}</p>
      ) : (
        <>
          {summary !== null && <p>{t('adminMergeMoves', { summary: moves ? mergeSummaryText(summary) : t('adminMergeNothing') })}</p>}
          {same !== null && <p>{t('adminMergeSame', { summary: same })}</p>}
          {summary?.passwordDropped === true && <p className="error">{t('adminMergePasswordDropped', { nickname: view.confirm })}</p>}
          <label className="field">
            <span>{t('adminMergeType', { nickname: view.confirm })}</span>
            <input type="text" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} maxLength={200} />
          </label>
          <button type="button" className="btn btn-danger" disabled={busy || typed.trim() !== view.confirm} onClick={onMerge}>
            {t('adminMergeButton')}
          </button>
        </>
      )}
    </>
  );
}
