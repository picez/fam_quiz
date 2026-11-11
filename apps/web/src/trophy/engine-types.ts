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
   * перезапускається, новіший виклик скасовує старший. label — новий aria-label полотна (trophyLabel), ставиться
   * разом із новим виглядом. Після dispose чи збою — нічого.
   */
  update(look: TrophyLook, label: string): void;
}

/** Рушій трофеїв (three.js); цей файл його типи описує без three — тож імпортувати його можна звідусіль. */
export interface TrophyEngine {
  mount(host: HTMLElement, options: TrophyMount, events: { onReady(): void; onError(): void }): TrophyHandle;
  /**
   * Статичний знімок вигляду (data URL з прозорим тлом, кадрування як у сцені) через той самий спільний рендерер;
   * збій — null. Необов'язковий: підмінні рушії в тестах можуть його не мати.
   */
  snapshot?(look: TrophyLook, label: string): Promise<TrophySnapshot | null>;
}

/** Знімок трофея: url — data URL (WebP, на старому Safari — PNG); complete — оформлення намальоване повністю. */
export interface TrophySnapshot {
  url: string;
  complete: boolean;
}
