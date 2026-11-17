// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AlikeInfo } from '@quiz/shared';
import { t } from '../i18n';
import { AlikeGroups } from './AlikeView';

afterEach(cleanup);

const info: AlikeInfo = {
  groups: [
    { key: 'p1', words: ['яблуко', 'яблука'], members: [{ id: 'p1', nickname: 'Оля' }, { id: 'p2', nickname: 'Тарас' }], top: true, points: 1000 },
    { key: 'p3', words: ['груша'], members: [{ id: 'p3', nickname: 'Петро' }], top: false, points: 0 },
  ],
  silent: [{ id: 'p4', nickname: 'Ірина' }],
};

const card = (word: string) => [...document.querySelectorAll<HTMLElement>('.alike-group')].find((li) => li.querySelector('.alike-words')?.textContent?.includes(word))!;

describe('AlikeGroups (37e)', () => {
  it('groups go from the biggest', () => {
    render(<AlikeGroups info={info} />);
    const cards = document.querySelectorAll('.alike-groups > li');
    expect(cards).toHaveLength(2);
    expect(cards[0]!.className).toContain('alike-top');
    expect(cards[1]!.className).not.toContain('alike-top');
    expect(within(cards[0] as HTMLElement).getByText(t('alikeTop'))).toBeTruthy();
    expect(within(cards[0] as HTMLElement).getByText('+1000')).toBeTruthy();
    expect(within(cards[0] as HTMLElement).getByText('Оля')).toBeTruthy();
    expect(within(cards[0] as HTMLElement).getByText('Тарас')).toBeTruthy();
    expect(within(cards[0] as HTMLElement).getByText('яблуко, яблука')).toBeTruthy();
    expect(within(cards[1] as HTMLElement).queryByText('+1000')).toBeNull();
    expect(screen.queryByText(t('alikeNobody'))).toBeNull();
  });

  it('nobody scores when all differ', () => {
    render(<AlikeGroups info={{ groups: info.groups.map((group) => ({ ...group, top: false, points: 0 })), silent: [] }} />);
    expect(document.querySelector('.alike-top')).toBeNull();
    expect(screen.getByText(t('alikeNobody'))).toBeTruthy();
  });

  it('silent players are listed', () => {
    render(<AlikeGroups info={info} />);
    const silent = document.querySelector('.alike-silent') as HTMLElement;
    expect(within(silent).getByText(t('alikeSilent'))).toBeTruthy();
    expect(within(silent).getByText('Ірина')).toBeTruthy();
  });

  it('the own group stands out', () => {
    render(<AlikeGroups info={info} mine="p3" />);
    expect(card('груша').className).toContain('is-me');
    expect(card('яблуко').className).not.toContain('is-me');
  });

  it('the host joins and splits', () => {
    const onJoin = vi.fn();
    const onSplit = vi.fn();
    render(<AlikeGroups info={info} host={{ editable: true, onJoin, onSplit }} />);
    fireEvent.change(within(card('груша')).getByRole('combobox', { name: t('alikeJoin') }), { target: { value: 'p1' } });
    expect(onJoin).toHaveBeenCalledWith('p3', 'p1');
    const taras = screen.getByText('Тарас').closest('li') as HTMLElement;
    fireEvent.click(within(taras).getByRole('button', { name: t('alikeSplit') }));
    expect(onSplit).toHaveBeenCalledWith('p2');
    // Одинака нікуди виносити.
    expect(within(card('груша')).queryByRole('button', { name: t('alikeSplit') })).toBeNull();
  });

  it('editable false shows no controls', () => {
    render(<AlikeGroups info={info} host={{ editable: false, onJoin: vi.fn(), onSplit: vi.fn() }} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('long words wrap at 320 px', () => {
    const word = 'а'.repeat(40);
    render(<AlikeGroups info={{ groups: [{ ...info.groups[0]!, words: [word] }], silent: [] }} />);
    expect(screen.getByText(word).style.width).toBe('');
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    const rule = (selector: string) => {
      const start = css.indexOf(`\n${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
    };
    expect(rule('.alike-groups')).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/);
    expect(rule('.alike-group')).toMatch(/min-width:\s*0/);
    expect(rule('.alike-words')).toMatch(/overflow-wrap:\s*anywhere/);
    // Жодної фіксованої ширини понад 320 px у стилях груп.
    const start = css.indexOf('/* «Думай як усі» (37e)');
    expect(start).toBeGreaterThan(0);
    const section = css.slice(start, css.indexOf('/* «Думай як усі»: кінець */'));
    for (const [, value, unit] of section.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
  });
});
