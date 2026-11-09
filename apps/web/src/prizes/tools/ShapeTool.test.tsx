// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { TrophyKind, TrophyMaterial } from '@quiz/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftFrom } from '../studio-draft';
import { ShapeTool } from './ShapeTool';

afterEach(cleanup);

function open({ level = 1, storedTrophy = null }: { level?: number; storedTrophy?: { kind: TrophyKind; material: TrophyMaterial } | null } = {}) {
  const dispatch = vi.fn();
  const draft = draftFrom(null); // cup, gold
  render(<ShapeTool draft={draft} dispatch={dispatch} level={level} replay={() => {}} stored={null} storedTrophy={storedTrophy} photoBusy={false} setPhotoBusy={() => {}} />);
  return { dispatch };
}

/** Радіо за назвою, без позначок «🔒 з рівня N» і «преміум» після неї. */
const option = (name: string, scope: HTMLElement = document.body) =>
  within(scope).getByRole('radio', {
    name: (accessible) => accessible.startsWith(name) && /^(|, (🔒.*|преміум))$/u.test(accessible.slice(name.length)),
  }) as HTMLInputElement;
const labelOf = (name: string) => option(name).closest('label')!;

describe('ShapeTool', () => {
  it('shapes are grouped', () => {
    open({ level: 30 });
    const shapes = screen.getByRole('group', { name: 'Вид' });
    const groups = within(shapes)
      .getAllByRole('group')
      .map((group) => group.querySelector('legend')?.textContent);
    expect(groups).toEqual(['Кубки', 'Медалі', 'Корони й вінки', 'Статуетки']);
    const cups = within(shapes).getByRole('group', { name: 'Кубки' });
    expect(within(cups).getAllByRole('radio').map((radio) => radio.closest('label')?.textContent?.replace(/^\P{L}+/u, ''))).toEqual([
      'кубок',
      'грааль',
      'кубок з вухами',
      'ваза',
      'тарілка-трофей',
      'келих',
    ]);
    const none = option('Без трофея', shapes);
    expect(none.closest('fieldset')).toBe(shapes);
    const radios = within(shapes).getAllByRole('radio') as HTMLInputElement[];
    expect(radios.at(-1)).toBe(none);
    expect(new Set(radios.map((radio) => radio.name))).toEqual(new Set(['studio-kind']));
  });

  it('locked shapes show their level', () => {
    open({ level: 1 });
    expect(option('тарілка-трофей').disabled).toBe(true);
    expect(labelOf('тарілка-трофей').className).toContain('is-locked');
    expect(labelOf('тарілка-трофей').textContent).toContain('🔒 з рівня 24');
    expect(option('кубок').disabled).toBe(false);
    cleanup();
    open({ level: 2 });
    expect(option('кубок').disabled).toBe(false);
    expect(option('келих').disabled).toBe(false);
    expect(labelOf('келих').textContent).not.toContain('🔒');
  });

  it('premium is marked', () => {
    open({ level: 30 });
    for (const name of ['діадема', 'крилата статуетка', 'Сапфір', 'Рубін', 'Неон']) {
      expect(labelOf(name).querySelector('.studio-premium')?.textContent, name).toBe('преміум');
    }
    expect(labelOf('кубок').querySelector('.studio-premium')).toBeNull();
    expect(labelOf('Золото').querySelector('.studio-premium')).toBeNull();
    const hint = 'Преміум — особливі форми й матеріали. Поки вони відкриваються рівнем.';
    expect(screen.getAllByText(hint)).toHaveLength(1);
  });

  it('a tile can be locked and premium at once', () => {
    open({ level: 1 });
    expect(option('діадема').disabled).toBe(true);
    expect(labelOf('діадема').querySelector('.look-lock')?.textContent).toBe('🔒 з рівня 22');
    expect(labelOf('діадема').querySelector('.studio-premium')?.textContent).toBe('преміум');
  });

  it('marks are read after a comma, not run together with the name', () => {
    open({ level: 1 });
    expect(screen.getByRole('radio', { name: 'тарілка-трофей, 🔒 з рівня 24' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'діадема, 🔒 з рівня 22, преміум' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'кубок' })).toBeTruthy();
    expect(labelOf('тарілка-трофей').querySelector('.sr-only')?.textContent).toBe(',');
  });

  it('stored shape stays pickable', () => {
    open({ level: 1, storedTrophy: { kind: 'plate', material: 'neon' } });
    expect(option('тарілка-трофей').disabled).toBe(false);
    expect(option('Неон').disabled).toBe(false);
    expect(labelOf('тарілка-трофей').textContent).not.toContain('🔒');
    expect(option('ваза').disabled).toBe(true);
    expect(option('Рубін').disabled).toBe(true);
  });

  it('materials are grouped and locked', () => {
    open({ level: 1 });
    const materials = screen.getByRole('group', { name: 'Матеріал' });
    expect(
      within(materials)
        .getAllByRole('group')
        .map((group) => group.querySelector('legend')?.textContent),
    ).toEqual(['Метали', 'Камені', 'Інше']);
    expect(option('Мідь').disabled).toBe(true);
    expect(labelOf('Мідь').textContent).toContain('🔒 з рівня 3');
    expect(option('Золото').disabled).toBe(false);
    expect(option('Золото').checked).toBe(true);
  });

  it('picking dispatches the action', () => {
    const { dispatch } = open({ level: 4 });
    fireEvent.click(option('ваза'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'trophy', kind: 'vase' });
    fireEvent.click(option('Мідь'));
    expect(dispatch).toHaveBeenCalledWith({ type: 'material', material: 'copper' });
  });
});
