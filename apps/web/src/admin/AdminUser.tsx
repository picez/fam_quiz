import { useState, type JSX } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { AdminUserDetail, AdminUserRow } from '@quiz/shared';
import type { ApiResult } from '../api';
import { formatDate } from '../format';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';
import { adminUser } from './admin-api';
import { useAdminData } from './useAdminData';
import { CardAchievements } from './card/CardAchievements';
import { CardDelete } from './card/CardDelete';
import { CardGames } from './card/CardGames';
import { CardMerge } from './card/CardMerge';
import { CardModeration } from './card/CardModeration';
import { CardOverview } from './card/CardOverview';
import { CardPrizes } from './card/CardPrizes';
import { CardXp } from './card/CardXp';

/**
 * Дія картки: підтвердження → запит → після успіху картка перечитується (`reread: false` — ні, напр. після видалення);
 * not_found веде на головну, інша помилка — у `report` (рядок-тривога свого розділу). Досягнення чи подарунка вже немає
 * (друга вкладка, другий адмін) — помилка в розділі й картка перечитується. Повертає, чи вдалося.
 */
export type CardAct = (confirmText: string, run: () => Promise<ApiResult<object>>, report: (error: string | null) => void, reread?: boolean) => Promise<boolean>;

/** Спільне для розділів картки (58). */
export interface CardProps {
  detail: AdminUserDetail;
  act: CardAct;
  busy: boolean;
}

export function AdminUser(): JSX.Element {
  const { id = '' } = useParams();
  // keep: перечитування після дії не ховає картку — стан розділів (повідомлення, поля) лишається.
  const state = useAdminData(() => adminUser(id), id, { keep: true });
  if (state.status === 'home') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
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
  return <UserView key={state.data.user.id} detail={state.data} reload={state.reload} stale={state.stale === true} />;
}

/** 69: шапка картки — нік, email і позначки; решта (реєстрація, ігри, вікторини) — в «Огляді». */
function CardHead({ user }: { user: AdminUserRow }): JSX.Element {
  return (
    <header className="admin-user-head">
      <h2>{nickText(user.nickname)}</h2>
      <p className="meta" dir="ltr">
        {user.email}
      </p>
      {user.admin && <p className="admin-mark">{t('adminIsAdmin')}</p>}
      {user.banned !== null && <p className="admin-mark is-banned">{t('adminBanned', { date: formatDate(user.banned.at) })}</p>}
    </header>
  );
}

/** Помилки дії, після яких картка застаріла, а не зникла: перечитати. */
const STALE_ERRORS = new Set(['achievement_not_owned', 'gift_not_found']);

function UserView({ detail, reload, stale }: { detail: AdminUserDetail; reload: () => void; stale: boolean }): JSX.Element {
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const act: CardAct = async (confirmText, run, report, reread = true) => {
    if (!window.confirm(confirmText)) return false;
    setBusy(true);
    report(null);
    const result = await run();
    setBusy(false);
    if (result.ok) {
      if (reread) reload();
      return true;
    }
    if (result.error === 'not_found') setGone(true);
    else report(errorText(result.error));
    // Масова дія зупинилась на помилці, зробивши частину: картка застаріла, перечитуємо.
    if (STALE_ERRORS.has(result.error) || ((result as { done?: number }).done ?? 0) > 0) reload();
    return false;
  };

  if (gone) return <Navigate to="/" replace />;
  const props: CardProps = { detail, act, busy };
  return (
    <div className="admin-player-card">
      <Link className="quiet-link" to="/admin/users">
        {t('adminBack')}
      </Link>
      {stale && (
        <p className="meta" role="status">
          {t('adminLiveStale')}
        </p>
      )}
      <CardHead user={detail.user} />
      <CardOverview detail={detail} />
      <CardAchievements {...props} />
      <CardXp {...props} />
      <CardGames detail={detail} />
      <CardModeration {...props} />
      <CardPrizes {...props} />
      {/* 66: за ключем — після переходу на картку головного розділ починає з чистого. */}
      <CardMerge key={detail.user.id} {...props} />
      {!detail.user.admin && <CardDelete {...props} />}
    </div>
  );
}
