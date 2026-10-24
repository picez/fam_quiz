// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { debuffName } from '../debuff-meta';
import { t } from '../i18n';
import { PowersEditor } from './PowersEditor';

afterEach(cleanup);

describe('PowersEditor prices', () => {
  it('shows a price field for every allowed debuff with 200 as the placeholder', () => {
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog', 'mud'] }} spares={undefined} onChange={vi.fn()} />);
    expect(screen.getAllByLabelText('Ціна, балів')).toHaveLength(2);
    expect(screen.getAllByLabelText('Ціна, балів')[0].getAttribute('placeholder')).toBe('200');
  });

  it('a typed price goes into debuffPrices; empty or 200 drops the key', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog', 'mud'] }} spares={undefined} onChange={onChange} />);
    fireEvent.change(screen.getAllByLabelText('Ціна, балів')[0], { target: { value: '100' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffs: ['fog', 'mud'], debuffPrices: { fog: 100 } }));
    rerender(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog', 'mud'], debuffPrices: { fog: 100 } }} spares={undefined} onChange={onChange} />);
    fireEvent.change(screen.getAllByLabelText('Ціна, балів')[0], { target: { value: '' } });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffPrices: undefined }));
    fireEvent.change(screen.getAllByLabelText('Ціна, балів')[0], { target: { value: '200' } });
    rerender(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog', 'mud'], debuffPrices: { fog: 200 } }} spares={undefined} onChange={onChange} />);
    fireEvent.blur(screen.getAllByLabelText('Ціна, балів')[0]);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffPrices: undefined }));
  });

  it('typing 2000 passes through 200 without clearing the field', () => {
    let settings: Parameters<typeof PowersEditor>[0]['settings'] = { leaderboard: 'each', debuffs: ['fog'] };
    const onChange = vi.fn((powers: { debuffPrices: Partial<Record<'fog', number>> | undefined }) => {
      settings = { ...settings, debuffPrices: powers.debuffPrices };
    });
    const { rerender } = render(<PowersEditor settings={settings} spares={undefined} onChange={onChange} />);
    for (const text of ['2', '20', '200', '2000']) {
      fireEvent.change(screen.getByLabelText('Ціна, балів'), { target: { value: text } });
      rerender(<PowersEditor settings={settings} spares={undefined} onChange={onChange} />);
      expect((screen.getByLabelText('Ціна, балів') as HTMLInputElement).value).toBe(text);
    }
    fireEvent.blur(screen.getByLabelText('Ціна, балів'));
    rerender(<PowersEditor settings={settings} spares={undefined} onChange={onChange} />);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffPrices: { fog: 2000 } }));
    expect((screen.getByLabelText('Ціна, балів') as HTMLInputElement).value).toBe('2000');
  });

  it('an out-of-range price typed stays visible and invalid after blur', () => {
    let settings: Parameters<typeof PowersEditor>[0]['settings'] = { leaderboard: 'each', debuffs: ['fog'] };
    const onChange = vi.fn((powers: { debuffPrices: Partial<Record<'fog', number>> | undefined }) => {
      settings = { ...settings, debuffPrices: powers.debuffPrices };
    });
    const { rerender } = render(<PowersEditor settings={settings} spares={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Ціна, балів'), { target: { value: '9000' } });
    fireEvent.blur(screen.getByLabelText('Ціна, балів'));
    rerender(<PowersEditor settings={settings} spares={undefined} onChange={onChange} />);
    const input = screen.getByLabelText('Ціна, балів') as HTMLInputElement;
    expect(input.value).toBe('9000');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('unticking a debuff drops its price', () => {
    const onChange = vi.fn();
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog', 'mud'], debuffPrices: { fog: 100 } }} spares={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: /Туман/ }));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffs: ['mud'], debuffPrices: undefined }));
  });

  it('marks an out-of-range price as invalid but keeps it', () => {
    const onChange = vi.fn();
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog'], debuffPrices: { fog: 10 } }} spares={undefined} onChange={onChange} />);
    expect(screen.getByLabelText('Ціна, балів').getAttribute('aria-invalid')).toBe('true');
  });

  it('the shop checkbox is on by default and writes debuffShop false when cleared', () => {
    const onChange = vi.fn();
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: ['fog'] }} spares={undefined} onChange={onChange} />);
    const box = screen.getByRole('checkbox', { name: 'Гравці можуть купувати дебафи' });
    expect((box as HTMLInputElement).checked).toBe(true);
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffShop: false }));
  });
});

describe('PowersEditor swap gaps (9d)', () => {
  it('swap warns about categories without spares and a classic round without the pool, but not add-spares when categories have them', () => {
    const gaps = { anyCategory: true, emptyCategories: ['Поле · Річки'], classicWithoutPool: true, legacyBoard: false };
    render(<PowersEditor settings={{ leaderboard: 'each', buffs: ['swap'] }} spares={undefined} gaps={gaps} onChange={vi.fn()} />);
    expect(screen.getByText(t('powersSwapCategoriesEmpty', { list: 'Поле · Річки' }))).toBeTruthy();
    expect(screen.getByText(t('powersSwapClassicEmpty'))).toBeTruthy();
    expect(screen.queryByText(t('powersSwapNeedsSpares'))).toBeNull();
  });
});

describe('PowersEditor help (10a)', () => {
  it('every buff and debuff row and the shop have ⓘ', () => {
    const onChange = vi.fn();
    render(<PowersEditor settings={{ leaderboard: 'each' }} spares={undefined} onChange={onChange} />);
    for (const kind of BUFF_KINDS) screen.getByRole('button', { name: `Довідка: ${buffName(kind)}` });
    for (const kind of DEBUFF_KINDS) screen.getByRole('button', { name: `Довідка: ${debuffName(kind)}` });
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Крамниця дебафів' }));
    fireEvent.click(screen.getByRole('button', { name: `Довідка: ${buffName(BUFF_KINDS[0])}` }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
