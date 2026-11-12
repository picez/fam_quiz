// @vitest-environment jsdom
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerQuest, QuestInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { QuestButton, QuestLock, QuestPanel } from './QuestView';

afterEach(cleanup);

const info = (over: Partial<QuestInfo> = {}): QuestInfo => ({
  prompt: 'Нічний птах — символ мудрості',
  length: 4,
  tries: 3,
  count: 5,
  bonus: { kind: 'points', points: 1200 },
  stage: 'play',
  code: null,
  endsAt: null,
  remainingMs: null,
  shareNow: 1,
  rows: [],
  ...over,
});

const mine = (over: Partial<PlayerQuest> = {}): PlayerQuest => ({ slots: [null, null, null, null], tries: [], left: 3, canEnter: true, solved: null, ...over });

const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;

const cells = () => [...document.querySelectorAll<HTMLElement>('.quest-cell')];
const field = () => screen.getByLabelText('Код') as HTMLInputElement;
const enter = () => screen.getByRole('button', { name: 'Відкрити скриню' });

describe('QuestLock', () => {
  it('the lock shows own characters only', () => {
    const { unmount } = render(<QuestLock length={4} slots={['С', null, 'В', 'А']} />);
    expect(cells()).toHaveLength(4);
    expect(cells().map((cell) => cell.textContent)).toEqual(['С', '', 'В', 'А']);
    expect(document.querySelectorAll('.quest-cell.is-empty')).toHaveLength(1);
    unmount();
    const empty = render(<QuestLock length={4} />);
    expect(cells()).toHaveLength(4);
    expect(document.querySelectorAll('.quest-cell.is-empty')).toHaveLength(4);
    empty.unmount();
    render(<QuestLock length={4} code="СОВА" />);
    expect(cells().map((cell) => cell.textContent)).toEqual(['С', 'О', 'В', 'А']);
  });

  it('shows the opening order small when given', () => {
    render(<QuestLock length={4} order={[2, 0, 3, 1]} />);
    expect([...document.querySelectorAll('.quest-cell-order')].map((el) => el.textContent)).toEqual(['2', '4', '1', '3']);
  });
});

describe('QuestPanel', () => {
  it('entering sends the raw text and clears on success', async () => {
    const send = okSend();
    render(<QuestPanel info={info()} mine={mine()} paused={false} send={send} />);
    expect(screen.getByText('Нічний птах — символ мудрості')).toBeTruthy();
    expect(field().getAttribute('inputmode')).toBe('text');
    expect(field().getAttribute('autocapitalize')).toBe('characters');
    expect(field().getAttribute('autocomplete')).toBe('off');
    expect(field().maxLength).toBe(32);
    fireEvent.change(field(), { target: { value: ' сова ' } });
    await act(async () => void fireEvent.click(enter()));
    expect(send).toHaveBeenCalledWith('player:quest', { code: ' сова ' });
    expect(field().value).toBe('');
  });

  it('a refusal keeps the text and says why', async () => {
    let answer: { ok: false; error: string } = { ok: false, error: 'quest_length' };
    const send = vi.fn(async () => answer) as unknown as Send;
    render(<QuestPanel info={info()} mine={mine()} paused={false} send={send} />);
    fireEvent.change(field(), { target: { value: 'СОВ' } });
    await act(async () => void fireEvent.click(enter()));
    expect(field().value).toBe('СОВ');
    const status = document.querySelector('.quest-error')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Потрібно символів: 4');
    answer = { ok: false, error: 'quest_repeat' };
    await act(async () => void fireEvent.click(enter()));
    expect(status.textContent).toBe('Такий код уже пробували.');
  });

  it('a double tap sends one try', async () => {
    let resolve: (value: { ok: true }) => void = () => undefined;
    const send = vi.fn(() => new Promise<{ ok: true }>((done) => (resolve = done))) as unknown as Send;
    render(<QuestPanel info={info()} mine={mine()} paused={false} send={send} />);
    fireEvent.change(field(), { target: { value: 'СОВА' } });
    fireEvent.click(enter());
    // Кнопку не притлумлено на мить очікування.
    expect((enter() as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(enter());
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ ok: true }));
  });

  it('a wrong try that burned says so', async () => {
    const send = okSend();
    const { rerender } = render(<QuestPanel info={info()} mine={mine()} paused={false} send={send} />);
    fireEvent.change(field(), { target: { value: 'СОВИ' } });
    await act(async () => void fireEvent.click(enter()));
    rerender(<QuestPanel info={info()} mine={mine({ tries: ['СОВИ'], left: 2 })} paused={false} send={send} />);
    expect(screen.getByText('Не той код')).toBeTruthy();
  });

  it('tries and share are shown', () => {
    const { unmount } = render(<QuestPanel info={info({ shareNow: 0.5 })} mine={mine({ left: 2 })} paused={false} send={okSend()} />);
    expect(screen.getByText('Лишилися 2 спроби')).toBeTruthy();
    expect(screen.getByText('Зараз: 50 % бонусу')).toBeTruthy();
    unmount();
    render(<QuestPanel info={info({ bonus: { kind: 'buff', buff: 'fifty', first: null } })} mine={mine()} paused={false} send={okSend()} />);
    expect(screen.getByText('Бонус: баф «50/50»')).toBeTruthy();
  });

  it('the wrong tries are crossed out', () => {
    render(<QuestPanel info={info()} mine={mine({ tries: ['СОВИ'], left: 2 })} paused={false} send={okSend()} />);
    expect(screen.getByText('СОВИ').tagName).toBe('DEL');
  });

  it('solved and out', () => {
    const { unmount } = render(<QuestPanel info={info()} mine={mine({ solved: { after: 2, points: 800, buff: null }, canEnter: false })} paused={false} send={okSend()} />);
    expect(screen.getByText('Скриню відкрито! +800')).toBeTruthy();
    expect(screen.queryByLabelText('Код')).toBeNull();
    unmount();
    const buff = render(<QuestPanel info={info()} mine={mine({ solved: { after: 2, points: null, buff: 'fifty' }, canEnter: false })} paused={false} send={okSend()} />);
    expect(screen.getByText('Скриню відкрито! Ваш баф: «50/50»')).toBeTruthy();
    buff.unmount();
    const late = render(<QuestPanel info={info()} mine={mine({ solved: { after: 2, points: null, buff: null }, canEnter: false })} paused={false} send={okSend()} />);
    expect(screen.getByText('Скриню відкрито — бафи вже розібрали')).toBeTruthy();
    late.unmount();
    render(<QuestPanel info={info()} mine={mine({ left: 0, canEnter: false, tries: ['СОВИ', 'СОВУ', 'ЛИСА'] })} paused={false} send={okSend()} />);
    expect(screen.getByText('Спроби скінчилися')).toBeTruthy();
    expect(field().disabled).toBe(true);
    expect((enter() as HTMLButtonElement).disabled).toBe(true);
  });

  it('the button is off with an empty field or when entering is not allowed', () => {
    const { rerender } = render(<QuestPanel info={info()} mine={mine()} paused={false} send={okSend()} />);
    expect((enter() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(field(), { target: { value: 'СОВА' } });
    expect((enter() as HTMLButtonElement).disabled).toBe(false);
    rerender(<QuestPanel info={info()} mine={mine()} paused send={okSend()} />);
    expect((enter() as HTMLButtonElement).disabled).toBe(true);
    rerender(<QuestPanel info={info()} mine={mine({ canEnter: false })} paused={false} send={okSend()} />);
    expect((enter() as HTMLButtonElement).disabled).toBe(true);
  });

  it('the shown code', () => {
    const { unmount } = render(<QuestPanel info={info({ stage: 'shown', code: 'СОВА' })} mine={mine({ canEnter: false, solved: { after: 1, points: 1000, buff: null } })} paused={false} send={okSend()} />);
    expect(screen.getByText('Код: СОВА')).toBeTruthy();
    expect(document.querySelector('.quest-verdict')?.textContent).toBe('✓');
    expect(cells().map((cell) => cell.textContent)).toEqual(['С', 'О', 'В', 'А']);
    expect(screen.queryByLabelText('Код')).toBeNull();
    unmount();
    render(<QuestPanel info={info({ stage: 'shown', code: 'СОВА' })} mine={mine({ canEnter: false })} paused={false} send={okSend()} />);
    expect(document.querySelector('.quest-verdict')?.textContent).toBe('✗');
  });

  it('keeps a controlled draft', () => {
    const onValue = vi.fn();
    render(<QuestPanel info={info()} mine={mine()} paused={false} send={okSend()} value="СО" onValue={onValue} />);
    expect(field().value).toBe('СО');
    fireEvent.change(field(), { target: { value: 'СОВ' } });
    expect(onValue).toHaveBeenCalledWith('СОВ');
  });
});

describe('QuestButton', () => {
  it('the header pill opens the sheet', () => {
    const { rerender } = render(<QuestButton info={info()} mine={mine({ slots: ['С', null, 'В', 'А'] })} paused={false} send={okSend()} />);
    const pill = screen.getByRole('button', { name: '🔐 3/4' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(pill);
    const sheet = screen.getByRole('dialog');
    expect(sheet.textContent).toContain('Нічний птах — символ мудрості');
    expect(sheet.querySelector('.quest-panel')).not.toBeNull();
    // Портал у body, position: fixed — поза шапкою.
    expect(sheet.closest('header')).toBeNull();
    rerender(<QuestButton info={info()} mine={mine({ slots: ['С', null, 'В', 'А'] })} paused send={okSend()} />);
    fireEvent.change(field(), { target: { value: 'СОВА' } });
    expect((enter() as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('QuestView CSS', () => {
  it('fits 320 px', () => {
    render(<QuestLock length={8} />);
    expect(cells()).toHaveLength(8);
    for (const el of document.querySelectorAll<HTMLElement>('.quest-lock, .quest-cell')) expect(el.style.width).toBe('');
    const css = cssSection();
    for (const [, value, unit] of css.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    const gap = Number(/--quest-gap:\s*([\d.]+)px/.exec(css)![1]);
    const max = Number(/--quest-cell-max:\s*([\d.]+)rem/.exec(css)![1]) * 16;
    expect(css).toMatch(/\.quest-lock \{[^}]*container-type:\s*inline-size/);
    expect(css).toMatch(/--quest-cell:\s*min\(var\(--quest-cell-max\), calc\(\(100cqi - 7 \* var\(--quest-gap\)\) \/ 8\)\);/);
    expect(css).toMatch(/\.quest-lock-row \{[^}]*grid-template-columns:\s*repeat\(var\(--quest-length\), var\(--quest-cell\)\)/);
    // Найгірше: 8 комірок у полі 320 − 2·12.
    const cell = Math.min(max, (320 - 2 * 12 - 7 * gap) / 8);
    expect(cell).toBeLessThanOrEqual((320 - 2 * 12 - 7 * 4) / 8);
    expect(8 * cell + 7 * gap).toBeLessThanOrEqual(320);
    // Поле й кнопка не ширші за свій рядок.
    expect(css).toMatch(/\.quest-input \{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.quest-form \{[^}]*flex-wrap:\s*wrap/);
  });
});

function cssSection(): string {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  const start = css.indexOf('/* «Квест із кодом»: телефон (29g)');
  expect(start).toBeGreaterThan(0);
  return css.slice(start, css.indexOf('/* «Квест із кодом»: кінець телефона */'));
}
