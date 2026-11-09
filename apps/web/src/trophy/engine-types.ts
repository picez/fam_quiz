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
  /** Грати анімацію появи при показі (лише з decor і без reduced motion). */
  appear: boolean;
}

export interface TrophyHandle {
  dispose(): void;
  /** Програти появу знову; без decor, під reduced motion чи після dispose — нічого. */
  replayAppearance(): void;
  /**
   * Перебудувати модель і оформлення на місці; старе видно, доки нове не готове. Поворот лишається, поява не
   * перезапускається, новіший виклик скасовує старший. Після dispose чи збою — нічого.
   */
  update(look: TrophyLook): void;
}

/** Рушій трофеїв (three.js); цей файл його типи описує без three — тож імпортувати його можна звідусіль. */
export interface TrophyEngine {
  mount(host: HTMLElement, options: TrophyMount, events: { onReady(): void; onError(): void }): TrophyHandle;
}
