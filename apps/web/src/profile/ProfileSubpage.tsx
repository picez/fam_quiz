import type { JSX, ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { t } from '../i18n';
import type { PrivateData } from '../usePrivateData';

/** Вхід із поверненням на ту саму адресу. */
export function loginFor(pathname: string): string {
  return `/login?next=${encodeURIComponent(pathname)}`;
}

/** Підсторінка профілю: «‹» назад (посилання, тож працює й на глибокому посиланні) і заголовок плитки; title null — без h1 (ще вантажимо). */
export function ProfileSubpage({ title, back = '/profile', className, children }: { title: ReactNode | null; back?: string; className?: string; children: ReactNode }): JSX.Element {
  return (
    <main className={className === undefined ? 'app wide profile-sub' : `app wide profile-sub ${className}`}>
      <div className="profile-sub-head">
        <Link className="profile-back" to={back} aria-label={t('profileBack')}>
          <span className="flip-rtl" aria-hidden="true">
            ‹
          </span>
        </Link>
        {title !== null && <h1 className="brand">{title}</h1>}
      </div>
      {children}
    </main>
  );
}

/** Спільні стани підсторінки зі своїми даними: без входу — на вхід, далі «Завантаження…», помилка або вміст. */
export function SubpageData<T>({ state, title, children }: { state: PrivateData<T>; title: string; children: (data: T) => ReactNode }): JSX.Element {
  const location = useLocation();
  if (state.status === 'signed-out') return <Navigate to={loginFor(location.pathname)} replace />;
  return (
    <ProfileSubpage title={title}>
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
