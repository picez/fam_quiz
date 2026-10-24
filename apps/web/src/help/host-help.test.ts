import { describe, expect, it } from 'vitest';
import { CELL_KINDS, QUESTION_TYPES, ROUND_TYPES } from '@quiz/shared';
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
});
