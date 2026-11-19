/**
 * Малює другу картинку «Знайди відмінності» для сіда `big3`: npx tsx apps/server/scripts/big3/draw.ts → big3/img/spot-b.png.
 * Бере ту саму мініатюру 1280 px з Wikimedia Commons, що й сід (SPOT_FILE), і накладає правки SPOT_EDITS.
 */
import { Resvg } from '@resvg/resvg-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { UA } from '../site-uploads';
import { SPOT_FILE, SPOT_W, changedSvg } from './spot';

const api = `https://commons.wikimedia.org/w/api.php?action=query&prop=imageinfo&iiprop=url&iiurlwidth=${SPOT_W}&format=json&titles=${encodeURIComponent(SPOT_FILE)}`;
const body = (await (await fetch(api, { headers: UA })).json()) as { query: { pages: Record<string, { imageinfo?: { thumburl?: string }[] }> } };
const thumb = Object.values(body.query.pages)[0]?.imageinfo?.[0]?.thumburl;
if (!thumb) throw new Error(`No thumbnail for ${SPOT_FILE}`);
const jpeg = Buffer.from(await (await fetch(thumb, { headers: UA })).arrayBuffer());
const dir = join(import.meta.dirname, 'img');
mkdirSync(dir, { recursive: true });
const png = new Resvg(changedSvg(`data:image/jpeg;base64,${jpeg.toString('base64')}`), { fitTo: { mode: 'width', value: SPOT_W } }).render().asPng();
writeFileSync(join(dir, 'spot-b.png'), png);
console.log(`spot-b.png ${Math.round(png.length / 1024)} KB from ${thumb}`);
