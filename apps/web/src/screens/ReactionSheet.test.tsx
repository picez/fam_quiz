// @vitest-environment jsdom
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QUICK_EMOJI, STICKERS, seriesLevel } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { ReactionButton, ReactionSheet } from './ReactionSheet';

const a = STICKERS[0].id;
const b = STICKERS[1].id;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function sheet(favorites: string[] = [], level: number | null = Infinity) {
  const onPick = vi.fn();
  const onToggle = vi.fn();
  const onClose = vi.fn();
  render(<ReactionSheet favorites={favorites} level={level} onPick={onPick} onToggle={onToggle} onClose={onClose} />);
  return { onPick, onToggle, onClose, dialog: screen.getByRole('dialog', { name: t('reactionSheetTitle') }) };
}

const group = (name: string) => screen.getByRole('group', { name });
const stickerButtons = (scope: HTMLElement) => within(scope).queryAllByRole('button', { name: /^Стікер / });

describe('ReactionSheet (13a)', () => {
  it('shows the six quick emoji and a tap sends one', () => {
    const { onPick, dialog } = sheet();
    for (const emoji of QUICK_EMOJI) expect(within(dialog).getByRole('button', { name: emoji })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '🔥' }));
    expect(onPick).toHaveBeenCalledWith({ kind: 'emoji', value: '🔥' });
  });

  it('lists every sticker in manifest order with lazy 48 px pictures', () => {
    const { onPick } = sheet();
    const all = stickerButtons(group(t('reactionAll')));
    expect(all).toHaveLength(STICKERS.length);
    expect(all[0].getAttribute('aria-label')).toBe(t('reactionSticker', { name: STICKERS[0].id }));
    for (const img of group(t('reactionAll')).querySelectorAll('img')) {
      expect(img.getAttribute('loading')).toBe('lazy');
      expect(img.getAttribute('decoding')).toBe('async');
      expect(img.getAttribute('width')).toBe('48');
      expect(img.getAttribute('height')).toBe('48');
    }
    fireEvent.click(all[2]);
    expect(onPick).toHaveBeenCalledWith({ kind: 'sticker', value: STICKERS[2].id });
  });

  it('without favourites it says how to add one', () => {
    sheet();
    expect(screen.getByText('Натисни ☆ на стікері, і він з\'явиться тут.')).toBeTruthy();
    expect(stickerButtons(group(t('reactionFavorites')))).toHaveLength(0);
  });

  it('favourites keep their order, their star is pressed and a tap on it toggles', () => {
    const { onToggle } = sheet([b, a]);
    const favorites = group(t('reactionFavorites'));
    expect(stickerButtons(favorites).map((button) => button.getAttribute('aria-label'))).toEqual([
      t('reactionSticker', { name: b }),
      t('reactionSticker', { name: a }),
    ]);
    const star = within(favorites).getByRole('button', { name: t('reactionFavoriteRemove', { name: b }) });
    expect(star.getAttribute('aria-pressed')).toBe('true');
    expect(star.textContent).toBe('★');
    fireEvent.click(star);
    expect(onToggle).toHaveBeenCalledWith(b);
    // У «Усі стікери» не улюблений стікер має ☆ без натиску.
    const other = within(group(t('reactionAll'))).getByRole('button', { name: t('reactionFavoriteAdd', { name: STICKERS[2].id }) });
    expect(other.getAttribute('aria-pressed')).toBe('false');
    expect(other.textContent).toBe('☆');
  });

  it('Escape and «Закрити» close the sheet', () => {
    const { onClose } = sheet();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: t('reactionClose') }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ReactionButton (13a)', () => {
  beforeEach(() => {
    // Улюблені гостя: GET /api/me/stickers відповідає 401.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })));
    localStorage.clear();
  });

  const trigger = () => screen.queryByRole('button', { name: t('reactionButton') }) as HTMLButtonElement | null;

  async function tap(name: string) {
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name }));
    });
  }

  it('is not there when shown is false', () => {
    render(<ReactionButton level={Infinity} shown={false} event="player:react" send={vi.fn<Send>()} />);
    expect(trigger()).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('the sheet grid is mounted only while it is open', async () => {
    render(<ReactionButton level={Infinity} shown event="player:react" send={vi.fn<Send>()} />);
    expect(document.querySelectorAll('img')).toHaveLength(0);
    await tap(t('reactionButton'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(document.querySelectorAll('img').length).toBeGreaterThanOrEqual(STICKERS.length);
    await tap(t('reactionClose'));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelectorAll('img')).toHaveLength(0);
  });

  it('a pick sends the reaction, closes the sheet and rests the button for 2 s', async () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    render(<ReactionButton level={Infinity} shown event="player:react" send={send} />);
    await tap(t('reactionButton'));
    await tap('👏');
    expect(send).toHaveBeenCalledWith('player:react', { kind: 'emoji', value: '👏' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()?.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1999));
    expect(trigger()?.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(1));
    expect(trigger()?.disabled).toBe(false);
  });

  it('too_soon rests the button too, wrong_phase does not and shows no error', async () => {
    vi.useFakeTimers();
    const send = vi.fn<Send>().mockResolvedValue({ ok: false, error: 'too_soon' });
    render(<ReactionButton level={Infinity} shown event="player:react" send={send} />);
    await tap(t('reactionButton'));
    await tap('😂');
    expect(trigger()?.disabled).toBe(true);
    act(() => vi.advanceTimersByTime(2000));
    expect(trigger()?.disabled).toBe(false);

    send.mockResolvedValue({ ok: false, error: 'wrong_phase' });
    await tap(t('reactionButton'));
    await tap('😂');
    expect(trigger()?.disabled).toBe(false);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(document.body.textContent).not.toContain('wrong_phase');
  });

  it('the host sends host:react, a sticker too', async () => {
    const send = vi.fn<Send>().mockResolvedValue({ ok: true });
    render(<ReactionButton level={Infinity} shown event="host:react" send={send} />);
    await tap(t('reactionButton'));
    await tap(t('reactionSticker', { name: a }));
    expect(send).toHaveBeenCalledWith('host:react', { kind: 'sticker', value: a });
  });
});

describe('«😀 Реакція» fits a 360 px header (e2e 7g regression)', () => {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  /** Усі блоки @media (max-width: 400px) разом. */
  const narrow = css
    .split('@media (max-width: 400px) {')
    .slice(1)
    .map((chunk: string) => chunk.slice(0, chunk.indexOf('\n}\n')))
    .join('\n');

  it('below 400 px the word is hidden whatever else stands in the header, e.g. «⚔ Дуель»', () => {
    expect(narrow).toContain('\n  .bar .reaction-button-label {\n    display: none;');
    expect(narrow).toContain('\n  .bar:has(.reaction-button) {\n    gap: 0.375rem;');
    // 17a: «Таблиця» більше не стискається трикрапкою (місце віддає нік) — трикрапкою стискається лише «⚔ Дуель».
    expect(narrow).toContain('.bar:has(.reaction-button) > .duel-button {\n    flex-shrink: 1;');
  });

  it('the word is a separate hideable span, the accessible name stays whole', () => {
    render(<ReactionButton level={Infinity} shown event="player:react" send={vi.fn<Send>()} />);
    const button = screen.getByRole('button', { name: t('reactionButton') });
    expect(button.querySelector('.reaction-button-label')?.textContent?.trim()).toBe('Реакція');
  });
});

describe('ReactionSheet locked series (15a)', () => {
  const open = STICKERS.find((s) => s.series === 'nya')!;
  const locked = STICKERS.find((s) => s.series === 'nyaa')!;
  const lockedLabel = t('stickerLocked', { level: seriesLevel('nyaa') });

  it('level 1: a later series is locked with its level and does not pick; the first series picks', () => {
    const { onPick, dialog } = sheet([], 1);
    const cell = within(group(t('reactionAll'))).getAllByRole('button', { name: lockedLabel })[0];
    expect(cell.textContent).toContain('🔒');
    fireEvent.click(cell);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getAllByRole('button', { name: t('reactionSticker', { name: open.id }) })[0]);
    expect(onPick).toHaveBeenCalledWith({ kind: 'sticker', value: open.id });
    expect(lockedLabel).toBe('Відкриється з рівня 3');
  });

  it('a guest (null) sees the same as level 1, and quick emoji stay open', () => {
    const { onPick, dialog } = sheet([], null);
    expect(within(group(t('reactionAll'))).getAllByRole('button', { name: lockedLabel }).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: '🔥' }));
    expect(onPick).toHaveBeenCalledWith({ kind: 'emoji', value: '🔥' });
  });

  it('a locked favourite shows 🔒 and the star still works', () => {
    const { onToggle, onPick } = sheet([locked.id], 1);
    const fav = group(t('reactionFavorites'));
    const cell = within(fav).getByRole('button', { name: lockedLabel });
    expect(cell.textContent).toContain('🔒');
    fireEvent.click(cell);
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(within(fav).getByRole('button', { name: t('reactionFavoriteRemove', { name: locked.id }) }));
    expect(onToggle).toHaveBeenCalledWith(locked.id);
  });

  it('level Infinity (the host) opens everything', () => {
    sheet([], Infinity);
    expect(within(group(t('reactionAll'))).queryAllByRole('button', { name: /^Відкриється/ })).toHaveLength(0);
    expect(stickerButtons(group(t('reactionAll')))).toHaveLength(STICKERS.length);
  });
});
