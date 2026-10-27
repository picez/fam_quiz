import type { AdjustmentSource } from './game';
import type { RoundType } from './quiz';

/** Що скасовує рядок журналу з source 'undo' (12a): відповідь свого гравця на запитання (індекс у plays) або коригування за seq. */
export type UndoTarget = { question: number } | { seq: number };

/** Джерела коригувань, які ведучий може скасувати; 12e і 12f допишуть 'away' і 'appeal'. 'undo' — окремо («Повернути»). */
export const UNDOABLE_SOURCES: readonly AdjustmentSource[] = ['host'];

/** Раунди, відповіді яких скасовуються; у «Ва-банк», «Вибуванні» й «Мільйонері» бали йдуть через банки й приховані бали. */
export const UNDOABLE_ROUNDS: readonly RoundType[] = ['classic', 'blitz', 'board', 'final'];

/** Рядок журналу для undoLedger: who — ключ гравця (id у рушії, нікнейм в історії). */
export interface UndoEntry {
  seq: number;
  who: string;
  source: AdjustmentSource;
  undoes?: UndoTarget;
}

/** Хто зараз скасований. */
export interface UndoLedger {
  /** undoAnswerKey(who, question) → seq скасування, що діє. */
  answers: ReadonlyMap<string, number>;
  /** seq скасованого коригування (не 'undo') → seq скасування, що діє. */
  adjustments: ReadonlyMap<number, number>;
  /** seq скасування → seq його «Повернути». */
  redone: ReadonlyMap<number, number>;
}

/** Ключ відповіді гравця на запитання в UndoLedger.answers (не answerKey: це ім'я вже займає нормалізація текстових відповідей у quiz.ts). */
export function undoAnswerKey(who: string, question: number): string {
  return `${question}:${who}`;
}

/**
 * Проходить журнал за зростанням seq (порядок вхідного масиву не важливий).
 * Скасування з `question` скасовує відповідь свого гравця; з `seq` — коригування; якщо `seq` вказує на інше скасування,
 * це «Повернути»: те скасування перестає діяти.
 */
export function undoLedger(entries: readonly UndoEntry[]): UndoLedger {
  const sorted = [...entries].sort((a, b) => a.seq - b.seq);
  const bySeq = new Map(sorted.map((e) => [e.seq, e]));
  const answers = new Map<string, number>();
  const adjustments = new Map<number, number>();
  const redone = new Map<number, number>();
  for (const entry of sorted) {
    if (entry.source !== 'undo' || !entry.undoes) continue;
    const { seq, who, undoes } = entry;
    if ('question' in undoes) {
      answers.set(undoAnswerKey(who, undoes.question), seq);
      continue;
    }
    const target = bySeq.get(undoes.seq);
    if (target?.source === 'undo') {
      redone.set(target.seq, seq);
      const t = target.undoes;
      if (t && 'question' in t) {
        const key = undoAnswerKey(target.who, t.question);
        if (answers.get(key) === target.seq) answers.delete(key);
      } else if (t && adjustments.get(t.seq) === target.seq) {
        adjustments.delete(t.seq);
      }
    } else {
      adjustments.set(undoes.seq, seq);
    }
  }
  return { answers, adjustments, redone };
}
