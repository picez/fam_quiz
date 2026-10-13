import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Файли клієнта перевіряються звідси: у пакеті клієнта немає типів Node.
const root = resolve(import.meta.dirname, '../../web');
const read = (path: string) => readFileSync(resolve(root, path));

/** Ширина й висота PNG з його заголовка. */
function pngSize(path: string) {
  const bytes = read(path);
  expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('installable app', () => {
  const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf8')) as {
    name: string;
    short_name: string;
    lang: string;
    start_url: string;
    display: string;
    background_color: string;
    theme_color: string;
    icons: { src: string; sizes: string; type: string; purpose?: string }[];
  };

  it('describes the app the way a phone needs to install it', () => {
    expect(manifest.name).toBe('Вікторина');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.lang).toBe('uk');
    expect(manifest.start_url).toBe('/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.background_color).toBe('#0E1020');
    expect(manifest.theme_color).toBe('#0E1020');
  });

  it('ships every icon it names, in the size it claims', () => {
    expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose ?? 'any'}`).sort()).toEqual([
      '192x192 any',
      '512x512 any',
      '512x512 maskable',
    ]);
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      const [width, height] = icon.sizes.split('x').map(Number);
      expect(pngSize(`public${icon.src}`), icon.src).toEqual({ width, height });
    }
  });

  it('is linked from the page together with the icons', () => {
    const page = read('index.html').toString('utf8');
    expect(page).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
    expect(page).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />');
    expect(page).toContain('<link rel="icon" type="image/png" href="/icon-192.png" />');
    expect(pngSize('public/apple-touch-icon.png')).toEqual({ width: 180, height: 180 });
  });
});
