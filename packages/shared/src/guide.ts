import type { BuffKind, DebuffKind } from './game';
import { allowedBuffs, allowedDebuffs, duelThreshold, questionsOf, roundTrials, type Question, type Quiz } from './quiz';
import { roundBrief, type RoundBrief } from './round-brief';
import { teamsOf } from './teams';

/** Тип запитання на сторінці «Як грати»; top — підпис верху для order ('' — немає або інший тип). */
export interface GuideType {
  type: Question['type'];
  top: string;
}

/** Одна сторінка «Як грати» без тексту: тексти складає клієнт. */
export type GuidePage =
  | { kind: 'phone' }
  /** Командна гра (10j): після «Телефона». */
  | { kind: 'teams'; count: number }
  | { kind: 'rounds'; rounds: RoundBrief[] }
  | { kind: 'questions'; types: GuideType[] }
  | { kind: 'buffs'; buffs: BuffKind[] }
  | { kind: 'debuffs'; debuffs: DebuffKind[] }
  | { kind: 'duels'; after: number; questions: number; stake: number; final: boolean };

/** Найбільше типів запитань на одній сторінці. */
export const GUIDE_TYPES_PER_PAGE = 5;

/** Чи ввімкнено пояснення для новачків (немає поля — вимкнено). */
export function newcomersOn(quiz: Pick<Quiz, 'settings'>): boolean {
  return quiz.settings.newcomers === true;
}

/** Сторінки «Як грати» для цієї вікторини: phone, [teams], rounds, questions…, [buffs], [debuffs], [duels]. */
export function guidePages(quiz: Quiz): GuidePage[] {
  // Один пункт на вид раунду — зведення першого раунду цього виду.
  const briefs = new Map<string, RoundBrief>();
  for (const round of quiz.rounds) {
    const brief = roundBrief(round);
    const key = `${brief.type}:${brief.instant}:${brief.wagerMode}`;
    if (!briefs.has(key)) briefs.set(key, brief);
  }

  // Типи запитань у порядку першої появи (питання на виживання — після запитань); запасні й запитання дуелей не враховуються.
  const questions = [...questionsOf(quiz), ...quiz.rounds.flatMap(roundTrials)];
  const types: GuideType[] = [];
  for (const q of questions) {
    if (!types.some((x) => x.type === q.type)) types.push({ type: q.type, top: '' });
  }
  const top = questions.flatMap((q) => (q.type === 'order' && q.topLabel?.trim() ? [q.topLabel.trim()] : []))[0];
  const order = types.find((x) => x.type === 'order');
  if (order && top) order.top = top;

  const pages: GuidePage[] = [{ kind: 'phone' }];
  const teams = teamsOf(quiz);
  if (teams) pages.push({ kind: 'teams', count: teams.count });
  pages.push({ kind: 'rounds', rounds: [...briefs.values()] });
  for (let i = 0; i < types.length; i += GUIDE_TYPES_PER_PAGE) {
    pages.push({ kind: 'questions', types: types.slice(i, i + GUIDE_TYPES_PER_PAGE) });
  }
  const buffs = allowedBuffs(quiz);
  if (buffs.length > 0) pages.push({ kind: 'buffs', buffs });
  const debuffs = allowedDebuffs(quiz);
  if (debuffs.length > 0) pages.push({ kind: 'debuffs', debuffs });
  const after = duelThreshold(quiz);
  if (after !== null && quiz.duels) {
    pages.push({
      kind: 'duels',
      after,
      questions: quiz.duels.questionsPerDuel,
      stake: quiz.duels.stake,
      final: quiz.rounds.some((round) => round.type === 'final'),
    });
  }
  return pages;
}
