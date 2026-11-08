import type { TrophyLook } from './trophy-meta';

/** Розміри трофея на екрані (ті самі, що в TrophyView). */
export type TrophySize = 'stage' | 'phone' | 'card' | 'view';

export interface TrophyMount {
  look: TrophyLook;
  size: TrophySize;
  spin: boolean;
  interactive: boolean;
  /** aria-label полотна (trophyLabel). */
  label: string;
}

export interface TrophyHandle {
  dispose(): void;
}

/** Рушій трофеїв (three.js); цей файл його типи описує без three — тож імпортувати його можна звідусіль. */
export interface TrophyEngine {
  mount(host: HTMLElement, options: TrophyMount, events: { onReady(): void; onError(): void }): TrophyHandle;
}
