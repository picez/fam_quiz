import { challengeDaysLeft } from '@quiz/shared';
import { countText } from '../i18n';

/** «лишилося 7 днів»: дні вгору до цілої, від поточного моменту. */
export const daysLeftText = (expiresAt: string, now: number = Date.now()): string => {
  const count = challengeDaysLeft(expiresAt, now);
  return countText('challengeDaysLeft', count, { count });
};

/** «зіграли 2 людини». */
export const playedText = (count: number): string => countText('challengePlayed', count, { count });
