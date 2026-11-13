/**
 * «Знайди відмінності» для «Великого шкільного марафону»: шкільний клас, 1200×800, шість відмінностей.
 * Обидві картинки малюються з одних даних (scene(changed)), кола відмінностей — SPOT_SPOTS (частки ширини/висоти).
 * PNG малює draw.ts (npx tsx apps/server/scripts/mega/draw.ts) у mega/img; вони лежать у git.
 */
const W = 1200;
const H = 800;
export const SPOT_ASPECT = W / H;

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const circle = (x: number, y: number, r: number, fill: string, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
const text = (x: number, y: number, s: string, size: number, fill: string) =>
  `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-size="${size}" font-weight="bold" fill="${fill}" text-anchor="middle">${s}</text>`;

/** Сцена класу; changed — друга картинка з шістьма відмінностями. */
export const scene = (changed: boolean): string => {
  const parts = [
    rect(0, 0, W, H, '#f3e7c9'),
    rect(0, 620, W, 180, '#b98b5a'),
    // Дошка з формулою й фігурою (відмінність 6: трикутник → квадрат).
    rect(110, 80, 600, 330, '#8b5a2b'),
    rect(125, 95, 570, 300, '#2f5d3a'),
    text(410, 200, 'a² + b² = c²', 64, '#f5f5f5'),
    changed
      ? `<rect x="360" y="275" width="100" height="100" fill="none" stroke="#f5f5f5" stroke-width="6"/>`
      : `<polygon points="350,375 470,375 350,270" fill="none" stroke="#f5f5f5" stroke-width="6" stroke-linejoin="round"/>`,
    // Годинник (відмінність 1: годинна стрілка на 3 → на 9).
    circle(880, 140, 60, '#ffffff', 'stroke="#333" stroke-width="8"'),
    line(880, 140, 880, 95, '#333', 6),
    changed ? line(880, 140, 845, 140, '#333', 9) : line(880, 140, 915, 140, '#333', 9),
    circle(880, 140, 6, '#333'),
    // Вікно з сонцем (відмінність 2: сонця немає).
    rect(810, 240, 320, 290, '#ffffff'),
    rect(825, 255, 290, 260, '#9fd3f5'),
    line(970, 255, 970, 515, '#ffffff', 10),
    line(825, 385, 1115, 385, '#ffffff', 10),
    changed ? '' : circle(1060, 310, 34, '#ffd23f'),
    // Парта.
    rect(140, 580, 520, 26, '#7a4b25'),
    rect(160, 606, 22, 120, '#5e3a1c'),
    rect(618, 606, 22, 120, '#5e3a1c'),
    // Глобус (відмінність 3: океан синій → фіолетовий).
    rect(245, 555, 30, 25, '#555'),
    line(260, 555, 260, 545, '#555', 8),
    circle(260, 495, 55, changed ? '#8e5cc9' : '#3d7fd9', 'stroke="#555" stroke-width="5"'),
    `<path d="M228,470 q20,-15 40,0 q10,20 -10,30 q-25,5 -30,-30 z" fill="#5fbf5a"/>`,
    `<path d="M270,515 q18,-8 25,10 q-10,15 -25,5 z" fill="#5fbf5a"/>`,
    // Яблуко (відмінність 4: яблука немає).
    changed ? '' : circle(470, 555, 24, '#d93636') + line(470, 532, 474, 520, '#5e3a1c', 4) + `<ellipse cx="484" cy="522" rx="10" ry="5" fill="#4caf50"/>`,
    // Стос книжок (відмінність 5: середня книжка жовта → червона).
    rect(545, 555, 100, 24, '#2e7d32'),
    rect(552, 531, 90, 24, changed ? '#c62828' : '#f9a825'),
    rect(548, 507, 96, 24, '#1565c0'),
    // Плакат з атомом (без змін).
    rect(40, 440, 80, 110, '#ffffff', 'stroke="#999" stroke-width="3"'),
    `<ellipse cx="80" cy="495" rx="30" ry="12" fill="none" stroke="#e53935" stroke-width="3"/>`,
    `<ellipse cx="80" cy="495" rx="30" ry="12" fill="none" stroke="#e53935" stroke-width="3" transform="rotate(60 80 495)"/>`,
    `<ellipse cx="80" cy="495" rx="30" ry="12" fill="none" stroke="#e53935" stroke-width="3" transform="rotate(-60 80 495)"/>`,
    circle(80, 495, 6, '#1e88e5'),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
};

const spot = (x: number, y: number, r: number) => ({ x: x / W, y: y / H, r: r / W });

/** Шість відмінностей: фігура на дошці, годинна стрілка, сонце, глобус, яблуко, середня книжка. */
export const SPOT_SPOTS = [spot(410, 325, 75), spot(880, 140, 70), spot(1060, 310, 50), spot(260, 495, 65), spot(470, 545, 40), spot(597, 543, 50)];
