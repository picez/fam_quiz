import { afterEach, describe, expect, it } from 'vitest';
import golden from './__fixtures__/help-uk-golden.json';
import { HELP_TOPICS, helpEntry, helpIds, searchHelp, type HelpId } from './host-help';
import { helpUk } from './help-uk';
import { helpVars } from './help-vars';
import { activateLocaleForTests } from '../i18n';

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

  it('takes the active help dictionary and falls back to uk per field', () => {
    activateLocaleForTests('en', { help: { 'round.classic.title': 'Classic' } });
    const entry = helpEntry('round.classic');
    expect(entry.title).toBe('Classic');
    expect(entry.what).toBe(golden['round.classic'].what);
    expect(entry.how).toEqual(golden['round.classic'].how);
  });
});
