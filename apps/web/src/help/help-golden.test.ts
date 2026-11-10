import { afterEach, describe, expect, it } from 'vitest';
import golden from './__fixtures__/help-uk-golden.json';
import { HELP_TOPICS, helpEntry, helpIds, searchHelp, type HelpId } from './host-help';
import { helpUk } from './help-uk';
import { helpVars } from './help-vars';
import { activateLocaleForTests } from '../i18n';
import ar from '../locales/ar.help.json';
import de from '../locales/de.help.json';
import en from '../locales/en.help.json';
import es from '../locales/es.help.json';
import it_ from '../locales/it.help.json';
import pl from '../locales/pl.help.json';

/** Довідка шести перекладених мов (uk — helpUk). */
const LOCALE_HELP: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };

const ids = HELP_TOPICS.flatMap(helpIds);
const PREFIXES = ['round', 'question', 'cell', 'buff', 'debuff', 'setting', 'team'];
const KEY = /^(round|question|cell|buff|debuff|setting|team)\.[A-Za-z]+\.(title|what|(how|points|tip|limits)\.\d+)$/;
const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);

describe('host help uk golden', () => {
  afterEach(() => activateLocaleForTests('uk'));

  it('every entry equals the golden recorded before the move', () => {
    for (const id of ids) expect(helpEntry(id), id).toEqual((golden as Record<string, unknown>)[id]);
  });

  it('has exactly the golden ids', () => {
    expect(ids.length).toBe(Object.keys(golden).length);
    expect([...ids].sort()).toEqual(Object.keys(golden).sort());
  });

  it('has no keys outside the prefixes and the key shape', () => {
    for (const key of Object.keys(helpUk)) {
      expect(PREFIXES, key).toContain(key.slice(0, key.indexOf('.')));
      expect(key).toMatch(KEY);
    }
  });

  it('every placeholder in helpUk exists in helpVars and every var is used', () => {
    const vars = helpVars('uk');
    const used = new Set(Object.values(helpUk).flatMap((text) => placeholders(text)));
    for (const name of used) expect(vars, name).toHaveProperty(name);
    for (const name of Object.keys(vars)) expect(used.has(name), `unused var ${name}`).toBe(true);
  });

  it('formats seconds by locale without a unit', () => {
    expect(helpVars('uk').awayAlarm).toBe('2,5');
    expect(helpVars('en').awayAlarm).toBe('2.5');
    expect(helpVars('uk').paceStep).toBe('2');
    for (const [name, value] of Object.entries(helpVars('uk'))) expect(value, name).not.toMatch(/\d\.\d/);
    expect(Object.values(helpVars('uk'))).toContain('1,5');
  });

  it('search finds by title ignoring case and apostrophe kind', () => {
    expect(searchHelp('')).toEqual(ids);
    expect(searchHelp('КЛАСИЧНИЙ')).toContain('round.classic' as HelpId);
    for (const id of ids) {
      const title = helpEntry(id).title;
      expect(searchHelp(title.replace(/'/g, '’')), id).toContain(id);
    }
  });

  it('more or less help says nothing about speed: each goes at own pace', () => {
    expect(JSON.stringify(helpEntry('question.moreless'))).not.toMatch(/швидк/i);
  });

  it('drawing help says nothing about speed and names only household words', () => {
    const text = JSON.stringify(helpEntry('question.drawing'));
    expect(text).not.toMatch(/швидк/i);
    expect(text).toMatch(/соняшник|парасольк|маяк|равлик|вишиванк/i);
  });

  it('puzzles help says nothing about speed and names only common words', () => {
    const text = JSON.stringify([helpEntry('round.puzzles'), helpEntry('question.sudoku'), helpEntry('question.crossword')]);
    expect(text).not.toMatch(/швидк/i);
    expect(JSON.stringify(helpEntry('question.crossword'))).toMatch(/калина.*лелека.*вишня/);
  });

  it('every locale has the puzzles help pages', () => {
    const keys = Object.keys(helpUk).filter((key) => /^(round\.puzzles|question\.sudoku|question\.crossword)\./.test(key));
    expect(keys.length).toBeGreaterThan(20);
    for (const [lang, dict] of Object.entries(LOCALE_HELP)) {
      expect(keys.filter((key) => !(key in dict)), lang).toEqual([]);
    }
  });

  it('takes the active help dictionary and falls back to uk per field', () => {
    activateLocaleForTests('en', { help: { 'round.classic.title': 'Classic' } });
    const entry = helpEntry('round.classic');
    expect(entry.title).toBe('Classic');
    expect(entry.what).toBe(golden['round.classic'].what);
    expect(entry.how).toEqual(golden['round.classic'].how);
  });
});
