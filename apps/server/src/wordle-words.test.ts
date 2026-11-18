import { beforeAll, describe, expect, it } from 'vitest';
import { classicRound, makeRoundsQuiz, wordle, wordle2, wordleQuiz } from '@quiz/engine/testing';
import { buildApp } from './app';
import type { Db } from './db/client';
import { TEST_AUTH, signUp } from './testing/accounts';
import { createTestDb } from './testing/test-db';
import { wordleUnknown } from './wordle-words';
import { nounsOf } from './wordladder/nouns';

describe('wordleUnknown (48)', () => {
  it('lists the host words that are not in the dictionary, in question order', () => {
    expect(wordleUnknown(wordleQuiz(), nounsOf(['колос', "м'ясо"]))).toEqual([]);
    expect(wordleUnknown(wordleQuiz(), nounsOf(["м'ясо"]))).toEqual(['колос']);
    expect(wordleUnknown(wordleQuiz(), nounsOf([]))).toEqual(['колос', "м'ясо"]);
  });
});

describe('saving a wordle quiz (48)', () => {
  let db: Db;
  beforeAll(async () => {
    db = await createTestDb();
  });
  const room = (word: string) => makeRoundsQuiz([classicRound('c1', [{ ...wordle, word }, wordle2])]);

  it('refuses to save a wordle word outside the dictionary, on create and on update', async () => {
    const local = await buildApp({ db, auth: TEST_AUTH, nouns: nounsOf(['колос', "м'ясо"]) });
    const host = await signUp(local.app, 'Ведуча');
    const send = (method: 'POST' | 'PUT', url: string, payload: object) => local.app.inject({ method, url, payload, headers: { cookie: host.cookie } });
    const unknown = await send('POST', '/api/quizzes', room('лампо'));
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ error: 'invalid_payload', reason: 'wordle_unknown' });
    const known = await send('POST', '/api/quizzes', room('колос'));
    expect(known.statusCode).toBe(201);
    const id = (known.json() as { id: string }).id;
    const refused = await send('PUT', `/api/quizzes/${id}`, room('лампо'));
    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toEqual({ error: 'invalid_payload', reason: 'wordle_unknown' });
    expect((await send('PUT', `/api/quizzes/${id}`, room('колос'))).statusCode).toBe(200);
    await local.app.close();
  });
});
