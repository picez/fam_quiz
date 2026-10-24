import { ROUND_TYPES, QUESTION_TYPES, type AnswerMode, type CellKind, type CellMark } from '@quiz/shared';
import { CELL_HELP, CELL_HELP_KEYS } from './cells';
import { QUESTION_HELP } from './questions';
import { ROUND_HELP } from './rounds';
import type { HelpEntry } from './types';

/** Теми довідника в порядку сторінки; teams — з частини 10j. */
export const HELP_TOPICS = ['rounds', 'questions', 'cells', 'buffs', 'debuffs', 'settings', 'teams'] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

interface Topic<P extends string, K extends string> {
  prefix: P;
  keys: readonly K[];
  entries: Record<K, HelpEntry>;
}
const topic = <P extends string, K extends string>(prefix: P, keys: readonly K[], entries: Record<K, HelpEntry>): Topic<P, K> => ({ prefix, keys, entries });
const none = <P extends string>(prefix: P): Topic<P, never> => ({ prefix, keys: [], entries: {} as Record<never, HelpEntry> });

/** Таблиця тем: новий тип у переліку shared без запису не пройде typecheck. */
const TOPICS = {
  rounds: topic('round', ROUND_TYPES, ROUND_HELP),
  questions: topic('question', QUESTION_TYPES, QUESTION_HELP),
  cells: topic('cell', CELL_HELP_KEYS, CELL_HELP),
  buffs: none('buff'), // задача 2
  debuffs: none('debuff'), // задача 2
  settings: none('setting'), // задача 2
  teams: none('team'), // частина 10j
} satisfies Record<HelpTopic, Topic<string, string>>;

type Topics = typeof TOPICS;
/** Ідентифікатор запису: 'round.board', 'buff.swap', 'setting.spares'… */
export type HelpId = { [T in HelpTopic]: `${Topics[T]['prefix']}.${Topics[T]['keys'][number]}` }[HelpTopic];

/** Записи теми в порядку переліку. */
export function helpIds(name: HelpTopic): HelpId[] {
  const { prefix, keys } = TOPICS[name] as Topic<string, string>;
  return keys.map((key) => `${prefix}.${key}` as HelpId);
}

/** Тема запису за префіксом id. */
export function helpTopic(id: HelpId): HelpTopic {
  const prefix = id.slice(0, id.indexOf('.'));
  const found = HELP_TOPICS.find((name) => TOPICS[name].prefix === prefix);
  if (found === undefined) throw new Error(`Unknown help id: ${id}`);
  return found;
}

export function helpEntry(id: HelpId): HelpEntry {
  const { entries } = TOPICS[helpTopic(id)] as Topic<string, string>;
  const entry = (entries as Record<string, HelpEntry | undefined>)[id.slice(id.indexOf('.') + 1)];
  if (entry === undefined) throw new Error(`Unknown help id: ${id}`);
  return entry;
}

/** Якір запису в довіднику: 'buff.swap' → 'help-buff-swap'. */
export function helpAnchor(id: HelpId): string {
  return `help-${id.replace('.', '-')}`;
}

const normalize = (s: string) => s.trim().toLocaleLowerCase('uk').replace(/[’ʼ`]/g, "'");

/** Усі записи в порядку тем; query — за назвою, без регістру й виду апострофа; '' — усе. */
export function searchHelp(query: string): HelpId[] {
  const needle = normalize(query);
  return HELP_TOPICS.flatMap(helpIds).filter((id) => normalize(helpEntry(id).title).includes(needle));
}

/** Запис для клітинки поля: бліц → cell.blitz; усна → cell.voice; ×2/×3 → cell.marks; інакше cell.normal. */
export function cellHelpId(cell: { kind: CellKind; answerMode: AnswerMode; mark: CellMark }): HelpId {
  if (cell.kind === 'blitz') return 'cell.blitz';
  if (cell.answerMode === 'voice') return 'cell.voice';
  if (cell.mark !== 'none') return 'cell.marks';
  return 'cell.normal';
}
