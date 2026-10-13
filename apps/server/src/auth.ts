import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { betterAuth } from 'better-auth';
import type { Db } from './db/client';
import * as schema from './db/schema';

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
    socialProviders: options.google === undefined ? {} : { google: options.google },
    // Власний обмежувач Better Auth не бачить справжньої адреси клієнта за проксі й тоді
    // рахує всіх разом; частоту обмежує маршрут Fastify, який знає request.ip.
    rateLimit: { enabled: false },
  });
}

export type Auth = ReturnType<typeof createAuth>;
