import type { PrizePlace } from '@quiz/shared';
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

/** Рядки диплома зверху вниз (без порожніх): «Диплом», нік, «1 місце», назва вікторини, гравіювання, дата dd.mm.yyyy (Europe/Kyiv). */
export function diplomaLines(data: DiplomaData): string[] {
  return [
    t('diplomaTitle'),
    data.nickname,
    t('diplomaPlace', { place: data.place }),
    data.quizTitle,
    data.engraving ?? '',
    kyivDate(data.date),
  ].filter((line) => line.trim() !== '');
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
  const frame = MATERIAL_LOOK[data.trophy?.material ?? 'gold'].color;
  const [title, nickname, place, quizTitle, ...rest] = diplomaLines(data);
  const date = rest.pop()!;
  const engraving = rest[0];

  context.fillStyle = '#FFFBF0';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.strokeStyle = frame;
  context.lineWidth = 18;
  context.strokeRect(30, 30, WIDTH - 60, HEIGHT - 60);
  context.lineWidth = 4;
  context.strokeRect(62, 62, WIDTH - 124, HEIGHT - 124);

  context.textAlign = 'center';
  context.textBaseline = 'alphabetic';
  const center = WIDTH / 2;
  const width = WIDTH - 240;

  context.font = `96px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', sans-serif`;
  context.fillText(data.trophy ? TROPHY_EMOJI[data.trophy.kind] : '🏆', center, 190);

  context.fillStyle = '#2B2340';
  context.font = `700 72px ${DISPLAY}`;
  context.fillText(title!.toUpperCase(), center, 300);

  context.font = `700 60px ${BODY}`;
  context.fillText(wrap(context, nickname!, width)[0] ?? '', center, 400);

  context.fillStyle = frame === MATERIAL_LOOK.diamond.color ? '#3A7CA5' : '#7A5A12';
  context.font = `600 44px ${DISPLAY}`;
  context.fillText(place!, center, 480);

  context.fillStyle = '#2B2340';
  context.font = `500 34px ${BODY}`;
  let y = 560;
  for (const line of wrap(context, quizTitle!, width).slice(0, 2)) {
    context.fillText(line, center, y);
    y += 44;
  }
  if (engraving !== undefined) {
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
