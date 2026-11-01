/**
 * Єдине місце, що знає про пакет model-viewer, і лише через динамічний import(): бібліотека (з three.js)
 * лягає в окремий чанк і вантажиться тільки там, де на екрані є трофей.
 */
let pending: Promise<boolean> | null = null;

/** Вантажить model-viewer один раз (обіцянка кешується); збій — false, і трофей лишається значком. */
export function loadViewer(): Promise<boolean> {
  pending ??= import('@google/model-viewer').then(
    () => true,
    () => false,
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
