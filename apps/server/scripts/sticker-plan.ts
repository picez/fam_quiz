import { STICKER_ID, compareStickers, seriesOf, type Sticker } from '@quiz/shared';

export interface SourceFile {
  name: string;
  bytes: Uint8Array;
}
export type SkipReason = 'not_image' | 'bad_name' | 'content_mismatch' | 'duplicate';
export interface StickerPlan {
  stickers: (Sticker & { source: string })[];
  skipped: { name: string; reason: SkipReason }[];
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function matchesContent(ext: 'gif' | 'png', bytes: Uint8Array): boolean {
  if (ext === 'png') return PNG_SIGNATURE.every((b, i) => bytes[i] === b);
  const head = String.fromCharCode(...bytes.slice(0, 6));
  return head === 'GIF87a' || head === 'GIF89a';
}

interface Candidate {
  name: string;
  core: string;
  ext: 'gif' | 'png';
  tailed: boolean;
}

/** Правила імпорту: розширення, назва, вміст, дублікати з хвостом, gif понад png. */
export function planStickers(files: SourceFile[]): StickerPlan {
  const skipped: StickerPlan['skipped'] = [];
  const candidates: Candidate[] = [];

  for (const file of files) {
    const dot = file.name.lastIndexOf('.');
    const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
    if (ext !== 'gif' && ext !== 'png') {
      skipped.push({ name: file.name, reason: 'not_image' });
      continue;
    }
    const base = file.name.slice(0, dot);
    const core = base.replace(/(~\d+|-\d{6,})$/, '');
    if (!STICKER_ID.test(core)) {
      skipped.push({ name: file.name, reason: 'bad_name' });
      continue;
    }
    if (!matchesContent(ext, file.bytes)) {
      skipped.push({ name: file.name, reason: 'content_mismatch' });
      continue;
    }
    candidates.push({ name: file.name, core, ext, tailed: core !== base });
  }

  const key = (core: string) => core.toLowerCase();
  const plain = new Set(candidates.filter((c) => !c.tailed).map((c) => key(c.core)));
  const groups = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (c.tailed && plain.has(key(c.core))) {
      skipped.push({ name: c.name, reason: 'duplicate' });
      continue;
    }
    const list = groups.get(key(c.core)) ?? [];
    list.push(c);
    groups.set(key(c.core), list);
  }

  const stickers: StickerPlan['stickers'] = [];
  for (const list of groups.values()) {
    // gif раніше за png, далі за назвою: вибір не залежить від порядку файлів
    list.sort((a, b) =>
      a.ext === b.ext ? a.name.localeCompare(b.name) : a.ext === 'gif' ? -1 : 1,
    );
    const [keep, ...rest] = list;
    for (const c of rest) skipped.push({ name: c.name, reason: 'duplicate' });
    stickers.push({ id: keep.core, ext: keep.ext, series: seriesOf(keep.core), source: keep.name });
  }
  stickers.sort(compareStickers);
  return { stickers, skipped };
}

export function renderStickerList(stickers: Sticker[]): string {
  const lines = stickers.map((s) => `  { id: '${s.id}', ext: '${s.ext}', series: '${s.series}' },`);
  return [
    '// Згенеровано apps/server/scripts/upload-stickers.ts — не правити вручну.',
    "import type { Sticker } from './stickers';",
    '',
    'export const STICKER_LIST: readonly Sticker[] = [',
    ...lines,
    '];',
    '',
  ].join('\n');
}
