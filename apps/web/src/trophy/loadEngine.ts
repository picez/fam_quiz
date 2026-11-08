import type { TrophyEngine } from './engine-types';

/**
 * Єдине місце, що знає шлях до рушія трофеїв, і лише через динамічний import(): three.js лягає в окремий чанк
 * і вантажиться тільки там, де на екрані є трофей.
 */
let pending: Promise<TrophyEngine | null> | null = null;

/** Вантажить рушій один раз (обіцянка кешується); збій чанка — null, і трофей лишається значком. */
export function loadTrophyEngine(): Promise<TrophyEngine | null> {
  pending ??= import('./engine/trophy-engine').then(
    (module) => module.engine,
    () => null,
  );
  return pending;
}

let webgl: boolean | null = null;

/** Чи вміє браузер WebGL (перевіряється один раз). */
export function webglAvailable(): boolean {
  if (webgl === null) {
    try {
      const canvas = document.createElement('canvas');
      webgl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) !== null;
    } catch {
      webgl = false;
    }
  }
  return webgl;
}
