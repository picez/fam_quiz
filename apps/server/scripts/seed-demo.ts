/**
 * Додає демо-вікторину користувачу за email.
 * Запуск: DATABASE_URL=... pnpm --filter @quiz/server seed:demo you@example.com [demo|party]
 */
import { quizSchema } from '@quiz/shared';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import pg from 'pg';
import { quiz, user } from '../src/db/schema';
import { demoQuiz } from './demo-quiz';
import { partyQuiz } from './party-quiz';

const email = process.argv.slice(2).find((arg) => arg.includes('@'));
const name = process.argv.slice(2).find((arg) => arg === 'demo' || arg === 'party') ?? 'demo';
const url = process.env.DATABASE_URL;
if (!email || !url) {
  console.error('Usage: DATABASE_URL=... seed-demo <email>');
  process.exit(1);
}

const data = quizSchema.parse(name === 'party' ? partyQuiz : demoQuiz);
const pool = new pg.Pool({ connectionString: url, ssl: url.includes('render.com') ? { rejectUnauthorized: false } : undefined });
const db = drizzle(pool);
try {
  const [owner] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!owner) throw new Error(`No user with email ${email}`);
  const [row] = await db.insert(quiz).values({ ownerId: owner.id, ...data }).returning({ id: quiz.id });
  console.log(`Created quiz ${row.id} for ${email}`);
} finally {
  await pool.end();
}
