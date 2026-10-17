// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { Question, RoundInfo, StageView } from '@quiz/shared';
import { StageScreen } from './StageScreen';

afterEach(cleanup);

const choices = [
  { id: 'a', text: 'Львів' },
  { id: 'b', text: 'Київ' },
];
const question = { type: 'single' as const, text: 'Столиця України?', imageUrl: null, timeLimit: 20, points: 1000, choices };
const full: Question = { id: 'q1', type: 'single', text: question.text, imageUrl: null, timeLimit: 20, points: 1000, options: choices, correctId: 'b' };

const view = (over: Partial<StageView> = {}): StageView => ({
  role: 'stage',
  phase: 'lobby',
  paused: false,
  blitz: null,
  round: null,
  questionIndex: -1,
  total: 3,
  question: null,
  endsAt: null,
  remainingMs: null,
  playerCount: 0,
  answeredCount: 0,
  players: [],
  reveal: null,
  stats: null,
  standings: null,
  ...over,
});

const show = (current: StageView, hostOnline = true) =>
  render(
    <StageScreen view={current} code="123456" joinUrl="http://quiz.test/play/123456" offsetMs={0} hostOnline={hostOnline} />,
  );

describe('StageScreen', () => {
  it('invites players with the address and the code split for reading aloud', () => {
    show(view());
    expect(screen.getByText('quiz.test')).toBeTruthy();
    expect(screen.getByText('123 456')).toBeTruthy();
    expect(screen.getByText('Чекаємо на перших гравців')).toBeTruthy();
  });

  it('lists the players who joined', () => {
    show(
      view({
        playerCount: 2,
        players: [
          { id: 'p1', nickname: 'Олена', connected: true, streak: 0 },
          { id: 'p2', nickname: 'Тарас', connected: false, streak: 0 },
        ],
      }),
    );
    expect(screen.getByText('У грі: 2')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    expect(screen.getByText('Тарас')).toBeTruthy();
  });

  it('shows the question with lettered options and the answer count', () => {
    show(view({ phase: 'question', questionIndex: 0, question, endsAt: Date.now() + 20_000, playerCount: 12, answeredCount: 7 }));
    expect(screen.getByText('Столиця України?')).toBeTruthy();
    expect(screen.getByText('Запитання 1 з 3')).toBeTruthy();
    expect(screen.getByText('Відповіли 7 з 12')).toBeTruthy();
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual(['AЛьвів', 'BКиїв']);
    expect(screen.getByRole('timer')).toBeTruthy();
  });

  it('tells players to type on their phones for a text question', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, type: 'text', choices: [] } }));
    expect(screen.getByText('Введіть відповідь на телефоні')).toBeTruthy();
  });

  it('marks the correct option and shows vote counts on reveal', () => {
    show(
      view({
        phase: 'reveal',
        questionIndex: 0,
        question,
        reveal: full,
        stats: { answered: 3, accepted: 2, counts: { a: 1, b: 2 } },
      }),
    );
    const items = screen.getAllByRole('listitem');
    expect(items[1].className).toContain('is-correct');
    expect(items[0].className).not.toContain('is-correct');
    expect(items[1].textContent).toContain('2');
    expect(screen.getByText('Правильна відповідь: B. Київ')).toBeTruthy();
  });

  it('shows the leaderboard and the final podium', () => {
    const standings = [
      { participantId: 'p1', nickname: 'Олена', score: 900, totalTimeMs: 1, rank: 1 },
      { participantId: 'p2', nickname: 'Тарас', score: 400, totalTimeMs: 1, rank: 2 },
    ];
    show(view({ phase: 'leaderboard', questionIndex: 0, standings }));
    expect(screen.getByText('Рейтинг')).toBeTruthy();
    expect(screen.getByText('Олена')).toBeTruthy();
    cleanup();

    show(view({ phase: 'finished', questionIndex: 2, standings }));
    expect(screen.getByText('Переможці')).toBeTruthy();
    expect(screen.getByText('900')).toBeTruthy();
  });

  it('shrinks a long question so the options stay on screen', () => {
    show(view({ phase: 'question', questionIndex: 0, question: { ...question, text: 'Д'.repeat(130) } }));
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('is-long');
    cleanup();

    show(view({ phase: 'question', questionIndex: 0, question: { ...question, text: 'Д'.repeat(250) } }));
    expect(screen.getByRole('heading', { level: 1 }).className).toContain('is-xlong');
  });

  it('says the game is paused, or that the host is away', () => {
    show(view({ phase: 'question', questionIndex: 0, question, paused: true, remainingMs: 9000 }));
    expect(screen.getByRole('status').textContent).toBe('Пауза');
    cleanup();

    show(view({ phase: 'question', questionIndex: 0, question, paused: true, remainingMs: 9000 }), false);
    expect(screen.getByRole('status').textContent).toBe('Чекаємо на ведучого');
  });
});

describe('StageScreen: rounds', () => {
  const round: RoundInfo = { index: 0, total: 2, title: 'Розминка', type: 'classic', partial: false };

  it('announces the round on the intro', () => {
    show(view({ phase: 'intro', round }));
    expect(screen.getByText('Раунд 1 з 2')).toBeTruthy();
    expect(screen.getByText('Розминка')).toBeTruthy();
  });

  it('names an untitled round «Раунд N» in the intro heading', () => {
    show(view({ phase: 'intro', round: { ...round, index: 1, title: '' } }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Раунд 2');
  });

  it('shows the standings under «round results» at the end of a round', () => {
    const standings = [{ participantId: 'p1', nickname: 'Олена', score: -300, totalTimeMs: 1, rank: 1 }];
    show(view({ phase: 'round_end', round, standings, players: [{ id: 'p1', nickname: 'Олена', connected: true, streak: 2 }] }));
    expect(screen.getByText('Підсумки раунду 1')).toBeTruthy();
    expect(screen.getByText('−300')).toBeTruthy();
    expect(screen.getByText('🔥 2')).toBeTruthy();
  });

  it('numbers the question inside the round', () => {
    show(view({ phase: 'question', round, questionIndex: 1, total: 5, question, endsAt: Date.now() + 20_000 }));
    expect(screen.getByText(/Запитання 2 з 5/)).toBeTruthy();
    expect(screen.getByText(/Раунд 1/)).toBeTruthy();
  });
});
