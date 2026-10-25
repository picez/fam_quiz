import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { baseUrl, localOrigins, proxyTrust, secretProblem } from './config';
import { connectDb } from './db/client';
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
/** Вхід через Google вмикається, коли задано обидва ключі. */
function googleKeys() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
  const given = [clientId, clientSecret].filter((value) => value !== undefined && value !== '').length;
  if (given === 1) {
    console.error('Для входу через Google потрібні обидві змінні: GOOGLE_CLIENT_ID і GOOGLE_CLIENT_SECRET.');
    process.exit(1);
  }
  return given === 2 ? { clientId: clientId!, clientSecret: clientSecret! } : undefined;
}

const google = googleKeys();
const address = baseUrl(process.env, port);
if (process.env.NODE_ENV === 'production' && address.startsWith('http://localhost')) {
  console.warn('Не задано BETTER_AUTH_URL: вхід працюватиме лише за адресою цього комп’ютера.');
}
const { db, close: closeDb } = await connectDb(databaseUrl);
// Кімнати живуть у пам'яті й у таблиці live_room: після перезапуску вони піднімаються з бази, а «в процесі»
// з минулого запуску перериваються лише ігри кімнат, яких там немає (це робить сховище кімнат на старті).
// Кілька екземплярів одночасно не підтримуються: оренда лише не дає двом версіям вести ту саму кімнату під час розгортання.
const { app, shutdown } = await buildApp({
  db,
  auth: {
    secret,
    baseURL: address,
    trustedOrigins: [...configured, ...local.all],
    google,
  },
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=1 (кількість проксі), інакше всі клієнти
  // ділять одне обмеження частоти.
  trustProxy: proxyTrust(process.env.TRUST_PROXY),
  storage,
  webRoot: existsSync(built) ? built : undefined,
  // Єдине місце, де вмикаються заставки переходів справжньої гри (8c).
  transitions: true,
  // Єдине місце, де вмикається мінімальний час справжньої гри (11b).
  pacing: true,
  persist: { instanceId: randomUUID() },
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
for (const origin of local.lan) console.log(`У локальній мережі: ${origin}`);

// Платформа зупиняє сервіс сигналом (нова версія, перезапуск): записуємо й віддаємо кімнати наступній версії,
// закриваємо з'єднання й базу, а не обриваємо запити на півдорозі.
let stopping = false;
async function stop(signal: string) {
  if (stopping) return;
  stopping = true;
  console.log(`Отримано ${signal}, зупиняюся.`);
  // Якщо щось зависло, процес усе одно має завершитися.
  setTimeout(() => process.exit(1), 10_000).unref();
  try {
    // Заморозити кімнати, сказати клієнтам restarting, записати кімнати з owner = null, закрити застосунок
    // і дочекатися записів результатів.
    await shutdown();
    await closeDb();
  } catch (error) {
    console.error('Помилка під час зупинки:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
  process.exit();
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));
