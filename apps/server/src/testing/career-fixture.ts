import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Question, Round } from '@quiz/shared';
import {
  boardRound,
  bool,
  classicRound,
  cloud,
  ladderRound,
  makeQuiz,
  makeRoundsQuiz,
  poll,
  single,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  think,
  thinkRound,
  truthRound,
  wipeoutLadder,
  wipeoutRound,
  withId,
} from '@quiz/engine/testing';
import type { Db } from '../db/client';
import { follow, game, PENALTY_ATTEMPT, quiz, user, VOTE_ATTEMPT, type PlayRef } from '../db/schema';
import { seedGame, type SeedPlayer } from './history-rows';

/**
 * Засіяна кар'єра (план 46): 26 завершених ігор Олі з усіма особливими випадками точності, гра, яку вона вела, гра за її вікториною,
 * її незавершена гра. userId — Оля, friendId — Петро (Оля на нього підписана), otherId — Віра.
 * gameIds — 26 завершених ігор Олі в порядку startedAt; gatedGameIds — «Ва-банк», «Вибування», «Мільйонер» і зіпсований «Ва-банк»;
 * oldFormatGameIds — гра зі знімком старого формату.
 */
export interface CareerFixture {
  userId: string;
  friendId: string;
  otherId: string;
  gameIds: string[];
  gatedGameIds: string[];
  oldFormatGameIds: string[];
}

const SINCE = new Date('2026-09-01T09:00:00Z');
const FIRST_DAY = Date.parse('2026-10-01T10:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const LONG =
  'Довге запитання про українські річки, гори, міста й села: Дніпро, Дністер, Десна, Говерла, Піп Іван, Чернівці, Ужгород, Полтава, Вінниця. ';

/** Запитання на межі довжини (300 знаків): щоб знімок кожної гри був справді великим, як у справжніх вікторин. */
const longText = (i: number) => `${i + 1}. ${LONG.repeat(4)}`.slice(0, 300).trim();

/** Незіграний раунд-баласт: 80 довгих запитань (~70 КБ у знімку); стоїть останнім, тож індекси зіграних раундів не зсуваються. */
const PADDING: Round = classicRound(
  'pad',
  Array.from({ length: 80 }, (_, i): Question => ({ ...single, id: `pad${i + 1}`, text: longText(i) })),
);

const snapshotOf = (rounds: Round[]) => makeRoundsQuiz([...rounds, PADDING]);

const guest = (nickname: string, score: number, rank: number, rows: SeedPlayer['rows'] = []): SeedPlayer => ({ userId: null, nickname, score, rank, rows });

/** Рядок відповіді: прийнята за 1000 чи ні. */
const mark = (questionIndex: number, accepted: boolean, roundIndex = 0) => ({ questionIndex, roundIndex, accepted, points: accepted ? 1000 : 0 });

/** Голос опитування, хмари чи слово «Думай інакше». */
const vote = (questionIndex: number, payload: { type: 'poll'; optionId: string } | { type: 'wordcloud'; words: string[] } | { type: 'think'; value: string }, roundIndex = 0) => ({
  questionIndex,
  roundIndex,
  attempt: VOTE_ATTEMPT,
  accepted: false,
  points: 0,
  payload,
});

const refs = (roundIndex: number, ids: string[]): PlayRef[] => ids.map((questionId) => ({ roundIndex, questionId }));

export async function seedCareer(db: Db): Promise<CareerFixture> {
  const userId = randomUUID();
  const friendId = randomUUID();
  const otherId = randomUUID();
  await db.insert(user).values([
    { id: userId, name: 'Оля Коваль', email: 'olya@example.com', createdAt: SINCE, updatedAt: SINCE },
    { id: friendId, name: 'Петро Бондар', email: 'petro@example.com', createdAt: SINCE, updatedAt: SINCE },
    { id: otherId, name: 'Віра Шевчук', email: 'vira@example.com', createdAt: SINCE, updatedAt: SINCE },
  ]);
  await db.insert(follow).values({ followerId: userId, followeeId: friendId, createdAt: SINCE });
  const own = makeQuiz([single, bool]);
  const [olyaQuiz] = await db
    .insert(quiz)
    .values({ ownerId: userId, title: 'Олина вікторина', description: '', settings: own.settings, rounds: own.rounds, createdAt: SINCE, updatedAt: SINCE })
    .returning({ id: quiz.id });

  let day = 0;
  const gameIds: string[] = [];
  const gatedGameIds: string[] = [];
  const oldFormatGameIds: string[] = [];

  /** Гра наступного дня; plays — від id учасників (у порядку players), бо seedGame дає їх сам. */
  async function play(
    spec: Omit<Parameters<typeof seedGame>[1], 'startedAt' | 'plays' | 'hostId'> & { hostId?: string; plays?: (ids: string[]) => PlayRef[] },
    kind: 'career' | 'gated' | 'old' | 'extra' = 'career',
  ): Promise<string> {
    const { plays, hostId, ...rest } = spec;
    const startedAt = new Date(FIRST_DAY + day * DAY);
    day += 1;
    const { gameId, participantIds } = await seedGame(db, { ...rest, hostId: hostId ?? otherId, startedAt });
    if (plays !== undefined) await db.update(game).set({ plays: plays(participantIds) }).where(eq(game.id, gameId));
    if (kind !== 'extra') gameIds.push(gameId);
    if (kind === 'gated') gatedGameIds.push(gameId);
    if (kind === 'old') oldFormatGameIds.push(gameId);
    return gameId;
  }

  const olya = (score: number, rank: number | null, rows: SeedPlayer['rows'] = [], extra: Partial<SeedPlayer> = {}): SeedPlayer => ({
    userId,
    nickname: 'Оля',
    score,
    rank,
    rows,
    ...extra,
  });
  const petro = (score: number, rank: number | null, rows: SeedPlayer['rows'] = [], extra: Partial<SeedPlayer> = {}): SeedPlayer => ({
    userId: friendId,
    nickname: 'Петро',
    score,
    rank,
    rows,
    ...extra,
  });

  // 1–8. Класика на чотири запитання: Петро — суперник у п'яти, Оля виграє три.
  const classic = snapshotOf([classicRound('r1', [single, withId(single, 'q2'), bool, text])]);
  const classicPlays = () => refs(0, [single.id, 'q2', bool.id, text.id]);
  const classicGames: { right: boolean[]; rank: number; rival: 'petro' | 'guest'; rivalRight: number }[] = [
    { right: [true, true, true, true], rank: 1, rival: 'petro', rivalRight: 2 },
    { right: [true, false, true, false], rank: 2, rival: 'petro', rivalRight: 3 },
    { right: [true, true, false, true], rank: 1, rival: 'petro', rivalRight: 1 },
    { right: [false, false, true, false], rank: 2, rival: 'petro', rivalRight: 4 },
    { right: [true, false, false], rank: 2, rival: 'petro', rivalRight: 2 },
    { right: [false, false, false, false], rank: 2, rival: 'guest', rivalRight: 1 },
    { right: [true, true, true], rank: 1, rival: 'guest', rivalRight: 0 },
    { right: [false, true, true, false], rank: 2, rival: 'guest', rivalRight: 3 },
  ];
  for (const [i, g] of classicGames.entries()) {
    const score = g.right.filter(Boolean).length * 1000;
    const rivalRows = [0, 1, 2, 3].map((q) => mark(q, q < g.rivalRight));
    const rivalRank = g.rank === 1 ? 2 : 1;
    await play({
      title: `Класика ${i + 1}`,
      snapshot: classic,
      questionsPlayed: 4,
      plays: classicPlays,
      quizId: i < 2 ? olyaQuiz.id : undefined,
      players: [
        olya(score, g.rank, g.right.map((right, q) => mark(q, right))),
        g.rival === 'petro' ? petro(g.rivalRight * 1000, rivalRank, rivalRows) : guest('Гість', g.rivalRight * 1000, rivalRank, rivalRows),
      ],
    });
  }

  // 9. Опитування й хмара в раунді-списку: не рахуються (4 − 2 = 2).
  await play({
    title: 'Опитування в списку',
    snapshot: snapshotOf([classicRound('r1', [single, poll, cloud, bool])]),
    questionsPlayed: 4,
    plays: () => refs(0, [single.id, poll.id, cloud.id, bool.id]),
    players: [
      olya(1000, 1, [mark(0, true), vote(1, { type: 'poll', optionId: 'b' }), vote(2, { type: 'wordcloud', words: ['Дніпро'] }), mark(3, false)]),
      guest('Гість', 0, 2, [mark(0, false), mark(3, false)]),
    ],
  });

  // 10. Те саме опитування й хмара в клітинках поля: рахуються, як і досі (4). Схема опитувань на полі не пускає — знімок не проходить quizSchema.
  const cellIds = ['bp1', 'bc1', 'bt1', 'bt2'];
  await play({
    title: 'Опитування на полі',
    snapshot: snapshotOf([
      boardRound('b1', [
        { title: 'Річки', cells: [withId(poll, 'bp1'), withId(cloud, 'bc1'), withId(text, 'bt1')] },
        { title: 'Гори', cells: [withId(text, 'bt2'), withId(text, 'bt3'), withId(text, 'bt4')] },
        { title: 'Міста', cells: [withId(text, 'bt5'), withId(text, 'bt6'), withId(text, 'bt7')] },
      ]),
    ]),
    questionsPlayed: 4,
    plays: (ids) => cellIds.map((id) => ({ roundIndex: 0, questionId: id, cell: { cellId: id, chooserId: ids[0]! } })),
    players: [
      olya(1000, 1, [vote(0, { type: 'poll', optionId: 'a' }), vote(1, { type: 'wordcloud', words: ['Говерла'] }), mark(2, true), mark(3, false)]),
      guest('Гість', 0, 2, [mark(2, false), mark(3, false)]),
    ],
  });

  // 11. «Думай інакше» (35) і класика: слова не рахуються (3 − 2 = 1).
  await play({
    title: 'Думай інакше',
    snapshot: snapshotOf([thinkRound('r1', [think('t1'), think('t2'), think('t3')]), classicRound('r2', [single])]),
    questionsPlayed: 3,
    plays: () => [...refs(0, ['t1', 't2']), ...refs(1, [single.id])],
    players: [
      olya(4000, 1, [vote(0, { type: 'think', value: 'ксилофон' }), vote(1, { type: 'think', value: 'смарагдовий' }), mark(2, true, 1)]),
      guest('Гість', 0, 2, [vote(0, { type: 'think', value: 'червоний' }), mark(2, false, 1)]),
    ],
  });

  // 12. «Правда про гравця»: факт Олі (не її запитання) і факт Петра (вона вгадує): 4 − 1 = 3.
  const truthQuestion = (id: string, fact: string): Question => ({
    id,
    type: 'single',
    text: fact,
    options: [
      { id: 'pa', text: 'Оля' },
      { id: 'pb', text: 'Петро' },
    ],
    correctId: 'pa',
    points: 300,
    timeLimit: 30,
    imageUrl: null,
    video: null,
  });
  await play({
    title: 'Правда про гравця',
    snapshot: snapshotOf([truthRound('t1'), classicRound('r2', [single, bool])]),
    questionsPlayed: 4,
    plays: (ids) => [
      { roundIndex: 0, questionId: 'truth-0', truth: { question: truthQuestion('truth-0', 'Я піднімалась на Говерлу'), author: ids[0]!, authorName: 'Оля', actor: ids[0]! } },
      { roundIndex: 0, questionId: 'truth-1', truth: { question: truthQuestion('truth-1', 'Я сплавлявся Дністром'), author: ids[1]!, authorName: 'Петро', actor: ids[1]! } },
      ...refs(1, [single.id, bool.id]),
    ],
    players: [
      olya(2300, 1, [{ questionIndex: 0, attempt: PENALTY_ATTEMPT, accepted: true, points: 300 }, mark(1, true), mark(2, true, 1), mark(3, false, 1)]),
      petro(1300, 2, [mark(0, false), { questionIndex: 1, attempt: PENALTY_ATTEMPT, accepted: false, points: 0 }, mark(2, true, 1), mark(3, false, 1)]),
    ],
  });

  // 13. «Ва-банк»: Оля забрала банк на 2-й сходинці з 4 — дві наступні не її (4 − 2 = 2); Петро пройшов усі.
  await play(
    {
      title: 'Ва-банк',
      snapshot: snapshotOf([wipeoutRound('w', wipeoutLadder)]),
      questionsPlayed: 4,
      plays: (ids) => [
        { roundIndex: 0, questionId: 'w1', wipeout: { took: [] } },
        { roundIndex: 0, questionId: 'w2', wipeout: { took: [ids[0]!] } },
        { roundIndex: 0, questionId: 'w3', wipeout: { took: [] } },
        { roundIndex: 0, questionId: 'w4', wipeout: { took: [ids[1]!], end: true } },
      ],
      players: [olya(300, 2, [mark(0, true), mark(1, true)]), petro(1000, 1, [mark(0, true), mark(1, true), mark(2, true), mark(3, true)])],
    },
    'gated',
  );

  // 14. «Вибування»: Оля вибула на 2-му запитанні з 4 (4 − 2 = 2).
  await play(
    {
      title: 'Вибування',
      snapshot: snapshotOf([survivalRound('s', survivalQuestions, survivalTrials)]),
      questionsPlayed: 4,
      plays: (ids) => [
        { roundIndex: 0, questionId: 's1' },
        { roundIndex: 0, questionId: 's2', survival: { edge: [ids[0]!], trial: { kind: 'question', questionId: 't1', out: [ids[0]!] } } },
        { roundIndex: 0, questionId: 's3' },
        { roundIndex: 0, questionId: 's4', survival: { end: true } },
      ],
      players: [olya(100, 2, [mark(0, true), mark(1, false)]), petro(900, 1, [mark(0, true), mark(1, true), mark(2, true), mark(3, false)])],
    },
    'gated',
  );

  // 15. «Мільйонер»: контестант Петро, Оля відповіла «за себе» на одне з трьох запитань драбини (4 − 2 = 2).
  await play(
    {
      title: 'Мільйонер',
      snapshot: snapshotOf([ladderRound('l'), classicRound('r2', [single])]),
      questionsPlayed: 4,
      plays: (ids) => [
        { roundIndex: 0, questionId: 'l1', ladder: { contestant: ids[1]!, step: 0, level: 100 } },
        { roundIndex: 0, questionId: 'l2', ladder: { contestant: ids[1]!, step: 1, level: 300 } },
        { roundIndex: 0, questionId: 'l3', ladder: { contestant: ids[1]!, step: 2, level: 1000, decision: 'take', outcome: { kind: 'took', passed: 2, points: 300 } } },
        ...refs(1, [single.id]),
      ],
      players: [olya(1000, 2, [mark(1, true), mark(3, true, 1)]), petro(1300, 1, [mark(0, true), mark(1, true), mark(3, false, 1)])],
    },
    'gated',
  );

  // 16. Зіпсований «Ва-банк»: дві сходинки замість щонайменше п'яти — знімок не проходить схему, віднімати нічого (2).
  const broken = snapshotOf([wipeoutRound('w', wipeoutLadder.slice(0, 2))]);
  await play(
    {
      title: 'Зіпсований ва-банк',
      snapshot: broken,
      questionsPlayed: 2,
      plays: (ids) => [
        { roundIndex: 0, questionId: 'w1', wipeout: { took: [ids[0]!] } },
        { roundIndex: 0, questionId: 'w2', wipeout: { took: [], end: true } },
      ],
      players: [olya(100, 1, [mark(0, true)]), guest('Гість', 0, 2, [mark(0, false)])],
    },
    'gated',
  );

  // 17. Стара гра: знімок без раундів і порожній журнал (2).
  await play(
    {
      title: 'Стара гра',
      snapshot: { title: 'Стара вікторина', settings: { leaderboard: 'each' }, questions: [single, bool, ...(PADDING as { questions: Question[] }).questions] },
      questionsPlayed: 2,
      players: [olya(1000, 1, [mark(0, true), mark(1, false)]), guest('Гість', 0, 2, [mark(0, false), mark(1, false)])],
    },
    'old',
  );

  // 18. Командна гра: Оля й Петро в «Совах»; відповіді, місце й перемога — команди.
  await play({
    title: 'Командна гра',
    snapshot: snapshotOf([classicRound('r1', [single, bool, text])]),
    questionsPlayed: 3,
    plays: () => refs(0, [single.id, bool.id, text.id]),
    players: [
      { userId: null, nickname: 'Сови', score: 2000, rank: 1, isTeam: true, rows: [{ ...mark(0, true), answeredBy: 2 }, { ...mark(1, true), answeredBy: 3 }, mark(2, false)] },
      { userId: null, nickname: 'Лиси', score: 1000, rank: 2, isTeam: true, rows: [{ ...mark(0, true), answeredBy: 4 }, mark(1, false), mark(2, false)] },
      olya(2000, 1, [], { teamOf: 0 }),
      petro(2000, 1, [], { teamOf: 0 }),
      { userId: otherId, nickname: 'Віра', score: 1000, rank: 2, teamOf: 1 },
    ],
  });

  // 19. Автопілотна гра Олі.
  await play({
    title: 'Автопілот',
    hostId: userId,
    autopilot: true,
    snapshot: snapshotOf([classicRound('r1', [single, bool])]),
    questionsPlayed: 2,
    plays: () => refs(0, [single.id, bool.id]),
    players: [olya(2000, 1, [mark(0, true), mark(1, true)]), guest('Гість', 1000, 2, [mark(0, true), mark(1, false)])],
  });

  // 20. Гра з дебафом: Оля купила «туман» на Петра.
  await play({
    title: 'Дебаф',
    snapshot: snapshotOf([classicRound('r1', [single, bool, text])]),
    questionsPlayed: 3,
    plays: () => refs(0, [single.id, bool.id, text.id]),
    players: [
      olya(1700, 1, [mark(0, true), mark(1, true), mark(2, false)], {
        adjustments: [{ seq: 1, afterQuestion: 1, points: -300, source: 'debuff', debuff: 'fog', targetNickname: 'Петро' }],
      }),
      petro(1000, 2, [mark(0, false), { ...mark(1, true), debuff: 'fog' }, mark(2, false)]),
    ],
  });

  // 21–26. Ще шість звичайних ігор: різні місця (і останнє з трьох), Петро в трьох.
  const more: { right: boolean[]; rank: number; withPetro: boolean }[] = [
    { right: [true, true, false], rank: 1, withPetro: true },
    { right: [false, false, false], rank: 3, withPetro: true },
    { right: [true, false, true], rank: 2, withPetro: false },
    { right: [true, true, true], rank: 1, withPetro: false },
    { right: [false, true, false], rank: 3, withPetro: true },
    { right: [true, false, false], rank: 2, withPetro: false },
  ];
  const three = snapshotOf([classicRound('r1', [single, bool, text])]);
  for (const [i, g] of more.entries()) {
    const others = [1, 2, 3].filter((rank) => rank !== g.rank);
    await play({
      title: `Вечірня гра ${i + 1}`,
      snapshot: three,
      questionsPlayed: 3,
      plays: () => refs(0, [single.id, bool.id, text.id]),
      players: [
        olya(g.right.filter(Boolean).length * 1000, g.rank, g.right.map((right, q) => mark(q, right))),
        g.withPetro ? petro(1500, others[0]!, [mark(0, true), mark(2, true)]) : guest('Марта', 1500, others[0]!, [mark(0, true), mark(2, true)]),
        guest('Гість', 500, others[1]!, [mark(1, true)]),
      ],
    });
  }

  // Поза кар'єрою гравчині: гра, яку Оля вела, гра Віри за вікториною Олі й незавершена гра Олі.
  const extraSnapshot = snapshotOf([classicRound('r1', [single, bool])]);
  await play(
    {
      title: 'Оля веде',
      hostId: userId,
      quizId: olyaQuiz.id,
      snapshot: extraSnapshot,
      questionsPlayed: 2,
      plays: () => refs(0, [single.id, bool.id]),
      players: [petro(2000, 1, [mark(0, true), mark(1, true)]), { userId: otherId, nickname: 'Віра', score: 1000, rank: 2, rows: [mark(0, true)] }],
    },
    'extra',
  );
  await play(
    {
      title: 'Віра за Олиною вікториною',
      quizId: olyaQuiz.id,
      snapshot: extraSnapshot,
      questionsPlayed: 2,
      plays: () => refs(0, [single.id, bool.id]),
      players: [{ userId: otherId, nickname: 'Віра', score: 1000, rank: 1, rows: [mark(1, true)] }, guest('Гість', 0, 2)],
    },
    'extra',
  );
  await play(
    {
      title: 'Ще триває',
      status: 'running',
      snapshot: extraSnapshot,
      questionsPlayed: 1,
      plays: () => refs(0, [single.id]),
      players: [olya(1000, null, [mark(0, true)]), petro(0, null, [mark(0, false)])],
    },
    'extra',
  );

  return { userId, friendId, otherId, gameIds, gatedGameIds, oldFormatGameIds };
}

