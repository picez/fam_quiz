import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { t } from '../i18n';
import { Loading } from '../ui/PageState';
import { useOnline } from '../useOnline';
import { AnnouncementBanner } from '../announcement/AnnouncementBanner';
import { Menu } from './Menu';

/** Поки лінивий чанк сторінки вантажиться (32), меню лишається на місці; «Підключаємося…» — лише для гри (76). */
function LazyFallback() {
  return (
    <main className="app">
      <Loading />
    </main>
  );
}

export function WithMenu() {
  const online = useOnline();
  return (
    <div className="with-menu">
      <Menu />
      <AnnouncementBanner />
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
