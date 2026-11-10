// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type PlayerWordLadder, type PublicQuestion, type WordLadderInfo } from '@quiz/shared';
import type { Send, SendResult } from '../live/types';
import { WordLadderBoard, WordLadderColumn, WordLadderPlay } from './WordLadderView';

afterEach(cleanup);

const question: PublicQuestion = {
  type: 'wordladder',
  text: 'Драбина',
  imageUrl: null,
  video: null,
  timeLimit: 90,
  points: 1000,
  choices: [],
  right: [],
  orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  chain: null,
  sort: null,
  wordladder: { start: 'поле', target: 'тара', letters: 4, maxSteps: 8 },
};

const ladderOf = (over: Partial<PlayerWordLadder> = {}): PlayerWordLadder => {
  const words = over.words ?? [];
  return { words, steps: words.length, finished: false, canAdd: true, canBack: words.length > 0, ...over };
};

const ok = (): Send => vi.fn(async () => ({ ok: true as const }));

const play = (ladder: PlayerWordLadder, send: Send = ok(), paused = false) => {
  render(<WordLadderPlay ladder={ladder} question={question} paused={paused} send={send} />);
  return send;
};

const field = () => screen.getByLabelText('Наступне слово') as HTMLInputElement;

const typeAndAdd = (word: string) => {
  fireEvent.change(field(), { target: { value: word } });
  fireEvent.click(screen.getByRole('button', { name: 'Додати' }));
};

describe('WordLadderView', () => {
  it('shows the goal, the start and the empty cells', () => {
    const { container } = render(<WordLadderPlay ladder={ladderOf()} question={question} paused={false} send={ok()} />);
    expect(screen.getByText('поле → тара')).toBeTruthy();
    expect(screen.getByText('поле').closest('ol')?.getAttribute('dir')).toBe('ltr');
    expect(container.querySelectorAll('.wordladder-cell').length).toBe(4);
    expect(screen.getByText('Бали — за щонайбільше 8 кроків')).toBeTruthy();
    const input = field();
    expect(input.maxLength).toBe(LIMITS.wordLadderWord);
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('enterkeyhint')).toBe('go');
    expect(input.getAttribute('lang')).toBe('uk');
  });

  it('adds a word and clears the field on ok', async () => {
    const send = play(ladderOf());
    typeAndAdd('пола');
    expect(send).toHaveBeenCalledWith('player:wordladder', { word: 'пола' });
    await waitFor(() => expect(field().value).toBe(''));
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it("shows the server's reason and keeps the word", async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'word_one_letter' }));
    play(ladderOf(), send);
    // Регіон причини стоїть у DOM ще до відмови: зміна його тексту озвучується.
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    typeAndAdd('пила');
    await waitFor(() => expect(status.textContent).toBe('Ви замінили більше ніж одну літеру'));
    expect(field().value).toBe('пила');
    send.mockImplementation(async () => ({ ok: false, error: 'word_unknown' }));
    typeAndAdd('поже');
    await waitFor(() => expect(status.textContent).toBe('Немає такого іменника в словнику'));
    expect(field().value).toBe('поже');
  });

  it('the maximum takes the plural form of its number', () => {
    for (const [maxSteps, text] of [[1, 'Бали — за щонайбільше 1 крок'], [3, 'Бали — за щонайбільше 3 кроки'], [20, 'Бали — за щонайбільше 20 кроків']] as const) {
      render(<WordLadderPlay ladder={ladderOf()} question={{ ...question, wordladder: { ...question.wordladder!, maxSteps } }} paused={false} send={ok()} />);
      expect(screen.getByText(text)).toBeTruthy();
      cleanup();
    }
  });

  it('a failed send shows a generic reason and keeps the word', async () => {
    const send = vi.fn<Send>(async () => {
      throw new Error('offline');
    });
    play(ladderOf(), send);
    typeAndAdd('пола');
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Щось пішло не так. Спробуйте ще раз.'));
    expect(field().value).toBe('пола');
  });

  it('text typed while a word is checked stays in the field', async () => {
    let answer: (result: SendResult) => void = () => undefined;
    const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => (answer = resolve)));
    play(ladderOf(), send);
    typeAndAdd('пола');
    fireEvent.change(field(), { target: { value: 'по' } });
    answer({ ok: true });
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(field().value).toBe('по');
  });

  it('a double tap sends one request', async () => {
    let answer: (result: SendResult) => void = () => undefined;
    const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => (answer = resolve)));
    play(ladderOf({ words: ['пола'] }), send);
    typeAndAdd('пора');
    fireEvent.submit(field().form!);
    fireEvent.click(screen.getByRole('button', { name: 'Крок назад' }));
    expect(send).toHaveBeenCalledTimes(1);
    answer({ ok: true });
    await waitFor(() => expect(field().value).toBe(''));
    fireEvent.click(screen.getByRole('button', { name: 'Крок назад' }));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:wordladder-back');
  });

  it('step back is off without words and after finishing', () => {
    play(ladderOf());
    expect((screen.getByRole('button', { name: 'Крок назад' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Додати' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    play(ladderOf({ words: ['пола'] }));
    expect((screen.getByRole('button', { name: 'Крок назад' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    play(ladderOf({ words: ['пола', 'пора', 'пара', 'тара'], finished: true, canAdd: false, canBack: false }));
    expect(screen.queryByRole('button', { name: 'Крок назад' })).toBeNull();
    cleanup();
    // На паузі все вимкнено, але поле лишається з уже введеним.
    play(ladderOf({ words: ['пола'] }), ok(), true);
    expect((screen.getByRole('button', { name: 'Крок назад' }) as HTMLButtonElement).disabled).toBe(true);
    expect(field().disabled).toBe(true);
  });

  it('collapses more than five words to start, second, gap and last two', () => {
    const words = ['пола', 'пора', 'нора', 'кора', 'пора', 'пара'];
    const { container } = render(<WordLadderColumn start="поле" target="тара" words={words} letters={4} current />);
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent);
    expect(items).toEqual(['поле', 'пола', '…', 'пора', 'пара', '']);
    expect(screen.getByLabelText('Пропущені слова').textContent).toBe('…');
    expect(screen.queryByText('нора')).toBeNull();
    expect(container.querySelectorAll('.wordladder-cell').length).toBe(4);
    cleanup();
    const short = render(<WordLadderColumn start="поле" target="тара" words={['пола', 'пора', 'пара', 'тара']} letters={4} />);
    expect([...short.container.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['поле', 'пола', 'пора', 'пара', 'тара']);
    expect(short.container.querySelectorAll('.wordladder-cell').length).toBe(0);
  });

  it('finished shows the step count without the input', () => {
    const { container } = render(
      <WordLadderPlay ladder={ladderOf({ words: ['пола', 'пора', 'пара', 'тара'], finished: true, canAdd: false, canBack: false })} question={question} paused={false} send={ok()} />,
    );
    expect(screen.getByText('Готово! Кроків: 4')).toBeTruthy();
    expect(screen.getByText('Чекаємо на інших')).toBeTruthy();
    // «Готово!» — у живій області, і фокус на ньому (форми з полем уже немає).
    expect(screen.getByRole('status').textContent).toContain('Готово! Кроків: 4');
    expect(document.activeElement?.textContent).toBe('Готово! Кроків: 4');
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(container.querySelectorAll('.wordladder-cell').length).toBe(0);
  });

  it('renders nothing without the ladder on the question', () => {
    const { container } = render(<WordLadderPlay ladder={ladderOf()} question={{ ...question, wordladder: undefined }} paused={false} send={ok()} />);
    expect(container.innerHTML).toBe('');
  });
});

describe('WordLadderBoard', () => {
  const row = (playerId: string, nickname: string, steps: number, finished: boolean, over: Partial<WordLadderInfo['rows'][number]> = {}) => ({
    playerId, nickname, steps, finished, words: null, points: null, ...over,
  });
  const infoOf = (rows: WordLadderInfo['rows'], path: string[] | null = null): WordLadderInfo => ({ start: 'поле', target: 'тара', maxSteps: 8, path, rows });

  it('shows step counts and no words while the question is open', () => {
    render(<WordLadderBoard info={infoOf([row('p1', 'Олена', 2, false), row('p2', 'Тарас', 3, true)])} reveal={false} />);
    expect(screen.getByText('кроків: 2')).toBeTruthy();
    expect(screen.getByText('фініш')).toBeTruthy();
    expect(document.querySelector('.wordladder-words')).toBeNull();
    expect(document.querySelector('.rank')).toBeNull();
    expect(document.querySelector('.is-out')).toBeNull();
  });

  it('shows the place, the words and the points at the reveal', () => {
    render(<WordLadderBoard info={infoOf([row('p1', 'Олена', 2, true, { words: ['пора', 'тара'], points: 400 }), row('p2', 'Тарас', 1, false, { points: 0 })])} reveal />);
    const first = document.querySelector('.wordladder-board li') as HTMLElement;
    expect(first.querySelector('.rank')?.textContent).toBe('1');
    expect(first.querySelector('.wordladder-words')?.textContent).toBe('пора → тара');
    expect(first.querySelector('.score')?.textContent).toContain('400');
    expect(document.querySelectorAll('.wordladder-board li')[1].className).toBe('is-out');
  });

  it('a finisher over the maximum has no place and is dimmed', () => {
    render(<WordLadderBoard info={infoOf([row('p1', 'А', 4, true, { points: 500 }), row('p2', 'Б', 9, true, { points: 0 }), row('p3', 'В', 2, false, { points: 0 })])} reveal />);
    expect([...document.querySelectorAll('.rank')].map((n) => n.textContent)).toEqual(['1', '—', '—']);
    expect([...document.querySelectorAll('.wordladder-board li')].map((li) => li.className)).toEqual(['', 'is-out', 'is-out']);
  });

  it('gives equal steps the same place', () => {
    render(<WordLadderBoard info={infoOf([row('p1', 'А', 2, true), row('p2', 'Б', 2, true), row('p3', 'В', 4, true)])} reveal />);
    expect([...document.querySelectorAll('.rank')].map((n) => n.textContent)).toEqual(['1', '1', '3']);
  });

  it('shows the host the words of every player live', () => {
    render(<WordLadderBoard info={infoOf([row('p1', 'Олена', 1, false, { words: ['пора'] })], ['поле', 'пора', 'тара'])} reveal={false} />);
    expect(document.querySelector('.wordladder-words')?.textContent).toBe('пора');
  });
});
