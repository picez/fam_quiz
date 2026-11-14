import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { t } from '../i18n';
import { useOnline } from '../useOnline';
import { Menu } from './Menu';

/** Поки лінивий чанк сторінки вантажиться (32), меню лишається на місці. */
function LazyFallback() {
  return <p className="lead">{t('connecting')}</p>;
}

export function WithMenu() {
  const online = useOnline();
  return (
    <div className="with-menu">
      <Menu />
      {/* Поза грою (32): у грі Play/Host/Stage показують власну смугу «Немає зв’язку». */}
      {!online && (
        <p className="banner is-offline" role="status">
          {t('netOffline')}
        </p>
      )}
      <Suspense fallback={<LazyFallback />}>
        <Outlet />
      </Suspense>
    </div>
  );
}
