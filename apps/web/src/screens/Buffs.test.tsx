// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuffBlock, BuffKind, PlayerActiveBuff, PlayerBuffs, PublicQuestion, VotePrompt, VoteTally } from '@quiz/shared';
// Vitest підміняє CSS порожнім рядком (і з ?raw), тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import type { Send } from '../live/types';
import { BuffPanel, BuffRow, OvertimeLine, RetryPrompt, StageBuffs, VoteSheet } from './Buffs';

const NOW = 1_000_000;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const ready: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'ready', block: null },
    { kind: 'double', state: 'ready', block: null },
    { kind: 'shield', state: 'blocked', block: 'unfit_penalty' },
  ],
  active: null,
};

const active: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'active', block: null },
    { kind: 'double', state: 'blocked', block: 'taken' },
    { kind: 'shield', state: 'blocked', block: 'taken' },
  ],
  active: { kind: 'fifty', removed: ['a'], retry: null, first: null, hint: null, votes: null, spare: false },
};

const used: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'used', block: 'used' },
    { kind: 'double', state: 'used', block: 'used' },
    { kind: 'shield', state: 'used', block: 'used' },
  ],
  active: null,
};

const blocked: PlayerBuffs = {
  slots: [
    { kind: 'fifty', state: 'blocked', block: 'answered' },
    { kind: 'double', state: 'blocked', block: 'answered' },
    { kind: 'shield', state: 'blocked', block: 'answered' },
  ],
  active: null,
};

const question: PublicQuestion = {
  type: 'numeric',
  text: 'Скільки?',
  imageUrl: null,
  video: null,
  timeLimit: 20,
  points: 1000,
  choices: [],
  right: [],
  chain: null,
  sort: null,
  orderLabels: null,
};

const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;

function row(buffs: PlayerBuffs, over: { paused?: boolean; timeOver?: boolean; send?: Send } = {}) {
  const send = over.send ?? okSend();
  const onError = vi.fn();
  const result = render(<BuffRow buffs={buffs} paused={over.paused ?? false} timeOver={over.timeOver} send={send} onError={onError} />);
  return { send, onError, ...result };
}

const why = () => document.querySelector('.buff-why')!;

describe('Buffs', () => {
  it('in a blitz the buff row is one compact line that says there are no buffs', () => {
    const off = (block: 'off_blitz' | 'off_blitz_cell'): PlayerBuffs => ({
      slots: [
        { kind: 'fifty', state: 'blocked', block },
        { kind: 'double', state: 'used', block: 'used' },
        { kind: 'shield', state: 'blocked', block },
      ],
      active: null,
    });
    const { container, unmount } = row(off('off_blitz'));
    expect(container.querySelector('.buff-row')).toBeNull();
    expect(container.querySelectorAll('button')).toHaveLength(1);
    expect(container.querySelector('.buff-bar.is-off .buff-help')).not.toBeNull();
    expect(container.querySelector('.buff-bar.is-off .buff-off')?.textContent).toBe('У бліці бафів немає.');
    unmount();
    row(off('off_blitz_cell'));
    expect(document.querySelector('.buff-off')?.textContent).toBe('На бліц-клітинках бафів немає.');
    cleanup();
    // У фіналі, ланцюжку й сортуванні — звичайний ряд неактивних кнопок.
    row({ slots: [{ kind: 'fifty', state: 'blocked', block: 'off_final' }], active: null });
    expect(document.querySelectorAll('.buff-row button')).toHaveLength(1);
    expect(document.querySelector('.buff-off')).toBeNull();
  });

  it('the buff row keeps its size in every state', () => {
    const shapes = [ready, active, used, blocked].map((buffs) => {
      const { container, unmount } = row(buffs);
      const buttons = [...container.querySelectorAll('.buff-row button')];
      expect(container.querySelector('.buff-why')).not.toBeNull();
      const shape = { count: buttons.length, why: container.querySelectorAll('.buff-why').length };
      if (buffs === used || buffs === blocked) {
        for (const button of buttons) {
          expect(button.getAttribute('aria-disabled')).toBe('true');
          expect(button.hasAttribute('disabled')).toBe(false);
        }
      }
      unmount();
      return shape;
    });
    expect(new Set(shapes.map((s) => JSON.stringify(s))).size).toBe(1);
    expect(shapes[0]).toEqual({ count: 3, why: 1 });
    // Порожній рядок пояснень однаково на місці.
    row(ready);
    expect(why().textContent).toBe('');
  });

  it('the used button is crossed out, the active one is marked and says it works', () => {
    row(active);
    expect(screen.getByRole('button', { name: '50/50' }).className).toContain('is-active');
    expect(why().textContent).toBe('½ 50/50: діє на цьому запитанні');
    cleanup();
    row(used);
    expect(screen.getByRole('button', { name: 'Щит' }).className).toContain('is-used');
  });

  it('two taps take a buff; one tap explains a blocked one', async () => {
    const { send } = row(ready);
    fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(why().textContent).toBe('Ще раз — узяти «50/50»');
    expect(send).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    });
    expect(send).toHaveBeenCalledWith('player:buff', { kind: 'fifty' });
    expect(send).toHaveBeenCalledTimes(1);
    cleanup();

    // Через 3 с підтвердження зникає: наступний дотик знову лише перший.
    const second = row(ready);
    fireEvent.click(screen.getByRole('button', { name: 'Подвійні бали' }));
    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(why().textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Подвійні бали' }));
    expect(second.send).not.toHaveBeenCalled();
    expect(why().textContent).toBe('Ще раз — узяти «Подвійні бали»');

    // Дотик неактивної — причина, без надсилання.
    fireEvent.click(screen.getByRole('button', { name: 'Щит' }));
    expect(why().textContent).toBe('Щит не потрібен: у цьому раунді помилка не коштує балів.');
    fireEvent.click(screen.getByRole('button', { name: 'Щит' }));
    expect(second.send).not.toHaveBeenCalled();
    cleanup();

    // На паузі готові кнопки не шлють нічого.
    const paused = row(ready, { paused: true });
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(paused.send).not.toHaveBeenCalled();
    expect(why().textContent).toBe('Гру поставлено на паузу.');
    expect(screen.getByRole('button', { name: '50/50' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('a refused buff shows the server reason', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'buff_busy' })) as unknown as Send;
    const { onError } = row(ready, { send });
    fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    });
    expect(onError).toHaveBeenLastCalledWith('На це запитання баф уже взято.');
  });

  it('after the own deadline ready and unfit buttons say the time is over, used and taken stay', () => {
    const { send } = row(
      {
        slots: [
          { kind: 'fifty', state: 'ready', block: null },
          { kind: 'double', state: 'used', block: 'used' },
          { kind: 'shield', state: 'blocked', block: 'unfit_penalty' },
        ],
        active: null,
      },
      { timeOver: true },
    );
    expect(screen.getByRole('button', { name: '50/50' }).getAttribute('aria-disabled')).toBe('true');
    for (let i = 0; i < 2; i++) fireEvent.click(screen.getByRole('button', { name: '50/50' }));
    expect(send).not.toHaveBeenCalled();
    expect(why().textContent).toBe('Час вийшов.');
    fireEvent.click(screen.getByRole('button', { name: 'Щит' }));
    expect(why().textContent).toBe('Час вийшов.');
    fireEvent.click(screen.getByRole('button', { name: 'Подвійні бали' }));
    expect(why().textContent).toBe('Уже використано.');
  });

  it('retry prompt: again or keep / more', async () => {
    const send = okSend();
    const again: PlayerActiveBuff = { kind: 'retry', removed: [], retry: 'again', first: { answer: { type: 'numeric', value: 3 }, points: 0 }, hint: null, votes: null, spare: false };
    render(<RetryPrompt active={again} question={question} send={send} onError={vi.fn()} />);
    expect(screen.getByText('Неправильно, ще одна спроба')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
    cleanup();

    const choice: PlayerActiveBuff = { kind: 'retry', removed: [], retry: 'choice', first: { answer: { type: 'numeric', value: 42 }, points: 750 }, hint: null, votes: null, spare: false };
    render(<RetryPrompt active={choice} question={question} send={send} onError={vi.fn()} />);
    expect(screen.getByText(/Частково правильно: \+750\. Залишити чи ще спроба\?/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Залишити' }));
    });
    expect(send).toHaveBeenCalledWith('player:retry', { keep: true });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ще спроба' }));
    });
    expect(send).toHaveBeenCalledWith('player:retry', { keep: false });
    cleanup();

    // На паузі вибір чекає: обидві кнопки вимкнено.
    send.mockClear();
    render(<RetryPrompt active={choice} question={question} send={send} onError={vi.fn()} paused />);
    for (const name of ['Залишити', 'Ще спроба']) {
      const button = screen.getByRole('button', { name }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    expect(send).not.toHaveBeenCalled();
    cleanup();

    const none = render(<RetryPrompt active={{ ...choice, retry: 'armed', first: null }} question={question} send={send} onError={vi.fn()} />);
    expect(none.container.firstChild).toBeNull();
  });

  it('overtime line counts down the personal deadline', () => {
    render(<OvertimeLine rows={[{ playerId: 'p2', nickname: 'Оля', deadline: NOW + 24_000, remainingMs: null }]} offsetMs={0} />);
    const line = screen.getByTitle('Чекаємо: Оля · 0:24');
    expect(line.getAttribute('aria-label')).toBe('Чекаємо: Оля · 0:24');
    // Вузький екран обрізає ім'я, а не відлік: час — окремий шматок, що не стискається.
    expect(line.querySelector('.buff-wait-names')?.textContent).toBe('Чекаємо: Оля');
    expect(line.querySelector('.buff-wait-time')?.textContent).toBe(' · 0:24');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTitle('Чекаємо: Оля · 0:23').textContent).toBe('Чекаємо: Оля · 0:23');
    cleanup();
    render(<OvertimeLine rows={[{ playerId: 'p2', nickname: 'Оля', deadline: null, remainingMs: 65_000 }]} offsetMs={0} />);
    expect(screen.getByTitle('Чекаємо: Оля · 1:05')).toBeTruthy();
    cleanup();
    const empty = render(<OvertimeLine rows={[]} offsetMs={0} />);
    expect(empty.container.firstChild).toBeNull();
  });

  it('several players with extra time share one line', () => {
    const { container } = render(
      <OvertimeLine
        rows={[
          { playerId: 'p2', nickname: 'Оля', deadline: NOW + 24_000, remainingMs: null },
          { playerId: 'p3', nickname: 'Петро', deadline: NOW + 12_000, remainingMs: null },
        ]}
        offsetMs={0}
      />,
    );
    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.textContent).toBe('Чекаємо: Оля · 0:24, Петро · 0:12');
    expect(container.querySelector('.buff-wait-time')?.textContent).toBe(' · 0:12');
  });

  it('the again prompt stands in the explanation line, not above the options', () => {
    row({ ...active, active: { kind: 'retry', removed: [], retry: 'again', first: { answer: null, points: 0 }, hint: null, votes: null, spare: false } });
    expect(why().textContent).toBe('Неправильно, ще одна спроба');
  });
});

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

/** Тіло першого правила з точно цим селектором у styles.css. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

const single: PublicQuestion = {
  ...question,
  type: 'single',
  text: 'Столиця України?',
  choices: [
    { id: 'a', text: 'Львів' },
    { id: 'b', text: 'Київ' },
    { id: 'c', text: 'Одеса' },
    { id: 'd', text: 'Харків' },
  ],
};
const text: PublicQuestion = { ...question, type: 'text' };

const base: PlayerActiveBuff = { kind: 'hint', removed: [], retry: null, first: null, hint: null, votes: null, spare: false };
const tally = (over: Partial<VoteTally> = {}): VoteTally => ({ endsAt: NOW + 15_000, remainingMs: null, closed: false, cast: 0, counts: {}, guesses: [], ...over });
const audience = (votes: VoteTally): PlayerActiveBuff => ({ ...base, kind: 'audience', votes });

describe('BuffPanel', () => {
  it('the buff panel keeps its size for waiting, text, votes and guesses', () => {
    const cases: [PlayerActiveBuff, PublicQuestion, string][] = [
      [{ ...base, hint: { state: 'waiting', text: null } }, single, 'Ведучий думає…'],
      [{ ...base, hint: { state: 'text', text: 'Д'.repeat(200) } }, single, `? ${'Д'.repeat(200)}`],
      [{ ...base, hint: { state: 'aloud', text: null } }, single, 'Ведучий підказав уголос'],
      [audience(tally()), single, 'Чекаємо голосів…'],
      [audience(tally({ cast: 2, counts: { b: 1, c: 1 } })), single, 'Київ'],
      [
        audience(tally({ cast: 6, guesses: ['А', 'Б', 'В', 'Г', 'Ґ', 'Д'].map((g) => ({ text: g, count: 1 })) })),
        text,
        'Здогадки залу: А ×1, Б ×1, В ×1, Г ×1, Ґ ×1, Д ×1',
      ],
    ];
    for (const [active, q, shown] of cases) {
      const { container, unmount } = render(<BuffPanel active={active} question={q} offsetMs={0} />);
      const panels = container.querySelectorAll('section');
      expect(panels).toHaveLength(1);
      expect(panels[0].className).toBe('buff-panel');
      expect(panels[0].getAttribute('aria-live')).toBe('polite');
      expect(panels[0].textContent).toContain(shown);
      unmount();
    }
    // Сталий розмір — у CSS: висота не залежить від вмісту, зайве прокручується всередині.
    const panel = rule('.buff-panel');
    expect(panel).toMatch(/(^|[;\s])height:\s*6\.5rem/);
    expect(panel).not.toMatch(/min-height|max-height/);
    expect(panel).toMatch(/overflow-y:\s*auto/);
    // До чотирьох варіантів — два стовпчики по два рядки: влазить без прокрутки; довгий текст обрізається.
    expect(rule('.vote-rows')).toMatch(/grid-template-columns:\s*repeat\(2,/);
    expect(rule('.vote-text')).toMatch(/text-overflow:\s*ellipsis/);
    // Інші бафи панелі не мають.
    const { container } = render(<BuffPanel active={{ ...base, kind: 'fifty' }} question={single} offsetMs={0} />);
    expect(container.innerHTML).toBe('');
  });

  it('votes show percentages per option, never which one is right', () => {
    const { container } = render(<BuffPanel active={audience(tally({ cast: 2, counts: { b: 1, c: 1 } }))} question={single} offsetMs={0} />);
    const rows = [...container.querySelectorAll('.vote-row')].map((row) => row.textContent);
    expect(rows).toEqual(['Львів 0 %', 'Київ 50 %', 'Одеса 50 %', 'Харків 0 %']);
    expect((container.querySelectorAll('.vote-bar')[1] as HTMLElement).style.width).toBe('50%');
    expect(container.querySelector('.correct, .is-right, .is-correct')).toBeNull();
    expect(container.textContent).toContain('Ще 0:15');
    cleanup();

    const yesNo = render(<BuffPanel active={audience(tally({ cast: 3, counts: { true: 2, false: 1 } }))} question={{ ...question, type: 'boolean' }} offsetMs={0} />);
    expect([...yesNo.container.querySelectorAll('.vote-row')].map((row) => row.textContent)).toEqual(['Так 67 %', 'Ні 33 %']);
    cleanup();

    const guesses = render(
      <BuffPanel active={audience(tally({ cast: 3, guesses: [{ text: 'Львів', count: 2 }, { text: 'Київ', count: 1 }] }))} question={text} offsetMs={0} />,
    );
    expect(guesses.container.textContent).toContain('Здогадки залу: Львів ×2, Київ ×1');
    cleanup();

    const closed = render(<BuffPanel active={audience(tally({ cast: 1, counts: { a: 1 }, closed: true }))} question={single} offsetMs={0} />);
    expect(closed.container.textContent).toContain('Голосування закінчено');
    cleanup();

    // Час сплив — теж закінчено, без нового зрізу.
    render(<BuffPanel active={audience(tally())} question={single} offsetMs={0} />);
    act(() => {
      vi.advanceTimersByTime(16_000);
    });
    expect(document.querySelector('.buff-panel')?.textContent).toContain('Голосування закінчено');
  });
});

describe('VoteSheet', () => {
  const prompt = (over: Partial<VotePrompt> = {}): VotePrompt => ({ asker: { playerId: 'p1', nickname: 'Оля' }, endsAt: Date.now() + 15_000, remainingMs: null, ...over });

  function sheet(current: VotePrompt | null, over: { paused?: boolean; send?: Send; q?: PublicQuestion } = {}) {
    const send = over.send ?? okSend();
    const onError = vi.fn();
    const props = { question: over.q ?? single, paused: over.paused ?? false, offsetMs: 0, send, onError };
    const result = render(<VoteSheet prompt={current} {...props} />);
    const again = (next: VotePrompt | null) => result.rerender(<VoteSheet prompt={next} {...props} />);
    return { send, onError, again, ...result };
  }

  it('the vote sheet is a compact strip that folds and unfolds', () => {
    const { again } = sheet(prompt());
    const toggle = screen.getByRole('button', { name: 'Згорнути' });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(toggle);
    expect(document.querySelector('.vote-sheet.is-collapsed')).not.toBeNull();
    expect(document.querySelector('.vote-sheet')?.textContent).toContain('Оля питає зал: як думаєте?');
    expect(screen.queryByRole('button', { name: 'Пропустити' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Розгорнути' }).getAttribute('aria-expanded')).toBe('false');
    // Живий регіон лишається й у згорнутому аркуші.
    expect(document.querySelector('.vote-live')?.textContent).toBe('Оля питає зал: як думаєте?');
    fireEvent.click(screen.getByRole('button', { name: 'Розгорнути' }));
    expect(screen.getByRole('button', { name: 'Пропустити' })).toBeTruthy();
    // Нове запрошення від іншого гравця — аркуш знову розгорнутий.
    fireEvent.click(screen.getByRole('button', { name: 'Згорнути' }));
    again(prompt({ asker: { playerId: 'p2', nickname: 'Петро' } }));
    expect(document.querySelector('.vote-sheet.is-collapsed')).toBeNull();
    expect(screen.getByRole('button', { name: 'Пропустити' })).toBeTruthy();
    expect(rule('.vote-sheet')).toContain('max-height: 35vh');
    expect(rule('.removed-tag')).toContain('position: absolute');
  });

  it('the vote sheet sends a ballot, thanks, and can be skipped', async () => {
    const { send, again } = sheet(prompt());
    expect(document.querySelector('.vote-sheet strong')?.textContent).toBe('Оля питає зал: як думаєте?');
    const live = document.querySelector('.vote-live')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('Оля питає зал: як думаєте?');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    });
    expect(send).toHaveBeenCalledWith('player:vote', { askerId: 'p1', answer: { type: 'single', optionId: 'b' } });
    expect(document.querySelector('.vote-thanks')?.textContent).toBe('Голос прийнято');
    // Той самий живий регіон, що оголосив аркуш, оголошує й подяку: він не перемонтовується.
    expect(document.querySelector('.vote-live')).toBe(live);
    expect(live.textContent).toBe('Голос прийнято');
    // Зріз прибирає запрошення, а подяка ще стоїть 1,5 с.
    again(null);
    expect(document.querySelector('.vote-thanks')?.textContent).toBe('Голос прийнято');
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(document.querySelector('.vote-sheet')).toBeNull();
    expect(document.querySelector('.vote-live')).toBe(live);
    expect(live.textContent).toBe('');
    cleanup();

    // «Пропустити» ховає аркуш; запрошення від іншого гравця — знову аркуш.
    const skip = sheet(prompt());
    fireEvent.click(screen.getByRole('button', { name: 'Пропустити' }));
    expect(document.querySelector('.vote-sheet')).toBeNull();
    expect(skip.send).not.toHaveBeenCalled();
    skip.again(prompt());
    expect(document.querySelector('.vote-sheet')).toBeNull();
    skip.again(prompt({ asker: { playerId: 'p3', nickname: 'Петро' } }));
    expect(document.querySelector('.vote-sheet strong')?.textContent).toBe('Петро питає зал: як думаєте?');
    cleanup();

    // Час сплив — аркуш зник.
    sheet(prompt());
    act(() => {
      vi.advanceTimersByTime(15_001);
    });
    expect(document.querySelector('.vote-sheet')).toBeNull();
    cleanup();

    // Пауза — кнопки вимкнено.
    sheet(prompt({ endsAt: null, remainingMs: 9000 }), { paused: true });
    expect(screen.getByRole('button', { name: /Київ/ }).matches(':disabled')).toBe(true);
    expect(screen.getByText(/Ще 0:09/)).toBeTruthy();
    cleanup();

    // Текст — поле в label.field і «Голосувати».
    const typed = sheet(prompt(), { q: text });
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Львів' } });
    expect(document.querySelector('.vote-sheet label.field input')).not.toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Голосувати' }));
    });
    expect(typed.send).toHaveBeenCalledWith('player:vote', { askerId: 'p1', answer: { type: 'text', value: 'Львів' } });
  });

  it('multi and numeric questions vote with their own inputs', async () => {
    const multiQ: PublicQuestion = { ...single, type: 'multi' };
    const many = sheet(prompt(), { q: multiQ });
    fireEvent.click(screen.getByRole('button', { name: /Київ/ }));
    fireEvent.click(screen.getByRole('button', { name: /Одеса/ }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Голосувати' }));
    });
    expect(many.send).toHaveBeenCalledWith('player:vote', { askerId: 'p1', answer: { type: 'multi', optionIds: ['b', 'c'] } });
    cleanup();

    const numericQ: PublicQuestion = { ...question, type: 'numeric' };
    const number = sheet(prompt(), { q: numericQ });
    fireEvent.change(document.querySelector('.vote-sheet input')!, { target: { value: '1991' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Голосувати' }));
    });
    expect(number.send).toHaveBeenCalledWith('player:vote', { askerId: 'p1', answer: { type: 'numeric', value: 1991 } });
  });

  it('the vote sheet is fixed and does not take room in the page', () => {
    sheet(prompt());
    expect(document.querySelector('.vote-sheet')).not.toBeNull();
    const body = rule('.vote-sheet');
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/max-height:\s*35vh/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });
});

describe('StageBuffs', () => {
  it('the swap tag on the stage uses the spare colour', () => {
    render(
      <StageBuffs
        buffs={[
          { playerId: 'p1', nickname: 'Оля', kind: 'swap' },
          { playerId: 'p2', nickname: 'Петро', kind: 'hint' },
        ]}
      />,
    );
    const [swap, hint] = [...document.querySelectorAll('.stage-buffs li')];
    expect(swap.className).toBe('is-swap');
    expect(hint.className).toBe('');
    expect(rule('.stage-buffs li.is-swap')).toMatch(/var\(--spare-accent\)/);
  });

  it('«?» lists what each allowed buff does and where it works', () => {
    const slots = (kinds: BuffKind[]): PlayerBuffs => ({ slots: kinds.map((kind) => ({ kind, state: 'ready' as const, block: null })), active: null });
    row(slots(['fifty', 'audience']));
    expect(document.querySelectorAll('.buff-row .buff-btn')).toHaveLength(2);
    const opener = screen.getByRole('button', { name: 'Що роблять бафи' });
    fireEvent.click(opener);
    const sheet = screen.getByRole('dialog', { name: 'Бафи' });
    expect(within(sheet).getByText('Прибирає частину неправильних варіантів.')).toBeTruthy();
    expect(within(sheet).getByText('Де: запитання з варіантами — у класиці й на полі, і на усних клітинках.')).toBeTruthy();
    expect(within(sheet).getByText('Інші гравці підказують, як думають; вам +15 с.')).toBeTruthy();
    expect(within(sheet).queryByText(/Подвоює бали/)).toBeNull();
    expect(within(sheet).getByText('Не діють: бліц, бліц-клітинки, фінал, ланцюжок, сортування й дуелі.')).toBeTruthy();
    expect(document.activeElement).toBe(within(sheet).getByRole('button', { name: 'Закрити' }));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    fireEvent.click(document.querySelector('.buff-help-backdrop')!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a disabled button says exactly why', () => {
    const blockedOf = (kind: BuffKind, block: BuffBlock): PlayerBuffs => ({ slots: [{ kind, state: 'blocked', block }], active: null });
    const whyOf = (buffs: PlayerBuffs, name: string) => {
      const { unmount } = row(buffs);
      fireEvent.click(screen.getByRole('button', { name }));
      const text = document.querySelector('.buff-why')?.textContent;
      unmount();
      return text;
    };
    expect(whyOf(blockedOf('double', 'off_final'), 'Подвійні бали')).toBe('У фіналі бафів немає.');
    expect(whyOf(blockedOf('fifty', 'unfit_type'), '50/50')).toBe('50/50 діє лише на запитаннях з варіантами.');
    expect(whyOf(blockedOf('retry', 'unfit_voice'), 'Друга спроба')).toBe('Друга спроба не діє, коли відповідаєте вголос.');
    expect(whyOf(blockedOf('swap', 'spares_out'), 'Заміна запитання')).toBe('Запасні запитання закінчилися.');
  });

  it('the help sheet is a fixed layer above the vote sheet', () => {
    expect(rule('.buff-help-sheet')).toContain('position: fixed');
    expect(rule('.buff-help-sheet')).toContain('z-index: 75');
    expect(rule('.buff-help-backdrop')).toContain('position: fixed');
  });
});
