import { BUFF_KINDS, CELL_KINDS, DEBUFF_KINDS, ROUND_TYPES, QUESTION_TYPES, TEAM_FORMS, type AnswerMode, type CellKind, type CellMark } from '@quiz/shared';
import { hasActiveHelp, helpText } from '../i18n';
import { searchNormalize } from '../locales/grammar';
import { helpUk } from './help-uk';
import { helpVars } from './help-vars';
import type { HelpEntry } from './types';

/** Теми довідника в порядку сторінки. */
export const HELP_TOPICS = ['rounds', 'questions', 'cells', 'buffs', 'debuffs', 'settings', 'teams'] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number];

export const CELL_HELP_KEYS = [...CELL_KINDS, 'voice', 'marks'] as const;
export const SETTING_HELP_KEYS = ['leaderboard', 'newcomers', 'pacing', 'live', 'scores', 'undo', 'away', 'appeal', 'description', 'speedBonus', 'spares', 'debuffShop', 'levelBonuses', 'duels', 'penalty', 'partial', 'streak', 'blitzSeries', 'multiplier', 'audio', 'reveal', 'autopilot', 'groups'] as const;
export const TEAM_HELP_KEYS = ['play', ...TEAM_FORMS, 'captain', 'answerer', 'formats'] as const;

interface Topic<P extends string, K extends string> {
  prefix: P;
  keys: readonly K[];
}
const topic = <P extends string, K extends string>(prefix: P, keys: readonly K[]): Topic<P, K> => ({ prefix, keys });

/** Таблиця тем: новий тип у переліку shared без запису не пройде typecheck. */
const TOPICS = {
  rounds: topic('round', ROUND_TYPES),
  questions: topic('question', QUESTION_TYPES),
  cells: topic('cell', CELL_HELP_KEYS),
  buffs: topic('buff', BUFF_KINDS),
  debuffs: topic('debuff', DEBUFF_KINDS),
  settings: topic('setting', SETTING_HELP_KEYS),
  teams: topic('team', TEAM_HELP_KEYS),
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

const hasUkHelp = (key: string) => Object.prototype.hasOwnProperty.call(helpUk, key);

/** Рядки списку розділу: довжина — за ключами `<base>.0…n` того словника, що має список (активний; немає в ньому — uk). */
function helpList(base: string, vars: Record<string, string>): string[] {
  const own = hasActiveHelp(`${base}.0`);
  const out: string[] = [];
  for (let i = 0; own ? hasActiveHelp(`${base}.${i}`) : hasUkHelp(`${base}.${i}`); i++) out.push(helpText(`${base}.${i}`, vars));
  return out;
}

/** Запис довідки активною мовою; чого нема в її словнику — uk. */
export function helpEntry(id: HelpId): HelpEntry {
  if (!hasUkHelp(`${id}.title`)) throw new Error(`Unknown help id: ${id}`);
  const vars = helpVars();
  const limits = helpList(`${id}.limits`, vars);
  return {
    title: helpText(`${id}.title`, vars),
    what: helpText(`${id}.what`, vars),
    how: helpList(`${id}.how`, vars),
    points: helpList(`${id}.points`, vars),
    tip: helpList(`${id}.tip`, vars),
    ...(limits.length > 0 ? { limits } : {}),
  };
}

/** Якір запису в довіднику: 'buff.swap' → 'help-buff-swap'. */
export function helpAnchor(id: HelpId): string {
  return `help-${id.replace('.', '-')}`;
}

const normalize = (s: string) => searchNormalize(s.trim()).replace(/[’ʼ`]/g, "'");

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
