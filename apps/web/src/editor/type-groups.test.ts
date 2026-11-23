import { describe, expect, it } from 'vitest';
import ar from '../locales/ar.json';
import de from '../locales/de.json';
import en from '../locales/en.json';
import es from '../locales/es.json';
import it_ from '../locales/it.json';
import pl from '../locales/pl.json';
import { t } from '../i18n';
import { QUESTION_TYPES, questionTypesFor } from './draft';
import { TYPE_GROUPS, groupedTypes } from './type-groups';

describe('type groups', () => {
  it('puts every question type in exactly one group', () => {
    const all = TYPE_GROUPS.flatMap((group) => group.types);
    expect([...all].sort()).toEqual([...QUESTION_TYPES].sort());
    expect(new Set(all).size).toBe(QUESTION_TYPES.length);
  });

  it('keeps only the allowed types and drops empty groups', () => {
    expect(groupedTypes(['text', 'single', 'poll'])).toEqual([
      { id: 'choice', types: ['single'] },
      { id: 'input', types: ['text'] },
      { id: 'polls', types: ['poll'] },
    ]);
    const puzzles = groupedTypes(questionTypesFor('puzzles')).flatMap((group) => group.types);
    expect([...puzzles].sort()).toEqual([...questionTypesFor('puzzles')].sort());
  });

  it('has a group name and a description for every type in every language', () => {
    const locales: Record<string, Record<string, string>> = { en, pl, de, es, it: it_, ar };
    for (const group of TYPE_GROUPS) {
      expect(t(`typeGroup_${group.id}` as never).trim(), group.id).toBeTruthy();
      for (const [lang, dict] of Object.entries(locales)) expect(dict[`typeGroup_${group.id}`]?.trim(), `${lang} ${group.id}`).toBeTruthy();
    }
    for (const type of QUESTION_TYPES) {
      expect(t(`typeDesc_${type}` as never).trim(), type).toBeTruthy();
      for (const [lang, dict] of Object.entries(locales)) expect(dict[`typeDesc_${type}`]?.trim(), `${lang} ${type}`).toBeTruthy();
    }
  });
});
