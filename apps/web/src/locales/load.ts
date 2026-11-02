import type { Locale } from '@quiz/shared';

export type Messages = Readonly<Record<string, string>>;

type Module = { default: Messages };
type Loader = () => Promise<[Module, Module]>;

/** Статична мапа, щоб Vite зробив з кожної мови окремий чанк. uk живе в i18n.ts і не вантажиться. */
const LOADERS: Record<Exclude<Locale, 'uk'>, Loader> = {
  en: () => Promise.all([import('./en.json'), import('./en.help.json')]),
  pl: () => Promise.all([import('./pl.json'), import('./pl.help.json')]),
  de: () => Promise.all([import('./de.json'), import('./de.help.json')]),
  es: () => Promise.all([import('./es.json'), import('./es.help.json')]),
  it: () => Promise.all([import('./it.json'), import('./it.help.json')]),
  ar: () => Promise.all([import('./ar.json'), import('./ar.help.json')]),
};

/** Динамічний import() <lang>.json (UI) і <lang>.help.json (довідка ведучого). */
export async function loadMessages(locale: Exclude<Locale, 'uk'>): Promise<{ ui: Messages; help: Messages }> {
  const [ui, help] = await LOADERS[locale]();
  return { ui: ui.default, help: help.default };
}
