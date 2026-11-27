import type { JSX, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import { BackLink } from '../nav/BackLink';
import type { PrivateData } from '../usePrivateData';

/** Вхід із поверненням на ту саму адресу: шлях разом із ?query (напр. /profile/settings?edit=1). */
export function loginFor(path: string): string {
  return `/login?next=${encodeURIComponent(path)}`;
}

/** Підсторінка профілю: «‹ Сторінка» назад (76: туди, звідки прийшли, або на back) і заголовок плитки; title null — без h1 (ще вантажимо). */
export function ProfileSubpage({ title, back = '/profile', className, children }: { title: ReactNode | null; back?: string; className?: string; children: ReactNode }): JSX.Element {
  return (
    <main className={className === undefined ? 'app wide profile-sub' : `app wide profile-sub ${className}`}>
      <div className="profile-sub-head">
        <BackLink parent={back} />
        {title !== null && <h1 className="brand">{title}</h1>}
      </div>
      {children}
    </main>
  );
}

/** Спільні стани підсторінки зі своїми даними: без входу — на вхід, далі «Завантаження…», помилка або вміст. */
export function SubpageData<T>({ state, title, className, children }: { state: PrivateData<T>; title: string; className?: string; children: (data: T) => ReactNode }): JSX.Element {
  const location = useLocation();
  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  return (
    <ProfileSubpage title={title} className={className}>
      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && children(state.data)}
    </ProfileSubpage>
  );
}
