import { describe, expect, it } from 'vitest';
import { BUFF_KINDS, CELL_KINDS, DEBUFF_KINDS, LIMITS, QUESTION_TYPES, ROUND_TYPES } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { debuffName } from '../debuff-meta';
import { MIRROR_SWAP_MS, freezeMs } from '../screens/Debuffs';
import { SETTING_HELP_KEYS } from './settings';
import { t, type TextKey } from '../i18n';
import { ROUND_NAMES } from '../guide-text';
import { HELP_TOPICS, cellHelpId, helpAnchor, helpEntry, helpIds, helpTopic, searchHelp, type HelpId } from './host-help';

const SENTENCE_END = /[.!?…](?=\s|$)/g;
const filled = (id: HelpId) => {
  const e = helpEntry(id);
  expect(e.title.trim(), id).not.toBe('');
  expect(e.what.trim(), id).not.toBe('');
  expect((e.what.match(SENTENCE_END) ?? []).length, `${id}: «Що це» — одне-два речення`).toBeLessThanOrEqual(2);
  for (const list of [e.how, e.points, e.tip]) {
    expect(list.length, id).toBeGreaterThan(0);
    for (const line of list) expect(line.trim(), id).not.toBe('');
  }
  if (e.limits !== undefined) expect(e.limits.length, id).toBeGreaterThan(0);
};

const text = (id: HelpId) => {
  const e = helpEntry(id);
  return [e.title, e.what, ...e.how, ...e.points, ...e.tip, ...(e.limits ?? [])].join(' ');
};

describe('host help', () => {
  it('every round type, question type and cell kind has an entry', () => {
    for (const type of ROUND_TYPES) filled(`round.${type}`);
    for (const type of QUESTION_TYPES) filled(`question.${type}`);
    for (const kind of CELL_KINDS) filled(`cell.${kind}`);
    filled('cell.voice');
    filled('cell.marks');
  });

  it('titles match the names in the interface', () => {
    for (const type of ROUND_TYPES) expect(helpEntry(`round.${type}`).title).toBe(t(ROUND_NAMES[type]));
    for (const type of QUESTION_TYPES) expect(helpEntry(`question.${type}`).title).toBe(t(`type_${type}` as TextKey));
  });

  it('topics list their entries in the order of the shared lists; ids are unique', () => {
    expect(helpIds('rounds')).toEqual(ROUND_TYPES.map((type) => `round.${type}`));
    expect(helpIds('questions')).toEqual(QUESTION_TYPES.map((type) => `question.${type}`));
    expect(helpIds('cells')).toEqual(['cell.normal', 'cell.blitz', 'cell.voice', 'cell.marks']);
    expect(helpIds('teams')).toEqual([]);
    const all = HELP_TOPICS.flatMap(helpIds);
    expect(new Set(all).size).toBe(all.length);
    for (const id of all) expect(helpIds(helpTopic(id))).toContain(id);
  });

  it('anchors and search by name', () => {
    expect(helpAnchor('round.board')).toBe('help-round-board');
    expect(searchHelp('')).toEqual(HELP_TOPICS.flatMap(helpIds));
    expect(searchHelp('  ПОЛЕ ')).toEqual(['round.board']);
    expect(searchHelp('клітинка')).toEqual(['cell.normal', 'cell.blitz']);
    expect(searchHelp('зззз')).toEqual([]);
  });

  it('picks the entry of a board cell', () => {
    expect(cellHelpId({ kind: 'blitz', answerMode: 'voice', mark: 'x2' })).toBe('cell.blitz');
    expect(cellHelpId({ kind: 'normal', answerMode: 'voice', mark: 'x3' })).toBe('cell.voice');
    expect(cellHelpId({ kind: 'normal', answerMode: 'phone', mark: 'x2' })).toBe('cell.marks');
    expect(cellHelpId({ kind: 'normal', answerMode: 'phone', mark: 'none' })).toBe('cell.normal');
  });

  it('every buff, debuff and listed setting has an entry', () => {
    for (const kind of BUFF_KINDS) filled(`buff.${kind}`);
    for (const kind of DEBUFF_KINDS) filled(`debuff.${kind}`);
    for (const key of SETTING_HELP_KEYS) filled(`setting.${key}`);
    expect(helpIds('buffs')).toEqual(BUFF_KINDS.map((kind) => `buff.${kind}`));
    expect(helpIds('debuffs')).toEqual(DEBUFF_KINDS.map((kind) => `debuff.${kind}`));
    expect(helpIds('settings')).toEqual(SETTING_HELP_KEYS.map((key) => `setting.${key}`));
  });

  it('host help agrees with the player texts', () => {
    for (const kind of BUFF_KINDS) expect(helpEntry(`buff.${kind}`).title).toBe(buffName(kind));
    for (const kind of DEBUFF_KINDS) expect(helpEntry(`debuff.${kind}`).title).toBe(debuffName(kind));
    // Числа, які гравці бачать у своїх текстах.
    expect(t('buffGuide_time')).toContain('30 секунд');
    expect(text('buff.time')).toContain('30 секунд');
    expect(t('buffGuide_audience')).toContain('15 с');
    expect(text('buff.audience')).toContain('15 секунд');
    expect(t('swapMine')).toContain('20 с');
    expect(text('buff.swap')).toContain('20 секунд');
    expect(text('debuff.mirror')).toContain(`${MIRROR_SWAP_MS / 1000} секунди`);
    expect(text('debuff.freeze')).toContain(`${freezeMs(null) / 1000} секунд`);
    expect(text('setting.debuffShop')).toContain(`типово ${LIMITS.defaultDebuffPrice}`);
    expect(text('setting.spares')).toContain(`до ${LIMITS.maxSpares}`);
    expect(text('setting.spares')).toContain(`до ${LIMITS.maxCategorySpares}`);
    // Де бафів немає — те саме, що в «?» гравця (buffHelpNone): бліц, бліц-клітинки, фінал, ланцюжок, сортування, дуелі.
    expect(text('round.blitz')).toContain('Бафи в бліці не діють');
    expect(text('cell.blitz')).toContain('Бафів на бліц-клітинці немає');
    expect(text('round.final')).toContain('бафів у фіналі немає');
    expect(text('question.chain')).toContain('без бафів');
    expect(text('question.sort')).toContain('без бафів');
    expect(text('setting.duels')).toContain('Бафів і дебафів у дуелі немає');
  });

  it('search finds buffs and debuffs by name', () => {
    expect(searchHelp('щит')).toEqual(['buff.shield']);
    expect(searchHelp('50')).toEqual(['buff.fifty']);
    expect(searchHelp('ЗАМІНА')).toEqual(['buff.swap']);
    expect(searchHelp('туман')).toEqual(['debuff.fog']);
  });
});
