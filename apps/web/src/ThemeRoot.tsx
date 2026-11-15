import { useLayoutEffect, useSyncExternalStore } from 'react';
import { applyThemeClass, lightThemeOn, subscribeTheme } from './theme-mode';

/** Тримає клас is-light на <html> відповідно до вибору й теми системи. */
export function ThemeRoot() {
  const light = useSyncExternalStore(subscribeTheme, lightThemeOn);
  useLayoutEffect(() => applyThemeClass(), [light]);
  return null;
}
