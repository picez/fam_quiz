import { DEFAULT_RULES } from './quiz';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Переводить вікторину старого формату (один список запитань) в один класичний раунд
 * з тими самими запитаннями й налаштуваннями. Усе інше повертає без змін;
 * перевірку робить quizSchema після цього.
 */
export function upgradeQuiz(raw: unknown): unknown {
  if (!isRecord(raw) || 'rounds' in raw || !Array.isArray(raw.questions)) return raw;
  const { questions, settings, ...rest } = raw;
  const old = isRecord(settings) ? settings : {};
  return {
    ...rest,
    settings: { leaderboard: old.leaderboard },
    rounds: [
      {
        id: 'r1',
        type: 'classic',
        title: '',
        speedBonus: old.speedBonus,
        shuffleOptions: old.shuffleOptions,
        rules: DEFAULT_RULES,
        questions,
      },
    ],
  };
}
