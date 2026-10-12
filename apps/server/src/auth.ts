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
}

export function createAuth(db: Db, options: AuthOptions) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: options.trustedOrigins ?? [],
    emailAndPassword: { enabled: true, minPasswordLength: 8 },
  });
}

export type Auth = ReturnType<typeof createAuth>;
