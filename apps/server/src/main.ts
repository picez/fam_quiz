import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { localOrigins, secretProblem } from './config';
import { connectDb } from './db/client';

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

const { db } = await connectDb(databaseUrl);
const { app } = await buildApp({
  db,
  auth: {
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
    trustedOrigins: [...configured, ...local.all],
  },
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
  trustProxy: process.env.TRUST_PROXY === 'true',
  webRoot: existsSync(built) ? built : undefined,
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
for (const origin of local.lan) console.log(`У локальній мережі: ${origin}`);
