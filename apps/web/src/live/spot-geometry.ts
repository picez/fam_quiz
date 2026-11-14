import { clamp01 } from '@quiz/shared';

/** Координати дотику в частках картинки (0…1 по ширині й висоті); точки за межами затискаються. Спільна з телефоном (29d). */
export function shareOf(rect: { left: number; top: number; width: number; height: number }, clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: rect.width > 0 ? clamp01((clientX - rect.left) / rect.width) : 0,
    y: rect.height > 0 ? clamp01((clientY - rect.top) / rect.height) : 0,
  };
}
