// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS, LEGACY_DEBUFFS } from '@quiz/shared';
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

describe('PowersEditor 12h', () => {
  const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

  it('a quiz without debuffs has exactly the old six on and the five new ones off', () => {
    render(<PowersEditor settings={{ leaderboard: 'each' }} spares={undefined} onChange={vi.fn()} />);
    for (const kind of LEGACY_DEBUFFS) expect(box(debuffName(kind)).checked).toBe(true);
    for (const name of ['Догори дриґом', 'Ліхтарик', 'Липкі кнопки', 'Без годинника', 'Бульбашки']) expect(box(name).checked).toBe(false);
    expect(document.querySelectorAll('.powers-list')[0].querySelectorAll('input[type="checkbox"]')).toHaveLength(11);
    expect(document.querySelectorAll('.powers-list')[1].querySelectorAll('input[type="checkbox"]')).toHaveLength(14);
  });

  it('ticking «Липкі кнопки» adds it after the old six and shows its price field', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PowersEditor settings={{ leaderboard: 'each' }} spares={undefined} onChange={onChange} />);
    fireEvent.click(box('Липкі кнопки'));
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud', 'sticky'] }));
    rerender(<PowersEditor settings={{ leaderboard: 'each', debuffs: onChange.mock.lastCall![0].debuffs }} spares={undefined} onChange={onChange} />);
    const prices = screen.getAllByLabelText('Ціна, балів');
    expect(prices).toHaveLength(7);
    expect(box('Липкі кнопки').closest('.powers-row')?.querySelector('input[type="number"]')?.getAttribute('placeholder')).toBe('200');
  });

  it('«Усі» turns on eleven debuffs and fourteen buffs', () => {
    const onChange = vi.fn();
    render(<PowersEditor settings={{ leaderboard: 'each' }} spares={undefined} onChange={onChange} />);
    const [allDebuffs, allBuffs] = screen.getAllByRole('button', { name: 'Усі' });
    fireEvent.click(allDebuffs);
    expect(onChange.mock.lastCall![0].debuffs).toEqual([...DEBUFF_KINDS]);
    expect(onChange.mock.lastCall![0].debuffs).toHaveLength(11);
    fireEvent.click(allBuffs);
    expect(onChange.mock.lastCall![0].buffs).toEqual([...BUFF_KINDS]);
    expect(onChange.mock.lastCall![0].buffs).toHaveLength(14);
  });
});

describe('PowersEditor level bonuses (15a)', () => {
  it('is on without the key; unticking writes false and ticking again drops the key', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PowersEditor settings={{ leaderboard: 'each' }} spares={undefined} onChange={onChange} />);
    const box = screen.getByLabelText(t('levelBonusesLabel')) as HTMLInputElement;
    expect(box.checked).toBe(true);
    expect(screen.getByText(t('levelBonusesHint'))).toBeTruthy();
    fireEvent.click(box);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ levelBonuses: false }));
    rerender(<PowersEditor settings={{ leaderboard: 'each', levelBonuses: false }} spares={undefined} onChange={onChange} />);
    const off = screen.getByLabelText(t('levelBonusesLabel')) as HTMLInputElement;
    expect(off.checked).toBe(false);
    fireEvent.click(off);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ levelBonuses: undefined }));
  });
});

describe('PowersEditor stealth (29h)', () => {
  it('stealth warns without the shop or without debuffs, and not with them', () => {
    const warn = t('powersStealthNeedsShop');
    render(<PowersEditor settings={{ leaderboard: 'each', buffs: ['stealth'], debuffShop: false }} spares={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(warn)).toBeTruthy();
    cleanup();
    render(<PowersEditor settings={{ leaderboard: 'each', buffs: ['stealth'], debuffs: [] }} spares={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(warn)).toBeTruthy();
    cleanup();
    render(<PowersEditor settings={{ leaderboard: 'each', buffs: ['stealth'] }} spares={undefined} onChange={vi.fn()} />);
    expect(screen.queryByText(warn)).toBeNull();
    cleanup();
    render(<PowersEditor settings={{ leaderboard: 'each', buffs: ['fifty'], debuffShop: false }} spares={undefined} onChange={vi.fn()} />);
    expect(screen.queryByText(warn)).toBeNull();
  });
});

describe('PowersEditor in a family game (31)', () => {
  const OFF = ['shake', 'mirror', 'flip', 'torch', 'bubbles'] as const;

  it('the five confusing debuffs are disabled and unticked with «У сімейній грі вимкнено»; the saved choice stays', () => {
    const onChange = vi.fn();
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: [...DEBUFF_KINDS], debuffPrices: { shake: 300 } }} family spares={undefined} onChange={onChange} />);
    for (const kind of OFF) {
      const box = screen.getByRole('checkbox', { name: new RegExp(debuffName(kind)) }) as HTMLInputElement;
      expect(box.disabled, kind).toBe(true);
      expect(box.checked, kind).toBe(false);
      expect(document.getElementById(box.getAttribute('aria-describedby') ?? '')?.textContent, kind).toBe('У сімейній грі вимкнено');
    }
    // Ціни — лише в дозволених: 11 − 5 = 6.
    expect(screen.getAllByLabelText('Ціна, балів')).toHaveLength(6);
    const fog = screen.getByRole('checkbox', { name: new RegExp(debuffName('fog')) }) as HTMLInputElement;
    expect(fog.disabled).toBe(false);
    fireEvent.click(fog);
    const sent = onChange.mock.lastCall?.[0] as { debuffs: string[]; debuffPrices: object | undefined };
    expect(sent.debuffs).toEqual(DEBUFF_KINDS.filter((kind) => kind !== 'fog'));
    expect(sent.debuffPrices).toEqual({ shake: 300 });
  });

  it('without family the editor is as before', () => {
    render(<PowersEditor settings={{ leaderboard: 'each', debuffs: [...DEBUFF_KINDS] }} spares={undefined} onChange={vi.fn()} />);
    const shake = screen.getByRole('checkbox', { name: new RegExp(debuffName('shake')) }) as HTMLInputElement;
    expect(shake.disabled).toBe(false);
    expect(shake.checked).toBe(true);
    expect(screen.queryByText('У сімейній грі вимкнено')).toBeNull();
  });
});

describe('settleFamilyPrices (31)', () => {
  it('a hidden debuff price out of range or not a number is settled silently; visible ones stay as typed', async () => {
    const { settleFamilyPrices } = await import('./PowersEditor');
    const settled = settleFamilyPrices({ leaderboard: 'each', family: true, debuffs: [...DEBUFF_KINDS], debuffPrices: { shake: 99_999, mirror: Number.NaN, torch: 0.5, fog: 99_999 } });
    expect(settled.debuffPrices).toEqual({ shake: 5000, torch: 50, fog: 99_999 });
  });
});
