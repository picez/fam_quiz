// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ debuffPrices: undefined }));
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
