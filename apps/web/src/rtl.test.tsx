// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me } from './api';
import { activateLocaleForTests } from './i18n';
import { applyDocument } from './locales/choose';
import { Timer } from './live/Timer';
import { Home } from './pages/Home';
import { PlayerScreen } from './screens/PlayerScreen';
import { ScoreTable } from './screens/ScoreTable';
import { baseMe, publicQuestion, teamPlayerView } from './screens/team-test-view';

vi.mock('./api', async (importOriginal) => ({ ...(await importOriginal<typeof import('./api')>()), checkCode: vi.fn(), me: vi.fn() }));

beforeEach(() => {
  activateLocaleForTests('ar', { ui: {}, help: {} });
  applyDocument('ar');
  vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
});

afterEach(() => {
  cleanup();
  activateLocaleForTests('uk');
  applyDocument('uk');
});

describe('right to left (ar)', () => {
  it('the page is rtl', () => {
    expect(document.documentElement.dir).toBe('rtl');
  });

  it('the timer stays left to right', () => {
    const { container } = render(<Timer view={{ endsAt: null, remainingMs: 45_000 }} offsetMs={0} total={60_000} />);
    expect(container.querySelector('.timer')?.getAttribute('dir')).toBe('ltr');
  });

  it('the Ukrainian question and every choice get dir=auto', () => {
    const question = { ...publicQuestion, text: 'Яке місто — столиця України?', choices: [{ id: 'a', text: 'Львів' }, { id: 'b', text: 'Київ' }, { id: 'c', text: 'Одеса' }] };
    const view = teamPlayerView({ teams: null, me: { ...baseMe, id: 'p1', nickname: 'Віра' }, phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 20_000 });
    render(<PlayerScreen view={view} hostOnline offsetMs={0} send={vi.fn(async () => ({ ok: true as const }))} />);
    const heading = screen.getByRole('heading', { name: 'Яке місто — столиця України?' });
    expect(heading.getAttribute('dir')).toBe('auto');
    const texts = [...document.querySelectorAll('.choice-text')];
    expect(texts.map((node) => node.textContent)).toEqual(['Львів', 'Київ', 'Одеса']);
    for (const node of texts) expect(node.getAttribute('dir')).toBe('auto');
  });

  it('score cells are ltr, nicknames dir=auto', () => {
    const rows = [
      { participantId: 'a', nickname: 'Оля', rank: 1, score: 1500, rounds: [1000, 500] },
      { participantId: 'b', nickname: 'Богдан', rank: 2, score: -200, rounds: [0, -200] },
    ];
    const { container } = render(<ScoreTable rows={rows} size="phone" breakdowns={{}} />);
    const cells = [...container.querySelectorAll('tbody td.round, tbody td.total')];
    expect(cells.length).toBe(6);
    for (const cell of cells) expect(cell.getAttribute('dir')).toBe('ltr');
    const names = [...container.querySelectorAll('tbody .score-name')];
    expect(names.length).toBe(2);
    for (const name of names) expect(name.getAttribute('dir')).toBe('auto');
  });

  it('the code field on Home is ltr', () => {
    render(
      <MemoryRouter>
        <Home />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Код гри').getAttribute('dir')).toBe('ltr');
  });
});
