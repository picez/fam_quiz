import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildApp } from './app';

const built = resolve(import.meta.dirname, '../../web/dist');

const { app } = await buildApp({
  // За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
  trustProxy: process.env.TRUST_PROXY === 'true',
  webRoot: existsSync(built) ? built : undefined,
});
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
