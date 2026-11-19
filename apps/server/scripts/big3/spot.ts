/**
 * «Знайди відмінності» для «Великої гри ІІІ» (сід `big3`): картина Гендріка Аверкампа «Зимовий пейзаж із ковзанярами» (бл. 1608, Рейксмузей,
 * суспільне надбання). Перша картинка — мініатюра 1280 px з Wikimedia Commons (SPOT_FILE, завантажується як у big2/mix2 через wideSources),
 * друга — та сама мініатюра з вісьмома правками (img/spot-b.png; малює draw.ts: npx tsx apps/server/scripts/big3/draw.ts).
 * Правки — ділянки тієї ж картини: «клон» переносить сусідній сніг чи небо на предмет, «колір» повертає відтінок, «дзеркало» віддзеркалює фігуру.
 */
export const SPOT_FILE = 'File:Hendrick_Avercamp_-_Winterlandschap_met_ijsvermaak.jpg';
/** Мініатюра 1280 × 739. */
export const SPOT_W = 1280;
export const SPOT_H = 739;
export const SPOT_ASPECT = SPOT_W / SPOT_H;

/** Правка: центр і півосі еліпса (px мініатюри); clone — звідки взяти (зсув), hue — поворот відтінку, flip — віддзеркалення. */
export type SpotEdit = { what: string; x: number; y: number; rx: number; ry: number; rot?: number } & ({ kind: 'clone'; dx: number; dy: number } | { kind: 'hue'; deg: number; sat?: number } | { kind: 'flip' });

export const SPOT_EDITS: SpotEdit[] = [
  { what: 'птах у небі над центром зник', x: 629, y: 34, rx: 16, ry: 11, kind: 'clone', dx: 0, dy: 30 },
  { what: 'птах ліворуч у небі зник', x: 301, y: 129, rx: 13, ry: 9, kind: 'clone', dx: 40, dy: 0 },
  { what: 'вохристий будинок праворуч став червоним', x: 1127, y: 363, rx: 42, ry: 32, kind: 'hue', deg: -30, sat: 1.25 },
  { what: 'червоні сани стали синіми', x: 987, y: 602, rx: 32, ry: 17, kind: 'hue', deg: 190 },
  { what: 'ковзаняр із жердиною розвернувся в інший бік', x: 1012, y: 645, rx: 24, ry: 30, kind: 'flip' },
  { what: 'червона спідниця жінки стала синьою', x: 770, y: 502, rx: 10, ry: 13, kind: 'hue', deg: 200 },
  { what: 'бочка на снігу зникла', x: 283, y: 647, rx: 21, ry: 15, kind: 'clone', dx: 0, dy: 31 },
  { what: 'санки-дошка на снігу зникли', x: 249, y: 695, rx: 42, ry: 20, rot: 22, kind: 'clone', dx: -70, dy: 0 },
];

/** Кола відмінностей: частки ширини/висоти, радіус — частка ширини (з запасом на влучання). */
export const SPOT_SPOTS = SPOT_EDITS.map((e) => ({
  x: Math.round((e.x / SPOT_W) * 1000) / 1000,
  y: Math.round((e.y / SPOT_H) * 1000) / 1000,
  r: Math.round((Math.max(0.025, (Math.max(e.rx, e.ry) + 6) / SPOT_W)) * 1000) / 1000,
}));

/** SVG другої картинки: base — data:-адреса мініатюри. */
export const changedSvg = (base: string): string => {
  const img = (extra = '') => `<image href="${base}" width="${SPOT_W}" height="${SPOT_H}" ${extra}/>`;
  const defs: string[] = [];
  const layers = SPOT_EDITS.map((e, i) => {
    // М'який край: радіальний градієнт маски, щоб латка зливалася з картиною.
    defs.push(
      `<radialGradient id="g${i}"><stop offset="0.75" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`,
      `<mask id="m${i}" maskUnits="userSpaceOnUse" x="0" y="0" width="${SPOT_W}" height="${SPOT_H}"><ellipse cx="${e.x}" cy="${e.y}" rx="${e.rx}" ry="${e.ry}" transform="rotate(${e.rot ?? 0} ${e.x} ${e.y})" fill="url(#g${i})"/></mask>`,
    );
    if (e.kind === 'clone') return `<g mask="url(#m${i})"><g transform="translate(${-e.dx} ${-e.dy})">${img()}</g></g>`;
    if (e.kind === 'flip') return `<g mask="url(#m${i})"><g transform="translate(${2 * e.x} 0) scale(-1 1)">${img()}</g></g>`;
    defs.push(
      `<filter id="f${i}" x="0" y="0" width="1" height="1" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="${e.sat ?? 1.3}"/><feColorMatrix type="hueRotate" values="${e.deg}"/></filter>`,
    );
    return `<g mask="url(#m${i})">${img(`filter="url(#f${i})"`)}</g>`;
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SPOT_W}" height="${SPOT_H}" viewBox="0 0 ${SPOT_W} ${SPOT_H}"><defs>${defs.join('')}</defs>${img()}${layers.join('')}</svg>`;
};
