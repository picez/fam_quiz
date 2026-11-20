import { emptyMergeSummary, type AchievementId, type MergeSummary } from '@quiz/shared';
import { HISTORY_RULES, MERGE_JSON_RULES } from './account-merge-history';
import { PEOPLE_RULES } from './account-merge-people';
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

/**
 * Усі правила ключів на user.id по порядку: історія першою (її рішення — чий рядок гри лишився, чия дата досягнення раніша —
 * потрібні стрічці й вітрині), далі люди й вміст. Схема-тест звіряє keys з усіма зовнішніми ключами на user.
 * mergeAccounts (задача 5) виконує їх, тоді MERGE_JSON_RULES, і лише потім вкладений deleteAccount.
 */
export const MERGE_RULES: readonly MergeRule[] = [...HISTORY_RULES, ...PEOPLE_RULES];

/** Колонки й JSON з id акаунтів без зовнішнього ключа. */
export const MERGE_JSON_KEYS: readonly string[] = MERGE_JSON_RULES.flatMap((rule) => rule.keys);

/**
 * Правила по порядку в транзакції того, хто викликає (mergeAccounts — під замком обох рядків user): власної не відкриває,
 * тож збій будь-якого правила відкочує все об'єднання.
 */
export async function applyMergeRules(tx: Tx, ctx: MergeContext, rules: readonly MergeRule[]): Promise<void> {
  for (const rule of rules) await rule.run(tx, ctx);
}
