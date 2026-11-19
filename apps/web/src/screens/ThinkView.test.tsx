// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostThink, PlayerThink, PublicQuestion, StageView, ThinkInfo, ThinkRow } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import { HostThinkAnswers, HostThinkWords, ThinkHearts, ThinkInput, ThinkPhoneVerdict, ThinkPlaces, ThinkReveal, ThinkStage, ThinkVoteBallot } from './ThinkView';

afterEach(cleanup);

const question = { type: 'think', text: 'Напишіть колір веселки', imageUrl: null, video: null, timeLimit: 30, points: 0, choices: [] } as unknown as PublicQuestion;
const alive: PlayerThink = { lives: 3, status: 'alive', verdict: null, off: null, vote: null, place: null };
const row = (over: Partial<ThinkRow> = {}): ThinkRow => ({ id: 'p1', nickname: 'Олена', lives: 3, out: false, answered: false, answer: null, verdict: null, lost: false, overridden: false, matched: null, off: null, ...over });
const info = (over: Partial<ThinkInfo> = {}): ThinkInfo => ({ lives: 3, points: 10000, index: 0, total: 5, rows: [row(), row({ id: 'p2', nickname: 'Хосе' })], words: null, places: null, vote: null, ...over });
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

  it('after the timer with no words typing never saves by itself — only the button commits the one change', async () => {
    vi.useFakeTimers();
    try {
      const send = okSend();
      render(<HostThinkWords think={host({ draft: [], editable: true })} phase="locked" send={send} />);
      fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'чер' } });
      await vi.advanceTimersByTimeAsync(5000);
      expect(send).not.toHaveBeenCalled();
      fireEvent.change(screen.getByLabelText(t('thinkWordLabel', { index: 1 })), { target: { value: 'червоний' } });
      fireEvent.click(screen.getByRole('button', { name: t('thinkHostSave') }));
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith('host:think-words', { words: [{ word: 'червоний', synonyms: [] }] });
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
    { id: 'p1', nickname: 'Олена', answer: 'Червона', hit: true, overridden: false, off: null },
    { id: 'p2', nickname: 'Хосе', answer: 'Зелений', hit: false, overridden: false, off: null },
    { id: 'p3', nickname: 'Іра', answer: null, hit: null, overridden: false, off: null },
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
    // Без відповіді — без кнопок: 2 рядки по дві кнопки (вердикт і «не на тему»).
    expect(screen.getAllByRole('button')).toHaveLength(4);
  });

  it('no verdict tag while the host has no words yet', () => {
    const { rerender } = render(<HostThinkAnswers think={host({ answers, draft: [] })} phase="question" send={okSend()} />);
    expect(screen.queryByText(t('thinkHostSafe'))).toBeNull();
    expect(screen.queryByText(t('thinkHostHit'))).toBeNull();
    rerender(<HostThinkAnswers think={host({ answers, draft: [{ word: 'червоний', synonyms: [] }] })} phase="question" send={okSend()} />);
    expect(screen.getByText(t('thinkHostSafe'))).toBeTruthy();
    expect(screen.getByText(t('thinkHostHit'))).toBeTruthy();
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

  it('a hit names the host word it matched', () => {
    const think = info({
      words: [{ word: 'червоний', synonyms: [] }, { word: 'синій', synonyms: ['блакитний'] }],
      rows: [row({ answer: 'Синя', verdict: 'hit', lives: 2, lost: true, matched: 1 }), row({ id: 'p2', nickname: 'Хосе', answer: 'Червінь', verdict: 'hit', lives: 2, lost: true, overridden: true })],
    });
    const { container } = render(<ThinkReveal think={think} big />);
    expect(screen.getByText('Синя').closest('li')!.querySelector('.think-matched')?.textContent).toBe('≈ синій');
    // Ручний збіг — без «≈»: програма ні з чим не збіглася.
    expect(container.querySelectorAll('.think-matched')).toHaveLength(1);
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

describe('51: off-topic', () => {
  const entries = [
    { key: 'банан', text: 'Банан' },
    { key: 'синій', text: 'Синій' },
  ];
  const ballot = (over: Partial<NonNullable<PlayerThink['vote']>> = {}): NonNullable<PlayerThink['vote']> => ({ entries, marked: [], canVote: true, done: false, ...over });

  it('the ballot toggles answers and sends the marks', async () => {
    const send = okSend();
    render(<ThinkVoteBallot vote={ballot()} send={send} />);
    expect(screen.getByRole('heading', { name: t('thinkVoteTitle') })).toBeTruthy();
    expect(screen.getByText(t('thinkVoteLead'))).toBeTruthy();
    const banana = screen.getByRole('button', { name: 'Банан' });
    expect(banana.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByRole('button', { name: 'Синій' }).getAttribute('aria-pressed')).toBe('false');
    // Живий регіон порожній, доки голос не враховано.
    expect(screen.getByRole('status').textContent).toBe('');
    fireEvent.click(banana);
    expect(banana.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: t('thinkVoteDone') }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:think-vote', { keys: ['банан'] }));
    expect(await screen.findByText(t('thinkVoteSent'))).toBeTruthy();
    // Перемикачі лишаються: повторне «Готово» замінює голос.
    fireEvent.click(screen.getByRole('button', { name: 'Синій' }));
    fireEvent.click(screen.getByRole('button', { name: t('thinkVoteDone') }));
    await waitFor(() => expect(send).toHaveBeenLastCalledWith('player:think-vote', { keys: ['банан', 'синій'] }));
  });

  it('own marks from the view are pressed from the start', () => {
    render(<ThinkVoteBallot vote={ballot({ marked: ['синій'], done: true })} send={okSend()} />);
    expect(screen.getByRole('button', { name: 'Синій' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Банан' }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByText(t('thinkVoteSent'))).toBeTruthy();
  });

  it('a refusal shows the reason', async () => {
    const onError = vi.fn();
    const send = vi.fn<Send>(async () => ({ ok: false as const, error: 'wrong_phase' }));
    render(<ThinkVoteBallot vote={ballot()} send={send} onError={onError} />);
    fireEvent.click(screen.getByRole('button', { name: t('thinkVoteDone') }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(expect.any(String)));
    expect(onError.mock.calls[0]![0]).not.toBeNull();
    expect(screen.queryByText(t('thinkVoteSent'))).toBeNull();
  });

  it('who cannot vote sees the answers without buttons', () => {
    const { rerender } = render(<ThinkVoteBallot vote={ballot({ canVote: false })} send={okSend()} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.getByText('Банан')).toBeTruthy();
    expect(screen.getByText(t('thinkVoteWatch'))).toBeTruthy();
    rerender(<ThinkVoteBallot vote={ballot({ canVote: false })} send={okSend()} teamMember />);
    expect(screen.getByText(t('thinkVoteCaptain'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('nothing to check for a voter with only their own answer', () => {
    render(<ThinkVoteBallot vote={ballot({ entries: [] })} send={okSend()} />);
    expect(screen.getByText(t('thinkVoteNothing'))).toBeTruthy();
    expect(screen.getByRole('button', { name: t('thinkVoteDone') })).toBeTruthy();
  });

  const stageView = (think: ThinkInfo) => ({ phase: 'question', question, think, endsAt: Date.now() + 20_000, remainingMs: null, limitMs: 25_000, paused: false, held: false, autopilot: true }) as unknown as StageView;

  it('the stage shows the anonymous ballot and who has voted', () => {
    const think = info({
      rows: [row({ id: 'p1', nickname: 'Петро', answered: true }), row({ id: 'p2', nickname: 'Хосе', answered: true })],
      vote: { entries, voted: ['p1'], voters: 2 },
    });
    const { container, rerender } = render(<ThinkStage view={stageView(think)} offsetMs={0} />);
    expect(screen.getByRole('heading', { name: t('thinkVoteTitle') })).toBeTruthy();
    expect(screen.getByText('Банан')).toBeTruthy();
    expect(screen.getByText('Синій')).toBeTruthy();
    expect(screen.getByText(t('thinkVoteVoted', { names: 'Петро' }))).toBeTruthy();
    // У сітці відповідей — лише тексти, жодного ніку.
    for (const cell of container.querySelectorAll('.think-vote-entry')) {
      expect(cell.textContent).not.toContain('Петро');
      expect(cell.textContent).not.toContain('Хосе');
    }
    expect(container.querySelector('.think-vote-grid')!.textContent).toBe('БананСиній');
    rerender(<ThinkStage view={stageView({ ...think, vote: { entries, voted: [], voters: 2 } })} offsetMs={0} />);
    expect(screen.getByText(t('thinkVoteNobody'))).toBeTruthy();
  });

  it('reveal tags off-topic answers', () => {
    const think = info({
      words: [{ word: 'червоний', synonyms: [] }],
      rows: [row({ answer: 'Банан', verdict: 'safe', lives: 2, lost: true, off: 'vote' }), row({ id: 'p2', nickname: 'Хосе', answer: 'Стіл', verdict: 'safe', lives: 2, lost: true, off: 'host' }), row({ id: 'p3', nickname: 'Іра', answer: 'Зелений', verdict: 'safe' })],
    });
    render(<ThinkReveal think={think} />);
    const banana = screen.getByText('Банан').closest('li')!;
    expect(banana.className).toContain('is-off');
    expect(banana.textContent).toContain(t('thinkOffVoteTag'));
    const table = screen.getByText('Стіл').closest('li')!;
    expect(table.className).toContain('is-off');
    expect(table.querySelector('.think-off')?.textContent).toBe(t('thinkOffTag'));
    expect(screen.getByText('Зелений').closest('li')!.className).not.toContain('is-off');
    expect(screen.getByText('Зелений').closest('li')!.querySelector('.think-off')).toBeNull();
  });

  it('the phone verdict says the answer was off topic', () => {
    render(<ThinkPhoneVerdict think={{ ...alive, lives: 2, verdict: 'safe', off: 'vote' }} />);
    expect(screen.getByText(t('thinkVerdictOff'))).toBeTruthy();
    expect(screen.queryByText('Ви в безпеці')).toBeNull();
  });

  it('the host marks and unmarks an off-topic answer on reveal', async () => {
    const send = okSend();
    const answers: HostThink['answers'] = [
      { id: 'p1', nickname: 'Олена', answer: 'банан', hit: false, overridden: false, off: null },
      { id: 'p2', nickname: 'Хосе', answer: 'Стіл', hit: false, overridden: false, off: 'host' },
      { id: 'p3', nickname: 'Іра', answer: '', hit: false, overridden: false, off: null },
    ];
    const { rerender } = render(<HostThinkAnswers think={host({ answers })} phase="question" send={send} />);
    expect(screen.queryByRole('button', { name: `${t('thinkHostMarkOff')}: Олена` })).toBeNull();
    rerender(<HostThinkAnswers think={host({ answers })} phase="reveal" send={send} />);
    const mark = screen.getByRole('button', { name: `${t('thinkHostMarkOff')}: Олена` });
    // Назва сама каже стан («Не на тему» / «Зняти…»): без aria-pressed, щоб зчитувач не чув «Зняти…, натиснуто».
    expect(mark.hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(mark);
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:think-off', { playerId: 'p1', off: true }));
    const unmark = screen.getByRole('button', { name: `${t('thinkHostUnmarkOff')}: Хосе` });
    fireEvent.click(unmark);
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:think-off', { playerId: 'p2', off: false }));
    expect(screen.getByText('Стіл').closest('li')!.querySelector('.think-off')?.textContent).toBe(t('thinkOffTag'));
    // Порожня відповідь — без кнопки «не на тему».
    expect(screen.queryByRole('button', { name: `${t('thinkHostMarkOff')}: Іра` })).toBeNull();
  });
});
