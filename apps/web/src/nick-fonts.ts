import { useEffect } from 'react';
import type { NickFont } from '@quiz/shared';

/** CSS шрифту вантажиться лише коли шрифт треба показати: у main.tsx їх немає, Vite кладе кожен в окремий чанк. */
export const NICK_FONT_LOADERS: Record<NickFont, () => Promise<unknown>> = {
  hand: () => import('@fontsource-variable/caveat'),
  round: () => import('@fontsource-variable/comfortaa'),
  mono: () => import('@fontsource-variable/fira-code'),
  poster: () => import('@fontsource-variable/oswald'),
  brush: () => import('@fontsource/amatic-sc/700.css'),
  pixel: () => import('@fontsource-variable/pixelify-sans'),
  elegant: () => import('@fontsource-variable/cormorant'),
  heavy: () => import('@fontsource/dela-gothic-one'),
};

/** Назви родин, як у `.nick-font-<id>` у styles.css; canvas малює ними без CSS-класу. */
export const NICK_FONT_FAMILY: Record<NickFont, string> = {
  hand: 'Caveat Variable',
  round: 'Comfortaa Variable',
  mono: 'Fira Code Variable',
  poster: 'Oswald Variable',
  brush: 'Amatic SC',
  pixel: 'Pixelify Sans Variable',
  elegant: 'Cormorant Variable',
  heavy: 'Dela Gothic One',
};

const loads = new Map<NickFont, Promise<void>>();

/** Один import на шрифт. Збій (офлайн, чанк не прийшов) ковтається: лишається запасний шрифт зі стека. */
export function loadNickFont(font: NickFont): Promise<void> {
  let load = loads.get(font);
  if (load === undefined) {
    let pending: Promise<unknown>;
    try {
      pending = NICK_FONT_LOADERS[font]();
    } catch {
      pending = Promise.resolve();
    }
    load = pending.then(
      () => undefined,
      () => undefined,
    );
    loads.set(font, load);
  }
  return load;
}

/** Для тестів: забути, що було завантажено. */
export function resetNickFontCache(): void {
  loads.clear();
}

export function useNickFont(font: NickFont | null): void {
  useEffect(() => {
    if (font !== null) void loadNickFont(font);
  }, [font]);
}
