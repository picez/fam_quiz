import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { documentTitleFor } from './page-meta';

/**
 * Що відбувається на кожен перехід (76): заголовок вкладки. Стоїть у AppRoutes перед <Routes>,
 * тож його ефект іде раніше за ефекти сторінки й useDocumentTitle може уточнити назву.
 */
export function RouteEffects(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = documentTitleFor(pathname);
  }, [pathname]);

  return null;
}
