/**
 * Малює PNG «Логіки й дедукції» з SVG у figures.ts: npx tsx apps/server/scripts/logic/draw.ts
 * Кладе logic/img/<ключ>.png (ширина 1200 px); потрібні системні шрифти з кирилицею (Arial).
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FIGURES } from './figures';

const dir = join(import.meta.dirname, 'img');
mkdirSync(dir, { recursive: true });
for (const [key, make] of Object.entries(FIGURES)) {
  const png = new Resvg(make(), { font: { loadSystemFonts: true, defaultFontFamily: 'Arial' }, fitTo: { mode: 'width', value: 1200 } }).render().asPng();
  writeFileSync(join(dir, `${key}.png`), png);
  console.log(`${key}.png ${Math.round(png.length / 1024)} KB`);
}
