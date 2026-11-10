import { describe, expect, it } from 'vitest';
import type { AchievementGame, AchievementPlayer, AchievementRow } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';
import { capXp, gameXp, kyivDay } from './xp-rules';

const row = (participantId: string, questionIndex: number, patch: Partial<AchievementRow> = {}): AchievementRow => ({
  participantId,
  questionIndex,
  roundIndex: 0,
  attempt: 0,
  payload: null,
  timeMs: 1000,
  accepted: true,
  points: 100,
  buff: null,
  spareId: null,
  debuff: null,
  clue: null,
  answeredBy: null,
  ...patch,
});

const solo = (ranks: (number | null)[] = [1, 2, 3, 4], patch: Partial<AchievementGame> = {}): AchievementGame => {
  const players: AchievementPlayer[] = ranks.map((rank, i) => ({
    participantId: `p${i + 1}`,
    userId: `u${i + 1}`,
    members: [],
    rank,
    score: 0,
  }));
  const rows = [
    ...[0, 1, 2, 3].map((q) => row('p1', q)),
    row('p1', 3, { attempt: 1 }), // друга спроба бліцу
    row('p1', 4, { accepted: false }),
    row('p2', 0),
    row('p2', 1),
  ];
  return {
    gameId: 'g1',
    status: 'finished',
    startedAt: new Date('2026-07-01T10:00:00Z'),
    finishedAt: new Date('2026-07-01T10:30:00Z'),
    questionsPlayed: 6,
    teams: false,
    players,
    questions: [],
    rows,
    adjustments: [],
    ...patch,
  } as AchievementGame;
};

const by = (xs: ReturnType<typeof gameXp>, id: string) => xs.find((x) => x.userId === id)!;

describe('gameXp', () => {
  it('сума: участь, правильні, місце', () => {
    const xs = gameXp(solo(), 'owner', () => false);
    expect(by(xs, 'u1').base).toBe(50 + 40 + 100);
    expect(by(xs, 'u2').base).toBe(50 + 20 + 60);
    expect(by(xs, 'u3').base).toBe(50 + 0 + 30);
    expect(by(xs, 'u4').base).toBe(50);
    expect(xs.every((x) => x.counted && x.reason === null)).toBe(true);
  });

  it('частка автора «Правди про гравця» (28b) — не правильна відповідь', () => {
    const base = solo();
    const xs = gameXp({ ...base, rows: [...base.rows, row('p3', 5, { attempt: PENALTY_ATTEMPT, points: 300 })] }, 'owner', () => false);
    expect(by(xs, 'u3').base).toBe(50 + 0 + 30);
  });

  it('нічия ділить місце', () => {
    const xs = gameXp(solo([1, 1, 3, 4]), 'owner', () => false);
    expect(by(xs, 'u1').base).toBe(190);
    expect(by(xs, 'u2').base).toBe(50 + 20 + 100);
  });

  it('менше п’яти запитань', () => {
    const xs = gameXp(solo(undefined, { questionsPlayed: 4 }), 'owner', () => false);
    for (const x of xs) expect(x).toMatchObject({ base: 0, reason: 'few_questions', counted: false });
  });

  it('менше трьох акаунтів, гість не рахується', () => {
    const g = solo();
    g.players[2]!.userId = null;
    g.players[3]!.userId = null;
    const xs = gameXp(g, 'owner', () => false);
    expect(xs.map((x) => x.reason)).toEqual(['few_accounts', 'few_accounts']);
  });

  it('автор у таблиці не рахується до трьох; перше правило перемагає', () => {
    const g = solo([1, 2, 3]);
    g.players[2]!.userId = 'owner';
    const xs = gameXp(g, 'owner', () => false);
    expect(xs.map((x) => x.reason)).toEqual(['few_accounts', 'few_accounts', 'few_accounts']);
  });

  it('автор вікторини не отримує', () => {
    const xs = gameXp(solo(), 'u4', () => false);
    expect(by(xs, 'u4')).toMatchObject({ base: 0, reason: 'author', counted: false });
    expect(by(xs, 'u1').counted).toBe(true);
  });

  it('повтор вікторини', () => {
    const xs = gameXp(solo(), 'owner', (id) => id === 'u2');
    expect(by(xs, 'u2')).toMatchObject({ base: 0, reason: 'repeat_quiz', counted: false });
    expect(by(xs, 'u1').counted).toBe(true);
  });

  it('прибраний не має запису й не рахується до трьох', () => {
    const xs = gameXp(solo([1, 2, 3, null]), 'owner', () => false);
    expect(xs.map((x) => x.userId)).toEqual(['u1', 'u2', 'u3']);
    const few = gameXp(solo([1, 2, null, null]), 'owner', () => false);
    expect(few.map((x) => x.reason)).toEqual(['few_accounts', 'few_accounts']);
  });

  it('акаунт двічі — раз', () => {
    const g = solo();
    g.players[3]!.userId = 'u1';
    expect(gameXp(g, 'owner', () => false).map((x) => x.userId)).toEqual(['u1', 'u2', 'u3']);
  });

  it('командна гра', () => {
    const g = solo(undefined, {
      teams: true,
      players: [
        { participantId: 'tA', userId: null, rank: 1, score: 0, members: [{ participantId: 'a1', userId: 'A1' }, { participantId: 'a2', userId: 'A2' }] },
        { participantId: 'tB', userId: null, rank: 2, score: 0, members: [{ participantId: 'b1', userId: 'B1' }, { participantId: 'b2', userId: 'B2' }] },
      ],
      rows: [row('tA', 0, { answeredBy: 'a1' }), row('tA', 1, { answeredBy: 'a1' }), row('tA', 2, { answeredBy: 'a1' }), row('tA', 3, { answeredBy: null })],
    });
    const xs = gameXp(g, 'owner', () => false);
    expect(by(xs, 'A1').base).toBe(50 + 40 + 100);
    expect(by(xs, 'A2').base).toBe(50 + 10 + 100);
    expect(by(xs, 'B1').base).toBe(50 + 60);
  });
});

describe('capXp', () => {
  it('урізає під стелею', () => {
    expect(capXp(250, 400)).toEqual({ amount: 200, capped: true });
    expect(capXp(100, 0)).toEqual({ amount: 100, capped: false });
    expect(capXp(100, 700)).toEqual({ amount: 0, capped: true });
  });
});

describe('kyivDay', () => {
  it('доба Києва', () => {
    expect(kyivDay(new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-02');
    expect(kyivDay(new Date('2026-12-31T21:59:00Z'))).toBe('2026-12-31');
    expect(kyivDay(new Date('2026-12-31T22:00:00Z'))).toBe('2027-01-01');
  });
});
