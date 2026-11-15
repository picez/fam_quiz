/**
 * «Знайди відмінності» для «Таємної справи» (сід `detective`): нічний кабінет детектива, 1200×800, вісім відмінностей.
 * Обидві картинки малюються з одних даних (scene(changed)), кола відмінностей — SPOT_SPOTS (частки ширини/висоти).
 * PNG малює draw.ts (npx tsx apps/server/scripts/detective/draw.ts) у detective/img; вони лежать у git.
 * На картинці немає жодного напису й жодної лупи (лупу в цій вікторині малює художник).
 */
const W = 1200;
const H = 800;
export const SPOT_ASPECT = W / H;

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const circle = (x: number, y: number, r: number, fill: string, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;

/** Книжки на полиці: x, ширина, висота, колір (четверта зникає на другій картинці). */
const BOOKS: [number, number, number, string][] = [
  [700, 34, 110, '#8e2b2b'],
  [736, 28, 96, '#2b5d8e'],
  [766, 40, 118, '#2e7d32'],
  [808, 30, 100, '#c49a2c'],
  [840, 36, 112, '#5d3a8e'],
  [878, 26, 90, '#8e5a2b'],
];
/** Сліди черевиків на підлозі: центр і поворот (на обох картинках однакові). */
const STEPS: [number, number, number][] = [
  [150, 735, -15],
  [235, 700, -5],
  [325, 745, -12],
  [410, 705, 0],
];
const step = (x: number, y: number, a: number) =>
  `<g transform="rotate(${a} ${x} ${y})">${ellipse(x, y - 8, 15, 22, '#4e3424')}${ellipse(x, y + 26, 11, 11, '#4e3424')}</g>`;

/** Сцена кабінету; changed — друга картинка з вісьмома відмінностями. */
export const scene = (changed: boolean): string => {
  const parts = [
    rect(0, 0, W, H, '#d9c7a3'),
    // Шпалери в смужку.
    ...Array.from({ length: 24 }, (_, i) => rect(i * 50, 0, 18, 640, '#cfb994')),
    rect(0, 640, W, 160, '#8b5a33'),
    ...Array.from({ length: 6 }, (_, i) => line(0, 660 + i * 26, W, 660 + i * 26, '#7a4c29', 3)),
    line(0, 640, W, 640, '#5e3b1f', 8),
    // Вікно з нічним небом і місяцем (відмінність 1: місяця немає).
    rect(60, 70, 300, 300, '#5e3b1f'),
    rect(78, 88, 264, 264, '#16213e'),
    changed ? '' : circle(270, 160, 40, '#f5e6a1') + circle(290, 145, 36, '#16213e'),
    circle(130, 140, 3, '#ffffff'),
    circle(180, 280, 3, '#ffffff'),
    circle(310, 300, 2, '#ffffff'),
    line(210, 88, 210, 352, '#5e3b1f', 10),
    line(78, 220, 342, 220, '#5e3b1f', 10),
    rect(50, 368, 320, 16, '#4a2e17'),
    // Настінний годинник (відмінність 2: хвилинна стрілка показує не на 2, а на 8).
    circle(500, 140, 62, '#fdf6e3', 'stroke="#4a2e17" stroke-width="10"'),
    ...Array.from({ length: 12 }, (_, i) => {
      const a = (Math.PI / 6) * i;
      return line(500 + 48 * Math.sin(a), 140 - 48 * Math.cos(a), 500 + 54 * Math.sin(a), 140 - 54 * Math.cos(a), '#4a2e17', 4);
    }),
    line(500, 140, 500 + 28 * Math.sin(-Math.PI / 3), 140 - 28 * Math.cos(-Math.PI / 3), '#222', 7),
    changed ? line(500, 140, 500 + 44 * Math.sin((Math.PI * 4) / 3), 140 - 44 * Math.cos((Math.PI * 4) / 3), '#222', 4) : line(500, 140, 500 + 44 * Math.sin(Math.PI / 3), 140 - 44 * Math.cos(Math.PI / 3), '#222', 4),
    circle(500, 140, 6, '#222'),
    // Полиця з книжками (відмінність 3: зникла жовта книжка).
    rect(680, 300, 240, 14, '#4a2e17'),
    ...BOOKS.map(([x, w, h, c], i) => (changed && i === 3 ? '' : rect(x, 300 - h, w, h, c, 'stroke="#2a1a0c" stroke-width="2"'))),
    // Картина в рамі: гори (відмінність 4: рама золота → синя).
    rect(980, 90, 170, 130, changed ? '#2b5d8e' : '#c49a2c'),
    rect(996, 106, 138, 98, '#a7c7e7'),
    `<polygon points="996,204 1040,140 1080,204" fill="#5b7553"/>`,
    `<polygon points="1050,204 1095,130 1134,204" fill="#6f8f66"/>`,
    circle(1110, 128, 10, '#fff3b0'),
    // Сейф у кутку (відмінність 5: на дверцятах немає ручки).
    rect(960, 450, 190, 200, '#4f5b66', 'rx="10"'),
    rect(978, 468, 154, 164, '#5f6c78', 'rx="6"'),
    circle(1040, 550, 30, '#c0c7ce', 'stroke="#2f3a44" stroke-width="5"'),
    circle(1040, 550, 6, '#2f3a44'),
    changed ? '' : rect(1092, 520, 14, 60, '#c0c7ce', 'rx="5"'),
    // Вішак із капелюхом і плащем (відмінність 6: капелюха немає).
    line(620, 640, 620, 360, '#4a2e17', 12),
    line(580, 640, 660, 640, '#4a2e17', 12),
    line(620, 380, 585, 395, '#4a2e17', 8),
    line(620, 380, 655, 395, '#4a2e17', 8),
    `<path d="M600,400 L640,400 L672,600 L568,600 Z" fill="#8a7a55"/>`,
    changed ? '' : ellipse(620, 362, 52, 10, '#3b3b3b') + `<path d="M592,362 Q592,318 620,316 Q648,318 648,362 Z" fill="#3b3b3b"/>` + rect(592, 348, 56, 8, '#7a2020'),
    // Стіл.
    rect(120, 470, 400, 22, '#6d4426'),
    rect(140, 492, 22, 150, '#5e3b1f'),
    rect(478, 492, 22, 150, '#5e3b1f'),
    rect(170, 492, 140, 90, '#6d4426', 'stroke="#4a2e17" stroke-width="3"'),
    circle(240, 537, 6, '#c49a2c'),
    // Настільна лампа (відмінність 7: абажур зелений → червоний).
    rect(170, 455, 70, 15, '#333'),
    line(205, 455, 205, 380, '#333', 6),
    `<path d="M160,385 L250,385 L230,340 L180,340 Z" fill="${changed ? '#c62828' : '#2e7d32'}"/>`,
    // Папери й чашка (відмінність 8: чашки немає).
    rect(280, 450, 110, 20, '#fafafa', 'stroke="#ccc" stroke-width="2" transform="rotate(-4 335 460)"'),
    rect(290, 440, 100, 20, '#f0ece2', 'stroke="#ccc" stroke-width="2" transform="rotate(3 340 450)"'),
    changed ? '' : rect(430, 420, 44, 50, '#ffffff', 'rx="6" stroke="#999" stroke-width="3"') + `<path d="M474,432 q22,12 0,26" fill="none" stroke="#999" stroke-width="6"/>` + ellipse(452, 422, 20, 5, '#6d3b1f'),
    // Килим і сліди (без змін) — для відволікання.
    ellipse(760, 720, 230, 50, '#7a2e2e'),
    ellipse(760, 720, 190, 36, '#8e3a3a'),
    ...STEPS.map(([x, y, a]) => step(x, y, a)),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
};

const spot = (x: number, y: number, r: number) => ({ x: x / W, y: y / H, r: r / W });

/** Вісім відмінностей: місяць, хвилинна стрілка, книжка, рама, ручка сейфа, капелюх, абажур, чашка. */
export const SPOT_SPOTS = [
  spot(275, 155, 55),
  spot(500, 140, 65),
  spot(823, 250, 40),
  spot(1065, 155, 90),
  spot(1099, 550, 40),
  spot(620, 345, 60),
  spot(205, 365, 55),
  spot(455, 440, 45),
];
