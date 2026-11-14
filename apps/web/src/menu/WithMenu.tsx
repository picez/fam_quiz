import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { t } from '../i18n';
import { Menu } from './Menu';

/** Поки лінивий чанк сторінки вантажиться (32), меню лишається на місці. */
function LazyFallback() {
  return <p className="lead">{t('connecting')}</p>;
}

export function WithMenu() {
  return (
    <div className="with-menu">
      <Menu />
      <Suspense fallback={<LazyFallback />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
