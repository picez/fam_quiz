import { buildApp } from './app';

// За проксі (наприклад, на Render) задайте TRUST_PROXY=true, інакше всі клієнти ділять одне обмеження частоти.
const { app } = await buildApp({ trustProxy: process.env.TRUST_PROXY === 'true' });
const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: '0.0.0.0' });
console.log(`Quiz server is listening on port ${port}`);
