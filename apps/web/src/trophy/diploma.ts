import type { PrizePlace, TrophyMaterial } from '@quiz/shared';
import { t } from '../i18n';
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
const DISPLAY = "'Unbounded Variable', system-ui, sans-serif";
const BODY = "'Onest Variable', system-ui, sans-serif";
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

/** dd.mm.yyyy за київським часом; ICU без Europe/Kyiv знає лише давню назву Europe/Kiev. */
function kyivDate(date: Date): string {
  const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat('uk-UA', { ...options, timeZone: 'Europe/Kyiv' });
  } catch {
    format = new Intl.DateTimeFormat('uk-UA', { ...options, timeZone: 'Europe/Kiev' });
  }
  const parts = Object.fromEntries(format.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day}.${parts.month}.${parts.year}`;
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
  const safe = nickname.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return safe === '' ? 'dyplom.png' : `dyplom-${safe}.png`;
}

/** Розбиває текст на рядки, що влазять у ширину. */
function wrap(context: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && context.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line !== '') lines.push(line);
  return lines;
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
  context.fillText(wrap(context, nickname, width)[0] ?? '', center, 400);

  // Неметалеві (камені, діамант) — синє місце, метали — темне золото.
  context.fillStyle = look.metallic < 0.5 ? '#3A7CA5' : '#7A5A12';
  context.font = `600 44px ${DISPLAY}`;
  context.fillText(place, center, 480);

  context.fillStyle = '#2B2340';
  context.font = `500 34px ${BODY}`;
  let y = 560;
  if (quizTitle !== null)
    for (const line of wrap(context, quizTitle, width).slice(0, 2)) {
      context.fillText(line, center, y);
      y += 44;
    }
  if (engraving !== null) {
    context.font = `italic 30px ${BODY}`;
    for (const line of wrap(context, `«${engraving}»`, width).slice(0, 2)) {
      context.fillText(line, center, y + 10);
      y += 40;
    }
  }
  context.fillStyle = '#6B6380';
  context.font = `400 28px ${BODY}`;
  context.fillText(date, center, HEIGHT - 110);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas_unavailable'))), 'image/png');
  });
}

/** canShare({ files }) → share; інакше завантаження через <a download>. Скасування share (AbortError) — не помилка. */
export async function shareDiploma(blob: Blob, fileName: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: t('diplomaTitle') });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      // Інша відмова (NotAllowedError тощо) — просто завантажуємо.
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}
