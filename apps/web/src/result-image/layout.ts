import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { num } from '../format';
import { t, type TextKey } from '../i18n';
import { IMAGE_FONTS, fitLine, kyivDate, safeFileName, wrapText } from '../share-image';
import { TROPHY_EMOJI, trophyLabel } from '../trophy/trophy-meta';
import type { ResultImageData } from './data';

export const RESULT_SIZE = { width: 1080, height: 1350 } as const;

export type ResultBlock = 'title' | 'date' | 'podium' | 'me' | 'prizes' | 'achievements' | 'footer';
/** y тексту — базова лінія (textBaseline = 'alphabetic'); align — як у canvas. */
export type DrawOp =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; fill: string }
  | { kind: 'frame'; x: number; y: number; w: number; h: number; stroke: string; line: number }
  | { kind: 'text'; text: string; x: number; y: number; font: string; fill: string; align: CanvasTextAlign; block: ResultBlock };

const MARGIN = 72;
const TEXT_WIDTH = RESULT_SIZE.width - 2 * MARGIN;
const GAP = 32;
const LIMIT = RESULT_SIZE.height - 120;
const FOOTER_Y = RESULT_SIZE.height - 60;
const COLORS = { background: '#FFF8EC', gold: '#C9A227', text: '#2B2340', muted: '#6B6380', plaque: '#F4E7C5' };
const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
const font = (weight: number, px: number, family: 'display' | 'body' = 'body'): string => `${weight} ${px}px ${IMAGE_FONTS[family]}`;

type Measure = (font: string, text: string) => number;

export function resultLayout(data: ResultImageData, measure: Measure, rtl: boolean): DrawOp[] {
  const ops: DrawOp[] = [
    { kind: 'rect', x: 0, y: 0, w: RESULT_SIZE.width, h: RESULT_SIZE.height, fill: COLORS.background },
    { kind: 'frame', x: 24, y: 24, w: RESULT_SIZE.width - 48, h: RESULT_SIZE.height - 48, stroke: COLORS.gold, line: 4 },
  ];
  const fit = (f: string, text: string, width: number): string => fitLine({ measureText: (value: string) => ({ width: measure(f, value) }) } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>, text, width);
  const wrap = (f: string, text: string, width: number): string[] => wrapText({ measureText: (value: string) => ({ width: measure(f, value) }) } as unknown as Pick<CanvasRenderingContext2D, 'measureText'>, text, width);
  const startX = rtl ? RESULT_SIZE.width - MARGIN : MARGIN;
  const startAlign: CanvasTextAlign = rtl ? 'right' : 'left';
  const endX = rtl ? MARGIN : RESULT_SIZE.width - MARGIN;
  const endAlign: CanvasTextAlign = rtl ? 'left' : 'right';
  let top = 72;

  type Line = { text: string; x: number; font: string; fill: string; align: CanvasTextAlign };
  /** Блок з рядками однакової висоти: додається цілком або не додається зовсім. */
  const place = (block: ResultBlock, lines: Line[][], px: number, lineHeight: number, plaque = false): boolean => {
    const height = lines.length * lineHeight;
    if (top + height > LIMIT) return false;
    if (plaque) ops.push({ kind: 'rect', x: MARGIN, y: top, w: TEXT_WIDTH, h: height, fill: COLORS.plaque });
    lines.forEach((row, index) => {
      const y = top + index * lineHeight + Math.round((lineHeight + px * 0.7) / 2);
      for (const line of row) ops.push({ kind: 'text', ...line, y, block });
    });
    top += height + GAP;
    return true;
  };
  const heading = (key: TextKey): Line[] => [{ text: t(key), x: startX, font: font(600, 36), fill: COLORS.muted, align: startAlign }];
  const centered = (text: string, f: string, fill: string): Line => ({ text, x: RESULT_SIZE.width / 2, font: f, fill, align: 'center' });

  if (data.quizTitle.trim() !== '') {
    const titleFont = font(700, 64, 'display');
    let lines = wrap(titleFont, data.quizTitle.trim(), TEXT_WIDTH);
    if (lines.length > 2) lines = [lines[0]!, lines.slice(1).join(' ')];
    place('title', lines.map((line) => [centered(fit(titleFont, line, TEXT_WIDTH), titleFont, COLORS.text)]), 64, 72);
    top -= GAP - 8;
  }
  const dateFont = font(400, 34);
  place('date', [[centered(kyivDate(data.date), dateFont, COLORS.muted)]], 34, 40);

  if (data.podium.length > 0) {
    const rows = data.podium.map((row) => {
      const px = row.place === 1 ? 52 : 48;
      const f = font(row.place === 1 ? 600 : 500, px);
      const medal = MEDALS[row.place] ?? '';
      const medalSlot = measure(f, medal) + 24;
      const score = num(row.score);
      const scoreSlot = measure(f, score) + 24;
      const name = fit(f, row.name, TEXT_WIDTH - medalSlot - scoreSlot);
      const nameX = rtl ? RESULT_SIZE.width - MARGIN - medalSlot : MARGIN + medalSlot;
      return [
        { text: medal, x: startX, font: f, fill: COLORS.text, align: startAlign },
        { text: name, x: nameX, font: f, fill: COLORS.text, align: startAlign },
        { text: score, x: endX, font: f, fill: COLORS.text, align: endAlign },
      ] satisfies Line[];
    });
    place('podium', rows, 50, 68);
  }

  if (data.me) {
    const meFont = font(500, 40);
    const text = fit(meFont, t('resultImageMe', { place: data.me.place, total: data.me.total, score: num(data.me.score) }), TEXT_WIDTH - 48);
    place('me', [[centered(text, meFont, COLORS.text)]], 40, 76, true);
  }

  if (data.prizes.length > 0) {
    const f = font(400, 40);
    const lines: Line[][] = [heading('resultImagePrizes')];
    for (const prize of data.prizes.slice(0, 3)) {
      const parts = [prize.trophy ? TROPHY_EMOJI[prize.trophy.kind] : '🎁', prize.trophy ? trophyLabel({ ...prize.trophy, decor: null }) : '', `→ ${prize.winners.join(', ')}`].filter((part) => part !== '');
      lines.push([{ text: fit(f, parts.join(' '), TEXT_WIDTH), x: startX, font: f, fill: COLORS.text, align: startAlign }]);
    }
    place('prizes', lines, 40, 52);
  }

  if (data.achievements.length > 0) {
    const f = font(400, 36);
    const lines: Line[][] = [heading('resultImageAchievements')];
    for (const item of data.achievements) {
      const name = t(`achievement_${item.id}` as TextKey);
      const text = `${ACHIEVEMENT_ICONS[item.id]} ${name}${item.nickname === null ? '' : ` · ${item.nickname}`}`;
      lines.push([{ text: fit(f, text, TEXT_WIDTH), x: startX, font: f, fill: COLORS.text, align: startAlign }]);
    }
    if (data.moreAchievements > 0) lines.push([{ text: t('resultImageMore', { count: data.moreAchievements }), x: startX, font: f, fill: COLORS.muted, align: startAlign }]);
    place('achievements', lines, 36, 46);
  }

  ops.push({ kind: 'text', text: `${t('appName')} · ${data.site}`, x: RESULT_SIZE.width / 2, y: FOOTER_Y, font: font(400, 28), fill: COLORS.muted, align: 'center', block: 'footer' });
  return ops;
}

export const resultFileName = (quizTitle: string): string => safeFileName('pidsumok', quizTitle);
