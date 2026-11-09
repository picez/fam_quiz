import type { DecorPhoto, Inscription, NickFont, TrophyDecor, TrophyMaterial, TrophyPhotoStyle } from '@quiz/shared';
import { loadNickFont, NICK_FONT_FAMILY } from '../nick-fonts';
import {
  coverCrop,
  fitFontPx,
  LINE_HEIGHT,
  metalStops,
  PHOTO_FRAME_INSET,
  plaqueLines,
  RING_TILE,
  ringAtlasSize,
  BAND_PX,
  rimRepeats,
  rimUnit,
  tileRect,
} from './decor-layout';

/** Малювання текстур оформлення на 2D-контексті. Нічого не створює: контекст і розмір задає виклик. */
type Img = CanvasImageSource & { width: number; height: number };
type Ctx = CanvasRenderingContext2D;
type Rect = { x: number; y: number; width: number; height: number };

const FONT_TIMEOUT_MS = 3000;

export function inscriptionFont(font: NickFont | null, px: number): string {
  if (font === null) return `600 ${px}px Georgia, serif`;
  const weight = font === 'brush' ? 700 : font === 'heavy' ? 400 : 600;
  return `${weight} ${px}px '${NICK_FONT_FAMILY[font]}', Georgia, serif`;
}

/**
 * Шрифт напису готовий (або запасний): збій чи завислий шрифт не затримує малювання довше 3 с. Результат — чи шрифт
 * справді завантажився (класичний, null, є завжди): false означає, що малюватиметься запасним. text — літери напису:
 * шрифти поділені на підмножини (unicode-range), і без тексту FontFaceSet.load вантажить лише латинську, тож кирилиця
 * на полотні малювалася б запасним шрифтом. Рим пишеться великими, тому вантажимо й їх.
 */
export function loadInscriptionFont(font: NickFont | null, text = ' '): Promise<boolean> {
  if (font === null) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), FONT_TIMEOUT_MS);
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      resolve(loaded);
    };
    loadNickFont(font)
      .then(() => {
        const fonts = typeof document === 'undefined' ? undefined : document.fonts;
        // Без FontFaceSet перевірити нічим — вважаємо готовим. Порожній список граней — шрифт не знайшовся (запасний).
        return fonts ? fonts.load(inscriptionFont(font, 40), `${text.toUpperCase()} ${text}`).then((faces) => faces.length > 0) : true;
      })
      .then(finish, () => finish(false));
  });
}

export function toneImageData(data: Uint8ClampedArray, style: TrophyPhotoStyle): void {
  if (style === 'normal') return;
  for (let i = 0; i + 3 < data.length; i += 4) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    if (style === 'bw') {
      const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[i] = y;
      data[i + 1] = y;
      data[i + 2] = y;
    } else {
      data[i] = Math.min(255, Math.round(0.393 * r + 0.769 * g + 0.189 * b));
      data[i + 1] = Math.min(255, Math.round(0.349 * r + 0.686 * g + 0.168 * b));
      data[i + 2] = Math.min(255, Math.round(0.272 * r + 0.534 * g + 0.131 * b));
    }
  }
}

/**
 * Тонує пікселі під прямокутником (x, y, w, h) у координатах малювання. getImageData/putImageData не зважають на
 * перетворення контексту, а полотно на картці зменшене через ctx.scale, тож прямокутник переводиться в пікселі полотна.
 */
function toneRect(ctx: Ctx, x: number, y: number, w: number, h: number, style: TrophyPhotoStyle): void {
  const m = typeof ctx.getTransform === 'function' ? ctx.getTransform() : undefined;
  const a = m?.a ?? 1;
  const d = m?.d ?? 1;
  const px = Math.round(x * a + (m?.e ?? 0));
  const py = Math.round(y * d + (m?.f ?? 0));
  const data = ctx.getImageData(px, py, Math.round(w * a), Math.round(h * d));
  toneImageData(data.data, style);
  ctx.putImageData(data, px, py);
}

function gradientDown(ctx: Ctx, height: number, stops: readonly [string, string, string]): CanvasGradient {
  const g = ctx.createLinearGradient(0, 0, 0, height);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.5, stops[1]);
  g.addColorStop(1, stops[2]);
  return g;
}

function roundedPath(ctx: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + k, y);
  ctx.arcTo(x + w, y, x + w, y + h, k);
  ctx.arcTo(x + w, y + h, x, y + h, k);
  ctx.arcTo(x, y + h, x, y, k);
  ctx.arcTo(x, y, x + w, y, k);
  ctx.closePath();
}

/** Рядок з виглядом: engraved — світла тінь під текстом, embossed — світла й темна, colored — лише текст. */
function drawLooked(ctx: Ctx, text: string, x: number, y: number, look: Inscription['look'], color: string, engraveOffset = 2): void {
  const dy = engraveOffset;
  if (look === 'engraved') {
    ctx.fillStyle = 'rgba(255,246,214,0.55)';
    ctx.fillText(text, x + 2, y + dy);
  } else if (look === 'embossed') {
    ctx.fillStyle = 'rgba(255,246,214,0.7)';
    ctx.fillText(text, x - 1, y - 1);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(text, x + 2, y + 2);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Фото в прямокутнику: «заповнити» з crop, форма й обводка за рамкою, стиль фото; null лишає прямокутник як є. */
function drawPhotoIn(ctx: Ctx, image: Img | null, photo: DecorPhoto, decor: TrophyDecor, rect: Rect, material: TrophyMaterial): void {
  const framed = decor.frame !== 'none';
  const inset = framed ? PHOTO_FRAME_INSET : 0;
  const x = rect.x + inset;
  const y = rect.y + inset;
  const w = rect.width - 2 * inset;
  const h = rect.height - 2 * inset;
  const clipped = decor.frame === 'round' || decor.frame === 'rounded';
  const shape = () => {
    if (decor.frame === 'round') {
      ctx.beginPath();
      ctx.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2, 0, Math.PI * 2);
    } else if (decor.frame === 'rounded') {
      roundedPath(ctx, x, y, w, h, 18);
    }
  };
  if (image !== null) {
    ctx.save();
    if (clipped) {
      shape();
      ctx.clip();
    }
    const c = coverCrop(image, { width: w, height: h }, photo.crop);
    ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, x, y, w, h);
    if (decor.photoStyle !== 'normal') {
      try {
        toneRect(ctx, x, y, w, h, decor.photoStyle);
      } catch {
        // полотно «заплямоване» чужим зображенням: лишаємо кольорове
      }
    }
    ctx.restore();
  }
  if (framed) {
    ctx.save();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    const stops = metalStops(material, 'plate');
    g.addColorStop(0, stops[0]);
    g.addColorStop(0.5, stops[1]);
    g.addColorStop(1, stops[2]);
    ctx.strokeStyle = g;
    ctx.lineWidth = 6;
    if (clipped) shape();
    else {
      ctx.beginPath();
      ctx.rect(x, y, w, h);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** Атлас кільця: клітинка на фото в рядок, тло темне; фото без картинки лишається тлом. */
export function drawPhotoRing(ctx: Ctx, images: (Img | null)[], decor: TrophyDecor, material: TrophyMaterial): void {
  const size = ringAtlasSize(images.length);
  ctx.fillStyle = RING_TILE.background;
  ctx.fillRect(0, 0, size.width, size.height);
  images.forEach((image, i) => {
    const photo = decor.photos[i];
    if (image === null || photo === undefined) return;
    drawPhotoIn(ctx, image, photo, decor, tileRect(i), material);
  });
}

/** Медальйон або самоцвіт: коло px×px, ободок металу, якщо рамка не `none`. */
export function drawPhotoDisc(
  ctx: Ctx,
  image: Img | null,
  photo: DecorPhoto,
  decor: TrophyDecor,
  px: number,
  material: TrophyMaterial = 'gold',
  bezel = false,
): void {
  ctx.clearRect(0, 0, px, px);
  const half = px / 2;
  const framed = decor.frame !== 'none';
  // Медальйон без рамки: тонкий металевий обідок у самій текстурі (на вигнутій чаші тор стирчав).
  const rim = framed || bezel;
  const inner = framed ? half - px * 0.07 : bezel ? half - px * 0.035 : half;
  ctx.save();
  ctx.beginPath();
  ctx.arc(half, half, inner, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = RING_TILE.background;
  ctx.fillRect(0, 0, px, px);
  if (image !== null) {
    const side = inner * 2;
    const c = coverCrop(image, { width: side, height: side }, photo.crop);
    ctx.drawImage(image, c.sx, c.sy, c.sw, c.sh, half - inner, half - inner, side, side);
    if (decor.photoStyle !== 'normal') {
      try {
        toneRect(ctx, 0, 0, px, px, decor.photoStyle);
      } catch {
        // див. drawPhotoIn
      }
    }
  }
  ctx.restore();
  // ободок після тонування, щоб метал лишився кольоровим
  if (rim) {
    ctx.fillStyle = gradientDown(ctx, px, metalStops(material, 'plate'));
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.arc(half, half, inner, 0, Math.PI * 2, true);
    ctx.fill('evenodd');
  }
}

/** Табличка або фон: прямокутна картка на весь розмір. */
export function drawPhotoCard(
  ctx: Ctx,
  image: Img | null,
  photo: DecorPhoto,
  decor: TrophyDecor,
  size: { width: number; height: number },
  material: TrophyMaterial = 'gold',
): void {
  ctx.fillStyle = RING_TILE.background;
  ctx.fillRect(0, 0, size.width, size.height);
  drawPhotoIn(ctx, image, photo, decor, { x: 0, y: 0, width: size.width, height: size.height }, material);
}

/** Стрічка обідка кубка: текст повторюється й розтягується на всю ширину 2048. */
export function drawRim(ctx: Ctx, inscription: Inscription, material: TrophyMaterial): void {
  const W = 2048;
  const H = 96;
  ctx.fillStyle = gradientDown(ctx, H, metalStops(material, 'band'));
  ctx.fillRect(0, 0, W, H);
  ctx.font = inscriptionFont(inscription.font, 54);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const unit = rimUnit(inscription.text);
  const unitWidth = ctx.measureText(unit).width;
  const repeats = rimRepeats(unitWidth, W);
  ctx.save();
  ctx.scale(W / (unitWidth * repeats), 1);
  drawLooked(ctx, unit.repeat(repeats), 0, H / 2, inscription.look, inscription.color);
  ctx.restore();
}

/** Поясок (1024×64 по колу чи 1024×128 на грані): один рядок по центру, кегль до 0.69 висоти. */
export function drawBand(
  ctx: Ctx,
  inscription: Inscription,
  material: TrophyMaterial,
  size: { width: number; height: number } = BAND_PX.ring,
): void {
  const W = size.width;
  const H = size.height;
  ctx.fillStyle = gradientDown(ctx, H, metalStops(material, 'band'));
  ctx.fillRect(0, 0, W, H);
  const lines = [inscription.text.replace(/\n/g, ' ')];
  const px = fitFontPx(lines, (line, p) => {
    ctx.font = inscriptionFont(inscription.font, p);
    return ctx.measureText(line).width;
  }, { width: W - 48, height: H - 8 }, Math.floor(H * 0.69));
  ctx.font = inscriptionFont(inscription.font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawLooked(ctx, lines[0]!, W / 2, H / 2, inscription.look, inscription.color);
}

/** Табличка 1024×400: золота плашка, до двох рядків по центру. */
export function drawPlaque(ctx: Ctx, inscription: Inscription, material: TrophyMaterial): void {
  const W = 1024;
  const H = 400;
  ctx.clearRect(0, 0, W, H);
  roundedPath(ctx, 26, 26, W - 52, H - 52, 42);
  ctx.fillStyle = gradientDown(ctx, H, metalStops(material, 'plate'));
  ctx.fill();
  ctx.lineWidth = 14;
  ctx.strokeStyle = '#7c5e22';
  ctx.stroke();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#f6e3a6';
  ctx.stroke();
  const box = { width: W - 120, height: H - 120 };
  const measureAt = (line: string, p: number) => {
    ctx.font = inscriptionFont(inscription.font, p);
    return ctx.measureText(line).width;
  };
  ctx.font = inscriptionFont(inscription.font, 108);
  const lines = plaqueLines(inscription.text, (line) => ctx.measureText(line).width, box.width);
  if (lines.length === 0) return;
  const px = fitFontPx(lines, measureAt, box, 108);
  ctx.font = inscriptionFont(inscription.font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const ys = lines.length === 1 ? [0.5 * H] : [0.37 * H, 0.66 * H];
  lines.forEach((line, i) => drawLooked(ctx, line, W / 2, ys[i]!, inscription.look, inscription.color, 3));
}

function wrapLines(words: string[], measure: (line: string) => number, maxWidth: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current === '' ? word : `${current} ${word}`;
    if (current !== '' && measure(next) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current !== '') lines.push(current);
  return lines;
}

/** Зворот 512×512: коло металу, до 3 рядків із автопереносом. */
export function drawBack(ctx: Ctx, inscription: Inscription, material: TrophyMaterial): void {
  const S = 512;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = gradientDown(ctx, S, metalStops(material, 'plate'));
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = '#7c5e22';
  ctx.stroke();
  const words = inscription.text.split(/\s+/).filter((w) => w !== '');
  if (words.length === 0) return;
  const maxWidth = S * 0.68;
  let px = 56;
  let lines: string[] = [];
  for (; px >= 14; px -= 2) {
    ctx.font = inscriptionFont(inscription.font, px);
    lines = wrapLines(words, (line) => ctx.measureText(line).width, maxWidth);
    if (lines.length <= 3 && lines.every((l) => ctx.measureText(l).width <= maxWidth)) break;
  }
  lines = lines.slice(0, 3);
  ctx.font = inscriptionFont(inscription.font, px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const step = px * LINE_HEIGHT;
  const top = S / 2 - ((lines.length - 1) * step) / 2;
  lines.forEach((line, i) => drawLooked(ctx, line, S / 2, top + i * step, inscription.look, inscription.color));
}
