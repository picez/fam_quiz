// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import { BetsCutField } from './BetsCutField';

afterEach(cleanup);

const TEXT = 'Яке місто є столицею Австралії?';

describe('BetsCutField', () => {
  it('clicking a word cuts after it', () => {
    const onChange = vi.fn();
    render(<BetsCutField text={TEXT} cut={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: 'місто' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('previews the visible start for the chosen word', () => {
    render(<BetsCutField text={TEXT} cut={2} onChange={() => {}} />);
    expect(screen.getByText(t('betsCutPreview', { text: 'Яке місто' }))).toBeTruthy();
    expect(screen.getByText(t('betsCutHidden'))).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'місто' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: 'Яке' }).getAttribute('aria-checked')).toBe('false');
  });

  it('"nothing" gives 0 and the empty preview', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BetsCutField text={TEXT} cut={3} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: t('betsCutNone') }));
    expect(onChange).toHaveBeenCalledWith(0);
    rerender(<BetsCutField text={TEXT} cut={0} onChange={onChange} />);
    expect(screen.getByText(t('betsCutPreviewNone'))).toBeTruthy();
    expect(screen.getByRole('radio', { name: t('betsCutNone') }).getAttribute('aria-checked')).toBe('true');
  });

  it('"whole text" gives the number of words', () => {
    const onChange = vi.fn();
    render(<BetsCutField text={TEXT} cut={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: t('betsCutAll') }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it('a cut beyond the words marks the whole text', () => {
    render(<BetsCutField text={TEXT} cut={9} onChange={() => {}} />);
    expect(screen.getByRole('radio', { name: t('betsCutAll') }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(t('betsCutPreview', { text: TEXT }))).toBeTruthy();
  });

  it('nothing is marked until a cut is chosen', () => {
    render(<BetsCutField text={TEXT} cut={undefined} onChange={() => {}} />);
    expect(screen.getAllByRole('radio').every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
    expect(screen.getByRole('radiogroup', { name: t('betsCutLabel') })).toBeTruthy();
  });
});
