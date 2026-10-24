import type { PinMap } from '@quiz/shared';

/** Адреса SVG вбудованої мапи (Vite кладе public/maps у dist/maps). */
export const PIN_MAP_URL: Record<PinMap, string> = { world: '/maps/world.svg', europe: '/maps/europe.svg', ukraine: '/maps/ukraine.svg' };

/** Адреса основи точки: вбудована мапа або власна картинка; null — немає. */
export function pinBaseUrl(pin: { map: PinMap | null }, imageUrl: string | null): string | null {
  return pin.map !== null ? PIN_MAP_URL[pin.map] : imageUrl;
}
