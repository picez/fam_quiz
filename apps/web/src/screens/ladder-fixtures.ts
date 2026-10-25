import type { LadderInfo } from '@quiz/shared';

/** Зріз «Мільйонера» для тестів: п'ять сходинок, поточна — третя (неспалима, 1000). */
export const ladderInfo = (over: Partial<LadderInfo> = {}): LadderInfo => ({
  contestant: { playerId: 'p1', nickname: 'Олена' },
  pick: 'host',
  drawn: false,
  steps: [
    { level: 100, safe: false, state: 'passed' },
    { level: 300, safe: false, state: 'passed' },
    { level: 1000, safe: true, state: 'current' },
    { level: 3000, safe: false, state: 'ahead' },
    { level: 10000, safe: false, state: 'ahead' },
  ],
  current: 2,
  timer: false,
  lifelines: [],
  fifty: null,
  audience: null,
  hint: null,
  contestantPick: null,
  hall: { answered: 0, total: 2, right: null },
  decision: null,
  outcome: null,
  banked: 300,
  guaranteed: 1000,
  ...over,
});
