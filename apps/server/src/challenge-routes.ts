import { challengeQuiz, LIMITS, type ChallengeAttemptStart, type ChallengeCheck, type ChallengeMine, type ChallengePreview } from '@quiz/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { CODE_LIMIT, type CurrentUser } from './account-routes';
import {
  activeForQuiz,
  attemptOf,
  challengeByCode,
  challengeResults,
  claimAttempt,
  createChallenge,
  friendChallenges,
  sentChallenges,
  isActive,
  myActiveChallenges,
  playedCount,
  type ChallengeRow,
} from './challenges';
import type { Db } from './db/client';
import { ensureProfile } from './profiles';
import { getQuiz } from './quizzes';
import type { RoomChallenge, RoomManager } from './rooms/manager';
import { abortParkedAttempt, attemptState, continueSavedGame, openGameIds } from './saved-games';

export interface ChallengeRouteDeps {
  db: Db;
  manager: RoomManager;
  currentUser: (request: FastifyRequest) => Promise<CurrentUser | null>;
  maxRooms: number;
  /** Годинник для тестів; типово «зараз». */
  now?: () => Date;
}

const CREATE_LIMIT = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
const UNAUTHORIZED = { error: 'unauthorized' };
const NOT_FOUND = { error: 'not_found' };
const CHALLENGE_NOT_FOUND = { error: 'challenge_not_found' };

type Outcome = { ok: true; body: ChallengeAttemptStart } | { ok: false; status: 404 | 409 | 503; error: string };

const markOf = (row: ChallengeRow): RoomChallenge => ({ id: row.id, code: row.code, title: row.title });

export async function registerChallengeRoutes(app: FastifyInstance, deps: ChallengeRouteDeps): Promise<void> {
  const { db, manager, currentUser, maxRooms } = deps;
  const now = deps.now ?? (() => new Date());
  /** Запити спроби одного акаунта на один виклик — по черзі (у цьому процесі): друга кімната з тим самим id не відкриється. */
  const queues = new Map<string, Promise<unknown>>();
  const serial = <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const previous = queues.get(key) ?? Promise.resolve();
    const run = previous.then(task, task);
    const settled = run.catch(() => undefined);
    queues.set(key, settled);
    void settled.then(() => {
      if (queues.get(key) === settled) queues.delete(key);
    });
    return run;
  };

  /** Сесія й виклик за кодом: гість — 401, невірний формат і «немає такого» — однаковий 404. */
  const load = async (request: FastifyRequest<{ Params: { code: string } }>, reply: FastifyReply) => {
    const user = await currentUser(request);
    if (user === null) {
      await reply.code(401).send(UNAUTHORIZED);
      return null;
    }
    const row = await challengeByCode(db, request.params.code);
    if (row === null) {
      await reply.code(404).send(CHALLENGE_NOT_FOUND);
      return null;
    }
    return { user, row };
  };

  /**
   * Що бачить акаунт: свою спробу (none / playing / done; збережена без точної контрольної точки — done) і чи можна дивитись таблицю:
   * автору, тим, хто дограв, і тим, чий виклик закрився посеред незавершеної гри; тому, хто лише грає, — ні.
   */
  const standing = async (row: ChallengeRow, userId: string) => {
    const mine = await attemptOf(db, row.id, userId);
    const state: ChallengePreview['mine'] = mine === null ? 'none' : (await attemptState(db, mine.gameId)).state;
    const isAuthor = row.ownerId === userId;
    return { mine: state, isAuthor, canSeeResults: isAuthor || state === 'done' || (state === 'playing' && !isActive(row, now())) };
  };

  /** Нова кімната спроби з id гри спроби. */
  const openRoom = (row: ChallengeRow, userId: string, nickname: string, gameId: string): Outcome => {
    if (manager.size >= maxRooms) return { ok: false, status: 503, error: 'server_busy' };
    if (manager.frozen) return { ok: false, status: 503, error: 'restarting' };
    const made = manager.createAutopilot(row.snapshot, userId, null, nickname, { id: gameId, challenge: markOf(row) });
    if (!made.ok) return { ok: false, status: made.error === 'restarting' ? 503 : 409, error: made.error };
    return { ok: true, body: { code: made.room.code, token: made.token, playerId: made.playerId, stageToken: made.room.stageToken } };
  };

  /**
   * Повернення до наявної спроби: зіграна чи збережена без точної контрольної точки — done; виклик закрито — closed
   * (збережена спроба, якої вже не продовжити, стає «aborted» і зникає з «Моїх ігор»); жива кімната — новий токен;
   * збережена — продовження; нічого — нова кімната.
   */
  const resume = async (row: ChallengeRow, userId: string, nickname: string, gameId: string): Promise<Outcome> => {
    const { state, status } = await attemptState(db, gameId);
    if (state === 'done') {
      if (status === 'saved') await abortParkedAttempt(db, manager, gameId);
      return { ok: false, status: 409, error: 'challenge_done' };
    }
    if (!isActive(row, now())) {
      if (status === 'saved') await abortParkedAttempt(db, manager, gameId);
      return { ok: false, status: 409, error: 'challenge_closed' };
    }
    const room = manager.roomById(gameId);
    if (room !== undefined) {
      // Гра вже скінчилась, а рекордер ще не записав рядок.
      if (room.state.phase === 'finished') return { ok: false, status: 409, error: 'challenge_done' };
      const author = manager.authorToken(room);
      if (author === null) return { ok: false, status: 503, error: 'restarting' };
      return { ok: true, body: { code: room.code, token: author.token, playerId: author.playerId, stageToken: room.stageToken } };
    }
    if ((await openGameIds(db, manager)).has(gameId)) return { ok: false, status: 503, error: 'restarting' };
    if (status === 'saved') {
      const continued = await continueSavedGame({ db, manager, maxRooms }, userId, gameId, markOf(row));
      if (!continued.ok) return continued;
      const body = continued.body;
      if (!('token' in body)) return { ok: false, status: 409, error: 'cannot_continue' };
      return { ok: true, body: { code: body.code, token: body.token, playerId: body.playerId, stageToken: body.stageToken } };
    }
    // Рядок «running» без кімнати — гру щойно закрито чи її підбирає інший процес: клієнт повторить.
    if (status !== null) return { ok: false, status: 503, error: 'restarting' };
    return openRoom(row, userId, nickname, gameId);
  };

  app.get<{ Params: { id: string } }>('/api/quizzes/:id/challenge', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const quiz = await getQuiz(db, user.id, request.params.id);
    if (quiz === null) return reply.code(404).send(NOT_FOUND);
    const { quiz: snapshot, skipped } = challengeQuiz(quiz);
    const check: ChallengeCheck = { skipped, empty: snapshot === null, active: await activeForQuiz(db, user.id, request.params.id, now()) };
    return check;
  });

  app.post<{ Params: { id: string } }>('/api/quizzes/:id/challenge', CREATE_LIMIT, async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    const created = await createChallenge(db, user.id, request.params.id, now());
    if (!created.ok) return created.error === 'not_found' ? reply.code(404).send(NOT_FOUND) : reply.code(409).send({ error: created.error });
    const row = created.challenge;
    const mine: ChallengeMine = { quizId: row.quizId ?? request.params.id, code: row.code, expiresAt: row.expiresAt.toISOString(), played: 0 };
    return reply.code(201).send(mine);
  });

  app.get('/api/challenges', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return myActiveChallenges(db, user.id, now());
  });

  // 78: «Виклик від друга» для картки «Що далі» на головній; лише читання.
  app.get('/api/me/friend-challenges', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return friendChallenges(db, user.id, now());
  });

  // 79: «Мої виклики» в історії — надіслані мною, зі спробами й найкращим результатом; лише читання.
  app.get('/api/me/sent-challenges', async (request, reply) => {
    const user = await currentUser(request);
    if (user === null) return reply.code(401).send(UNAUTHORIZED);
    return sentChallenges(db, user.id, now());
  });

  app.get<{ Params: { code: string } }>('/api/challenges/:code', CODE_LIMIT, async (request, reply) => {
    const loaded = await load(request, reply);
    if (loaded === null) return reply;
    const { user, row } = loaded;
    const card = await ensureProfile(db, row.ownerId);
    const preview: ChallengePreview = {
      title: row.title,
      author: card?.nickname ? { id: row.ownerId, nickname: card.nickname } : null,
      expiresAt: row.expiresAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      active: isActive(row, now()),
      played: await playedCount(db, row.id),
      ...(await standing(row, user.id)),
    };
    return preview;
  });

  app.get<{ Params: { code: string } }>('/api/challenges/:code/results', CODE_LIMIT, async (request, reply) => {
    const loaded = await load(request, reply);
    if (loaded === null) return reply;
    const { user, row } = loaded;
    // Таблицю видно автору, тим, хто дограв, і тим, чий виклик закрився посеред гри; іншим — жодного рядка.
    if (!(await standing(row, user.id)).canSeeResults) return reply.code(403).send({ error: 'challenge_hidden' });
    return challengeResults(db, row, user.id);
  });

  app.post<{ Params: { code: string } }>('/api/challenges/:code/attempt', CREATE_LIMIT, async (request, reply) => {
    const loaded = await load(request, reply);
    if (loaded === null) return reply;
    const { user, row } = loaded;
    const outcome = await serial(`${row.id}:${user.id}`, async (): Promise<Outcome> => {
      const nickname = (await ensureProfile(db, user.id))?.nickname ?? (user.name.trim().slice(0, LIMITS.nicknameMax) || 'Гравець');
      const existing = await attemptOf(db, row.id, user.id);
      if (existing !== null) return resume(row, user.id, nickname, existing.gameId);
      if (!isActive(row, now())) return { ok: false, status: 409, error: 'challenge_closed' };
      if (manager.size >= maxRooms) return { ok: false, status: 503, error: 'server_busy' };
      if (manager.frozen) return { ok: false, status: 503, error: 'restarting' };
      // Спершу спроба (ключ у базі — одна на акаунт), потім кімната з її id; конфлікт — паралельний запит, повертаємось до наявної.
      const claimed = await claimAttempt(db, row.id, user.id, nickname, now());
      if (!claimed.fresh) return resume(row, user.id, nickname, claimed.gameId);
      return openRoom(row, user.id, nickname, claimed.gameId);
    });
    return outcome.ok ? reply.code(201).send(outcome.body) : reply.code(outcome.status).send({ error: outcome.error });
  });
}

