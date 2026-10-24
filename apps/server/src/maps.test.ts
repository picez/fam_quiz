import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PIN_MAP_ASPECT, PIN_MAPS } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { PIN_PLACES } from '../scripts/pin-places';

// Файли клієнта перевіряються звідси: у пакеті клієнта немає типів Node.
const root = resolve(import.meta.dirname, '../../web');
const mapPath = (map: string) => resolve(root, `public/maps/${map}.svg`);

describe('built-in maps', () => {
  it('each built-in map has the aspect of PIN_MAP_ASPECT', () => {
    for (const map of PIN_MAPS) {
      expect(existsSync(mapPath(map)), map).toBe(true);
      const svg = readFileSync(mapPath(map), 'utf8');
      const box = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg);
      expect(box, map).not.toBeNull();
      expect(Math.abs(Number(box![1]) / Number(box![2]) - PIN_MAP_ASPECT[map]), map).toBeLessThan(1e-3);
    }
  });

  it('maps credit Natural Earth, carry no scripts or external links and stay small', () => {
    for (const map of PIN_MAPS) {
      const svg = readFileSync(mapPath(map), 'utf8');
      expect(svg).toContain('Natural Earth');
      expect(svg).not.toContain('<script');
      expect(svg).not.toContain('href="http');
      expect(svg).not.toContain('xlink:href="http');
      expect(statSync(mapPath(map)).size, map).toBeLessThanOrEqual(350_000);
    }
  });

  it('reference places sit inside the maps in the right order', () => {
    for (const places of Object.values(PIN_PLACES)) {
      for (const { x, y } of Object.values(places)) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(1);
      }
    }
    const { ukraine, world } = PIN_PLACES;
    expect(ukraine.lviv.x).toBeLessThan(ukraine.kyiv.x);
    expect(ukraine.kyiv.x).toBeLessThan(ukraine.kharkiv.x);
    expect(ukraine.kyiv.y).toBeLessThan(ukraine.odesa.y);
    expect(ukraine.odesa.y).toBeLessThan(ukraine.simferopol.y);
    expect(world.newYork.x).toBeLessThan(world.kyiv.x);
    expect(world.kyiv.x).toBeLessThan(world.tokyo.x);
    expect(world.kyiv.y).toBeLessThan(world.cairo.y);
    expect(world.cairo.y).toBeLessThan(world.sydney.y);
  });
});
