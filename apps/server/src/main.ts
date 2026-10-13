import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { localOrigins, secretProblem } from './config';
import { connectDb } from './db/client';
import { markInterrupted } from './recorder';
import { diskStorage, type ImageStorage } from './storage/images';
import { r2Storage } from './storage/r2';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    console.error(`Не задано змінну середовища ${name}. Скопіюйте .env.example у .env і заповніть її.`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required('DATABASE_URL');
const secret = required('BETTER_AUTH_SECRET');
const problem = secretProblem(secret);
if (problem !== null) {
  console.error(problem);
  process.exit(1);
}
const port = Number(process.env.PORT ?? 3000);
const built = resolve(import.meta.dirname, '../../web/dist');

// Поза продакшеном вхід дозволено й за адресами цього комп'ютера в локальній мережі.
const local = process.env.NODE_ENV === 'production' ? { lan: [], all: [] } : localOrigins(networkInterfaces(), port);
const configured = (process.env.TRUSTED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);

/** Зображення: Cloudflare R2, якщо задано всі чотири змінні R2_*, інакше тека на диску. */
function imageStorage(): ImageStorage {
  const { R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  const r2 = [R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY];
  if (r2.every((value) => value !== undefined && value !== '')) {
    console.log('Зображення зберігаються в Cloudflare R2.');
    return r2Storage({
      accountId: R2_ACCOUNT_ID!,
      bucket: R2_BUCKET!,
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    });
  }
  if (r2.some((value) => value !== undefined && value !== '')) {
    console.error('Задано не всі змінні R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    process.exit(1);
  }
  const dir = resolve(process.env.UPLOAD_DIR ?? resolve(import.meta.dirname, '../uploads'));
  if (process.env.NODE_ENV === 'production') {
    console.warn(`Зображення зберігаються на диску (${dir}). Якщо диск не постійний, вони зникнуть після перезапуску.`);
  }
  return diskStorage(dir);
}

const storage = imageStorage();
const { db } = await connectDb(databaseUrl);
// Кімнати живуть у пам'яті: гри, що лишилися «в процесі» з минулого запуску, уже ніхто не дограє.
await markInterrupted(db);
const { app } = await buildApp({
  db,
  auth: {
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
    trustedOrigins: [...configured, ...local.all],
  },
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
  trustProxy: process.env.TRUST_PROXY === 'true',
  storage,
  webRoot: existsSync(built) ? built : undefined,
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
for (const origin of local.lan) console.log(`У локальній мережі: ${origin}`);
