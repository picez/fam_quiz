import { LEVEL_XP, type XpReason } from '@quiz/shared';
import type { AchievementGame } from './achievement-games';
import { PENALTY_ATTEMPT } from './db/schema';

export type { XpReason } from '@quiz/shared';

export interface XpAward {
  userId: string;
  /** До стелі. */
  base: number;
  /** Гра пройшла правила 1–4 (вікторина «з'їдена» для repeat_quiz). */
  counted: boolean;
  reason: Exclude<XpReason, 'cap'> | null;
  /** Складники base (49): нулі, коли правило дало 0; join + correct + place = base. */
  parts: XpParts;
}

export interface XpParts {
  join: number;
  correct: number;
  correctCount: number;
  place: number;
}

const NO_PARTS: XpParts = { join: 0, correct: 0, correctCount: 0, place: 0 };

/** Один запис на акаунт таблиці (rank !== null; соло — гравець, команда — люди), у порядку players; акаунт двічі — раз. seen(userId) — чи має вже зараховану гру з цією вікториною. */
export function gameXp(game: AchievementGame, ownerId: string | null, seen: (userId: string) => boolean): XpAward[] {
  // Правильні запитання за рядком учасника таблиці; спроби бліцу не множать.
  const correct = (participantId: string, byPerson: string | null): number => {
    const done = new Set<number>();
    for (const row of game.rows) {
      // Рядок штрафу (частка автора «Правди про гравця», 28b) — не відповідь.
      if (row.participantId !== participantId || !row.accepted || row.attempt === PENALTY_ATTEMPT) continue;
      if (byPerson !== null && row.answeredBy !== null && row.answeredBy !== byPerson) continue;
      done.add(row.questionIndex);
    }
    return done.size;
  };

  interface Entry {
    userId: string;
    rank: number;
    right: number;
  }
  const entries: Entry[] = [];
  const known = new Set<string>();
  const add = (userId: string | null, rank: number, right: () => number): void => {
    if (userId === null || known.has(userId)) return;
    known.add(userId);
    entries.push({ userId, rank, right: right() });
  };
  for (const player of game.players) {
    if (player.rank === null) continue;
    const rank = player.rank;
    if (game.teams) {
      for (const member of player.members) add(member.userId, rank, () => correct(player.participantId, member.participantId));
    } else {
      add(player.userId, rank, () => correct(player.participantId, null));
    }
  }

  const accounts = entries.filter((e) => e.userId !== ownerId).length;
  return entries.map((e): XpAward => {
    const none = (reason: Exclude<XpReason, 'cap'>): XpAward => ({ userId: e.userId, base: 0, counted: false, reason, parts: { ...NO_PARTS } });
    if (game.questionsPlayed < LEVEL_XP.minQuestions) return none('few_questions');
    if (accounts < LEVEL_XP.minAccounts) return none('few_accounts');
    if (e.userId === ownerId) return none('author');
    if (seen(e.userId)) return none('repeat_quiz');
    const place = e.rank >= 1 && e.rank <= LEVEL_XP.place.length ? LEVEL_XP.place[e.rank - 1]! : 0;
    const parts: XpParts = { join: LEVEL_XP.join, correct: e.right * LEVEL_XP.correct, correctCount: e.right, place };
    return { userId: e.userId, base: parts.join + parts.correct + parts.place, counted: true, reason: null, parts };
  });
}

/** Що лишилось під стелею: amount = min(base, max(0, dailyCap − usedToday)); reason 'cap', якщо урізано. */
export function capXp(base: number, usedToday: number): { amount: number; capped: boolean } {
  const amount = Math.min(base, Math.max(0, LEVEL_XP.dailyCap - usedToday));
  return { amount, capped: amount < base };
}

let kyivFormat: Intl.DateTimeFormat | undefined;

/** 'YYYY-MM-DD' за Europe/Kyiv. */
export function kyivDay(date: Date): string {
  if (kyivFormat === undefined) {
    try {
      kyivFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' });
    } catch (error) {
      // Старіший ICU знає лише давню назву поясу.
      if (!(error instanceof RangeError)) throw error;
      kyivFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kiev' });
    }
  }
  return kyivFormat.format(date);
}
