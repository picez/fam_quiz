// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type PlayerTimedList, type PublicQuestion, type TimedListInfo } from '@quiz/shared';
import type { Send, SendResult } from '../live/types';
import { TimedListBoard, TimedListCells, TimedListPlay, TimedListReveal } from './TimedListView';

const question: PublicQuestion = {
  type: 'timedlist',
  text: 'Назвіть планети Сонячної системи',
  imageUrl: null,
  video: null,
  timeLimit: 90,
  points: 100,
  choices: [],
  right: [],
  orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  chain: null,
  sort: null,
  timedlist: { total: 8, minus: 50 },
};

const listOf = (over: Partial<PlayerTimedList> = {}): PlayerTimedList => ({ found: [], total: 8, wrong: 0, canType: true, done: false, ...over });

const field = () => screen.getByLabelText('Ваш варіант') as HTMLInputElement;

/** Ack, що відповідає, коли тест скаже. */
function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at](result)) };
}

const typeIn = (value: string) => fireEvent.change(field(), { target: { value } });
const wait = async (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe('TimedListPlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('shows the counter and numbered empty cells', () => {
    render(<TimedListPlay list={listOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    expect(screen.getByText('0 / 8')).toBeTruthy();
    expect(screen.getByText('Слово не зі списку: −50')).toBeTruthy();
    for (let n = 1; n <= 8; n++) expect(screen.getByLabelText(`Клітинка ${n}`)).toBeTruthy();
    const input = field();
    expect(input.maxLength).toBe(LIMITS.listWord);
    expect(input.getAttribute('autocapitalize')).toBe('none');
    expect(input.getAttribute('autocomplete')).toBe('off');
    expect(input.getAttribute('autocorrect')).toBe('off');
    expect(input.getAttribute('spellcheck')).toBe('false');
    expect(input.getAttribute('enterkeyhint')).toBe('done');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('a pause in typing checks the word without enter', async () => {
    const { send } = deferred();
    render(<TimedListPlay list={listOf()} question={question} paused={false} send={send} />);
    typeIn('Юпі');
    await wait(200);
    typeIn('Юпітер');
    await wait(399);
    expect(send).not.toHaveBeenCalled();
    await wait(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:list', { word: 'Юпітер', enter: false });
  });

  it('a live miss changes nothing and the same word is not checked twice', async () => {
    const { send, answer } = deferred();
    render(<TimedListPlay list={listOf()} question={question} paused={false} send={send} />);
    typeIn('Юп');
    await wait(400);
    await answer({ ok: false, error: 'list_miss' });
    expect(field().value).toBe('Юп');
    expect(document.querySelector('.is-shake')).toBeNull();
    expect(screen.queryByText('−50')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('');
    typeIn('Юп ');
    typeIn('Юп');
    await wait(400);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('enter sends with enter: true; a miss with a minus shakes and shows −50', async () => {
    const { send, answer } = deferred();
    const { rerender } = render(<TimedListPlay list={listOf()} question={question} paused={false} send={send} />);
    typeIn('Плутон');
    fireEvent.submit(field().form!);
    expect(send).toHaveBeenCalledWith('player:list', { word: 'Плутон', enter: true });
    await answer({ ok: false, error: 'list_miss' });
    expect(field().value).toBe('');
    expect(document.querySelector('.is-shake')).not.toBeNull();
    expect(screen.getByText('−50')).toBeTruthy();
    rerender(<TimedListPlay list={listOf({ wrong: 1 })} question={question} paused={false} send={send} />);
    expect(screen.getByText('Помилок: 1')).toBeTruthy();
    await wait(1500);
    expect(screen.queryByText('−50')).toBeNull();
    // Таймер живого введення після Enter не шле того самого слова вдруге.
    expect(send).toHaveBeenCalledTimes(1);
    cleanup();
    const free = deferred();
    render(<TimedListPlay list={listOf()} question={{ ...question, timedlist: { total: 8, minus: null } }} paused={false} send={free.send} />);
    expect(screen.queryByText(/Слово не зі списку/)).toBeNull();
    typeIn('Плутон');
    fireEvent.submit(field().form!);
    await free.answer({ ok: false, error: 'list_miss' });
    expect(field().value).toBe('');
    expect(screen.queryByText('−50')).toBeNull();
  });

  it('a repeat flashes the found cell and costs nothing', async () => {
    const { send, answer } = deferred();
    render(<TimedListPlay list={listOf({ found: [{ index: 5, text: 'Юпітер' }] })} question={question} paused={false} send={send} />);
    typeIn('юпітер');
    await wait(400);
    await answer({ ok: false, error: 'list_repeat' });
    expect(field().value).toBe('');
    expect(screen.getByText('Юпітер').closest('li')?.classList.contains('is-again')).toBe(true);
    expect(screen.getByRole('status').textContent).toBe('Цей пункт уже знайдено');
    expect(screen.queryByText('−50')).toBeNull();
    expect(document.querySelector('.is-shake')).toBeNull();
    await wait(600);
    expect(document.querySelector('.is-again')).toBeNull();
  });

  it('one request at a time and a cleared field only for the word that was sent', async () => {
    const { send, answer } = deferred();
    render(<TimedListPlay list={listOf()} question={question} paused={false} send={send} />);
    typeIn('Марс');
    await wait(400);
    typeIn('Марс, Вене');
    await wait(400);
    typeIn('Венера');
    await wait(400);
    fireEvent.submit(field().form!);
    expect(send).toHaveBeenCalledTimes(1);
    await answer({ ok: true }, 0);
    // Гравець дописав поле: ack «Марс» його не стирає, а останнє значення йде після відповіді.
    expect(field().value).toBe('Венера');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:list', { word: 'Венера', enter: true });
    await answer({ ok: true }, 1);
    expect(field().value).toBe('');
    expect(document.activeElement).toBe(field());
  });

  it('found words take their numbered place and a new find pops', () => {
    const { rerender } = render(<TimedListPlay list={listOf()} question={question} paused={false} send={vi.fn<Send>()} />);
    rerender(<TimedListPlay list={listOf({ found: [{ index: 5, text: 'Юпітер' }] })} question={question} paused={false} send={vi.fn<Send>()} />);
    const cells = [...document.querySelectorAll('.timedlist-cell')];
    expect(cells).toHaveLength(8);
    expect(cells[4].textContent).toContain('Юпітер');
    expect(cells[4].classList.contains('is-fresh')).toBe(true);
    expect(screen.getByText('1 / 8')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Знайдено: Юпітер');
  });

  it('done hides the input', () => {
    const found = Array.from({ length: 8 }, (_, i) => ({ index: i + 1, text: `П${i + 1}` }));
    render(<TimedListPlay list={listOf({ found, done: true, canType: false })} question={question} paused={false} send={vi.fn<Send>()} />);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.getByText('Усе знайдено!')).toBeTruthy();
  });

  it('a pause turns the field off and sends nothing', async () => {
    const send = vi.fn<Send>();
    render(<TimedListPlay list={listOf()} question={question} paused send={send} />);
    expect(field().disabled).toBe(true);
    fireEvent.submit(field().form!);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('TimedListCells', () => {
  afterEach(cleanup);

  it('an empty cell shows only its number', () => {
    render(<TimedListCells total={3} found={[{ index: 2, text: 'Марс' }]} />);
    expect(screen.getByLabelText('Клітинка 1').textContent).toBe('1');
    expect(screen.getByText('Марс').closest('li')?.textContent).toContain('2');
  });
});

const info = (over: Partial<TimedListInfo> = {}): TimedListInfo => ({
  total: 3,
  minus: 50,
  players: 2,
  rows: [
    { playerId: 'p1', nickname: 'Олена', found: 2, wrong: 1, points: null },
    { playerId: 'p2', nickname: 'Тарас', found: 1, wrong: 0, points: null },
  ],
  items: null,
  ...over,
});

describe('TimedListBoard', () => {
  afterEach(cleanup);

  it('TimedListBoard shows counts during play and points on reveal', () => {
    render(<TimedListBoard info={info()} reveal={false} />);
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByText('Помилок: 1')).toBeTruthy();
    expect(document.querySelector('.score')).toBeNull();
    cleanup();
    const rows = info().rows.map((row, i) => ({ ...row, points: [100, 50][i] }));
    render(<TimedListBoard info={info({ rows })} reveal />);
    expect([...document.querySelectorAll('.timedlist-board .score')].map((n) => n.textContent)).toEqual(['+100', '+50']);
  });
});

describe('TimedListReveal', () => {
  afterEach(cleanup);

  it('TimedListReveal lists every item with finders and per-finder points; nobody — «Ніхто не знайшов»', () => {
    const items = [
      { index: 1, text: 'Меркурій', finders: ['p1', 'p2'], points: 50 },
      { index: 2, text: 'Венера', finders: ['p1'], points: 100 },
      { index: 3, text: 'Нептун', finders: [], points: 0 },
    ];
    render(<TimedListReveal info={info({ items })} mine="p2" />);
    const lines = [...document.querySelectorAll('.timedlist-reveal li')];
    expect(lines).toHaveLength(3);
    expect(lines[0].textContent).toContain('Меркурій');
    expect(lines[0].textContent).toContain('Знайшли: Олена, Тарас');
    expect(lines[0].textContent).toContain('+50');
    expect(lines[0].classList.contains('is-mine')).toBe(true);
    expect(lines[1].classList.contains('is-mine')).toBe(false);
    expect(lines[2].textContent).toContain('Ніхто не знайшов');
    expect(lines[2].textContent).not.toContain('+0');
  });

  it('the host sees finders without points before the reveal', () => {
    render(<TimedListReveal info={info({ items: [{ index: 1, text: 'Меркурій', finders: ['p1'], points: null }] })} />);
    expect(screen.getByText('Знайшли: Олена')).toBeTruthy();
    expect(document.querySelector('.timedlist-reveal .score')).toBeNull();
  });

  it('renders nothing without items', () => {
    const { container } = render(<TimedListReveal info={info()} />);
    expect(container.innerHTML).toBe('');
  });
});
