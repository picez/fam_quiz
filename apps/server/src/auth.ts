import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { isBotDomainEmail, isBotUser } from '@quiz/shared';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { banNotice, isBanned } from './bans';
import type { Db } from './db/client';
import * as schema from './db/schema';
import { isMergedEmail } from './merged-email';

export interface AuthOptions {
  /** Секрет, яким підписуються сесії. */
  secret: string;
  /** Адреса, за якою відкривається застосунок. */
  baseURL: string;
  /** Інші адреси клієнта, з яких дозволено запити (наприклад, сервер розробки). */
  trustedOrigins?: string[];
  /** Скільки спроб входу чи реєстрації дозволено з однієї адреси за хвилину (типово 10). */
  attemptsPerMinute?: number;
  /** Ключі застосунку Google; без них входу через Google немає. */
  google?: { clientId: string; clientSecret: string };
}

export function createAuth(db: Db, options: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins ?? [],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
    // Права адміна залежать від email_verified, що приходить лише від Google; це закріплює типову поведінку Better Auth
    // на випадок, якщо її колись змінять.
    account: { accountLinking: { requireLocalEmailVerified: true } },
    socialProviders: options.google === undefined ? {} : { google: options.google },
    // Власний обмежувач Better Auth не бачить справжньої адреси клієнта за проксі й тоді
    // рахує всіх разом; частоту обмежує маршрут Fastify, який знає request.ip.
    rateLimit: { enabled: false },
    // Будь-який вхід (пароль, Google) створює сесію: забаненому її не дає цей хук. Google-помилку Better Auth
    // перетворює на свій редирект, тож прапорець banNotice каже проксі переписати його на /login?error=account_banned.
    databaseHooks: {
      user: {
        create: {
          // Домен бота (54) зарезервований: ні пароль, ні Google не створять людину з адресою @quiz.invalid.
          // Сам бот створюється в обхід Better Auth (ensureBotAccount), тож хук його не зачіпає.
          before: async (created) => {
            if (isBotDomainEmail(created.email)) throw new APIError('BAD_REQUEST', { code: 'EMAIL_RESERVED', message: 'EMAIL_RESERVED' });
            // 66: адреса акаунта, злитого з іншим, — псевдонім головного; ні пароль, ні новий Google не створять на неї третій акаунт.
            if (await isMergedEmail(db, created.email)) throw new APIError('BAD_REQUEST', { code: 'EMAIL_MERGED', message: 'EMAIL_MERGED' });
          },
        },
      },
      session: {
        create: {
          before: async (session) => {
            // «Квіз-бот» (54) не входить жодним шляхом, навіть якби в нього з'явився рядок account.
            if (isBotUser(session.userId)) throw new APIError('FORBIDDEN', { code: 'BOT_ACCOUNT', message: 'BOT_ACCOUNT' });
            if (await isBanned(db, session.userId)) {
              const notice = banNotice.getStore();
              if (notice) notice.banned = true;
              throw new APIError('FORBIDDEN', { code: 'ACCOUNT_BANNED', message: 'ACCOUNT_BANNED' });
            }
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
