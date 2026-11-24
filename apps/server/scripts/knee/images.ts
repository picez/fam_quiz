/**
 * Bilder für «Knie & Unterschenkel» (Seed `knee`): Abbildungen aus den Vorlesungsfolien «Anatomie skelettal» (Kerstin Milcarek, 2025),
 * die der Besitzer für sein privates Lernen freigegeben hat. Die Folien-PDFs liegen NICHT im Repo: Standard ist
 * `.superpowers/materials/knee/{femur,knie1,knie2}.pdf` im Repo-Stamm (gitignored), sonst KNEE_PDF_DIR.
 * Jede Abbildung ist ein JPEG-Objekt im PDF (Objektnummer obj). render() schneidet zu, deckt Beschriftungen weiß ab
 * (Antworten dürfen nicht lesbar sein), setzt nummerierte Marken und schreibt PNGs nach `.superpowers/knee-img` (gitignored).
 * Alle Koordinaten sind Pixel des Original-JPEGs; geprüft durch Ansicht mit Raster am 2026-11-24.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';

type Rect = [x1: number, y1: number, x2: number, y2: number];
export interface KneeImage {
  pdf: 'femur' | 'knie1' | 'knie2';
  /** Nummer des JPEG-Objekts im PDF. */
  obj: number;
  /** Größe des Original-JPEGs. */
  size: [w: number, h: number];
  /** Zuschnitt [x, y, w, h]; ohne — das ganze Bild. */
  crop?: [x: number, y: number, w: number, h: number];
  /** Weiß abgedeckte Beschriftungen. */
  masks: Rect[];
  /** Nummernmarken: [Nummer, Mitte x, Mitte y]. */
  marks?: [n: number, x: number, y: number][];
  /** Richtiger Punkt für «Tippe auf …» (Originalkoordinaten). */
  pin?: [x: number, y: number];
}

// Beschriftungen des distalen Femurs (Folie 3/4): links ventral, rechts dorsal.
const FEMUR_LABELS: Rect[] = [
  [20, 400, 165, 470], [45, 505, 165, 572], [300, 630, 420, 705], [465, 635, 585, 700], [600, 215, 780, 280], [605, 300, 750, 367],
  [680, 90, 820, 190], [1190, 90, 1345, 190], [1190, 235, 1370, 280], [1190, 325, 1335, 390], [1190, 405, 1345, 475], [1190, 505, 1315, 570],
  [780, 635, 900, 700], [920, 635, 1100, 705],
];
// Tibiaplateau von kranial (Folie 10).
const PLATEAU_LABELS: Rect[] = [
  [35, 80, 130, 155], [275, 10, 470, 90], [500, 10, 760, 90], [20, 725, 150, 800], [295, 810, 450, 885], [505, 775, 705, 885], [770, 725, 900, 800],
];

export const KNEE_IMAGES = {
  // Folie 2: Beinskelett, links ventral (a), rechts dorsal (b). Patella des linken Bildes.
  skeleton: { pdf: 'femur', obj: 28, size: [586, 1500], masks: [[45, 1455, 85, 1498], [300, 1455, 340, 1498]], pin: [160, 772] },
  // Folie 6a: Patella von ventral; Apex unten.
  patellaFront: { pdf: 'femur', obj: 60, size: [910, 1008], masks: [[0, 0, 910, 165], [300, 880, 620, 1008], [670, 880, 910, 1008], [60, 840, 105, 885]], pin: [462, 855] },
  // Folie 6b: Patella von dorsal, Gelenkfläche.
  patellaBack: { pdf: 'femur', obj: 61, size: [910, 764], masks: [[740, 185, 910, 305], [290, 700, 490, 760], [60, 620, 100, 665]] },
  // Folie 3/4 mit Nummern (1 am Anfang der ventralen Epicondylus-Linie): 1 Epicondylus medialis, 2 Linea intercondylaris, 3 Facies patellaris, 4 Condylus lateralis.
  femurNumbered: {
    pdf: 'femur',
    obj: 40,
    size: [1390, 719],
    masks: FEMUR_LABELS,
    marks: [[1, 590, 357], [2, 1262, 357], [3, 364, 667], [4, 1252, 537]],
  },
  // Folie 4 rechts: Femur dorsal; Tuberculum adductorium.
  femurBack: { pdf: 'femur', obj: 40, size: [1390, 719], crop: [680, 0, 710, 719], masks: FEMUR_LABELS, pin: [865, 312] },
  // Folie 7: Patellagleitlager im Querschnitt; 1 = laterale Facette.
  facets: {
    pdf: 'femur',
    obj: 66,
    size: [910, 1013],
    masks: [[425, 10, 635, 95], [785, 190, 875, 235], [105, 245, 210, 315], [785, 275, 895, 345], [10, 390, 135, 495], [425, 865, 610, 935], [145, 930, 265, 1000], [710, 930, 835, 1000]],
    marks: [[1, 157, 280]],
  },
  // Folie 10: Tibiaplateau; Eminentia intercondylaris.
  plateau: { pdf: 'femur', obj: 77, size: [910, 902], masks: PLATEAU_LABELS, pin: [515, 350] },
  // Folie 10 mit Nummer: 1 = Area intercondylaris anterior.
  plateauNumbered: { pdf: 'femur', obj: 77, size: [910, 902], masks: PLATEAU_LABELS, marks: [[1, 605, 830]] },
  // Folie 9 oben: Tibia ventral; Tuberositas tibiae.
  tibiaFront: {
    pdf: 'femur',
    obj: 70,
    size: [643, 1500],
    crop: [0, 0, 643, 750],
    masks: [[0, 0, 172, 750], [140, 0, 300, 40], [440, 0, 570, 40], [550, 110, 643, 170], [490, 250, 600, 305], [445, 570, 500, 605], [445, 655, 530, 712]],
    pin: [352, 265],
  },
  // Folie 13a: Knie ventral; die Fibula ist nicht beteiligt.
  kneeFront: {
    pdf: 'knie1',
    obj: 37,
    size: [910, 917],
    crop: [0, 0, 480, 917],
    masks: [[0, 350, 125, 545], [60, 760, 120, 795], [320, 165, 425, 200], [405, 295, 480, 660], [315, 780, 388, 812], [60, 875, 100, 905]],
    pin: [160, 720],
  },
  // Folie 13: Kniegelenk ventral/dorsal unverändert — nur als Puzzle (keine Frage nach Namen).
  kneePuzzle: { pdf: 'knie1', obj: 37, size: [910, 917], masks: [] },
  // Folie 17: Halteband-Skizze (LPFL, MPFL, LPML, MPML, LPTL, MPTL) — Beschriftung ist hier die Frage, ohne Instagram-Kopf.
  patellaLigs: { pdf: 'knie1', obj: 52, size: [1070, 1476], crop: [0, 118, 1070, 1335], masks: [] },
  // Folie 19: Knie von lateral; 1 = Lig. collaterale fibulare.
  lateralKnee: {
    pdf: 'knie1',
    obj: 60,
    size: [910, 1429],
    masks: [
      [590, 230, 720, 290], [775, 475, 855, 510], [775, 530, 880, 620], [775, 640, 880, 705], [775, 725, 905, 760], [775, 810, 890, 900], [745, 1005, 870, 1067],
      [145, 507, 277, 570], [110, 595, 277, 660], [125, 683, 277, 745], [103, 765, 277, 830], [133, 848, 277, 885], [205, 1033, 277, 1067], [165, 1345, 195, 1380],
    ],
    marks: [[1, 200, 714]],
  },
  // Folie 18: Knie von medial; Lig. collaterale tibiale.
  medialKnee: {
    pdf: 'knie1',
    obj: 56,
    size: [910, 1434],
    masks: [
      [465, 95, 590, 135], [280, 170, 435, 230], [10, 505, 112, 595], [5, 700, 135, 735], [620, 505, 755, 570], [620, 590, 730, 680], [620, 700, 730, 760],
      [620, 780, 780, 845], [620, 1025, 700, 1060], [40, 1115, 195, 1180], [190, 1365, 220, 1400],
    ],
    pin: [420, 850],
  },
  // Folie 21: Knie ventral bei Flexion; 1 = Lig. cruciatum anterius.
  cruciate: {
    pdf: 'knie1',
    obj: 67,
    size: [1060, 1020],
    crop: [0, 80, 575, 940],
    masks: [[10, 385, 116, 700], [60, 840, 115, 865], [455, 500, 575, 700], [480, 400, 575, 500], [420, 780, 480, 805]],
    marks: [[1, 66, 475]],
  },
  // Folie 26: Sagittalschnitt mit Bursen; Bursa subcutanea prepatellaris.
  bursae: {
    pdf: 'knie1',
    obj: 86,
    size: [948, 768],
    masks: [[0, 105, 200, 235], [0, 250, 200, 375], [0, 490, 145, 610], [805, 90, 948, 210], [755, 230, 948, 375], [765, 430, 948, 555], [740, 640, 948, 760]],
    pin: [728, 370],
  },
  // Folie 27: Menisken von kranial; Lig. transversum genus.
  menisci: {
    pdf: 'knie2',
    obj: 41,
    size: [910, 613],
    masks: [
      [155, 30, 320, 85], [20, 140, 115, 195], [655, 55, 775, 90], [745, 140, 885, 195], [795, 320, 905, 375], [750, 475, 905, 530],
      [675, 550, 745, 603], [530, 550, 630, 603], [310, 550, 490, 603], [155, 550, 290, 603], [10, 475, 145, 530], [20, 575, 50, 605],
    ],
    pin: [495, 205],
  },
  // Folie 31/32: Menisken farbig (vorne oben, medial links); Hinterhorn des Meniscus lateralis.
  horns: {
    pdf: 'knie2',
    obj: 57,
    size: [721, 768],
    masks: [[5, 10, 240, 80], [515, 10, 715, 80], [5, 100, 120, 170], [595, 100, 715, 170], [612, 240, 705, 300], [610, 512, 715, 600], [570, 620, 705, 660], [5, 690, 235, 760], [465, 690, 715, 760]],
    pin: [480, 525],
  },
  // Folie 30: Ernährung des Meniskus; 1 = zentrale Zone.
  nutrition: { pdf: 'knie2', obj: 53, size: [1024, 616], masks: [[15, 15, 230, 105], [15, 160, 255, 290], [15, 355, 152, 445], [15, 515, 230, 605]], marks: [[1, 60, 400]] },
  // Folie 33: Verlagerung der Menisken bei Flexion (Pfeil), Beschriftung abgedeckt.
  shift: { pdf: 'knie2', obj: 66, size: [1012, 768], masks: [[785, 100, 995, 195]] },
  // Folie 37: Bewegungsumfang Flexion/Extension, Gradzahlen abgedeckt.
  flexion: { pdf: 'knie2', obj: 82, size: [1024, 762], masks: [[450, 580, 645, 635], [905, 200, 1024, 255]] },
  // Folie 37: Außenrotation im gebeugten Knie, Gradzahl abgedeckt.
  rotation: { pdf: 'knie2', obj: 83, size: [397, 768], crop: [0, 0, 397, 410], masks: [[322, 245, 397, 285]] },
} satisfies Record<string, KneeImage>;

export type KneeImageKey = keyof typeof KNEE_IMAGES;
export const KNEE_KEYS = Object.keys(KNEE_IMAGES) as KneeImageKey[];

const box = (image: KneeImage) => image.crop ?? [0, 0, image.size[0], image.size[1]];

/** Seitenverhältnis des fertigen Bildes. */
export const aspectOf = (key: KneeImageKey): number => {
  const [, , w, h] = box(KNEE_IMAGES[key]);
  return w / h;
};

/** Richtiger Punkt als Anteil von Breite und Höhe des fertigen Bildes. */
export const pinOf = (key: KneeImageKey): { x: number; y: number } => {
  const image: KneeImage = KNEE_IMAGES[key];
  if (!image.pin) throw new Error(`${key}: no pin`);
  const [x, y, w, h] = box(image);
  return { x: Math.round(((image.pin[0] - x) / w) * 1000) / 1000, y: Math.round(((image.pin[1] - y) / h) * 1000) / 1000 };
};

/** JPEG-Objekte eines PDFs: Objektnummer → Bytes (nur /DCTDecode-Bilder). */
export function pdfJpegs(pdf: Buffer): Map<number, Buffer> {
  const text = pdf.toString('latin1');
  const result = new Map<number, Buffer>();
  const re = /(\d+) 0 obj/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const end = text.indexOf('endobj', m.index);
    const stream = text.indexOf('stream', m.index);
    if (stream < 0 || stream > end) continue;
    const dict = text.slice(m.index, stream);
    if (!/\/Subtype\s*\/Image/.test(dict) || !/\/DCTDecode/.test(dict)) continue;
    const length = /\/Length (\d+)(?! 0 R)/.exec(dict);
    if (!length) continue;
    let start = stream + 'stream'.length;
    if (text[start] === '\r') start++;
    if (text[start] === '\n') start++;
    result.set(Number(m[1]), pdf.subarray(start, start + Number(length[1])));
  }
  return result;
}

/** SVG eines Bildes: Zuschnitt, weiße Abdeckungen, Nummernmarken; debug zeichnet den Zielpunkt rot ein. */
export function imageSvg(image: KneeImage, jpeg: Buffer, debug = false): string {
  const [x, y, w, h] = box(image);
  const masks = image.masks.map(([x1, y1, x2, y2]) => `<rect x="${x1}" y="${y1}" width="${x2 - x1}" height="${y2 - y1}" fill="#ffffff"/>`).join('');
  const marks = (image.marks ?? [])
    .map(
      ([n, cx, cy]) =>
        `<circle cx="${cx}" cy="${cy}" r="24" fill="#ffd400" stroke="#111111" stroke-width="3"/><text x="${cx}" y="${cy + 11}" font-family="Arial, Helvetica, sans-serif" font-size="32" font-weight="bold" fill="#111111" text-anchor="middle">${n}</text>`,
    )
    .join('');
  const pin = debug && image.pin ? `<circle cx="${image.pin[0]}" cy="${image.pin[1]}" r="8" fill="#ff0000"/>` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#ffffff"/>` +
    `<image href="data:image/jpeg;base64,${jpeg.toString('base64')}" x="0" y="0" width="${image.size[0]}" height="${image.size[1]}"/>` +
    `${masks}${marks}${pin}</svg>`
  );
}

/** Rendert alle Bilder als PNG nach outDir; Ergebnis: Schlüssel → Pfad. */
export function renderKneeImages(pdfDir: string, outDir: string, debug = false): Record<KneeImageKey, string> {
  mkdirSync(outDir, { recursive: true });
  const jpegs = new Map<string, Map<number, Buffer>>();
  const result = {} as Record<KneeImageKey, string>;
  for (const key of KNEE_KEYS) {
    const image: KneeImage = KNEE_IMAGES[key];
    if (!jpegs.has(image.pdf)) jpegs.set(image.pdf, pdfJpegs(readFileSync(join(pdfDir, `${image.pdf}.pdf`))));
    const jpeg = jpegs.get(image.pdf)!.get(image.obj);
    if (!jpeg) throw new Error(`${key}: no JPEG object ${image.obj} in ${image.pdf}.pdf`);
    const png = new Resvg(imageSvg(image, jpeg, debug), { font: { loadSystemFonts: true } }).render().asPng();
    const path = join(outDir, `${key}${debug ? '-debug' : ''}.png`);
    writeFileSync(path, png);
    result[key] = path;
  }
  return result;
}

/** Standardordner im Repo-Stamm (beide gitignored). */
export const KNEE_PDF_DIR = process.env.KNEE_PDF_DIR ?? join(import.meta.dirname, '..', '..', '..', '..', '.superpowers', 'materials', 'knee');
export const KNEE_OUT_DIR = join(import.meta.dirname, '..', '..', '..', '..', '.superpowers', 'knee-img');

// Direkter Aufruf: npx tsx apps/server/scripts/knee/images.ts [--debug]
if (process.argv[1]?.endsWith('images.ts')) {
  const paths = renderKneeImages(KNEE_PDF_DIR, KNEE_OUT_DIR, process.argv.includes('--debug'));
  for (const [key, path] of Object.entries(paths)) console.log(key, path, readFileSync(path).length);
}
