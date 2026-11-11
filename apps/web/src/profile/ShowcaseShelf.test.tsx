// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AwardCard } from '@quiz/shared';
import { renderDiploma, shareDiploma } from '../trophy/diploma';
import { loadTrophyEngine, webglAvailable } from '../trophy/loadEngine';
import { clearTrophyPictures } from '../trophy/picture-cache';
import { ShowcaseShelf } from './ShowcaseShelf';

vi.mock('../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: vi.fn(() => false) }));
vi.mock('../trophy/diploma', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../trophy/diploma')>()),
  renderDiploma: vi.fn(),
  shareDiploma: vi.fn(),
}));

const award = (id: string, over: Omit<Partial<AwardCard>, 'content'> & { content?: Partial<AwardCard['content']> } = {}): AwardCard => ({
  id,
  place: 1,
  quizTitle: `Вікторина ${id}`,
  nickname: 'Оля',
  awardedAt: '2026-10-30T10:00:00.000Z',
  ...over,
  content: { trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false, ...over.content },
});

const open = (props: Partial<Parameters<typeof ShowcaseShelf>[0]> = {}) =>
  render(
    <MemoryRouter>
      <ShowcaseShelf awards={[]} pinned={[]} allTo="/profile/prizes" {...props} />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(webglAvailable).mockReturnValue(false);
  vi.mocked(loadTrophyEngine).mockResolvedValue(null);
  clearTrophyPictures();
});
afterEach(cleanup);

describe('ShowcaseShelf', () => {
  it('puts the first of three in the middle and makes it the main one', () => {
    open({
      awards: [
        award('a', { awardedAt: '2026-10-30T10:00:00.000Z' }),
        award('b', { awardedAt: '2026-10-29T10:00:00.000Z' }),
        award('c', { awardedAt: '2026-10-28T10:00:00.000Z' }),
      ],
    });
    expect(screen.getByRole('heading', { level: 2 }).textContent).toContain('Вітрина кубків');
    const items = [...document.querySelectorAll('.shelf-item')];
    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining('Вікторина b'),
      expect.stringContaining('Вікторина a'),
      expect.stringContaining('Вікторина c'),
    ]);
    expect(items.map((item) => item.classList.contains('is-main'))).toEqual([false, true, false]);
    expect(items[1]!.textContent).toContain('Золотий кубок');
  });

  it('shows the pinned ones in the order of pinning', () => {
    open({ awards: [award('a'), award('b'), award('c')], pinned: ['c', 'a'] });
    expect([...document.querySelectorAll('.shelf-item')].map((item) => item.textContent)).toEqual([
      expect.stringContaining('Вікторина c'),
      expect.stringContaining('Вікторина a'),
    ]);
  });

  it('without WebGL the cup is the emoji; with it, a static picture of the real cup and no live scene', async () => {
    open({ awards: [award('a')] });
    expect(document.querySelector('.shelf-icon')!.textContent).toBe('🏆');
    expect(document.querySelector('.shelf-icon img')).toBeNull();
    cleanup();
    vi.mocked(webglAvailable).mockReturnValue(true);
    const snapshot = vi.fn(async () => 'data:image/webp;base64,CUP');
    const mount = vi.fn();
    vi.mocked(loadTrophyEngine).mockResolvedValue({ mount, snapshot });
    open({ awards: [award('a'), award('b')] });
    await act(async () => {});
    const pictures = [...document.querySelectorAll<HTMLImageElement>('.shelf-icon img.trophy-picture')];
    expect(pictures.map((img) => img.src)).toEqual(['data:image/webp;base64,CUP', 'data:image/webp;base64,CUP']);
    expect(pictures[0]!.alt).toBe('Золотий кубок');
    // Два однакові кубки — один знімок; жодної живої сцени.
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(mount).not.toHaveBeenCalled();
  });

  it('a tap on a cup opens the full-screen viewer', () => {
    open({ awards: [award('a')] });
    fireEvent.click(screen.getByRole('button', { name: /Золотий кубок/ }));
    expect(screen.getByRole('dialog', { name: 'Приз за 1 місце' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a diploma alone downloads the diploma', async () => {
    vi.mocked(renderDiploma).mockResolvedValue(new Blob(['png']));
    vi.mocked(shareDiploma).mockResolvedValue('downloaded');
    open({ awards: [award('a', { content: { trophy: null, diploma: true } })] });
    expect(document.querySelector('.shelf-item')!.textContent).toContain('📜');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Диплом/ }));
    });
    expect(renderDiploma).toHaveBeenCalledWith(expect.objectContaining({ quizTitle: 'Вікторина a', place: 1 }));
    expect(shareDiploma).toHaveBeenCalledOnce();
  });

  it('an award with only a real prize and no photo is not a button', () => {
    open({ awards: [award('a', { content: { trophy: null, real: { text: 'Піца', photoUrl: null } } })] });
    const item = document.querySelector('.shelf-item')!;
    expect(item.textContent).toContain('🎁');
    expect(item.textContent).toContain('Піца');
    expect(item.querySelector('button')).toBeNull();
  });

  it('an empty shelf shows the cloud and the empty text, and still links to all prizes', () => {
    open();
    expect(document.querySelector('.cloud-motif')).toBeTruthy();
    expect(screen.getByText('Полиця поки порожня — тут стануть твої кубки.')).toBeTruthy();
    expect(screen.getByRole('link', { name: /усі призи/ }).getAttribute('href')).toBe('/profile/prizes');
  });

  it('with onAll the head has a button with allLabel instead of the link', () => {
    const onAll = vi.fn();
    open({ awards: [award('a')], allTo: undefined, onAll, allLabel: 'Усі нагороди (4)' });
    expect(screen.queryByRole('link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Усі нагороди (4)' }));
    expect(onAll).toHaveBeenCalledOnce();
  });
});
