import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';
import { secretProblem } from './config';
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

const { db } = await connectDb(databaseUrl);
const { app } = await buildApp({
  db,
  auth: {
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? `http://localhost:${port}`,
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
  },
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
  trustProxy: process.env.TRUST_PROXY === 'true',
  webRoot: existsSync(built) ? built : undefined,
});
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
