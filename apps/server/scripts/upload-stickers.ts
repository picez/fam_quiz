/**
 * Разовий імпорт стікерів: читає теку, відсіює дублікати, пише маніфест
 * packages/shared/src/sticker-list.ts і (без --manifest-only) заливає файли в R2.
 *
 *   pnpm --filter @quiz/server exec tsx --env-file-if-exists=../../.env scripts/upload-stickers.ts <тека> [--manifest-only]
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { r2Storage } from '../src/storage/r2';
import { planStickers, renderStickerList, type SourceFile } from './sticker-plan';

const here = dirname(fileURLToPath(import.meta.url));
const MANIFEST = resolve(here, '../../../packages/shared/src/sticker-list.ts');

async function main() {
  const args = process.argv.slice(2);
  const manifestOnly = args.includes('--manifest-only');
  const dir = args.find((a) => !a.startsWith('--'));
  if (!dir) {
    console.error('Вкажіть теку зі стікерами.');
    process.exit(1);
  }

  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!manifestOnly && !(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)) {
    console.error('Задайте R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    process.exit(1);
  }

  const entries = await readdir(dir, { withFileTypes: true });
  const files: SourceFile[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    files.push({ name: entry.name, bytes: new Uint8Array(await readFile(join(dir, entry.name))) });
  }

  const { stickers, skipped } = planStickers(files);
  const count = (series: string) => stickers.filter((s) => s.series === series).length;
  console.log(
    `${stickers.length} стікерів (nya ${count('nya')}, nyaa ${count('nyaa')}, nyas ${count('nyas')}, інші ${count('other')}); пропущено ${skipped.length}:`,
  );
  for (const s of skipped) console.log(`  ${s.name} — ${s.reason}`);

  await writeFile(MANIFEST, renderStickerList(stickers));
  console.log(`Маніфест записано: ${MANIFEST}`);
  if (manifestOnly) return;

  const storage = r2Storage({
    accountId: R2_ACCOUNT_ID!,
    bucket: R2_BUCKET!,
    accessKeyId: R2_ACCESS_KEY_ID!,
    secretAccessKey: R2_SECRET_ACCESS_KEY!,
  });
  const bytesOf = new Map(files.map((f) => [f.name, f.bytes]));
  const queue = [...stickers];
  let done = 0;
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      await storage.put(`stickers/${s.id}.${s.ext}`, bytesOf.get(s.source)!, `image/${s.ext}`);
      done++;
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  console.log(`Завантажено ${done} файлів.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
