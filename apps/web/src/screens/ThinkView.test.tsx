// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostThink, PlayerThink, PublicQuestion, StageView, ThinkInfo, ThinkRow } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import { HostThinkAnswers, HostThinkWords, ThinkHearts, ThinkInput, ThinkPhoneVerdict, ThinkPlaces, ThinkReveal, ThinkStage } from './ThinkView';

afterEach(cleanup);

const question = { type: 'think', text: 'Напишіть колір веселки', imageUrl: null, video: null, timeLimit: 30, points: 0, choices: [] } as unknown as PublicQuestion;
const alive: PlayerThink = { lives: 3, status: 'alive', verdict: null, place: null };
const row = (over: Partial<ThinkRow> = {}): ThinkRow => ({ id: 'p1', nickname: 'Олена', lives: 3, out: false, answered: false, answer: null, verdict: null, lost: false, overridden: false, ...over });
const info = (over: Partial<ThinkInfo> = {}): ThinkInfo => ({ lives: 3, points: 10000, index: 0, total: 5, rows: [row(), row({ id: 'p2', nickname: 'Хосе' })], words: null, places: null, ...over });
const host = (over: Partial<HostThink> = {}): HostThink => ({ ...info(), draft: [], editable: true, canReveal: false, answers: [], ...over });
const okSend = () => vi.fn<Send>(async () => ({ ok: true as const }));

describe('ThinkInput (phone)', () => {
  it('the phone sends one word once', async () => {
    const send = okSend();
    render(<ThinkInput question={question} think={alive} disabled={false} send={send} />);
    fireEvent.change(screen.getByLabelText(t('thinkInputLabel')), { target: { value: ' Зелений ' } });
    fireEvent.click(screen.getByRole('button', { name: t('thinkSend') }));
    fireEvent.click(screen.getByRole('button', { name: t('thinkSend') }));
    expect(await screen.findByText(t('thinkSent', { word: 'Зелений' }))).toBeTruthy();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'think', value: 'Зелений' });
  });

  it('a refusal shows the reason', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false as const, error: 'think_out' }));
    render(<ThinkInput question={question} think={alive} disabled={false} send={send} />);
    fireEvent.change(screen.getByLabelText(t('thinkInputLabel')), { target: { value: 'Зелений' } });
    fireEvent.click(screen.getByRole('button', { name: t('thinkSend') }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('У вас не лишилося життів — ви глядач.'));
  });

  it('the field keeps maxLength 40 and an empty word cannot be sent', () => {
    render(<ThinkInput question={question} think={alive} disabled={false} send={okSend()} />);
    expect((screen.getByLabelText(t('thinkInputLabel')) as HTMLInputElement).maxLength).toBe(40);
    expect((screen.getByRole('button', { name: t('thinkSend') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the spectator and the eliminated get no field', () => {
    const { rerender } = render(<ThinkInput question={question} think={{ ...alive, status: 'spectator' }} disabled={false} send={okSend()} />);
    expect(screen.getByText(t('thinkSpectator'))).toBeTruthy();
    expect(screen.queryByLabelText(t('thinkInputLabel'))).toBeNull();
    rerender(<ThinkInput question={question} think={{ ...alive, status: 'spectator' }} disabled={false} send={okSend()} author />);
    expect(screen.getByText(t('thinkSpectatorAuthor'))).toBeTruthy();
    rerender(<ThinkInput question={question} think={{ ...alive, lives: 0, status: 'out' }} disabled={false} send={okSend()} />);
    expect(screen.getByText(t('thinkOutNow'))).toBeTruthy();
    expect(screen.queryByLabelText(t('thinkInputLabel'))).toBeNull();
  });

  it('an accepted word from the view shows instead of the field', () => {
    render(<ThinkInput question={question} think={alive} disabled={false} send={okSend()} answer="Синій" />);
    expect(screen.getByText(t('thinkSent', { word: 'Синій' }))).toBeTruthy();
  });
});

describe('ThinkPhoneVerdict', () => {
  it('the phone verdict on reveal', () => {
    const { rerender } = render(<ThinkPhoneVerdict think={{ ...alive, verdict: 'safe' }} />);
    expect(screen.getByText('Ви в безпеці')).toBeTruthy();
    rerender(<ThinkPhoneVerdict think={{ ...alive, lives: 2, verdict: 'hit' }} />);
    expect(screen.getByText('Збіг: −1 ❤️')).toBeTruthy();
    expect(screen.queryByText(t('thinkOutNow'))).toBeNull();
    rerender(<ThinkPhoneVerdict think={{ ...alive, lives: 0, status: 'out', verdict: 'hit' }} />);
    expect(screen.getByText(t('thinkOutNow'))).toBeTruthy();
    rerender(<ThinkPhoneVerdict think={{ ...alive, lives: 2, verdict: 'empty' }} />);
    expect(screen.getByText('Без відповіді: −1 ❤️')).toBeTruthy();
  });
});

describe('ThinkHearts', () => {
  it('hearts show lives out of the start', () => {
    const { container } = render(<ThinkHearts lives={1} max={3} />);
    expect(screen.getByRole('img', { name: 'Життя: 1' })).toBeTruthy();
    expect(container.querySelectorAll('.think-heart')).toHaveLength(3);
    expect(container.querySelectorAll('.think-heart.is-gone')).toHaveLength(2);
  });

  it('many lives become a compact count', () => {
    const { container } = render(<ThinkHearts lives={7} max={10} />);
    expect(container.querySelector('.think-hearts.is-compact')?.textContent).toBe('❤️7');
  });
});

describe('HostThinkWords', () => {
  it('the host saves words and is locked after the timer', async () => {
    const send = okSend();
    const { rerender } = render(<HostThinkWords think={host()} phase="question" send={send} />);
    // Порожній список — одне порожнє поле одразу.
    expect((screen.getByLabelText(t('thinkWordLabel', { index: 1 })) as HTMLInputElement).value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: t('thinkAddWord') }));
    fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'червоний' } });
    fireEvent.change(screen.getAllByLabelText(t('thinkSynonymsLabel'))[0]!, { target: { value: 'багряний, алий' } });
    fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 2 })), { target: { value: ' синій ' } });
    // Новий зріз з тими самими словами (поки ведучий пише) поле не скидає.
    rerender(<HostThinkWords think={host({ answers: [] })} phase="question" send={send} />);
    expect((screen.getByLabelText(t('thinkWordLabel', { index: 1 })) as HTMLInputElement).value).toBe('червоний');
    fireEvent.click(screen.getByRole('button', { name: t('thinkHostSave') }));
    await waitFor(() =>
      expect(send).toHaveBeenCalledWith('host:think-words', {
        words: [
          { word: 'червоний', synonyms: ['багряний', 'алий'] },
          { word: 'синій', synonyms: [] },
        ],
      }),
    );
    const saved = [{ word: 'червоний', synonyms: ['багряний', 'алий'] }];
    rerender(<HostThinkWords think={host({ draft: saved, editable: false })} phase="locked" send={send} />);
    expect(screen.getByText(t('thinkHostLocked'))).toBeTruthy();
    expect((screen.getByLabelText(t('thinkWordLabel', { index: 1 })) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: t('thinkHostSave') })).toBeNull();
  });

  it('typed words save themselves while the timer runs', async () => {
    vi.useFakeTimers();
    try {
      const send = okSend();
      render(<HostThinkWords think={host()} phase="question" send={send} />);
      fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'черв' } });
      await vi.advanceTimersByTimeAsync(300);
      fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'червоний' } });
      await vi.advanceTimersByTimeAsync(300);
      expect(send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('host:think-words', { words: [{ word: 'червоний', synonyms: [] }] });
    } finally {
      vi.useRealTimers();
    }
  });

  it('locked words show what is in effect, not an unsaved draft', () => {
    vi.useFakeTimers();
    try {
      const send = okSend();
      const { rerender } = render(<HostThinkWords think={host({ draft: [{ word: 'синій', synonyms: [] }] })} phase="question" send={send} />);
      fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'зелений' } });
      // Таймер закрив питання раніше, ніж спрацювало автозбереження: діють старі слова.
      rerender(<HostThinkWords think={host({ draft: [{ word: 'синій', synonyms: [] }], editable: false })} phase="locked" send={send} />);
      expect((screen.getByLabelText(t('thinkWordLabel', { index: 1 })) as HTMLInputElement).value).toBe('синій');
      vi.advanceTimersByTime(2000);
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('after the timer with no words the host still can write one', () => {
    render(<HostThinkWords think={host({ draft: [], editable: true })} phase="locked" send={okSend()} />);
    expect(screen.getByText(t('thinkHostLate'))).toBeTruthy();
    expect((screen.getByLabelText(t('thinkWordLabel', { index: 1 })) as HTMLInputElement).disabled).toBe(false);
  });
});

describe('HostThinkAnswers', () => {
  const answers: HostThink['answers'] = [
    { id: 'p1', nickname: 'Олена', answer: 'Червона', hit: true, overridden: false },
    { id: 'p2', nickname: 'Хосе', answer: 'Зелений', hit: false, overridden: false },
    { id: 'p3', nickname: 'Іра', answer: null, hit: null, overridden: false },
  ];

  it('the host marks a match on reveal', async () => {
    const send = okSend();
    const { rerender } = render(<HostThinkAnswers think={host({ answers })} phase="question" send={send} />);
    expect(screen.getByText('Червона')).toBeTruthy();
    expect(screen.queryByRole('button', { name: `${t('thinkHostMarkSafe')}: Олена` })).toBeNull();
    rerender(<HostThinkAnswers think={host({ answers })} phase="reveal" send={send} />);
    // Назва кнопки — з ніком: зчитувач екрана чує, чию відповідь змінює.
    fireEvent.click(screen.getByRole('button', { name: `${t('thinkHostMarkSafe')}: Олена` }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p1', grade: 'correct' }));
    fireEvent.click(screen.getByRole('button', { name: `${t('thinkHostMarkHit')}: Хосе` }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:override', { playerId: 'p2', grade: 'wrong' }));
    // Без відповіді — без кнопок: 2 рядки з кнопками.
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });
});

describe('ThinkStage and ThinkReveal', () => {
  const stageView = (think: ThinkInfo) => ({ phase: 'question', question, think, endsAt: Date.now() + 20_000, remainingMs: null, limitMs: 30_000, paused: false, held: false, autopilot: false }) as unknown as StageView;

  it('the stage hides answers before reveal', () => {
    const think = info({ rows: [row({ answered: true }), row({ id: 'p2', nickname: 'Хосе' })] });
    const { container } = render(<ThinkStage view={stageView(think)} offsetMs={0} />);
    expect(screen.getByText('Напишіть колір веселки')).toBeTruthy();
    const rows = container.querySelectorAll('.think-row');
    expect(rows[0]!.querySelector('.think-answered')).toBeTruthy();
    expect(rows[1]!.querySelector('.think-answered')).toBeNull();
    expect(container.textContent).not.toContain('Зелений');
    expect(screen.getByText(t('thinkOf', { index: 1, total: 5 }))).toBeTruthy();
  });

  it('reveal shows the words and every answer', () => {
    const think = info({
      words: [{ word: 'червоний', synonyms: ['багряний'] }],
      rows: [row({ answer: 'Червона', verdict: 'hit', lives: 2, lost: true }), row({ id: 'p2', nickname: 'Хосе', answer: '', verdict: 'empty', lives: 2, lost: true }), row({ id: 'p3', nickname: 'Іра', answer: 'Зелений', verdict: 'safe' })],
    });
    const { container } = render(<ThinkReveal think={think} big />);
    expect(screen.getByText('червоний').tagName).toBe('STRONG');
    expect(screen.getByText('багряний').tagName).toBe('SMALL');
    expect(screen.getByText('Червона').closest('li')!.className).toContain('is-hit');
    expect(screen.getByText('Зелений').closest('li')!.className).toContain('is-safe');
    expect(screen.getByText('Хосе').closest('li')!.textContent).toContain('—');
    expect(container.querySelectorAll('.think-heart.is-lost')).toHaveLength(2);
    expect(container.querySelector('.think-overridden')).toBeNull();
  });

  it('a manual verdict is marked for everyone', () => {
    const think = info({ words: [{ word: 'червоний', synonyms: [] }], rows: [row({ answer: 'Червона', verdict: 'safe', overridden: true })] });
    render(<ThinkReveal think={think} big />);
    expect(screen.getByText('Червона').closest('li')!.querySelector('.think-overridden')?.textContent).toBe(t('thinkHostOverridden'));
  });

  it('places table', () => {
    const think = info({
      places: [
        { id: 'p2', nickname: 'Хосе', place: 1, lives: 2, outAt: null, points: 10000 },
        { id: 'p1', nickname: 'Олена', place: 2, lives: 0, outAt: 2, points: 0 },
      ],
    });
    render(<ThinkPlaces think={think} me="p1" />);
    expect(screen.getByText('1 місце')).toBeTruthy();
    expect(screen.getByText('Хосе')).toBeTruthy();
    expect(screen.getByText('+10000')).toBeTruthy();
    expect(screen.getByText('вибування на питанні 2')).toBeTruthy();
    expect(screen.getByText('Олена').closest('tr')!.className).toBe('is-me');
    expect(screen.queryByText(t('thinkTotalCol'))).toBeNull();
  });

  it('the stage places table carries the game total', () => {
    const think = info({
      places: [
        { id: 'p2', nickname: 'Хосе', place: 1, lives: 2, outAt: null, points: 10000 },
        { id: 'p1', nickname: 'Олена', place: 2, lives: 0, outAt: 2, points: 0 },
      ],
    });
    render(<ThinkPlaces think={think} totals={{ p1: 4200, p2: 10500 }} />);
    expect(screen.getByRole('columnheader', { name: t('thinkTotalCol') })).toBeTruthy();
    expect(screen.getByText('Олена').closest('tr')!.querySelector('.think-place-total')?.textContent?.replace(/\s/g, '')).toBe('4200');
    expect(screen.getByText('Хосе').closest('tr')!.querySelector('.think-place-total')?.textContent?.replace(/\s/g, '')).toBe('10500');
  });
});
