/** Висота видимої області (visualViewport; без нього — вікно). */
export function viewportHeight(): number {
  return window.visualViewport?.height ?? window.innerHeight;
}

/**
 * Екранна клавіатура справді відкрилася: видима область стала нижчою більш ніж на 100 px, ніж була (before).
 * Програмний фокус (курсор після заставки) клавіатури не відкриває — тоді прокручувати не треба, і довге
 * запитання лишається на екрані з початку.
 */
export function keyboardOpened(before: number): boolean {
  return viewportHeight() < before - 100;
}
