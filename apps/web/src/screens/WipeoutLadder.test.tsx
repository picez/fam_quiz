// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { WipeoutInfo, WipeoutRow } from '@quiz/shared';
import { WIPEOUT_DECISIONS_MAX, WipeoutLadder, WipeoutPlayers, WipeoutSide, WipeoutStepList, WipeoutStrip } from './WipeoutLadder';

afterEach(cleanup);

const row = (id: string, over: Partial<WipeoutRow> = {}): WipeoutRow => ({ playerId: id, nickname: `Гравець ${id}`, status: 'in', bank: 0, step: null, decision: null, choice: null, prev: null, ...over });

const wipeoutInfo = (over: Partial<WipeoutInfo> = {}): WipeoutInfo => ({
  ladder: [100, 200, 300, 400, 500],
  current: 2,
  done: 3,
  rows: [row('a', { bank: 600 }), row('b', { status: 'took', bank: 300, step: 1 }), row('c', { status: 'burned', step: 2 })],
  inCount: 1,
  decide: null,
  decisions: false,
  ...over,
});

describe('WipeoutLadder', () => {
  it('draws every step with the current one marked and the passed ones done', () => {
    render(<WipeoutLadder info={wipeoutInfo()} size="stage" />);
    const steps = screen.getAllByRole('listitem').filter((el) => el.classList.contains('wipeout-step'));
    expect(steps).toHaveLength(5);
    expect(steps[0].textContent).toContain('сходинка 5 з 5');
    expect(steps[0].hasAttribute('aria-label')).toBe(false);
    const current = steps.filter((el) => el.getAttribute('aria-current') === 'step');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain('300');
    expect(steps.filter((el) => el.classList.contains('is-done'))).toHaveLength(3);
  });

  it('groups the players by state with banks', () => {
    render(<WipeoutLadder info={wipeoutInfo()} size="phone" highlightId="a" />);
    expect(screen.getByText('У грі')).toBeTruthy();
    expect(screen.getByText('Забрали')).toBeTruthy();
    expect(screen.getByText('Згоріли')).toBeTruthy();
    expect(screen.getByText('Гравець a').closest('li')?.classList.contains('is-me')).toBe(true);
    expect(screen.getByText('Гравець a').closest('li')?.textContent).toContain('600');
  });

  it('marks a decided player without showing the choice', () => {
    const info = wipeoutInfo({
      rows: [row('a', { decision: 'decided' }), row('b', { decision: 'pending' })],
      decide: { endsAt: null, remainingMs: null, decided: 1, total: 2 },
    });
    render(<WipeoutPlayers info={info} size="stage" />);
    expect(screen.getByText('✓ вирішив')).toBeTruthy();
    expect(screen.getByText('Вирішили 1 з 2')).toBeTruthy();
    expect(screen.queryByText('забирає')).toBeNull();
    expect(screen.queryByText('іде далі')).toBeNull();
    cleanup();
    render(<WipeoutPlayers info={info} size="phone" />);
    expect(screen.queryByText('забирає')).toBeNull();
    expect(screen.queryByText('іде далі')).toBeNull();
  });

  it('shows the live choice for the host', () => {
    const info = wipeoutInfo({ rows: [row('a', { decision: 'take' }), row('b', { decision: 'stay' })] });
    render(<WipeoutPlayers info={info} size="host" />);
    expect(screen.getByText('забирає')).toBeTruthy();
    expect(screen.getByText('іде далі')).toBeTruthy();
  });
});

describe('WipeoutPlayers decisions group (11e)', () => {
  const info = wipeoutInfo({
    decisions: true,
    rows: [
      row('a', { bank: 600, choice: 'stay' }),
      row('b', { status: 'took', bank: 300, step: 2, choice: 'took' }),
      row('c', { status: 'took', bank: 300, step: 2, choice: 'auto' }),
      row('d', { status: 'burned', step: 1 }),
    ],
  });

  it('puts the choices in the first group and keeps the others without them', () => {
    const { container } = render(<WipeoutPlayers info={info} size="phone" highlightId="a" />);
    const groups = container.querySelectorAll('.wipeout-group');
    expect(groups[0].classList.contains('is-choices')).toBe(true);
    expect(groups[0].querySelector('h3')?.textContent).toBe('Рішення');
    expect([...container.querySelectorAll('.wipeout-choice')].map((el) => el.textContent)).toEqual(['Далі з 600', 'Забрано 300', 'Без вибору — забрано 300']);
    expect(screen.getByText('Гравець a').closest('li')?.classList.contains('is-me')).toBe(true);
    expect(screen.queryByText('У грі')).toBeNull();
    expect(screen.queryByText('Забрали')).toBeNull();
    expect(screen.getByText('Згоріли')).toBeTruthy();
    expect(groups).toHaveLength(2);
  });

  it('shows the same group on the stage and the host', () => {
    for (const size of ['stage', 'host'] as const) {
      const { container } = render(<WipeoutPlayers info={info} size={size} />);
      expect(container.querySelector('.wipeout-group.is-choices')).toBeTruthy();
      cleanup();
    }
  });

  it('on the stage: a big list without its own title, going on first, then taken, then by default', () => {
    const mixed = wipeoutInfo({
      decisions: true,
      rows: [row('a', { status: 'took', bank: 300, choice: 'auto' }), row('b', { status: 'took', bank: 200, choice: 'took' }), row('c', { bank: 600, choice: 'stay' }), row('d', { bank: 400, choice: 'stay' })],
    });
    const { container } = render(<WipeoutPlayers info={mixed} size="stage" />);
    expect(container.querySelector('.wipeout-players.is-decisions')).toBeTruthy();
    expect(container.querySelector('.is-choices h3')).toBeNull();
    expect([...container.querySelectorAll('.is-choices .name')].map((el) => el.textContent)).toEqual(['Гравець c', 'Гравець d', 'Гравець b', 'Гравець a']);
    cleanup();
    const phone = render(<WipeoutPlayers info={mixed} size="phone" />).container;
    expect(phone.querySelector('.is-decisions')).toBeNull();
    expect(phone.querySelector('.is-choices h3')?.textContent).toBe('Рішення');
  });

  it('on the stage: a long list ends with a rest line', () => {
    const many = wipeoutInfo({ decisions: true, rows: Array.from({ length: WIPEOUT_DECISIONS_MAX + 3 }, (_, i) => row(`p${i}`, { bank: 100, choice: 'stay' })) });
    const { container } = render(<WipeoutPlayers info={many} size="stage" />);
    expect(container.querySelectorAll('.is-choices li:not(.meta)')).toHaveLength(WIPEOUT_DECISIONS_MAX);
    expect(screen.getByText('ще 3')).toBeTruthy();
  });
});

describe('WipeoutStrip (11e)', () => {
  const rows = Array.from({ length: 10 }, (_, i) => row(`p${i + 1}`, { bank: (i + 1) * 100 }));

  it('lists up to eight by bank and always the own row', () => {
    const { container } = render(<WipeoutStrip info={wipeoutInfo({ rows })} highlightId="p1" />);
    const p = container.querySelector('.wipeout-strip-phone');
    expect(p?.textContent?.startsWith('У грі:')).toBe(true);
    const pairs = [...(p?.querySelectorAll('span:not(.meta)') ?? [])];
    expect(pairs).toHaveLength(9);
    expect(pairs[0].textContent).toBe('Гравець p10 1000');
    expect(pairs[8].textContent).toBe('Гравець p1 100');
    expect(pairs[8].classList.contains('is-me')).toBe(true);
    expect(p?.textContent).toContain('ще 1');
  });

  it('draws nothing when nobody is in the game', () => {
    const { container } = render(<WipeoutStrip info={wipeoutInfo({ rows: [row('a', { status: 'took', bank: 100 })] })} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('WipeoutStepList (11e)', () => {
  const info = wipeoutInfo({
    current: 1,
    rows: [
      row('a', { bank: 300, prev: 100 }),
      row('b', { status: 'burned', step: 1, prev: 100 }),
      row('c', { status: 'took', bank: 50, step: 0 }),
    ],
  });

  it('shows who passed the rung and who burned', () => {
    const { container } = render(<WipeoutStepList info={info} size="phone" highlightId="a" />);
    const items = container.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].classList.contains('is-right')).toBe(true);
    expect(items[0].classList.contains('is-me')).toBe(true);
    expect(items[0].textContent).toContain('100 → 300');
    expect(items[0].querySelector('.wipeout-verdict [aria-hidden="true"]')?.textContent).toBe('✓');
    expect(items[0].querySelector('.wipeout-verdict .sr-only')?.textContent).toBe('правильно');
    expect(items[1].querySelector('.wipeout-verdict [aria-hidden="true"]')?.textContent).toBe('✗');
    expect(items[1].querySelector('.wipeout-verdict .sr-only')?.textContent).toBe('згорів');
    expect(items[1].classList.contains('is-burned')).toBe(true);
    expect(items[1].textContent).toContain('банк 100 згорів');
    expect(screen.queryByText('Гравець c')).toBeNull();
    expect(screen.getByText('Як пройшли сходинку')).toBeTruthy();
  });

  it('has no title on the stage and cuts the list with a rest line', () => {
    const { container } = render(<WipeoutStepList info={info} size="stage" max={1} />);
    expect(screen.queryByText('Як пройшли сходинку')).toBeNull();
    expect(container.querySelector('.wipeout-step-list.is-stage')).toBeTruthy();
    expect(screen.getByText('ще 1')).toBeTruthy();
  });
});

describe('WipeoutSide (11e)', () => {
  const rows = [
    ...Array.from({ length: 14 }, (_, i) => row(`p${i + 1}`, { bank: (i + 1) * 100 })),
    row('t', { status: 'took', bank: 50, step: 0 }),
    row('x', { status: 'burned', step: 0 }),
  ];

  it('shows the banks of those in the game while the question runs', () => {
    const { container } = render(<WipeoutSide info={wipeoutInfo({ rows, inCount: 14 })} reveal={false} />);
    expect(container.querySelector('aside')?.getAttribute('aria-label')).toBe('Банки');
    expect(screen.getByText('У грі · 14')).toBeTruthy();
    expect(container.querySelectorAll('li:not(.meta)')).toHaveLength(12);
    expect(screen.getByText('ще 2')).toBeTruthy();
    expect(screen.getByText('Забрали: 1 · Згоріли: 1')).toBeTruthy();
  });

  it('shows the rung list on the reveal under its title', () => {
    const { container } = render(<WipeoutSide info={wipeoutInfo({ rows: [row('a', { bank: 300, prev: 100 })] })} reveal />);
    expect(container.querySelector('.wipeout-step-list.is-stage')).toBeTruthy();
    expect(container.querySelector('aside h2')?.textContent).toBe('Як пройшли сходинку');
  });

  it('draws nothing on the reveal when nobody played the rung', () => {
    const { container } = render(<WipeoutSide info={wipeoutInfo({ rows: [row('t', { status: 'took', bank: 50, step: 0 })] })} reveal />);
    expect(container.innerHTML).toBe('');
  });
});
