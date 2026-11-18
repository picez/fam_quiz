import type { PrizePlace, TrophyMaterial } from '@quiz/shared';
import { t } from '../i18n';
import { IMAGE_FONTS, canvasPng, kyivDate, safeFileName, sharePng, wrapText } from '../share-image';
import { MATERIAL_LOOK, TROPHY_EMOJI, type TrophyLook } from './trophy-meta';

export interface DiplomaData {
  nickname: string;
  place: PrizePlace;
  quizTitle: string;
  date: Date;
  engraving: string | null;
  trophy: TrophyLook | null;
}

const WIDTH = 1200;
const HEIGHT = 850;
const DISPLAY = IMAGE_FONTS.display;
const BODY = IMAGE_FONTS.body;
const PAPER = '#FFFBF0';
/**
 * Срібло, золото й діамант світлі й на кремовому папері ледь видні: рамка — темніший відтінок того самого кольору
 * (контраст ≥ 3.5:1), а посередині широкої рамки — тонка смужка кольору матеріалу, як відблиск на металі.
 */
const FRAME_SHADE: Partial<Record<TrophyMaterial, string>> = {
  silver: '#7B879B',
  gold: '#AC7E16',
  diamond: '#3F86B0',
};
/** Бронза до 25e: колір матеріалу без змін (і так контрастна). */
const LEGACY_FRAMES: readonly TrophyMaterial[] = ['bronze'];

/** Відносна яскравість sRGB-кольору #RRGGBB (WCAG). */
function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
}

/** Контраст двох кольорів за WCAG (1…21). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Колір рамки диплома: колір матеріалу; нові світлі (перламутр, мармур, платина…) — темніший відтінок того самого
 * кольору, доки контраст з кремовим папером не сягне 3:1 (інакше рамка зливається з тлом).
 */
export function diplomaFrame(material: TrophyMaterial): string {
  const color = MATERIAL_LOOK[material].color;
  const fixed = FRAME_SHADE[material];
  if (fixed !== undefined) return fixed;
  if (LEGACY_FRAMES.includes(material)) return color;
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  let shade = color;
  for (let k = 1; contrast(shade, PAPER) < 3; k *= 0.92) {
    shade = `#${rgb.map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
  }
  return shade;
}

/** Поля диплома; порожні текстові поля — null (їх на дипломі немає). */
interface DiplomaFields {
  title: string;
  nickname: string;
  place: string;
  quizTitle: string | null;
  engraving: string | null;
  date: string;
}

const filled = (text: string | null): string | null => (text === null || text.trim() === '' ? null : text);

function diplomaFields(data: DiplomaData): DiplomaFields {
  return {
    title: t('diplomaTitle'),
    nickname: data.nickname,
    place: t('diplomaPlace', { place: data.place }),
    quizTitle: filled(data.quizTitle),
    engraving: filled(data.engraving),
    date: kyivDate(data.date),
  };
}

/** Рядки диплома зверху вниз (без порожніх): «Диплом», нік, «1 місце», назва вікторини, гравіювання, дата dd.mm.yyyy (Europe/Kyiv). */
export function diplomaLines(data: DiplomaData): string[] {
  const fields = diplomaFields(data);
  return [fields.title, fields.nickname, fields.place, fields.quizTitle, fields.engraving, fields.date].filter(
    (line): line is string => line !== null && line.trim() !== '',
  );
}

/** dyplom-<нік>.png: усе, крім літер і цифр, стає дефісом. */
export function diplomaFileName(nickname: string): string {
  return safeFileName('dyplom', nickname);
}

/** Диплом PNG: canvas 1200 × 850, рамка в кольорі матеріалу (без трофея — золота). */
export async function renderDiploma(data: DiplomaData): Promise<Blob> {
  await document.fonts?.ready;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (context === null) throw new Error('canvas_unavailable');
  const material = data.trophy?.material ?? 'gold';
  const look = MATERIAL_LOOK[material];
  const frame = diplomaFrame(material);
  // Кожне поле на своєму місці: порожня назва вікторини не зсуває гравіювання й дату.
  const { title, nickname, place, quizTitle, engraving, date } = diplomaFields(data);

  context.fillStyle = PAPER;
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = frame;
  context.lineWidth = 18;
  context.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);
  if (FRAME_SHADE[material] !== undefined) {
    context.strokeStyle = look.color;
    context.lineWidth = 4;
    context.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);
    context.strokeStyle = frame;
  }
  context.lineWidth = 4;
  context.strokeRect(62, 62, WIDTH - 124, HEIGHT - 124);

  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  const center = WIDTH / 2;
  const width = WIDTH - 240;

  // Колір значка задано явно: інакше одноколірний гліф узяв би кремовий колір тла й зник.
  context.fillStyle = '#2B2340';
  context.font = `96px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
  context.fillText(data.trophy ? TROPHY_EMOJI[data.trophy.kind] : '🏆', center, 190);

  context.fillStyle = '#2B2340';
  context.font = `700 72px ${DISPLAY}`;
  context.fillText(title.toUpperCase(), center, 300);

  context.font = `700 60px ${BODY}`;
  context.fillText(wrapText(context, nickname, width)[0] ?? '', center, 400);

  // Неметалеві (камені, діамант) — синє місце, метали — темне золото.
  context.fillStyle = look.metallic < 0.5 ? '#3A7CA5' : '#7A5A12';
  context.font = `600 44px ${DISPLAY}`;
  context.fillText(place, center, 480);

  context.fillStyle = '#2B2340';
  context.font = `500 34px ${BODY}`;
  let y = 560;
  if (quizTitle !== null)
    for (const line of wrapText(context, quizTitle, width).slice(0, 2)) {
      context.fillText(line, center, y);
      y += 44;
    }
  if (engraving !== null) {
    context.font = `italic 30px ${BODY}`;
    for (const line of wrapText(context, `«${engraving}»`, width).slice(0, 2)) {
      context.fillText(line, center, y + 10);
      y += 40;
    }
  }
  context.fillStyle = '#6B6380';
  context.font = `400 28px ${BODY}`;
  context.fillText(date, center, HEIGHT - 110);

  return canvasPng(canvas);
}

/** canShare({ files }) → share; інакше завантаження через <a download>. Скасування share (AbortError) — не помилка. */
export function shareDiploma(blob: Blob, fileName: string): Promise<'shared' | 'downloaded'> {
  return sharePng(blob, fileName, t('diplomaTitle'));
}
