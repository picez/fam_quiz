import { z } from 'zod';
import { answerSchema, type SubmittedAnswer } from './answer';
import { LIMITS, type Question } from './quiz';
import { UNSTORABLE, isStorable } from './text';

/** Найдовший текст живого вибору (12b): телефон обрізає сам, сервер відкидає довше. */
export const DRAFT_TEXT_MAX = 100;
/** Скільки подій player:draft одна людина може надіслати за 1000 мс (12b); понад — too_soon. Чесний телефон шле до 4. */
export const DRAFTS_PER_SECOND = 8;
/** Пакети живих виборів пульту — не частіше ніж раз на стільки мс (12b). */
export const HOST_DRAFTS_MS = 300;

const storable = (max: number) => z.string().max(max).refine(isStorable, UNSTORABLE);

/** Живий вибір до «Надіслати» (12b): поле відповіді, виділені плитки стіни, надруковане слово ланцюжка, вигадка блефу. */
export const draftValueSchema = z
  .union([
    answerSchema,
    z.object({ type: z.literal('wallPick'), tiles: z.array(z.number().int().min(0).max(15)).max(4).refine((tiles) => new Set(tiles).size === tiles.length, 'duplicate_tile') }),
    z.object({ type: z.literal('chainWord'), word: storable(LIMITS.chainWord) }),
    z.object({ type: z.literal('lie'), text: storable(LIMITS.bluffLie) }),
  ])
  .refine((value) => !((value.type === 'text' || value.type === 'clues') && value.value.length > DRAFT_TEXT_MAX), 'draft_too_long');
export type DraftValue = z.infer<typeof draftValueSchema>;

/** Тип запитання, до якого належить чернетка (wallPick → wall, chainWord → chain, lie → bluff; решта — як відповідь). */
export function draftQuestionType(draft: DraftValue): Question['type'] {
  if (draft.type === 'wallPick') return 'wall';
  if (draft.type === 'chainWord') return 'chain';
  if (draft.type === 'lie') return 'bluff';
  return draft.type;
}

/** Чернетка — звичайна відповідь поля (її бачать і товариші капітана, 10j). */
export function isAnswerDraft(draft: DraftValue): draft is SubmittedAnswer {
  return draft.type !== 'wallPick' && draft.type !== 'chainWord' && draft.type !== 'lie';
}

/** Телефон: обрізати text / clues до DRAFT_TEXT_MAX; решта без змін. */
export function clipDraft(draft: DraftValue): DraftValue {
  if ((draft.type === 'text' || draft.type === 'clues') && draft.value.length > DRAFT_TEXT_MAX) {
    return { ...draft, value: draft.value.slice(0, DRAFT_TEXT_MAX) };
  }
  return draft;
}

/** Живий вибір у пакеті для пульта (12b). */
export interface LiveDraft {
  /** Id рядка «Відповідей наживо» (LiveRow.id): гравець, команда чи людина в опитуванні командної гри. */
  id: string;
  draft: DraftValue;
  /** Скільки разів значення змінилося після першого на цьому запитанні. */
  changes: number;
  /** Мить останньої зміни за часом сервера. */
  at: number;
}

/** Пакет host:drafts (12b): усі чинні живі вибори поточного запитання (або питання на виживання, trial). */
export interface HostDrafts {
  questionIndex: number;
  trial: boolean;
  drafts: LiveDraft[];
}
