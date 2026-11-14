/**
 * «Знайди відмінності» для «Великого святкового фестивалю»: хата на Святвечір, 1200×800, вісім відмінностей.
 * Обидві картинки малюються з одних даних (scene(changed)), кола відмінностей — SPOT_SPOTS (частки ширини/висоти).
 * PNG малює draw.ts (npx tsx apps/server/scripts/fest/draw.ts) у fest/img; вони лежать у git.
 * На картинці немає жодного напису.
 */
const W = 1200;
const H = 800;
export const SPOT_ASPECT = W / H;

const rect = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${extra}/>`;
const circle = (x: number, y: number, r: number, fill: string, extra = '') => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${extra}/>`;
const ellipse = (x: number, y: number, rx: number, ry: number, fill: string, extra = '') => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" ${extra}/>`;
const line = (x1: number, y1: number, x2: number, y2: number, stroke: string, w: number) =>
  `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
/** Ромбик вишивки з центром (x, y). */
const rhomb = (x: number, y: number, s: number, fill: string) => `<polygon points="${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}" fill="${fill}"/>`;
/** Восьмипроменева зірка. */
const star = (x: number, y: number, r: number, fill: string) => {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    pts.push(`${(x + rr * Math.cos(a)).toFixed(1)},${(y + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
};

/** Рушник над вікном: позиції ромбиків на лівому звисі (найнижчий зникає на другій картинці). */
const TOWEL_RHOMBS = [130, 180, 230, 280];
/** Ромбики вишивки на звисі скатертини (шостий зникає на другій картинці). */
const CLOTH_RHOMBS = Array.from({ length: 10 }, (_, i) => 235 + i * 64);

/** Сцена Святвечора; changed — друга картинка з вісьмома відмінностями. */
export const scene = (changed: boolean): string => {
  const parts = [
    rect(0, 0, W, H, '#f4e6c8'),
    rect(0, 640, W, 160, '#a8743f'),
    line(0, 640, W, 640, '#8a5a2b', 6),
    // Вікно з нічним небом і першою зіркою (відмінність 1: зірки немає).
    rect(70, 60, 320, 280, '#6d4c2f'),
    rect(88, 78, 284, 244, '#1b2a52'),
    changed ? '' : star(300, 140, 34, '#ffd23f'),
    circle(150, 250, 4, '#ffffff'),
    circle(200, 120, 3, '#ffffff'),
    circle(330, 270, 3, '#ffffff'),
    line(230, 78, 230, 322, '#6d4c2f', 10),
    line(88, 200, 372, 200, '#6d4c2f', 10),
    rect(60, 338, 340, 16, '#8a5a2b'),
    // Мальована тарілка на стіні (відмінність 2: пелюстки червоні → жовті).
    circle(560, 160, 78, '#ffffff', 'stroke="#1e5aa8" stroke-width="8"'),
    ...[0, 1, 2, 3, 4, 5].map((i) =>
      ellipse(560 + 30 * Math.cos((Math.PI / 3) * i), 160 + 30 * Math.sin((Math.PI / 3) * i), 20, 11, changed ? '#f9a825' : '#d32f2f', `transform="rotate(${60 * i} ${560 + 30 * Math.cos((Math.PI / 3) * i)} ${160 + 30 * Math.sin((Math.PI / 3) * i)})"`),
    ),
    circle(560, 160, 13, '#2e7d32'),
    // Рушник на жердині: верхня смуга й два звиси (відмінність 3: на лівому звисі зник найнижчий ромбик).
    line(820, 70, 1100, 70, '#6d4c2f', 10),
    rect(840, 64, 240, 26, '#ffffff', 'stroke="#ddd" stroke-width="2"'),
    rect(840, 90, 56, 230, '#ffffff', 'stroke="#ddd" stroke-width="2"'),
    rect(1024, 90, 56, 230, '#ffffff', 'stroke="#ddd" stroke-width="2"'),
    ...TOWEL_RHOMBS.map((y, i) => (changed && i === 3 ? '' : rhomb(868, y, 14, '#c62828'))),
    ...TOWEL_RHOMBS.map((y) => rhomb(1052, y, 14, '#c62828')),
    line(846, 316, 890, 316, '#c62828', 5),
    line(1030, 316, 1074, 316, '#c62828', 5),
    // Дідух у кутку (відмінність 4: стрічка червона → синя).
    ...Array.from({ length: 13 }, (_, i) => line(1090, 700, 1010 + i * 13, 380 + Math.abs(6 - i) * 14, '#d4a017', 6)),
    ...Array.from({ length: 13 }, (_, i) => ellipse(1010 + i * 13, 372 + Math.abs(6 - i) * 14, 6, 14, '#e0b23a')),
    rect(1062, 575, 56, 22, changed ? '#1565c0' : '#c62828', 'rx="6"'),
    // Стіл зі скатертиною (відмінність 5: на звисі скатертини зник шостий ромбик).
    rect(190, 470, 670, 26, '#ffffff', 'stroke="#ddd" stroke-width="2"'),
    rect(190, 496, 670, 70, '#ffffff', 'stroke="#ddd" stroke-width="2"'),
    ...CLOTH_RHOMBS.map((x, i) => (changed && i === 5 ? '' : rhomb(x, 531, 18, '#c62828'))),
    rect(215, 566, 26, 120, '#6d4c2f'),
    rect(809, 566, 26, 120, '#6d4c2f'),
    // Вареники на тарілці (без змін).
    ellipse(290, 462, 70, 14, '#e3f2fd', 'stroke="#90a4ae" stroke-width="3"'),
    ...[255, 290, 325].map((x) => `<path d="M${x - 22},458 a22,18 0 0 1 44,0 z" fill="#fff8e1" stroke="#d7ccc8" stroke-width="2"/>`),
    // Калач зі свічкою (відмінність 6: свічка не горить).
    ellipse(440, 452, 80, 22, '#b5651d'),
    ellipse(440, 436, 66, 20, '#c97a2b'),
    ellipse(440, 420, 50, 17, '#d98e3a'),
    rect(431, 330, 18, 84, '#fffde7', 'stroke="#e0d9b0" stroke-width="2"'),
    line(440, 330, 440, 320, '#333', 3),
    changed ? '' : ellipse(440, 304, 10, 18, '#ff9800') + ellipse(440, 308, 5, 9, '#ffeb3b'),
    // Миска куті з ложкою (відмінність 7: ложки немає).
    `<path d="M570,430 a70,40 0 0 0 140,0 z" fill="#8d5524"/>`,
    ellipse(640, 430, 70, 13, '#a1887f'),
    ...[600, 625, 650, 675].map((x, i) => circle(x, 427 + (i % 2) * 3, 4, '#4e342e')),
    changed ? '' : line(665, 425, 720, 345, '#c49a6c', 9) + ellipse(722, 340, 12, 8, '#c49a6c'),
    // Глечик узвару (відмінність 8: глечик коричневий → зелений).
    ellipse(785, 405, 48, 60, changed ? '#2e7d32' : '#8d5524'),
    rect(767, 330, 36, 30, changed ? '#2e7d32' : '#8d5524'),
    `<path d="M830,375 q35,30 0,60" fill="none" stroke="${changed ? '#2e7d32' : '#8d5524'}" stroke-width="10"/>`,
    ellipse(785, 405, 30, 8, '#fbe9e7', 'opacity="0.5"'),
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
};

const spot = (x: number, y: number, r: number) => ({ x: x / W, y: y / H, r: r / W });

/** Вісім відмінностей: зірка, тарілка, ромбик рушника, стрічка дідуха, ромбик скатертини, вогник свічки, ложка, глечик. */
export const SPOT_SPOTS = [
  spot(300, 140, 50),
  spot(560, 160, 80),
  spot(868, TOWEL_RHOMBS[3], 35),
  spot(1090, 586, 45),
  spot(CLOTH_RHOMBS[5], 531, 35),
  spot(440, 306, 35),
  spot(695, 385, 55),
  spot(790, 395, 70),
];
