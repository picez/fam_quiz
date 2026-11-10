// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type HostTruth, type PlayerTruth, type PublicQuestion, type StageView, type TruthInfo } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import { HostTruthFacts, TruthFactForm, TruthOwn, TruthPick, TruthReveal, TruthSkipped, TruthStage } from './TruthView';

afterEach(cleanup);

const mine = (over: Partial<PlayerTruth> = {}): PlayerTruth => ({ fact: '', hidden: false, canWrite: true, own: false, ...over });

const info = (over: Partial<TruthInfo> = {}): TruthInfo => ({ open: true, count: 0, index: null, reveal: null, skipped: false, ...over });

const hostTruth = (over: Partial<HostTruth> = {}): HostTruth => ({
  ...info({ count: 2 }),
  facts: [
    { id: 'p1', nickname: 'Олена', text: 'Я стрибала з парашутом', hidden: false, played: false, revised: false },
    { id: 'p2', nickname: 'Тарас', text: 'Маю трьох котів', hidden: false, played: false, revised: false },
  ],
  author: null,
  ...over,
});

const names = [
  { id: 'p1', text: 'Олена' },
  { id: 'p2', text: 'Тарас' },
  { id: 'p3', text: 'Хосе' },
];

const question: PublicQuestion = {
  type: 'single',
  text: 'Я стрибала з парашутом',
  imageUrl: null,
  video: null,
  timeLimit: 30,
  points: 200,
  choices: names,
  right: [], chain: null, sort: null, orderLabels: null, slider: null, clues: null, pin: null, wall: null, cloud: null, survey: null, audio: null, reveal: null,
};

describe('TruthFactForm', () => {
  it("the phone saves a fact and shows the host's mark", async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const { rerender } = render(<TruthFactForm truth={mine()} send={send} />);
    expect(screen.getByText(t('truthFactHint'))).toBeTruthy();
    const field = screen.getByLabelText(t('truthFactLabel')) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(200);
    fireEvent.change(field, { target: { value: 'Я стрибала з парашутом' } });
    expect(screen.getByText('22 / 200')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('truthFactSave') }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:truth', { text: 'Я стрибала з парашутом' }));
    rerender(<TruthFactForm truth={mine({ fact: 'Я стрибала з парашутом' })} send={send} />);
    expect(screen.getByText('Ваш факт: «Я стрибала з парашутом»')).toBeTruthy();
    rerender(<TruthFactForm truth={mine({ fact: 'Я стрибала з парашутом', hidden: true })} send={send} />);
    expect(screen.getByText(t('truthFactHidden'))).toBeTruthy();
    expect(screen.queryByText('Ваш факт: «Я стрибала з парашутом»')).toBeNull();
    fireEvent.change(field, { target: { value: 'а'.repeat(230) } });
    expect(field.value).toHaveLength(200);
    expect(screen.getByText('200 / 200')).toBeTruthy();
  });

  it('a new view does not wipe what the person is typing', () => {
    const { rerender } = render(<TruthFactForm truth={mine()} send={vi.fn()} />);
    const field = screen.getByLabelText(t('truthFactLabel')) as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Пишу' } });
    rerender(<TruthFactForm truth={mine({ fact: 'Старий' })} send={vi.fn()} />);
    expect(field.value).toBe('Пишу');
  });

  it('a late answer from the server shows the reason', async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'truth_closed' }));
    render(<TruthFactForm truth={mine()} send={send} />);
    fireEvent.change(screen.getByLabelText(t('truthFactLabel')), { target: { value: 'Факт' } });
    fireEvent.click(screen.getByRole('button', { name: t('truthFactSave') }));
    const status = await screen.findByText('Факти вже не приймаються.');
    expect(status.getAttribute('role')).toBe('status');
  });

  it('one request at a time', async () => {
    let finish: (value: { ok: true }) => void = () => undefined;
    const send = vi.fn<Send>(() => new Promise((resolve) => (finish = resolve)));
    render(<TruthFactForm truth={mine()} send={send} />);
    fireEvent.change(screen.getByLabelText(t('truthFactLabel')), { target: { value: 'Факт' } });
    const save = screen.getByRole('button', { name: t('truthFactSave') });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(send).toHaveBeenCalledTimes(1);
    finish({ ok: true });
  });

  it('nothing when facts are closed', () => {
    const { container } = render(<TruthFactForm truth={mine({ canWrite: false, fact: 'Факт' })} send={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});

describe('HostTruthFacts', () => {
  it('the host hides and shows', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const { rerender } = render(<HostTruthFacts truth={hostTruth()} send={send} />);
    expect(screen.getByText(t('truthHostTitle'))).toBeTruthy();
    expect(screen.getByText('Фактів: 2')).toBeTruthy();
    expect(screen.getByText('Маю трьох котів')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: t('truthHostHide') })[1]!);
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:truth-hide', { playerId: 'p2', hidden: true }));
    rerender(
      <HostTruthFacts
        truth={hostTruth({
          facts: [
            { id: 'p1', nickname: 'Олена', text: 'Я стрибала з парашутом', hidden: false, played: true, revised: false },
            { id: 'p2', nickname: 'Тарас', text: 'Маю чотирьох котів', hidden: true, played: false, revised: true },
          ],
        })}
        send={send}
      />,
    );
    expect(screen.getByText('Фактів: 1')).toBeTruthy();
    expect(screen.getByText(t('truthHostPlayed'))).toBeTruthy();
    expect(screen.getByText(t('truthHostHiddenMark'))).toBeTruthy();
    expect(screen.getByText(t('truthHostRevised'))).toBeTruthy();
    // Зіграний — без кнопки; схований — «Показати».
    expect(screen.queryByRole('button', { name: t('truthHostHide') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('truthHostShow') }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:truth-hide', { playerId: 'p2', hidden: false }));
    rerender(<HostTruthFacts truth={hostTruth({ facts: [] })} send={send} />);
    expect(screen.getByText(t('truthHostNone'))).toBeTruthy();
  });

  it("reports the server's refusal", async () => {
    const onError = vi.fn();
    render(<HostTruthFacts truth={hostTruth()} send={vi.fn<Send>(async () => ({ ok: false, error: 'truth_closed' }))} onError={onError} />);
    fireEvent.click(screen.getAllByRole('button', { name: t('truthHostHide') })[0]!);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Факти вже не приймаються.'));
  });
});

describe('TruthPick', () => {
  it('a guess sends the name once', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<TruthPick question={question} disabled={false} send={send} />);
    expect(screen.getByText(t('truthWho'))).toBeTruthy();
    const taras = screen.getByRole('button', { name: 'Тарас' });
    expect(taras.getAttribute('dir')).toBe('auto');
    fireEvent.click(taras);
    fireEvent.click(taras);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'p2' });
  });

  it('paused or out of time — every name is off', () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<TruthPick question={question} disabled send={send} />);
    for (const button of screen.getAllByRole('button')) expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Олена' }));
    expect(send).not.toHaveBeenCalled();
  });

  it("shows the server's reason and lets the person pick again", async () => {
    const send = vi.fn<Send>(async () => ({ ok: false, error: 'truth_own' }));
    render(<TruthPick question={question} disabled={false} send={send} />);
    fireEvent.click(screen.getByRole('button', { name: 'Олена' }));
    expect((await screen.findByText(t('err_truth_own'))).getAttribute('role')).toBe('status');
    expect((screen.getByRole('button', { name: 'Хосе' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('TruthOwn', () => {
  it('the author sees a notice, not names', () => {
    const { rerender } = render(<TruthOwn team={false} />);
    expect(screen.getByText(t('truthOwn'))).toBeTruthy();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    rerender(<TruthOwn team />);
    expect(screen.getByText(t('truthOwnTeam'))).toBeTruthy();
  });
});

const stage = (over: Partial<StageView> = {}): StageView =>
  ({
    role: 'stage',
    phase: 'question',
    paused: false,
    round: { index: 0, total: 1, title: '', type: 'truth', partial: false, description: '', brief: emptyBrief('truth'), times: null },
    questionIndex: 0,
    total: 3,
    question,
    endsAt: Date.now() + 30_000,
    remainingMs: null,
    limitMs: 30_000,
    playerCount: 2,
    answeredCount: 1,
    overtime: [],
    reveal: null,
    truth: info({ open: false, count: 3, index: 0 }),
    ...over,
  }) as StageView;

describe('TruthStage', () => {
  it('the stage asks who wrote it and hides the answer', () => {
    const { container } = render(<TruthStage view={stage()} offsetMs={0} />);
    expect(screen.getByText(t('truthWho'))).toBeTruthy();
    expect(screen.getByText('Я стрибала з парашутом')).toBeTruthy();
    expect(screen.getByText('Факт 1 з 3')).toBeTruthy();
    expect(screen.getByText('Відповіли 1 з 2')).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    // Імена — дрібно й без букв варіантів; жодної позначки правильного.
    expect(screen.getByText('Хосе')).toBeTruthy();
    expect(container.querySelector('.is-correct')).toBeNull();
    expect(container.textContent).not.toContain('✓');
    expect(container.textContent).not.toMatch(/\bA\b/);
  });
});

describe('TruthReveal', () => {
  it('reveal shows the author and every pick', () => {
    const reveal: TruthInfo['reveal'] = {
      author: { id: 'p1', nickname: 'Олена' },
      points: 200,
      picks: [
        { id: 'p2', nickname: 'Тарас', pickedId: 'p1', picked: 'Олена', correct: true },
        { id: 'p4', nickname: 'Іра', pickedId: 'p2', picked: 'Тарас', correct: false },
        { id: 'p3', nickname: 'Хосе', pickedId: null, picked: null, correct: false },
      ],
    };
    render(<TruthReveal truth={info({ open: false, count: 3, index: 0, reveal })} />);
    expect(screen.getByText('Це написав(ла) Олена')).toBeTruthy();
    expect(screen.getByText('Автор: +200')).toBeTruthy();
    expect(screen.getByText('Тарас → Олена ✓')).toBeTruthy();
    expect(screen.getByText('Іра → Тарас ✗')).toBeTruthy();
    expect(screen.getByText('Хосе — без вибору')).toBeTruthy();
  });

  it('nothing before the reveal', () => {
    const { container } = render(<TruthReveal truth={info({ index: 0 })} />);
    expect(container.textContent).toBe('');
  });
});

describe('TruthSkipped', () => {
  it('a skipped round says so', () => {
    render(<TruthSkipped />);
    expect(screen.getByText(t('truthSkipped')).getAttribute('role')).toBe('status');
  });
});
