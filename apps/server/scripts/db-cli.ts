/** Спільне для scripts/db-backup.ts і scripts/db-restore.ts: ключі R2 зі змінних середовища й опис бази без пароля. */
import type { R2Settings } from '../src/storage/r2';

export function r2FromEnv(): R2Settings {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!(R2_ACCOUNT_ID && R2_BUCKET && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)) {
    throw new Error('Set R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY to use R2.');
  }
  return { accountId: R2_ACCOUNT_ID, bucket: R2_BUCKET, accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY };
}

/** «user@host:port/db» без пароля: щоб було видно, яку базу чіпає скрипт. */
export function describeTarget(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.username || '?'}@${parsed.host}${parsed.pathname}`;
  } catch {
    return '(unparsable DATABASE_URL)';
  }
}
