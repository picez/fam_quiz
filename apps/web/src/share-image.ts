/** Спільні шматки картинок для поділитися (диплом, підсумок гри): шрифти, дата, рядки, назва файлу, PNG, шеринг. */

type Measure = Pick<CanvasRenderingContext2D, 'measureText'>;

export const IMAGE_FONTS = {
  display: "'Unbounded Variable', system-ui, sans-serif",
  body: "'Onest Variable', system-ui, sans-serif",
};

/** Вантажить саме ті гарнітури й піднабори (unicode-range), що знадобляться, і чекає на document.fonts.ready. */
export async function loadImageFonts(samples: { font: string; text: string }[]): Promise<void> {
  try {
    await Promise.all(samples.map((sample) => document.fonts?.load(sample.font, sample.text)));
  } catch {
    // Шрифт не завантажився: малюємо запасним.
  }
  await document.fonts?.ready;
}

/** dd.mm.yyyy за київським часом; ICU без Europe/Kyiv знає лише давню назву Europe/Kiev. */
export function kyivDate(date: Date): string {
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

/** Розбиває текст на рядки, що влазять у ширину (довге слово лишається окремим рядком). */
export function wrapText(context: Measure, text: string, width: number): string[] {
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

/** Рядок, обрізаний до ширини з «…» в кінці; влазить — без змін. Обрізає по символах, не розриваючи сурогатні пари. */
export function fitLine(context: Measure, text: string, width: number): string {
  if (context.measureText(text).width <= width) return text;
  const chars = Array.from(text);
  const cut = (count: number): string => `${chars.slice(0, count).join('').trimEnd()}…`;
  let low = 0;
  let high = chars.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (context.measureText(cut(mid)).width <= width) low = mid;
    else high = mid - 1;
  }
  return cut(low);
}

/** <prefix>-<безпечна назва>.png: усе, крім літер і цифр, стає дефісом; порожньо — <prefix>.png. */
export function safeFileName(prefix: string, name: string): string {
  const safe = name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  return safe === '' ? `${prefix}.png` : `${prefix}-${safe}.png`;
}

/** canvas → PNG Blob; null від toBlob — Error('canvas_unavailable'). */
export function canvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas_unavailable'))), 'image/png');
  });
}

export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === 'function' && typeof navigator.share === 'function' && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Завантаження через <a download>. */
export function downloadPng(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** canShareFile → share; інакше завантаження. Скасування share (AbortError) — не помилка. */
export async function sharePng(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (canShareFile(file)) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'shared';
      // Інша відмова (NotAllowedError тощо) — просто завантажуємо.
    }
  }
  downloadPng(blob, fileName);
  return 'downloaded';
}
