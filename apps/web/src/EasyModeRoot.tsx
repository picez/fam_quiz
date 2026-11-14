import { useLayoutEffect, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { applyEasyClass, easyModeOn, subscribeEasyMode } from './easy-mode';

/** Тримає клас is-easy на <html> відповідно до вибору й сторінки (31). */
export function EasyModeRoot() {
  const { pathname } = useLocation();
  const on = useSyncExternalStore(subscribeEasyMode, easyModeOn);
  useLayoutEffect(() => applyEasyClass(pathname), [pathname, on]);
  return null;
}
