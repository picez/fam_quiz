import { Fragment, useSyncExternalStore, type ReactNode } from 'react';
import { currentLocale, subscribeLocale } from './current';

/** Перемонтовує все дерево, коли змінюється мова: жоден закешований текст не лишається старою мовою. */
export function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribeLocale, currentLocale);
  return <Fragment key={locale}>{children}</Fragment>;
}
