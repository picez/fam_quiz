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
  rounds: [300, -100, 500],
  correct: 9,
  answered: 12,
  bestStreak: 4,
  fastestMs: 1800,
  buffs: 2,
  debuffs: { sent: 1, got: 3 },
  bluff: null,
  away: 0,
};

describe('FactCards', () => {
  it('renders a card per fact with its title and body, and the heading', () => {
    const { container } = render(<FactCards cards={cards} withRound={false} title="Цікавинки раунду" />);
    expect(screen.getByRole('heading', { name: 'Цікавинки раунду' })).toBeTruthy();
    const items = container.querySelectorAll('li.fact-card');
    expect(items).toHaveLength(3);
    expect(items[0].classList.contains('fact-lightning')).toBe(true);
    expect([...container.querySelectorAll('.fact-title')].map((p) => p.textContent)).toEqual(['⚡ Блискавка', '🔥 Серія', '🧗 Найважче запитання']);
    expect(items[0].querySelector('.fact-body')?.textContent).toBe('Оля — 2,1 с, запитання 2');
    expect(container.querySelector('.fact-cards.is-big')).toBeNull();
  });

  it('withRound names the round of the lightning question (awards); the round end does not', () => {
    const later = [{ ...cards[0], question: { ...q, roundIndex: 1 } } as FactCard];
    const { container, rerender } = render(<FactCards cards={later} withRound />);
    expect(container.querySelector('.fact-lightning .fact-body')?.textContent).toBe('Оля — 2,1 с, запитання 2 раунду 2');
    rerender(<FactCards cards={later} withRound={false} />);
    expect(container.querySelector('.fact-lightning .fact-body')?.textContent).toBe('Оля — 2,1 с, запитання 2');
  });

  it('big on the stage; nothing for an empty list', () => {
    const { container, rerender } = render(<FactCards cards={cards} withRound={false} big />);
    expect(container.querySelector('.fact-cards.is-big')).not.toBeNull();
    expect(container.querySelector('h2')).toBeNull();
    rerender(<FactCards cards={[]} withRound={false} />);
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
    expect(line?.textContent).toBe('Правильно 4 з 7 · найшвидше — Оля, 2,1 с');
    expect(container.querySelectorAll('p.meta.reveal-facts')[1].textContent).toBe('Правильно відповіли 57 %');
  });

  it('round card: own and team title, parts joined by «·»', () => {
    const { container, rerender } = render(<RoundCardView card={round} team={false} />);
    expect(screen.getByRole('heading', { name: 'Твій раунд' })).toBeTruthy();
    expect(container.querySelector('section.own-card.round-card p')?.textContent).toBe('правильно 4 з 6 · середній час 5,3 с · найшвидша 2,0 с · серія зараз 3 · місце: 5 → 3 · тебе обдурили 1 раз');
    rerender(<RoundCardView card={round} team />);
    expect(screen.getByRole('heading', { name: 'Раунд команди' })).toBeTruthy();
    expect(container.textContent).toContain('вас обдурили 1 раз');
  });

  it('game card: bars per round with the minus one down, labels and lines; no own place line (it stands above)', () => {
    const { container, rerender } = render(<GameCardView card={game} team={false} />);
    expect(screen.getByRole('heading', { name: 'Твоя гра' })).toBeTruthy();
    expect(container.querySelector('.game-card .lead')).toBeNull();
    expect(container.textContent).not.toContain('місце');
    const bars = container.querySelectorAll('.round-bar');
    expect(bars).toHaveLength(3);
    expect([...bars].map((b) => b.classList.contains('is-minus'))).toEqual([false, true, false]);
    expect([...container.querySelectorAll('.round-bar-label')].map((l) => l.textContent)).toEqual(['Р1', 'Р2', 'Р3']);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Бали за раундами: Раунд 1 300, Раунд 2 −100, Раунд 3 500');
    expect((bars[2].querySelector('.round-bar-fill') as HTMLElement).style.height).toBe('83.33%');
    expect(screen.getByText('Дебафи: від тебе 1 · на тобі 3')).toBeTruthy();
    expect(container.querySelector('.round-bars.is-many')).toBeNull();
    rerender(<GameCardView card={{ ...game, rounds: [1, 2, 3, 4, 5, 6, 7, 8, 9] }} team={false} />);
    expect(container.querySelector('.round-bars.is-many')).not.toBeNull();
    rerender(<GameCardView card={{ ...game, rounds: [] }} team />);
    expect(screen.getByRole('heading', { name: 'Гра команди' })).toBeTruthy();
    expect(container.querySelector('.round-bars')).toBeNull();
    expect(screen.getByText('Дебафи: від вас 1 · на вас 3')).toBeTruthy();
  });
});
