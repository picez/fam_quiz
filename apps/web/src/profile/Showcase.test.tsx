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

  it('without IntersectionObserver only emoji show, and a tap opens 3D for that card', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    render(<Showcase showcase={{ title: null, awards: [award({ id: 'a1' }), award({ id: 'a2' })] }} own />);
    expect(document.querySelector('.trophy-mock')).toBeNull();
    const emoji = document.querySelectorAll('.award-emoji');
    expect(emoji).toHaveLength(2);
    fireEvent.click(emoji[0]!);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(1);
    expect(document.querySelectorAll('.award-emoji')).toHaveLength(1);
  });

  function fakeObserver() {
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
    const show = (index: number, isIntersecting = true) => {
      const card = document.querySelectorAll('.award-card')[index]!;
      const entry = observers.find((o) => o.seen.includes(card))!;
      act(() => entry.cb([{ isIntersecting } as IntersectionObserverEntry], entry as unknown as IntersectionObserver));
    };
    return show;
  }

  it('mounts 3D only for the cards that are in view and keeps it after they scroll away', () => {
    const show = fakeObserver();
    render(<Showcase showcase={{ title: null, awards: [award({ id: 'a1' }), award({ id: 'a2' }), award({ id: 'a3' })] }} own />);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(0);
    expect(document.querySelectorAll('.award-emoji')).toHaveLength(3);
    show(1);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(1);
    show(1, false);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(1);
    expect(document.querySelectorAll('.award-emoji')).toHaveLength(2);
  });

  it('allows at most 6 live 3D cards by scrolling; the rest stay emoji until tapped', () => {
    const show = fakeObserver();
    const awards = Array.from({ length: 8 }, (_, i) => award({ id: `a${i}` }));
    render(<Showcase showcase={{ title: null, awards }} own />);
    for (let i = 0; i < 8; i++) show(i);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(6);
    fireEvent.click(document.querySelectorAll('.award-emoji')[0]!);
    expect(document.querySelectorAll('.trophy-mock')).toHaveLength(7);
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
