import { useSyncExternalStore, type JSX, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { t } from '../i18n';
import { backTarget, subscribeTrail } from './nav-trail';
import { isGamePath, pageTitle } from './page-meta';

const pathOf = (to: string) => to.split(/[?#]/)[0];

/**
 * «‹ Сторінка» (76): якщо людина прийшла сюди зсередини сайту — назад туди ж (крок історії: повертає й прокрутку),
 * інакше (глибоке посилання, нова вкладка) — на батьківську сторінку. Вхід і ігрові екрани місцем походження не вважаються.
 * Завжди справжнє посилання: відкрити в новій вкладці теж можна.
 */
export function BackLink({ parent, className }: { parent: string; className?: string }): JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const step = useSyncExternalStore(subscribeTrail, () => backTarget(location.key));
  const fromPath = step === null ? null : pathOf(step.from);
  const useFrom = step !== null && fromPath !== null && fromPath !== location.pathname && fromPath !== '/login' && !isGamePath(fromPath) && pageTitle(fromPath) !== null;
  const target = useFrom ? step.from : parent;
  const page = pageTitle(pathOf(target)) ?? t('pageHome');

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!useFrom || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(-step.steps);
  };

  return (
    <Link className={className === undefined ? 'back-link' : `back-link ${className}`} to={target} aria-label={t('backTo', { page })} onClick={onClick}>
      <span className="flip-rtl" aria-hidden="true">
        ‹
      </span>{' '}
      <span aria-hidden="true">{page}</span>
    </Link>
  );
}
