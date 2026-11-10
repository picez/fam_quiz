// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS } from '@quiz/shared';
import { t } from '../i18n';
import { BETS_CUT_ALL, BetsCutField } from './BetsCutField';

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

  it('"whole text" gives the schema maximum, which survives a longer text', () => {
    const onChange = vi.fn();
    render(<BetsCutField text={TEXT} cut={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: t('betsCutAll') }));
    expect(onChange).toHaveBeenCalledWith(BETS_CUT_ALL);
    expect(BETS_CUT_ALL).toBe(LIMITS.questionText);
    cleanup();
    const longer = `${TEXT} Підказка: на півдні.`;
    render(<BetsCutField text={longer} cut={BETS_CUT_ALL} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: t('betsCutAll') }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(t('betsCutPreview', { text: longer }))).toBeTruthy();
  });

  it('on an empty text "whole text" and "nothing" stay apart', () => {
    const onChange = vi.fn();
    const { rerender } = render(<BetsCutField text="" cut={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: t('betsCutAll') }));
    expect(onChange).toHaveBeenLastCalledWith(BETS_CUT_ALL);
    fireEvent.click(screen.getByRole('radio', { name: t('betsCutNone') }));
    expect(onChange).toHaveBeenLastCalledWith(0);
    rerender(<BetsCutField text="" cut={BETS_CUT_ALL} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: t('betsCutAll') }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: t('betsCutNone') }).getAttribute('aria-checked')).toBe('false');
    rerender(<BetsCutField text="" cut={0} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: t('betsCutAll') }).getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('radio', { name: t('betsCutNone') }).getAttribute('aria-checked')).toBe('true');
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

describe('BetsCutField in an auction', () => {
  it('speaks of bidding, not of bets', () => {
    render(<BetsCutField text={TEXT} cut={2} onChange={() => {}} phase="auction" />);
    expect(screen.getByRole('radiogroup', { name: 'Що видно під час торгу' })).toBeTruthy();
    expect(screen.getByText('Під час торгу видно: «Яке місто»')).toBeTruthy();
    expect(screen.getByText(t('auctionCutHidden'))).toBeTruthy();
  });

  it('shows the topic-only note for an empty cut', () => {
    render(<BetsCutField text={TEXT} cut={0} onChange={() => {}} phase="auction" />);
    expect(screen.getByText(t('auctionCutPreviewNone'))).toBeTruthy();
  });
});
