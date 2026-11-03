import { describe, expect, it } from 'vitest';
import { LOCALES } from '@quiz/shared';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import itUi from '../locales/it.json';
import pl from '../locales/pl.json';
import { LOCALE_CODES, PUSH_STRINGS, pushLocale, pushStrings } from './push-strings';

describe('push strings', () => {
  it('knows exactly the shared locales (the worker keeps its own copy to stay small)', () => {
    expect([...LOCALE_CODES]).toEqual([...LOCALES]);
    expect(Object.keys(PUSH_STRINGS).sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) expect(pushLocale(locale)).toBe(locale);
  });

  it('push keys live only in the push dictionaries, never in the UI ones', () => {
    const ui: Record<string, Record<string, unknown>> = { ar, de, en, es, it: itUi, pl };
    for (const [locale, dict] of Object.entries(ui)) {
      for (const key of Object.keys(pushStrings)) expect(Object.keys(dict), `${locale}.json has ${key}`).not.toContain(key);
    }
  });
});
