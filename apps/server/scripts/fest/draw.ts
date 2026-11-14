/**
 * Малює PNG «Знайди відмінності» для сіда `fest`: npx tsx apps/server/scripts/fest/draw.ts → fest/img/spot-a.png, spot-b.png.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { scene } from './spot';

const dir = join(import.meta.dirname, 'img');
mkdirSync(dir, { recursive: true });
for (const [key, changed] of [['spot-a', false], ['spot-b', true]] as const) {
  const png = new Resvg(scene(changed), { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  writeFileSync(join(dir, `${key}.png`), png);
  console.log(`${key}.png ${Math.round(png.length / 1024)} KB`);
}
