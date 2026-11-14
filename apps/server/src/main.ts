import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { adminEmails, baseUrl, localOrigins, proxyTrust, pushKeys, secretProblem } from './config';
import { connectDb } from './db/client';
import { backfillFeed, settleFeedLevels } from './feed-publish';
import { settleStickerLegacy } from './xp-store';
import { diskStorage, type ImageStorage } from './storage/images';
import { r2Storage } from './storage/r2';
import { webPushSender } from './web-push-sender';
import { log, reportError } from './log';

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    log.error(`Не задано змінну середовища ${name}. Скопіюйте .env.example у .env і заповніть її.`);
    process.exit(1);
  }
  return value;
}

const databaseUrl = required('DATABASE_URL');
const secret = required('BETTER_AUTH_SECRET');
const problem = secretProblem(secret);
if (problem !== null) {
  log.error(problem);
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
    log.info('Зображення зберігаються в Cloudflare R2.');
    return r2Storage({
      accountId: R2_ACCOUNT_ID!,
      bucket: R2_BUCKET!,
      accessKeyId: R2_ACCESS_KEY_ID!,
      secretAccessKey: R2_SECRET_ACCESS_KEY!,
    });
  }
  if (r2.some((value) => value !== undefined && value !== '')) {
    log.error('Задано не всі змінні R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY.');
    process.exit(1);
  }
  const dir = resolve(process.env.UPLOAD_DIR ?? resolve(import.meta.dirname, '../uploads'));
  if (process.env.NODE_ENV === 'production') {
    log.warn(`Зображення зберігаються на диску (${dir}). Якщо диск не постійний, вони зникнуть після перезапуску.`);
  }
  return diskStorage(dir);
}

const storage = imageStorage();
/** Без R2 файлів стікерів на диску немає: локально віддається мала картинка-фікстура. */
const stickerFixtures = ![process.env.R2_ACCOUNT_ID, process.env.R2_BUCKET, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY].every(
  (value) => value !== undefined && value !== '',
);
/** Вхід через Google вмикається, коли задано обидва ключі. */
function googleKeys() {
  const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = process.env;
  const given = [clientId, clientSecret].filter((value) => value !== undefined && value !== '').length;
  if (given === 1) {
    log.error('Для входу через Google потрібні обидві змінні: GOOGLE_CLIENT_ID і GOOGLE_CLIENT_SECRET.');
    process.exit(1);
  }
  return given === 2 ? { clientId: clientId!, clientSecret: clientSecret! } : undefined;
}

const google = googleKeys();
/** Web Push вмикається, коли задано всі три змінні VAPID_*; частково чи криво задані — вихід із причиною. */
function webPush() {
  const result = pushKeys(process.env);
  if (!result.ok) {
    log.error(result.problem);
    process.exit(1);
  }
  if (result.keys === null) {
    if (process.env.NODE_ENV === 'production') {
      log.warn('Не задано VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY і VAPID_SUBJECT: сповіщення вимкнені.');
    }
    return undefined;
  }
  log.info('Web Push увімкнено.');
  return { publicKey: result.keys.publicKey, send: webPushSender(result.keys) };
}

const push = webPush();
/** Адміни лише з ADMIN_EMAILS; самі адреси в журнал не пишуться. */
const admins = adminEmails(process.env);
if (admins.size === 0) {
  if (process.env.NODE_ENV === 'production') log.warn('Не задано ADMIN_EMAILS: адмінка вимкнена.');
} else {
  log.info(`Адмінів у ADMIN_EMAILS: ${admins.size}.`);
}
const address = baseUrl(process.env, port);
if (process.env.NODE_ENV === 'production' && address.startsWith('http://localhost')) {
  log.warn('Не задано BETTER_AUTH_URL: вхід працюватиме лише за адресою цього комп’ютера.');
}
const { db, close: closeDb } = await connectDb(databaseUrl);
// Кімнати живуть у пам'яті й у таблиці live_room: після перезапуску вони піднімаються з бази, а «в процесі»
// з минулого запуску перериваються лише ігри кімнат, яких там немає (це робить сховище кімнат на старті).
// Кілька екземплярів одночасно не підтримуються: оренда лише не дає двом версіям вести ту саму кімнату під час розгортання.
// Стрічка (18a): тихо записати наявні рівні до підняття кімнат, щоб кімната, піднята в finished, не оголосила давнього рівня.
// Одне оновлення на порцію профілів; збій лише журналюється.
await settleFeedLevels(db).catch((error: unknown) => reportError(error, { where: 'feed-levels' }));
// Стікери (34, «м'якше»): наявні акаунти один раз запам'ятовують свій рівень — усе, що давало старе правило серій, лишається відкритим.
await settleStickerLegacy(db).catch((error: unknown) => reportError(error, { where: 'sticker-legacy' }));
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
  // Стиснення кадрів WebSocket (30c) увімкнено; SOCKET_DEFLATE=off вимикає, якщо бракує пам'яті.
  socketDeflate: process.env.SOCKET_DEFLATE !== 'off',
  storage,
  stickerFixtures,
  webRoot: existsSync(built) ? built : undefined,
  // Єдине місце, де вмикаються заставки переходів справжньої гри (8c).
  transitions: true,
  // Єдине місце, де вмикається мінімальний час справжньої гри (11b).
  pacing: true,
  persist: { instanceId: randomUUID() },
  push,
  adminEmails: admins,
});
await app.listen({ port, host: '0.0.0.0' });
// Стрічка (18a): події завершених ігор за 90 днів дописуються у фоні, старт їх не чекає. Ідемпотентно (ключі), тож іде на кожному
// старті, і обірване зупинкою дописування продовжить наступний; бейджа не запалює (created_at = at). Збій лише журналюється.
void backfillFeed(db, new Date()).catch((error: unknown) => reportError(error, { where: 'feed-backfill' }));
log.info(`Quiz server is listening on port ${port}`);
for (const origin of local.lan) log.info(`У локальній мережі: ${origin}`);

// Платформа зупиняє сервіс сигналом (нова версія, перезапуск): записуємо й віддаємо кімнати наступній версії,
// закриваємо з'єднання й базу, а не обриваємо запити на півдорозі.
let stopping = false;
async function stop(signal: string, code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  log.info(`Отримано ${signal}, зупиняюся.`);
  // Якщо щось зависло, процес усе одно має завершитися.
  setTimeout(() => process.exit(1), 10_000).unref();
  try {
    // Заморозити кімнати, сказати клієнтам restarting, записати кімнати з owner = null, закрити застосунок
    // і дочекатися записів результатів.
    await shutdown();
    await closeDb();
  } catch (error) {
    reportError(error, { where: 'shutdown' });
    process.exitCode = 1;
  }
  process.exit();
}
process.on('SIGTERM', () => void stop('SIGTERM'));
process.on('SIGINT', () => void stop('SIGINT'));

// Глобальні запобіжники (30a). Обробники подій, таймери кімнат, розсилка й записувачі мають власні try/catch, тож сюди доходить
// лише те, що проскочило повз них.
// Відхилений проміс, якого ніхто не чекав, — у журнал, процес живе: синхронний стан кімнат такий збій не зачіпає.
process.on('unhandledRejection', (reason) => reportError(reason, { where: 'process', what: 'unhandledRejection' }));
// Неперехоплений виняток: після нього стан процесу невідомий (Node радить не продовжувати), тож лишатися живим небезпечно.
// Тому — у журнал і впорядкована зупинка, як на SIGTERM: кімнати записуються й віддаються, Render перезапускає сервіс,
// і ігри піднімаються з бази (9b) — гравці бачать лише перепідключення. Код виходу 1, щоб перезапуск був видно.
process.on('uncaughtException', (error) => {
  reportError(error, { where: 'process', what: 'uncaughtException' });
  void stop('uncaughtException', 1);
});
