import type { Answer, GameStatus, QuizSettings, Round } from '@quiz/shared';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const at = (name: string) => timestamp(name, { withTimezone: true });

const stamps = {
  createdAt: at('created_at').notNull().defaultNow(),
  updatedAt: at('updated_at').notNull().defaultNow(),
};

// Таблиці user, session, account, verification належать Better Auth:
// назви полів мають збігатися з його моделлю.

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  ...stamps,
});

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: at('expires_at').notNull(),
    token: text('token').notNull().unique(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    ...stamps,
  },
  (table) => [index('session_user_idx').on(table.userId)],
);

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: at('access_token_expires_at'),
    refreshTokenExpiresAt: at('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    ...stamps,
  },
  (table) => [index('account_user_idx').on(table.userId)],
);

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: at('expires_at').notNull(),
  ...stamps,
});

export const quiz = pgTable(
  'quiz',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull(),
    settings: jsonb('settings').$type<QuizSettings>().notNull(),
    rounds: jsonb('rounds').$type<Round[]>().notNull(),
    ...stamps,
  },
  (table) => [index('quiz_owner_idx').on(table.ownerId)],
);

/** Зігране запитання гри: раунд і id запитання в ньому. */
export interface PlayRef {
  roundIndex: number;
  questionId: string;
}

/** Зіграна або поточна гра. id збігається з id кімнати. */
export const game = pgTable(
  'game',
  {
    id: uuid('id').primaryKey(),
    // Без зовнішнього ключа: вікторину можуть видалити, а історія спирається на знімок.
    quizId: uuid('quiz_id'),
    hostId: text('host_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    status: text('status').$type<GameStatus>().notNull(),
    title: text('title').notNull(),
    /** Знімок вікторини; ігри, зіграні до раундів, мають старий формат, тому читати через upgradeQuiz. */
    quizSnapshot: jsonb('quiz_snapshot').$type<unknown>().notNull(),
    /** Закриті запитання в порядку гри; у старих іграх порожній. */
    plays: jsonb('plays').$type<PlayRef[]>().notNull().default([]),
    /** Скільки запитань уже закрито. */
    questionsPlayed: integer('questions_played').notNull().default(0),
    startedAt: at('started_at').notNull(),
    finishedAt: at('finished_at'),
  },
  (table) => [index('game_host_idx').on(table.hostId)],
);

/** Гравець у грі. id збігається з id гравця в кімнаті. */
export const participant = pgTable(
  'participant',
  {
    id: uuid('id').primaryKey(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => game.id, { onDelete: 'cascade' }),
    nickname: text('nickname').notNull(),
    /** Акаунт гравця, якщо він увійшов; після видалення акаунта гра лишається в історії ведучого. */
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    score: integer('score').notNull(),
    totalTimeMs: integer('total_time_ms').notNull(),
    rank: integer('rank'),
  },
  (table) => [index('participant_game_idx').on(table.gameId), index('participant_user_idx').on(table.userId)],
);

export const answer = pgTable(
  'answer',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    /** Індекс у game.plays. */
    questionIndex: integer('question_index').notNull(),
    /** Номер спроби гравця на запитання з нуля: у бліці спроб може бути кілька, в інших раундах лише 0. */
    attempt: integer('attempt').notNull().default(0),
    roundIndex: integer('round_index').notNull().default(0),
    /** null — спроба бліцу, у якій гравець не встиг відповісти. */
    payload: jsonb('payload').$type<Answer>(),
    timeMs: integer('time_ms').notNull(),
    accepted: boolean('accepted').notNull(),
    /** Повні бали за відповідь, разом із бонусом серії. */
    points: integer('points').notNull(),
    streakBonus: integer('streak_bonus').notNull().default(0),
    overridden: boolean('overridden').notNull(),
  },
  (table) => [primaryKey({ columns: [table.participantId, table.questionIndex, table.attempt] })],
);
