// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MoreLessInfo, MoreLessPairView, PlayerMoreLess, PublicQuestion } from '@quiz/shared';
import type { Send, SendResult } from '../live/types';
import { MORELESS_RESYNC_MS, MORELESS_TAP_GAP_MS, MoreLessBoard, MoreLessPlay, MoreLessReveal, MoreLessWatch } from './MoreLessView';

const question: PublicQuestion = {
  type: 'moreless',
  text: 'Порівняйте',
  imageUrl: null,
  video: null,
  timeLimit: 60,
  points: 300,
  choices: [],
  right: [],
  orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
  chain: null,
  sort: null,
  moreless: {
    pairs: [
      { id: 'p1', prompt: 'Що вище?', a: 'Говерла', b: 'Ейфелева вежа', points: 100 },
      { id: 'p2', prompt: 'Що довше?', a: 'Рейн', b: 'Дунай', points: 100 },
      { id: 'p3', prompt: 'Що глибше?', a: 'Світязь', b: 'Синевир', points: 100 },
    ],
  },
};

const pairs: MoreLessPairView[] = [
  { id: 'p1', prompt: 'Що вище?', a: { text: 'Говерла', value: '2061 м' }, b: { text: 'Ейфелева вежа', value: '330 м' }, correct: 'a', points: 100, right: 2 },
  { id: 'p2', prompt: 'Що довше?', a: { text: 'Рейн', value: '1233 км' }, b: { text: 'Дунай', value: '2850 км' }, correct: 'b', points: 100, right: 1 },
  { id: 'p3', prompt: 'Що глибше?', a: { text: 'Світязь', value: '58 м' }, b: { text: 'Синевир', value: '22 м' }, correct: 'a', points: 100, right: 0 },
];

const mineOf = (over: Partial<PlayerMoreLess> = {}): PlayerMoreLess => ({ done: 0, total: 3, picks: [], canPick: true, marks: null, points: null, ...over });

/** Ack, що відповідає, коли тест скаже. */
function deferred() {
  const answers: ((result: SendResult) => void)[] = [];
  const send = vi.fn<Send>(() => new Promise<SendResult>((resolve) => answers.push(resolve)));
  return { send, answer: async (result: SendResult, at = answers.length - 1) => act(async () => answers[at](result)) };
}

const option = (name: RegExp) => screen.getByRole('button', { name });
const tap = (name: RegExp) => {
  const button = option(name);
  fireEvent.pointerDown(button, { button: 0, pointerType: 'touch' });
  // Той самий дотик дає ще й click: він уже не рахується.
  fireEvent.click(button, { detail: 1 });
};
const wait = (ms: number) => act(() => vi.advanceTimersByTime(ms));

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MoreLessPlay', () => {
  it('shows one comparison with a counter and moves on at once', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    expect(screen.getByText('1 / 3')).toBeTruthy();
    // ar: абзац лічильника — у напрямку сторінки (без dir), числа — ltr у bdi.
    expect(screen.getByText('1 / 3').tagName).toBe('BDI');
    expect(screen.getByText('1 / 3').getAttribute('dir')).toBe('ltr');
    expect(screen.getByText('1 / 3').closest('p')?.hasAttribute('dir')).toBe(false);
    expect(screen.getByText('Що вище?')).toBeTruthy();
    expect(screen.queryByText('Дунай')).toBeNull();
    tap(/Говерла/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:moreless', { index: 0, pick: 'a' });
    // До ack: уже наступне порівняння.
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByText('Що довше?')).toBeTruthy();
    expect(option(/Дунай/)).toBeTruthy();
    // Правильність не показується.
    expect(document.body.textContent).not.toMatch(/правильно|помилка/i);
  });

  it('a double tap answers one comparison only', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Говерла/);
    wait(100);
    // Кнопки стоять на тому самому місці: другий дотик влучає в першу кнопку наступної пари.
    expect(option(/Рейн/).getAttribute('aria-disabled')).toBe('true');
    tap(/Рейн/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.getByText('2 / 3')).toBeTruthy();
    wait(MORELESS_TAP_GAP_MS);
    expect(option(/Рейн/).getAttribute('aria-disabled')).toBe('false');
    tap(/Дунай/);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 1, pick: 'b' });
  });

  it('a click with no press of its own does not count', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    fireEvent.click(option(/Говерла/), { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    // Клавіатура (Enter на кнопці) дає click з detail 0 — рахується.
    fireEvent.click(option(/Говерла/), { detail: 0 });
    expect(send).toHaveBeenCalledWith('player:moreless', { index: 0, pick: 'a' });
  });

  it('a press and a pointercancel send nothing', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    const button = option(/Говерла/);
    // Палець узявся за сторінку на кнопці: прокрутка дає pointercancel і без click.
    fireEvent.pointerDown(button, { button: 0, pointerType: 'touch' });
    expect(send).not.toHaveBeenCalled();
    fireEvent.pointerCancel(button, { pointerType: 'touch' });
    expect(send).not.toHaveBeenCalled();
    // Позначку знято: click опісля (не того дотику) теж нічого не шле.
    fireEvent.click(button, { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    // Миша з натиснутою кнопкою вийшла з неї — так само.
    fireEvent.pointerDown(button, { button: 0, pointerType: 'mouse' });
    fireEvent.pointerLeave(button, { pointerType: 'mouse', buttons: 1 });
    fireEvent.click(button, { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    // Дотик, що почався на іншій кнопці, — теж ні.
    fireEvent.pointerDown(option(/Ейфелева вежа/), { button: 0, pointerType: 'touch' });
    fireEvent.click(button, { detail: 1 });
    expect(send).not.toHaveBeenCalled();
    // Звичайний дотик: pointerleave після pointerup (buttons 0) не заважає.
    fireEvent.pointerDown(button, { button: 0, pointerType: 'touch' });
    fireEvent.pointerLeave(button, { pointerType: 'touch', buttons: 0 });
    fireEvent.click(button, { detail: 1 });
    expect(send).toHaveBeenCalledWith('player:moreless', { index: 0, pick: 'a' });
  });

  it('a stale refusal from behind returns the phone to the server place', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Говерла/);
    wait(MORELESS_TAP_GAP_MS);
    tap(/Дунай/);
    wait(MORELESS_TAP_GAP_MS);
    tap(/Світязь/);
    expect(screen.getByText('Готово! Чекаємо на відкриття')).toBeTruthy();
    // Вибір 0 загубився: сервер відхиляє 2 як stale і каже, що має 1 — телефон мовчки вертається на порівняння 2.
    await answer({ ok: false, error: 'moreless_stale', index: 1 }, 2);
    expect(screen.getByText('2 / 3')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
    wait(MORELESS_TAP_GAP_MS);
    tap(/Рейн/);
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 1, pick: 'a' });
    // Stale з місцем попереду (подвійний натиск) — мовчки, без руху.
    await answer({ ok: false, error: 'moreless_stale', index: 1 }, 0);
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  it('a lost last pick does not end in done', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    const { rerender } = render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Говерла/);
    wait(MORELESS_TAP_GAP_MS);
    rerender(<MoreLessPlay info={mineOf({ done: 1, picks: ['a'] })} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Дунай/);
    wait(MORELESS_TAP_GAP_MS);
    rerender(<MoreLessPlay info={mineOf({ done: 2, picks: ['a', 'b'] })} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Світязь/);
    expect(screen.getByText('Готово! Чекаємо на відкриття')).toBeTruthy();
    // Ack останнього не прийшов, а зріз так і лишився на 2: телефон вертається на порівняння 3.
    wait(MORELESS_RESYNC_MS);
    expect(screen.getByText('3 / 3')).toBeTruthy();
    tap(/Синевир/);
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 2, pick: 'b' });
  });

  it('a refusal ahead of an unanswered pick frees the server place', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Говерла/);
    wait(MORELESS_TAP_GAP_MS);
    tap(/Дунай/);
    // Відмова для 1, коли info.done = 0, а ack для 0 ще не прийшов: телефон на порівнянні 1, і воно живе.
    await answer({ ok: false, error: 'paused' }, 1);
    expect(screen.getByText('1 / 3')).toBeTruthy();
    wait(MORELESS_TAP_GAP_MS);
    tap(/Говерла/);
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 0, pick: 'a' });
  });

  it('a late reply does not move the phone back', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Говерла/);
    wait(MORELESS_TAP_GAP_MS);
    tap(/Дунай/);
    wait(MORELESS_TAP_GAP_MS);
    expect(screen.getByText('3 / 3')).toBeTruthy();
    await answer({ ok: false, error: 'moreless_stale' }, 0);
    expect(screen.getByText('3 / 3')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
    await answer({ ok: true }, 1);
    expect(screen.getByText('3 / 3')).toBeTruthy();
  });

  it('a refusal shows its text and returns to the server place', async () => {
    vi.useFakeTimers();
    const { send, answer } = deferred();
    const { rerender } = render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Говерла/);
    wait(MORELESS_TAP_GAP_MS);
    rerender(<MoreLessPlay info={mineOf({ done: 1, picks: ['a'] })} question={question} paused={false} timeUp={false} send={send} />);
    tap(/Дунай/);
    expect(screen.getByText('3 / 3')).toBeTruthy();
    await answer({ ok: false, error: 'time_over' }, 1);
    expect(screen.getByRole('status').textContent).toBe('Час на відповідь вийшов.');
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });

  it('keys pick and focus follows the next comparison', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    render(<MoreLessPlay info={mineOf()} question={question} paused={false} timeUp={false} send={send} />);
    option(/Ейфелева вежа/).focus();
    fireEvent.keyDown(option(/Ейфелева вежа/), { key: '2' });
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 0, pick: 'b' });
    expect(document.activeElement).toBe(option(/Рейн/));
    expect(screen.getByText('Порівняння 2: Що довше?')).toBeTruthy();
    // Під час паузи між дотиками клавіша теж не відповідає.
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(send).toHaveBeenCalledTimes(1);
    wait(MORELESS_TAP_GAP_MS);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 1, pick: 'a' });
    wait(MORELESS_TAP_GAP_MS);
    // Фокус не на кнопці — не крадемо його.
    const other = document.createElement('input');
    document.body.appendChild(other);
    other.focus();
    fireEvent.keyDown(window, { key: '1' });
    expect(send).toHaveBeenLastCalledWith('player:moreless', { index: 2, pick: 'a' });
    expect(document.activeElement).toBe(other);
    other.remove();
  });

  it('the end of time and the end of the row turn the buttons off', () => {
    vi.useFakeTimers();
    const { send } = deferred();
    const { rerender } = render(<MoreLessPlay info={mineOf({ done: 1, picks: ['a'] })} question={question} paused={false} timeUp send={send} />);
    expect(option(/Рейн/).getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByText('Час вийшов: пройдено 1 з 3')).toBeTruthy();
    tap(/Рейн/);
    expect(send).not.toHaveBeenCalled();
    rerender(<MoreLessPlay info={mineOf({ done: 1, picks: ['a'] })} question={question} paused timeUp={false} send={send} />);
    expect(option(/Рейн/).getAttribute('aria-disabled')).toBe('true');
    tap(/Рейн/);
    expect(send).not.toHaveBeenCalled();
    rerender(<MoreLessPlay info={mineOf({ done: 3, picks: ['a', 'b', 'a'], canPick: false })} question={question} paused={false} timeUp={false} send={send} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Готово! Чекаємо на відкриття')).toBeTruthy();
  });
});

describe('MoreLessBoard', () => {
  const rows = [
    { playerId: 'p1', nickname: 'Олена', done: 3, total: 3, right: null, points: null },
    { playerId: 'p2', nickname: 'Тарас', done: 1, total: 3, right: null, points: null },
  ];

  it('the stage board shows how far each got, then right counts and points', () => {
    const info: MoreLessInfo = { rows, pairs: null, picks: null };
    const { rerender } = render(<MoreLessBoard info={info} reveal={false} />);
    expect(screen.getByText('3 / 3')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/правильно/);
    expect(document.querySelector('.score')).toBeNull();
    const revealed: MoreLessInfo = { rows: [{ ...rows[0], right: 2, points: 200 }, { ...rows[1], right: 1, points: 100 }], pairs, picks: null };
    rerender(<MoreLessBoard info={revealed} reveal me="p2" />);
    expect(screen.getByText('правильно 2 з 3')).toBeTruthy();
    expect(screen.getByText('+200')).toBeTruthy();
    expect(screen.getByText('Тарас').closest('li')?.classList.contains('is-mine')).toBe(true);
  });

  it('the host board shows right counts and picks live, points only on reveal', () => {
    const info: MoreLessInfo = { rows: [{ ...rows[0], right: 2 }, { ...rows[1], right: 1 }], pairs, picks: { p1: ['a', 'a', 'a'], p2: ['a'] } };
    render(<MoreLessBoard info={info} reveal={false} />);
    expect(screen.getByText('правильно 2 з 3')).toBeTruthy();
    expect(document.querySelector('.score')).toBeNull();
    const marks = [...document.querySelectorAll('li')[0].querySelectorAll('.moreless-pick')].map((el) => el.className);
    expect(marks).toEqual(['moreless-pick is-right', 'moreless-pick is-wrong', 'moreless-pick is-right']);
  });
});

describe('MoreLessReveal', () => {
  it('the reveal table shows values, the right side and how many got it', () => {
    render(<MoreLessReveal pairs={pairs} />);
    expect(screen.getByText('2061 м')).toBeTruthy();
    expect(screen.getByText('2850 км')).toBeTruthy();
    expect(screen.getByText('Дунай').closest('.moreless-side')?.classList.contains('moreless-right')).toBe(true);
    expect(screen.getByText('Рейн').closest('.moreless-side')?.classList.contains('moreless-right')).toBe(false);
    expect(screen.getByText('Правильно: 1')).toBeTruthy();
    expect(document.querySelector('.moreless-reveal.is-two')).toBeNull();
  });

  it('shows the own marks and splits a long row in two columns', () => {
    const { rerender } = render(<MoreLessReveal pairs={pairs} marks={['right', 'wrong', 'late']} compact />);
    expect(screen.getByText('правильно')).toBeTruthy();
    expect(screen.getByText('помилка')).toBeTruthy();
    expect(screen.getByText('без відповіді')).toBeTruthy();
    const many = Array.from({ length: 20 }, (_, i) => ({ ...pairs[i % 3], id: `x${i}` }));
    rerender(<MoreLessReveal pairs={many} />);
    expect(document.querySelectorAll('.moreless-reveal > li')).toHaveLength(20);
    expect(document.querySelector('.moreless-reveal.is-two')).not.toBeNull();
  });
});

describe('MoreLessWatch', () => {
  const watchInfo = (done: number, picks: ('a' | 'b')[]): MoreLessInfo => ({ rows: [], pairs: null, picks: null, watch: { playerId: 'p1', done, picks } });

  it('MoreLessWatch shows the current pair and the chosen texts without marks', () => {
    const { container } = render(<MoreLessWatch info={watchInfo(2, ['a', 'b'])} question={question} />);
    expect(screen.getByRole('heading', { name: 'Що глибше?' })).toBeTruthy();
    expect(screen.getByText('Світязь')).toBeTruthy();
    expect(screen.getByText('Синевир')).toBeTruthy();
    const items = [...container.querySelectorAll('.moreless-watch-picks li')].map((li) => li.textContent);
    expect(items).toEqual(['1. Що вище? — Говерла', '2. Що довше? — Дунай']);
    expect(container.querySelector('.moreless-pick')).toBeNull();
    expect(container.textContent).not.toMatch(/[✓✗]/);
    expect(container.querySelector('button')).toBeNull();
  });

  it('names who is choosing from the rows, also before the first pick', () => {
    const info: MoreLessInfo = { rows: [{ playerId: 'p1', nickname: 'Оля', done: 0, total: 3, right: null, points: null }], pairs: null, picks: null, watch: { playerId: 'p1', done: 0, picks: [] } };
    const { container } = render(<MoreLessWatch info={info} question={question} />);
    expect(container.querySelector('.moreless-watch-chooser')?.textContent).toBe('Вибирає Оля');
  });

  it('shows done when the row is finished and nothing without a watch', () => {
    const { container, rerender } = render(<MoreLessWatch info={watchInfo(3, ['a', 'b', 'a'])} question={question} />);
    expect(container.querySelector('.moreless-done')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Що глибше?' })).toBeNull();
    rerender(<MoreLessWatch info={{ rows: [], pairs: null, picks: null }} question={question} />);
    expect(container.firstChild).toBeNull();
  });
});
