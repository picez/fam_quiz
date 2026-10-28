// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { FactCard, GameCard, RoundCard } from '@quiz/shared';
import { FactCards, GameCardView, OwnRevealLine, RevealFactsLine, RoundCardView } from './FactCards';

afterEach(cleanup);

const q = { roundIndex: 0, number: 2, text: 'Найвища гора Карпат?' };
const cards: FactCard[] = [
  { kind: 'lightning', names: ['Оля'], timeMs: 2100, question: q },
  { kind: 'streak', names: ['Петро'], length: 3 },
  { kind: 'hardest', question: q, accepted: 1, answered: 5 },
];
const round: RoundCard = { correct: 4, answered: 6, avgMs: 5300, fastestMs: 2000, streak: 3, place: { before: 5, now: 3 }, fooledBy: 1 };
const game: GameCard = {
  rank: 2,
  rounds: [300, -100, 500],
  correct: 9,
  answered: 12,
  bestStreak: 4,
  fastestMs: 1800,
  buffs: 2,
  debuffs: { sent: 1, got: 3 },
  bluff: null,
};

describe('FactCards', () => {
  it('renders a card per fact with its title and body, and the heading', () => {
    const { container } = render(<FactCards cards={cards} rounds={1} title="Цікавинки раунду" />);
    expect(screen.getByRole('heading', { name: 'Цікавинки раунду' })).toBeTruthy();
    const items = container.querySelectorAll('li.fact-card');
    expect(items).toHaveLength(3);
    expect(items[0].classList.contains('fact-lightning')).toBe(true);
    expect([...container.querySelectorAll('.fact-title')].map((p) => p.textContent)).toEqual(['⚡ Блискавка', '🔥 Серія', '🧗 Найважче запитання']);
    expect(items[0].querySelector('.fact-body')?.textContent).toBe('Оля — 2,1 с, запитання 2');
    expect(container.querySelector('.fact-cards.is-big')).toBeNull();
  });

  it('big on the stage; nothing for an empty list', () => {
    const { container, rerender } = render(<FactCards cards={cards} rounds={1} big />);
    expect(container.querySelector('.fact-cards.is-big')).not.toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    rerender(<FactCards cards={[]} rounds={1} />);
    expect(container.innerHTML).toBe('');
  });

  it('reveal lines', () => {
    const { container } = render(
      <>
        <RevealFactsLine facts={{ accepted: 4, answered: 7, fastest: { names: ['Оля'], timeMs: 2100 }, bluff: null }} big />
        <OwnRevealLine fact={{ kind: 'share', percent: 57 }} />
      </>,
    );
    const line = container.querySelector('p.meta.reveal-facts.is-big');
    expect(line?.textContent).toBe('Правильно 4 з 7 · найшвидша Оля, 2,1 с');
    expect(screen.getByText('Правильно відповіли 57 %').className).toContain('reveal-facts');
  });

  it('round card: own and team title, parts joined by «·»', () => {
    const { container, rerender } = render(<RoundCardView card={round} team={false} />);
    expect(screen.getByRole('heading', { name: 'Твій раунд' })).toBeTruthy();
    expect(container.querySelector('section.own-card.round-card p')?.textContent).toBe('правильно 4 з 6 · середній час 5,3 с · найшвидша 2,0 с · серія зараз 3 · місце: 5 → 3 · тебе обдурили 1 раз');
    rerender(<RoundCardView card={round} team />);
    expect(screen.getByRole('heading', { name: 'Раунд команди' })).toBeTruthy();
    expect(container.textContent).toContain('вас обдурили 1 раз');
  });

  it('game card: place, bars per round with the minus one down, labels and lines', () => {
    const { container, rerender } = render(<GameCardView card={game} team={false} />);
    expect(screen.getByRole('heading', { name: 'Твоя гра' })).toBeTruthy();
    expect(container.querySelector('.game-card .lead')?.textContent).toBe('2-е місце');
    const bars = container.querySelectorAll('.round-bar');
    expect(bars).toHaveLength(3);
    expect([...bars].map((b) => b.classList.contains('is-minus'))).toEqual([false, true, false]);
    expect([...container.querySelectorAll('.round-bar-label')].map((l) => l.textContent)).toEqual(['Р1', 'Р2', 'Р3']);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Бали за раундами: Р1 300, Р2 −100, Р3 500');
    expect((bars[2].querySelector('.round-bar-fill') as HTMLElement).style.height).toBe('83.33%');
    expect(screen.getByText('Дебафи: від тебе 1 · на тобі 3')).toBeTruthy();
    rerender(<GameCardView card={{ ...game, rank: null, rounds: [] }} team />);
    expect(screen.getByRole('heading', { name: 'Гра команди' })).toBeTruthy();
    expect(container.querySelector('.game-card .lead')).toBeNull();
    expect(container.querySelector('.round-bars')).toBeNull();
    expect(screen.getByText('Дебафи: від вас 1 · на вас 3')).toBeTruthy();
  });
});
