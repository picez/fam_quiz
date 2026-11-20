import { emptyMergeSummary, type AchievementId, type MergeSummary } from '@quiz/shared';
import type { Db } from './db/client';

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/** 66: стан одного об'єднання — P (головний, лишається) і S (другорядний, зникне); правила наповнюють summary. */
export interface MergeContext {
  primaryId: string;
  secondaryId: string;
  primaryNickname: string | null;
  summary: MergeSummary;
  /** Ігри, де в обох був рядок і лишився рядок S (правило participant, задача 4). */
  secondaryWonGames: Set<string>;
  /** Досягнення, які S отримав раніше за P (правило user_achievement, задача 4). */
  earlierOnSecondary: Set<AchievementId>;
}

/** Правило однієї чи кількох колонок з ключем на user.id; keys — 'таблиця.колонка' (схема-тест звіряє їх з базою). */
export interface MergeRule {
  keys: readonly string[];
  run(tx: Tx, ctx: MergeContext): Promise<void>;
}

export function mergeContext(primaryId: string, secondaryId: string, primaryNickname: string | null): MergeContext {
  return { primaryId, secondaryId, primaryNickname, summary: emptyMergeSummary(), secondaryWonGames: new Set(), earlierOnSecondary: new Set() };
}

/** Правила по порядку в одній транзакції: збій будь-якого — нічого не перенесено. */
export async function applyMergeRules(db: Db, ctx: MergeContext, rules: readonly MergeRule[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const rule of rules) await rule.run(tx, ctx);
  });
}
