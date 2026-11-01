// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AwardCard, Showcase as ShowcaseData } from '@quiz/shared';
import { renderDiploma, shareDiploma } from '../trophy/diploma';
import { Showcase } from './Showcase';

vi.mock('../trophy/diploma', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../trophy/diploma')>()),
  renderDiploma: vi.fn(),
  shareDiploma: vi.fn(),
}));
vi.mock('../trophy/TrophyView', () => ({ TrophyView: () => <span className="trophy-mock" /> }));

const render$ = vi.mocked(renderDiploma);
const share = vi.mocked(shareDiploma);

const award = (over: Omit<Partial<AwardCard>, 'content'> & { content?: Partial<AwardCard['content']> } = {}): AwardCard => ({
  id: 'a1',
  place: 1,
  quizTitle: 'Столиці',
  nickname: 'Оля',
  awardedAt: '2026-10-30T10:00:00.000Z',
  ...over,
  content: { trophy: { kind: 'cup', material: 'gold' }, engraving: null, real: null, title: null, diploma: false, ...over.content },
});

beforeEach(() => {
  render$.mockReset();
  share.mockReset();
  vi.unstubAllGlobals();
});
afterEach(cleanup);

describe('Showcase', () => {
  it('lists awards in the order they came, with place, quiz and engraving', () => {
    const data: ShowcaseData = {
      title: null,
      awards: [award({ id: 'a1', quizTitle: 'Нова', content: { engraving: 'Чемпіон' } }), award({ id: 'a2', place: 2, quizTitle: 'Стара' })],
    };
    render(<Showcase showcase={data} own={false} />);
    expect(screen.getByRole('heading', { name: 'Нагороди' })).toBeTruthy();
    const items = document.querySelectorAll('.award-card');
    expect(items).toHaveLength(2);
    expect(items[0]?.textContent).toContain('1 місце · Нова');
    expect(items[0]?.textContent).toContain('Чемпіон');
    expect(items[1]?.textContent).toContain('2 місце · Стара');
  });

  it('an award without a trophy has no 3D view and shows the real prize record', () => {
    render(<Showcase showcase={{ title: null, awards: [award({ content: { trophy: null, real: { text: 'Піца', photoUrl: null } } })] }} own />);
    expect(document.querySelector('.trophy-mock')).toBeNull();
    expect(screen.getByText('🎁 Піца')).toBeTruthy();
  });

  it('without IntersectionObserver the trophy view mounts at once', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Showcase showcase={{ title: null, awards: [award()] }} own />);
    expect(document.querySelector('.trophy-mock')).not.toBeNull();
  });

  it('mounts 3D only for the cards that are in view', () => {
    const observers: { cb: IntersectionObserverCallback; seen: Element[] }[] = [];
    class Fake {
      seen: Element[] = [];
      cb: IntersectionObserverCallback;
      constructor(cb: IntersectionObserverCallback) {
        this.cb = cb;
        observers.push(this);
      }
      observe(el: Element) {
        this.seen.push(el);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('IntersectionObserver', Fake);
    render(<Showcase showcase={{ title: null, awards: [award({ id: 'a1' }), award({ id: 'a2' }), award({ id: 'a3' })] }} own />);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(0);
    expect(document.querySelectorAll('.award-emoji')).toHaveLength(3);
    const cards = document.querySelectorAll('.award-card');
    const second = observers.find((entry) => entry.seen.includes(cards[1]!));
    expect(second).toBeTruthy();
    act(() => second!.cb([{ isIntersecting: true } as IntersectionObserverEntry], second as unknown as IntersectionObserver));
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(1);
    expect(document.querySelectorAll('.award-emoji')).toHaveLength(2);
  });

  it('the diploma button exists only for awards with a diploma and makes it with the award nickname', async () => {
    render$.mockResolvedValue(new Blob(['png']));
    share.mockResolvedValue('downloaded');
    render(
      <Showcase
        showcase={{ title: null, awards: [award({ id: 'a1', nickname: 'Оля', content: { diploma: true } }), award({ id: 'a2', nickname: 'Інша' })] }}
        own={false}
      />,
    );
    const buttons = screen.getAllByRole('button', { name: 'Диплом' });
    expect(buttons).toHaveLength(1);
    await act(async () => {
      fireEvent.click(buttons[0]!);
    });
    expect(render$).toHaveBeenCalledWith(expect.objectContaining({ nickname: 'Оля', quizTitle: 'Столиці', place: 1, date: new Date('2026-10-30T10:00:00.000Z') }));
    expect(share).toHaveBeenCalledOnce();
  });

  it('renders nothing for an empty showcase', () => {
    const { container } = render(<Showcase showcase={{ title: null, awards: [] }} own />);
    expect(container.innerHTML).toBe('');
  });

  it('a title alone makes the section with its end date', () => {
    render(<Showcase showcase={{ title: { text: 'Король', until: '2026-11-06T10:00:00.000Z' }, awards: [] }} own />);
    expect(screen.getByText(/титул до/)).toBeTruthy();
    expect(screen.getByText(/Король/)).toBeTruthy();
  });
});
