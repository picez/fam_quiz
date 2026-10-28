import type { RoundType } from './quiz';

/** Апеляція (12f): скільки триває голосування залу, мс. */
export const APPEAL_MS = { vote: 30_000 } as const;
/** Скільки апеляцій за гру має гравець (у командній грі — команда); відкрита рахується, закрита ведучим чи кінцем — ні. */
export const APPEALS_PER_GAME = 2;
/** Раунди, де можна оскаржити: класика й звичайна клітинка поля. */
export const APPEAL_ROUNDS: readonly RoundType[] = ['classic', 'board'];
/** Скільки голосів player:appeal-vote людина може надіслати за секунду; понад — too_soon. */
export const APPEAL_VOTES_PER_SECOND = 4;

/** Підстава: grade — відповідь не зарахували повністю; away — штраф за вихід із гри (12e). */
export const APPEAL_REASONS = ['grade', 'away'] as const;
export type AppealReason = (typeof APPEAL_REASONS)[number];
/** Рішення: yes — «так» > «ні»; no — «ні» > «так»; tie — нарівно (і 0 : 0); host — ведучий зарахував сам; cancelled — завершення раунду чи гри, вилучення. */
export const APPEAL_OUTCOMES = ['yes', 'no', 'tie', 'host', 'cancelled'] as const;
export type AppealOutcome = (typeof APPEAL_OUTCOMES)[number];

/** Проста більшість тих, хто не оскаржує: yes > no → 'yes', no > yes → 'no', інакше 'tie'. */
export function appealDecision(yes: number, no: number): 'yes' | 'no' | 'tie' {
  if (yes > no) return 'yes';
  if (no > yes) return 'no';
  return 'tie';
}

/** Чи рахується апеляція в ліміт: відкрита (null) і рішення залу — так; host і cancelled — ні. */
export function appealCounted(outcome: AppealOutcome | null): boolean {
  return outcome !== 'host' && outcome !== 'cancelled';
}
