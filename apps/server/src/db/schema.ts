import type { BluffOption } from '@quiz/engine';
import type {
  AchievementId,
  AdminActionKind,
  AdminLogDetails,
  AdjustmentSource,
  AppealOutcome,
  AppealReason,
  CalendarRequestStatus,
  Answer,
  BuffKind,
  DebuffKind,
  Duels,
  FeedData,
  FeedKind,
  GameStatus,
  Locale,
  LikeKind,
  LadderOutcomeKind,
  NickColor,
  NickFont,
  NickFrame,
  PhotoFrame,
  PrizeContent,
  PrizePlace,
  ShowcasePinKind,
  ProfileBadge,
  Question,
  QuizSettings,
  Round,
  SurveyRow,
  TrialKind,
} from '@quiz/shared';
import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';
import type { XpReason } from '../xp-rules';

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
    settings: jsonb('settings').$type<QuizSettings & { duels?: Duels; spares?: Question[] }>().notNull(),
    rounds: jsonb('rounds').$type<Round[]>().notNull(),
    ...stamps,
  },
  (table) => [index('quiz_owner_idx').on(table.ownerId)],
);

/** Зігране запитання гри: раунд і id запитання в ньому. */
export interface PlayRef {
  roundIndex: number;
  questionId: string;
  /** Клітинка поля й той, хто її вибрав; лише для запитань раунду поля. */
  cell?: { cellId: string; chooserId: string };
  /** Ключі слів «хмари», які ведучий сховав; лише для хмари й лише якщо щось сховано. */
  cloudHidden?: string[];
  /** «100 до 1» з дошкою з хмари: збудовані рядки (знімок вікторини їх не має). */
  surveyRows?: SurveyRow[];
  /** Блеф: варіанти (з авторами, видами й позначкою «прибрано») і вибори гравців за id; знімок вікторини їх не має. */
  bluff?: { options: BluffOption[]; picks: Record<string, string> };
  /** «Слова з літер»: роздані літери (випадковий набір знімок вікторини не має) і найдовші можливі слова. */
  letterwords?: { letters: string[]; best: string[] };
  /** «Ва-банк»: хто забрав банк після цього запитання (id учасників) і чи скінчився на ньому раунд. */
  wipeout?: { took: string[]; end?: true };
  /** «Мільйонер»: учасник, сходинка, підказки, рішення й підсумок (id учасника). */
  ladder?: {
    contestant: string;
    step: number;
    level: number;
    lifelines?: {
      fifty?: string[];
      /** Лише закрите голосування залу: скільки глядачів проголосувало й за які варіанти. */
      audience?: { cast: number; counts: Record<string, number> };
      hint?: { text: string | null; aloud: boolean };
    };
    decision?: 'go' | 'take';
    outcome?: { kind: LadderOutcomeKind; passed: number; points: number };
  };
  /**
   * «Правда про гравця» (28b): згенероване запитання (факт — особисті дані цієї гри, лише тут), автор (id людини), його нікнейм
   * на мить запитання й учасник рушія автора (соло — сам автор, командна гра — команда). Знімок вікторини їх не має.
   */
  truth?: { question: Question; author: string; authorName: string; actor: string };
  /** «Вибування»: хто був на межі, випробування, привиди й кінець раунду (id учасників). */
  survival?: {
    /** Хто був на межі; немає — раунд чи гра скінчились на розкритті, до вердикту. */
    edge?: string[];
    /** Скільки привидів відповіли «для себе» й скільки відгадали; немає — жоден не відповідав. */
    ghosts?: { answered: number; right: number };
    trial?: {
      kind: TrialKind;
      fellBack?: true;
      questionId?: string;
      /** Питання: відповіді на межі (answer і correct). */
      answers?: Record<string, { answer: Answer; correct: boolean }>;
      /** Удача: двері (picked чи auto) і пастка кожного на межі. */
      doors?: Record<string, { door: number; auto: boolean; trap: number }>;
      out: string[];
    };
    end?: true;
  };
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
    /** Гру вів автопілот (11h); старі ігри — false. */
    autopilot: boolean('autopilot').notNull().default(false),
  },
  (table) => [index('game_host_idx').on(table.hostId)],
);

/** Збережена гра (13b): контрольна точка між запитаннями; data null — знімка немає, продовження шляхом 12r. Без терміну давності. */
export const savedGame = pgTable('saved_game', {
  gameId: uuid('game_id')
    .primaryKey()
    .references(() => game.id, { onDelete: 'cascade' }),
  /** SavedGameData (rooms/continuation.ts); null — знімка немає. */
  data: jsonb('data').$type<unknown>(),
  /** GAME_STATE_VERSION знімка; null — знімка немає. */
  stateVersion: integer('state_version'),
  savedAt: at('saved_at').notNull(),
});

/** Гравець у грі. id збігається з id гравця в кімнаті; у командній грі — рядок команди (id команди) або людини. */
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
    /** Рядок команди (10j): відповіді й коригування команди; user_id null. */
    isTeam: boolean('is_team').notNull().default(false),
    /** Рядок людини в командній грі: її команда; бали й місце — копія командних. */
    teamId: uuid('team_id').references((): AnyPgColumn => participant.id, { onDelete: 'cascade' }),
  },
  (table) => [
    index('participant_game_idx').on(table.gameId),
    index('participant_user_idx').on(table.userId),
    index('participant_team_idx').on(table.teamId),
  ],
);

/** Номер рядка answer з балами без відповіді: штраф бліц-клітинки або мовчання у фіналі; спроби мають номери 0…n. */
export const PENALTY_ATTEMPT = -1;

/** Номер рядка answer для голосу в запитанні без балів (опитування, хмара, 10d): не відповідь для статистики. */
export const VOTE_ATTEMPT = -3;

/**
 * Номер рядка answer лише з позначкою виходу (12e): учасник без жодного рядка на закритому запитанні, але з away_ms від порогу.
 * Бали 0, відповіді немає; не відповідь ні для статистики, ні для рахунку — лише для цікавинок «відволікався».
 */
export const AWAY_ATTEMPT = -4;

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
    /** Ставка у фіналі; null поза фіналом і в старих іграх. */
    wager: integer('wager'),
    /** Баф, узятий на це запитання; null — без бафу (і в старих іграх). */
    buff: text('buff').$type<BuffKind>(),
    /** Запасне запитання, на яке дано відповідь; null — основне (і в старих іграх). */
    spareId: text('spare_id'),
    /** Вихід із гри на цьому запитанні від AWAY_MS.mark, мс (12e); null — без позначки (і в старих іграх). */
    awayMs: integer('away_ms'),
    /** Дебаф, що діяв на учасника в цьому запитанні (12i); null — без дебафу (і в старих іграх). */
    debuff: text('debuff').$type<DebuffKind>(),
    /** «Хто я?»: на якій підказці дано відповідь (12i); null — інший тип, запасне чи старі ігри. */
    clue: integer('clue'),
    /** Командна гра: рядок людини, що відповідала чи натиснула (12i); без зовнішнього ключа — рядки команд пишуться раніше за рядки людей. null — соло, людина чи старі ігри. */
    answeredBy: uuid('answered_by'),
  },
  (table) => [primaryKey({ columns: [table.participantId, table.questionIndex, table.attempt] })],
);

/** Номер рядка в TableRow для коригування рахунку (не відповідь); у таблиці answer таких рядків немає. */
export const ADJUSTMENT_ATTEMPT = -2;

/** Коригування рахунку учасника поза відповідями: бали від ведучого, пізніше — дуелі. */
export const scoreAdjustment = pgTable(
  'score_adjustment',
  {
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    /** Зростаючий номер коригування в межах гри; не перевикористовується. */
    seq: integer('seq').notNull(),
    roundIndex: integer('round_index').notNull(),
    /** Скільки запитань гри вже закрито в мить коригування. */
    afterQuestion: integer('after_question').notNull(),
    points: integer('points').notNull(),
    source: text('source').$type<AdjustmentSource>().notNull(),
    /** Купівля дебафу (9c): вид; null — не покупка (і в старих іграх). */
    debuff: text('debuff').$type<DebuffKind>(),
    /** Купівля дебафу: нікнейм цілі в мить запису; null — не покупка або ціль уже вилучено. */
    targetNickname: text('target_nickname'),
    /** Скасування (12a): індекс у game.plays запитання, бали якого скасовано; null — інший рядок (і старі ігри). */
    undoesQuestion: integer('undoes_question'),
    /** Скасування (12a): seq скасованого коригування або скасування, яке повернули; null — інший рядок (і старі ігри). */
    undoesSeq: integer('undoes_seq'),
  },
  (table) => [primaryKey({ columns: [table.participantId, table.seq] })],
);

/** Апеляція гравця (12f): закрита апеляція з лічильником голосів і рішенням; голоси людей не зберігаються. */
export const appeal = pgTable(
  'appeal',
  {
    gameId: uuid('game_id')
      .notNull()
      .references(() => game.id, { onDelete: 'cascade' }),
    /** Номер апеляції в грі (Appeal.id). */
    seq: integer('seq').notNull(),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    /** Індекс у game.plays. */
    questionIndex: integer('question_index').notNull(),
    reason: text('reason').$type<AppealReason>().notNull(),
    yes: integer('yes').notNull(),
    no: integer('no').notNull(),
    outcome: text('outcome').$type<AppealOutcome>().notNull(),
    /** seq коригування 'appeal'; null — рішення його не дописало. */
    adjustmentSeq: integer('adjustment_seq'),
  },
  (table) => [primaryKey({ columns: [table.gameId, table.seq] })],
);

/** Профіль гравця: окремо від user Better Auth, створюється під час першого читання. */
export const profile = pgTable('profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  /** null — нікнейма ще нема (ім'я акаунта не пройшло правил); веб показує підставку. */
  nickname: text('nickname'),
  /** normalizeText(nickname): нікнейм унікальний без різниці регістру, пробілів і апострофів; null, коли нікнейма нема. */
  nicknameKey: text('nickname_key').unique(),
  /** Шлях /uploads/<назва> або null. */
  avatar: text('avatar'),
  /** Історію цього користувача вже доповнено ачівками (12i); null — ще ні. Далі — мітка: ігри, що закінчились пізніше й не дали жодного рядка user_achievement, читання наздоганяє. */
  achievementsSyncedAt: at('achievements_synced_at'),
  /** Останнє звернення до сайту (беклог 9): за ним друзі бачать «онлайн» чи «був(-ла) …»; null — ще не бачили. */
  lastSeenAt: at('last_seen_at'),
  /** Улюблені стікери (беклог 7): id з маніфесту, від нещодавно доданих; невідомі id відкидаються під час читання. */
  favoriteStickers: text('favorite_stickers').array().notNull().default(sql`'{}'`),
  /** Ретро-нарахування досвіду вже зроблено (беклог 11); null — ще ні. Далі — мітка: ігри, що закінчились пізніше й не мають свого рядка xp_entry, syncXp наздоганяє. */
  xpSyncedAt: at('xp_synced_at'),
  /** Вбрання біля ніку (беклог 11); закрите рівнем не показується (looksShown). */
  nickColor: text('nick_color').$type<NickColor>(),
  nickFrame: text('nick_frame').$type<NickFrame>(),
  badge: text('badge').$type<ProfileBadge>(),
  /** Рамка фото й шрифт ніку (24d); закрите рівнем не показується. */
  photoFrame: text('photo_frame').$type<PhotoFrame>(),
  nickFont: text('nick_font').$type<NickFont>(),
  /** Стрічку переглянуто до цієї миті (18a): бейдж рахує події з created_at пізніше; null — ще ні (усі події друзів за 90 днів нові). */
  feedSeenAt: at('feed_seen_at'),
  /** Найвищий оголошений у стрічці рівень (18a); null = 1. */
  feedLevel: integer('feed_level'),
  /** Календар переглянуто до цієї миті (19a): decisions рахує зміни пізніше; null — ще ні. */
  calendarSeenAt: at('calendar_seen_at'),
  /** Мова інтерфейсу (22a): одна з LOCALES; null — ще не обрано (пуші йдуть українською). */
  locale: text('locale').$type<Locale>(),
  ...stamps,
});

/** Підписка «follower додав followee в друзі»; одностороння. */
export const follow = pgTable(
  'follow',
  {
    followerId: text('follower_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    followeeId: text('followee_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: at('created_at').notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.followerId, table.followeeId] }), index('follow_followee_idx').on(table.followeeId)],
);

/** Отримана ачівка (12i): дата отримання й гра; earned_at null — отримано до 12i («давно»). */
export const userAchievement = pgTable(
  'user_achievement',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    achievementId: text('achievement_id').$type<AchievementId>().notNull(),
    earnedAt: at('earned_at'),
    gameId: uuid('game_id').references(() => game.id, { onDelete: 'set null' }),
  },
  (table) => [primaryKey({ columns: [table.userId, table.achievementId] })],
);

/** Жива кімната (9b): серіалізований SavedRoom, щоб гра пережила перезапуск. Рядок видаляється, коли кімната закривається. */
export const liveRoom = pgTable('live_room', {
  code: text('code').primaryKey(),
  roomId: uuid('room_id').notNull().unique(),
  data: jsonb('data').$type<unknown>().notNull(),
  /** Процес, що веде кімнату; null — віддано на зупинці, будь-хто може підхопити. */
  owner: text('owner'),
  heartbeatAt: at('heartbeat_at'),
  updatedAt: at('updated_at').notNull(),
});

/** Склад призів ведучого (беклог 10): free → reserved (за грою) → awarded. */
export const prize = pgTable(
  'prize',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    content: jsonb('content').$type<PrizeContent>().notNull(),
    status: text('status').$type<'free' | 'reserved' | 'awarded'>().notNull().default('free'),
    /** id гри (= room.id), за якою зарезервовано; null — не зарезервовано. */
    reservedGame: uuid('reserved_game'),
    createdAt: at('created_at').notNull(),
    updatedAt: at('updated_at').notNull(),
  },
  (table) => [index('prize_owner_idx').on(table.ownerId), index('prize_reserved_idx').on(table.reservedGame)],
);

/** Вручений екземпляр призу (беклог 15): знімок змісту для вітрини; game_id і prize_id без FK, щоб вітрина пережила видалення. */
export const prizeAward = pgTable(
  'prize_award',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    prizeId: uuid('prize_id').notNull(),
    gameId: uuid('game_id').notNull(),
    place: integer('place').$type<PrizePlace>().notNull(),
    content: jsonb('content').$type<PrizeContent>().notNull(),
    quizTitle: text('quiz_title').notNull(),
    nickname: text('nickname').notNull(),
    awardedAt: at('awarded_at').notNull(),
  },
  (table) => [uniqueIndex('prize_award_once').on(table.gameId, table.place, table.userId), index('prize_award_user_idx').on(table.userId)],
);

/** Титул біля ніку (беклог 15): один на акаунт, діє до expires_at. */
export const userTitle = pgTable('user_title', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  text: text('text').notNull(),
  gameId: uuid('game_id').notNull(),
  awardedAt: at('awarded_at').notNull(),
  expiresAt: at('expires_at').notNull(),
});

/**
 * Закріплене на вітрині (23a): нагорода (item_id = id prize_award) чи ачівка (item_id = AchievementId).
 * slot 0…ліміт−1 з унікальним індексом — база не пускає понад ліміт навіть за гонки; pinned_at — порядок.
 * FK лише на user: предмети двох видів у різних таблицях, застарілі рядки прибирають pinItem і deleteAward.
 */
export const showcasePin = pgTable(
  'showcase_pin',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<ShowcasePinKind>().notNull(),
    itemId: text('item_id').notNull(),
    slot: integer('slot').notNull(),
    pinnedAt: at('pinned_at').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.kind, table.itemId] }), uniqueIndex('showcase_pin_slot').on(table.userId, table.kind, table.slot)],
);

/** Журнал досвіду (беклог 11): рядок на акаунт за гру ('game') чи за ачівку ('achievement'); сума — рівень. */
export const xpEntry = pgTable(
  'xp_entry',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    source: text('source').$type<'game' | 'achievement'>().notNull(),
    /** Без FK: журнал переживає видалення гри. */
    gameId: uuid('game_id'),
    quizId: uuid('quiz_id'),
    achievementId: text('achievement_id').$type<AchievementId>(),
    amount: integer('amount').notNull(),
    /** Гра пройшла правила 1–4: вікторина «з'їдена» для repeat_quiz. */
    counted: boolean('counted').notNull().default(false),
    reason: text('reason').$type<XpReason>(),
    /** kyivDay(at) — для денної стелі. */
    day: text('day').notNull(),
    /** finished_at гри чи earned_at досягнення; null — давнє досягнення без дати. */
    at: at('at'),
    retro: boolean('retro').notNull().default(false),
    createdAt: at('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('xp_entry_game_once').on(table.userId, table.gameId).where(sql`source = 'game'`),
    uniqueIndex('xp_entry_achievement_once').on(table.userId, table.achievementId).where(sql`source = 'achievement'`),
    index('xp_entry_user_day_idx').on(table.userId, table.day),
  ],
);

/** Лайки (беклог #22): хто кому за що; один лайк людини на об'єкт (часткові унікальні індекси за видом). */
export const userLike = pgTable(
  'user_like',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Хто лайкнув. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<LikeKind>().notNull(),
    /** Кому зараховано: власник вікторини (question / quiz), ведучий (host) чи гравець (player). */
    targetUserId: text('target_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Без FK: лайки переживають видалення вікторини. */
    quizId: uuid('quiz_id'),
    questionId: text('question_id'),
    /** Без FK; = room.id. null — лише event без гри. */
    gameId: uuid('game_id'),
    /** Лише event: feed_event.key. */
    eventKey: text('event_key'),
    /** Запитання видалено з вікторини чи вікторину видалено: рядок лишається, але не рахується. */
    hidden: boolean('hidden').notNull().default(false),
    createdAt: at('created_at').notNull(),
  },
  (table) => [
    uniqueIndex('user_like_question_once').on(table.userId, table.quizId, table.questionId).where(sql`kind = 'question'`),
    uniqueIndex('user_like_quiz_once').on(table.userId, table.quizId).where(sql`kind = 'quiz'`),
    uniqueIndex('user_like_host_once').on(table.userId, table.gameId).where(sql`kind = 'host'`),
    uniqueIndex('user_like_player_once').on(table.userId, table.gameId, table.targetUserId).where(sql`kind = 'player'`),
    uniqueIndex('user_like_event_once').on(table.userId, table.eventKey).where(sql`kind = 'event'`),
    index('user_like_target_idx').on(table.targetUserId, table.kind, table.createdAt),
    index('user_like_user_idx').on(table.userId),
    index('user_like_quiz_idx').on(table.quizId),
  ],
);

/** Подія стрічки друзів (18a); лайки до мене не матеріалізуються — їх читають з user_like. */
export const feedEvent = pgTable(
  'feed_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Ідемпотентний ключ: game:<gameId>:<userId> | achievement:<userId>:<id> | prize:<awardId> | level:<userId>:<n>. */
    key: text('key').notNull().unique(),
    /** Чия подія. */
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<Exclude<FeedKind, 'like'>>().notNull(),
    /** Без FK: подія переживає видалення гри. */
    gameId: uuid('game_id'),
    /** FeedData без лайків; kind дублюється всередині. */
    data: jsonb('data').$type<FeedData>().notNull(),
    /** Пишіть з точністю до мілісекунд (Date з JS): курсор сторінок — ISO з мілісекундами. */
    at: at('at').notNull(),
    /** Коли записано: за ним рахує бейдж. Теж до мілісекунд. */
    createdAt: at('created_at').notNull(),
  },
  (table) => [
    index('feed_event_user_at_idx').on(table.userId, table.at),
    index('feed_event_user_created_idx').on(table.userId, table.createdAt),
    index('feed_event_at_idx').on(table.at),
  ],
);

/** Запланована гра (19a). Стан обчислюється (calendarState), не зберігається. */
export const calendarEvent = pgTable(
  'calendar_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: text('host_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Вікторину видалили — null, подія лишається («Вікторину видалено»). */
    quizId: uuid('quiz_id').references(() => quiz.id, { onDelete: 'set null' }),
    startsAt: at('starts_at').notNull(),
    /** Остання кімната події: room.id і room.code; без FK (гра пишеться лише після лобі). */
    gameId: uuid('game_id'),
    gameCode: text('game_code'),
    editedAt: at('edited_at'),
    cancelledAt: at('cancelled_at'),
    /** Пуш «за годину» уже ішов (20a); ставиться атомарно до відправки. */
    remindedAt: at('reminded_at'),
    /** Пуш «гру відкрито» уже ішов (20a). */
    openedPushedAt: at('opened_pushed_at'),
    createdAt: at('created_at').notNull(),
  },
  (table) => [
    index('calendar_event_host_starts_idx').on(table.hostId, table.startsAt),
    index('calendar_event_starts_idx').on(table.startsAt),
  ],
);

/** Запит на участь; ключ — (подія, людина). */
export const calendarRequest = pgTable(
  'calendar_request',
  {
    eventId: uuid('event_id')
      .notNull()
      .references(() => calendarEvent.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<CalendarRequestStatus>().notNull(),
    requestedAt: at('requested_at').notNull(),
    decidedAt: at('decided_at'),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index('calendar_request_user_idx').on(table.userId),
  ],
);

/** Підписка Web Push одного пристрою (20a); endpoint унікальний на весь світ. */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    endpoint: text('endpoint').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: at('created_at').notNull(),
  },
  (table) => [index('push_subscription_user_idx').on(table.userId)],
);

export const userBan = pgTable('user_ban', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  reason: text('reason'),
  bannedBy: text('banned_by').references(() => user.id, { onDelete: 'set null' }),
  bannedAt: at('banned_at').notNull(),
});

export const adminAction = pgTable(
  'admin_action',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    at: at('at').notNull(),
    adminId: text('admin_id').references(() => user.id, { onDelete: 'set null' }),
    adminLabel: text('admin_label').notNull(),
    kind: text('kind').$type<AdminActionKind>().notNull(),
    targetUserId: text('target_user_id'),
    targetLabel: text('target_label').notNull(),
    details: jsonb('details').$type<AdminLogDetails>().notNull(),
  },
  (table) => [index('admin_action_at_idx').on(table.at)],
);
