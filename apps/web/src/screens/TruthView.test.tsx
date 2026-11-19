// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyBrief, type HostTruth, type PlayerTruth, type PublicQuestion, type StageView, type TruthInfo, type TruthRecap } from '@quiz/shared';
import type { Send } from '../live/types';
import { t } from '../i18n';
import { HostTruthFacts, HostTruthFakes, TruthFactForm, TruthHeldPick, TruthOwn, TruthPick, TruthRecapFold, TruthRecapView, TruthReveal, TruthSkipped, TruthStage, truthChoiceText } from './TruthView';

afterEach(cleanup);

const mine = (over: Partial<PlayerTruth> = {}): PlayerTruth => ({ fact: '', hidden: false, canWrite: true, own: false, ...over });

const info = (over: Partial<TruthInfo> = {}): TruthInfo => ({ open: true, count: 0, index: null, reveal: null, skipped: false, ...over });

const hostTruth = (over: Partial<HostTruth> = {}): HostTruth => ({
  ...info({ count: 2 }),
  facts: [
    { id: 'p1', nickname: 'Олена', text: 'Я стрибала з парашутом', hidden: false, played: false, revised: false, inDeck: true },
    { id: 'p2', nickname: 'Тарас', text: 'Маю трьох котів', hidden: false, played: false, revised: false, inDeck: true },
  ],
  fakes: [],
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
            { id: 'p1', nickname: 'Олена', text: 'Я стрибала з парашутом', hidden: false, played: true, revised: false, inDeck: true },
            { id: 'p2', nickname: 'Тарас', text: 'Маю чотирьох котів', hidden: true, played: false, revised: true, inDeck: true },
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

  it('after the deal a fact outside the deck has no button', () => {
    render(
      <HostTruthFacts
        truth={hostTruth({
          facts: [
            { id: 'p1', nickname: 'Олена', text: 'Я стрибала з парашутом', hidden: false, played: false, revised: false, inDeck: true },
            { id: 'p2', nickname: 'Тарас', text: 'Маю трьох котів', hidden: true, played: false, revised: false, inDeck: false },
          ],
        })}
        send={vi.fn()}
      />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: t('truthHostShow') })).toBeNull();
    expect(screen.getByText(t('truthHostHiddenMark'))).toBeTruthy();
  });

  it("reports the server's refusal", async () => {
    const onError = vi.fn();
    render(<HostTruthFacts truth={hostTruth()} send={vi.fn<Send>(async () => ({ ok: false, error: 'truth_closed' }))} onError={onError} />);
    fireEvent.click(screen.getAllByRole('button', { name: t('truthHostHide') })[0]!);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Факти вже не приймаються.'));
  });
});

const fake = (over: Partial<HostTruth['fakes'][number]> = {}): HostTruth['fakes'][number] => ({ id: 'fake-1', text: 'Я вмію жонглювати', preset: false, played: false, inDeck: true, ...over });

describe('HostTruthFakes (52)', () => {
  it('the host adds a fake', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<HostTruthFakes truth={hostTruth()} send={send} />);
    expect(screen.getByText(t('truthFakesTitle'))).toBeTruthy();
    expect(screen.getByText(t('truthFakesHint'))).toBeTruthy();
    const field = screen.getByLabelText(t('truthFakesTitle')) as HTMLTextAreaElement;
    expect(field.maxLength).toBe(200);
    fireEvent.change(field, { target: { value: 'Я тричі бачила північне сяйво' } });
    expect(screen.getByText('29 / 200')).toBeTruthy();
    const add = screen.getByRole('button', { name: t('truthFakeAdd') });
    fireEvent.click(add);
    fireEvent.click(add);
    await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send).toHaveBeenCalledWith('host:truth-fake', { id: null, text: 'Я тричі бачила північне сяйво' });
    await waitFor(() => expect(field.value).toBe(''));
  });

  it('edits and removes', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<HostTruthFakes truth={hostTruth({ fakes: [fake({ preset: true }), fake({ id: 'fake-2', text: 'Я пекла хліб', inDeck: false })] })} send={send} />);
    expect(screen.getByText('Я вмію жонглювати')).toBeTruthy();
    expect(screen.getAllByText(t('truthFakePreset'))).toHaveLength(1);
    expect(screen.getAllByText(t('truthFakeSkip'))).toHaveLength(1);
    fireEvent.click(screen.getAllByRole('button', { name: t('truthFakeEdit') })[0]!);
    const edit = screen.getByDisplayValue('Я вмію жонглювати') as HTMLTextAreaElement;
    expect(edit.maxLength).toBe(200);
    fireEvent.change(edit, { target: { value: 'Я вмію жонглювати п’ятьма м’ячами' } });
    fireEvent.click(screen.getByRole('button', { name: t('truthFactSave') }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:truth-fake', { id: 'fake-1', text: 'Я вмію жонглювати п’ятьма м’ячами' }));
    fireEvent.click(screen.getAllByRole('button', { name: t('truthFakeRemove') })[0]!);
    await waitFor(() => expect(send).toHaveBeenCalledWith('host:truth-fake', { id: 'fake-1', text: '' }));
  });

  it('more fakes than real facts — only the first ones play', () => {
    const facts = hostTruth().facts.map((fact, i) => ({ ...fact, hidden: i === 1 }));
    const { rerender } = render(<HostTruthFakes truth={hostTruth({ facts, fakes: [fake(), fake({ id: 'fake-2', inDeck: false })] })} send={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Вигадок більше, ніж фактів гравців: зіграються лише перші 1.');
    rerender(<HostTruthFakes truth={hostTruth({ fakes: [fake()] })} send={vi.fn()} />);
    expect(screen.queryByText(/Вигадок більше/)).toBeNull();
  });

  it('no player facts yet — fakes will not play and the round is skipped, not «the first 0»', () => {
    const facts = hostTruth().facts.map((fact) => ({ ...fact, hidden: true }));
    const { rerender } = render(<HostTruthFakes truth={hostTruth({ facts, fakes: [fake({ inDeck: false })] })} send={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('Фактів гравців ще немає: без них вигадки не зіграються, а раунд буде пропущено.');
    rerender(<HostTruthFakes truth={hostTruth({ facts: [], fakes: [fake({ inDeck: false })] })} send={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe(t('truthFakesNoFacts'));
    rerender(<HostTruthFakes truth={hostTruth({ facts: [], fakes: [] })} send={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it("reports the server's refusal", async () => {
    const onError = vi.fn();
    render(<HostTruthFakes truth={hostTruth()} send={vi.fn<Send>(async () => ({ ok: false, error: 'truth_fakes_full' }))} onError={onError} />);
    fireEvent.change(screen.getByLabelText(t('truthFakesTitle')), { target: { value: 'Вигадка' } });
    fireEvent.click(screen.getByRole('button', { name: t('truthFakeAdd') }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(t('err_truth_fakes_full')));
  });

  it('nothing once facts are closed', () => {
    const { container } = render(<HostTruthFakes truth={hostTruth({ open: false, fakes: [fake()] })} send={vi.fn()} />);
    expect(container.textContent).toBe('');
  });
});

describe('truthChoiceText (52)', () => {
  it('the «made up» option reads by its id; a name stays as it is', () => {
    expect(truthChoiceText({ id: 'fake', text: 'raw' })).toBe(t('truthFakeOption'));
    expect(truthChoiceText({ id: 'p1', text: 'Олена' })).toBe('Олена');
  });
});

const faked: PublicQuestion = { ...question, choices: [...names, { id: 'fake', text: 'Вигадка' }] };

describe('TruthPick', () => {
  it('«made up» is one more name: the same button, sent by its id (52)', async () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    render(<TruthPick question={faked} disabled={false} send={send} />);
    const made = screen.getByRole('button', { name: t('truthFakeOption') });
    expect(made.className).toBe(screen.getByRole('button', { name: 'Тарас' }).className);
    expect(made.className).toBe('btn truth-name');
    fireEvent.click(made);
    await waitFor(() => expect(send).toHaveBeenCalledWith('player:answer', { type: 'single', optionId: 'fake' }));
  });

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
    teams: null,
    blitz: null,
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

  it('the reveal drops the answered counter: playerCount there counts everyone', () => {
    const reveal: TruthInfo['reveal'] = { author: { id: 'p1', nickname: 'Олена' }, points: 300, picks: [] };
    render(<TruthStage view={stage({ phase: 'reveal', playerCount: 3, truth: info({ open: false, count: 3, index: 0, reveal }) })} offsetMs={0} />);
    expect(screen.getByText('Факт 1 з 3')).toBeTruthy();
    expect(screen.queryByText(/Відповіли/)).toBeNull();
  });

  it('a round with host fakes shows no answered counter (52)', () => {
    const { container } = render(<TruthStage view={stage({ playerCount: 0, answeredCount: 0, question: faked, truth: info({ open: false, count: 3, index: 0, faked: true }) })} offsetMs={0} />);
    expect(screen.queryByText(/Відповіли/)).toBeNull();
    expect(screen.getByText(t('truthFakeOption'))).toBeTruthy();
    expect(container.textContent).not.toContain(t('truthFakeLabel'));
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

  it('the stage packs a crowd of picks tighter; a few picks and the phone stay as they are', () => {
    const picks = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `g${i}`, nickname: `Гравець ${i}`, pickedId: null, picked: null, correct: false }));
    const truthOf = (n: number) => info({ open: false, count: 1, index: 0, reveal: { author: { id: 'p1', nickname: 'Олена' }, points: 300, picks: picks(n) } });
    const { container, rerender } = render(<TruthReveal truth={truthOf(21)} big />);
    expect(container.querySelector('.truth-reveal')?.className).toBe('truth-reveal is-big is-many');
    rerender(<TruthReveal truth={truthOf(12)} big />);
    expect(container.querySelector('.truth-reveal')?.className).toBe('truth-reveal is-big');
    rerender(<TruthReveal truth={truthOf(21)} />);
    expect(container.querySelector('.truth-reveal')?.className).toBe('truth-reveal');
  });

  it('a host fake: made up by the host, no author line; a «made up» pick reads in the language (52)', () => {
    const reveal: TruthInfo['reveal'] = {
      author: { id: 'fake-1', nickname: '' },
      points: 0,
      fake: true,
      picks: [
        { id: 'p2', nickname: 'Оля', pickedId: 'fake', picked: 'Вигадка', correct: true },
        { id: 'p3', nickname: 'Хосе', pickedId: 'p1', picked: 'Олена', correct: false },
      ],
    };
    render(<TruthReveal truth={info({ open: false, count: 3, index: 0, reveal, faked: true })} />);
    expect(screen.getByText(t('truthFakeIs'))).toBeTruthy();
    expect(screen.queryByText(/Автор:/)).toBeNull();
    expect(screen.queryByText(/Це написав/)).toBeNull();
    expect(screen.getByText('Оля → Вигадка ✓')).toBeTruthy();
    expect(screen.getByText('Хосе → Олена ✗')).toBeTruthy();
  });

  it('nothing before the reveal', () => {
    const { container } = render(<TruthReveal truth={info({ index: 0 })} />);
    expect(container.textContent).toBe('');
  });
});

const recap: TruthRecap = {
  early: false,
  facts: [
    {
      text: 'Я стрибала з парашутом',
      author: { id: 'p1', nickname: 'Олена' },
      points: 100,
      picks: [
        { id: 'p2', nickname: 'Тарас', pickedId: 'p1', picked: 'Олена', correct: true },
        { id: 'p3', nickname: 'Хосе', pickedId: 'p2', picked: 'Тарас', correct: false },
      ],
    },
    {
      text: 'Маю трьох котів',
      author: { id: 'p2', nickname: 'Тарас' },
      points: 200,
      picks: [
        { id: 'p1', nickname: 'Олена', pickedId: 'p3', picked: 'Хосе', correct: false },
        { id: 'p3', nickname: 'Хосе', pickedId: null, picked: null, correct: false },
      ],
    },
  ],
};

describe('the truth round recap', () => {
  it('while the round is held the stage shows a seal instead of the author, and the phone pick has no verdict', () => {
    const { container, rerender } = render(<TruthStage view={stage({ phase: 'locked', truth: info({ open: false, count: 3, index: 0, held: true, sealed: true }) })} offsetMs={0} />);
    expect(screen.getByText(t('truthSealed'))).toBeTruthy();
    expect(screen.getByText(t('truthHeldNote'))).toBeTruthy();
    expect(container.textContent).not.toMatch(/[✓✗]/);
    // закрито, але ведучий ще не розкрив — «Час вийшов»
    rerender(<TruthStage view={stage({ phase: 'locked', truth: info({ open: false, count: 3, index: 0, held: true }) })} offsetMs={0} />);
    expect(screen.getByText(t('truthClosed'))).toBeTruthy();
    // на запитанні печатки немає
    rerender(<TruthStage view={stage({ truth: info({ open: false, count: 3, index: 0, held: true }) })} offsetMs={0} />);
    expect(screen.queryByText(t('truthHeldNote'))).toBeNull();
    cleanup();
    render(<TruthHeldPick question={question} answer={{ type: 'single', optionId: 'p2' }} />);
    expect(screen.getByText('Ваш вибір: Тарас')).toBeTruthy();
    expect(screen.getByText(t('truthHeldNote'))).toBeTruthy();
    cleanup();
    render(<TruthHeldPick question={question} answer={null} />);
    expect(screen.getByText(t('truthYouSkipped'))).toBeTruthy();
  });

  it('the phone pick reminds that the author comes at the end of the round', () => {
    const send = vi.fn<Send>(async () => ({ ok: true }));
    const { rerender } = render(<TruthPick question={question} disabled={false} send={send} held />);
    expect(screen.getByText(t('truthHeldNote'))).toBeTruthy();
    rerender(<TruthPick question={question} disabled={false} send={send} />);
    expect(screen.queryByText(t('truthHeldNote'))).toBeNull();
  });

  it('the last reveal on the stage is the recap: every fact with its author, who guessed and the author points', () => {
    const { container } = render(<TruthStage view={stage({ phase: 'reveal', truth: info({ open: false, count: 2, index: 1, recap }) })} offsetMs={0} />);
    expect(screen.getByText(t('truthRecapTitle'))).toBeTruthy();
    expect(screen.queryByText(t('truthWho'))).toBeNull();
    const cards = [...container.querySelectorAll('.truth-recap-card')].map((card) => card.textContent);
    expect(cards).toEqual(['Я стрибала з парашутомОленаВгадали: ТарасАвтор: +100', 'Маю трьох котівТарасНіхто не вгадавАвтор: +200']);
    expect(container.querySelector('.truth-recap')?.className).toBe('truth-recap is-big cols-2');
  });

  it('the phone recap marks the own pick on every fact and counts the right ones', () => {
    const { container } = render(<TruthRecapView recap={recap} mine={{ id: 'p3', own: (id) => id === 'p3' }} />);
    expect(screen.getByText('Ви вгадали 0 з 2')).toBeTruthy();
    expect(screen.getByText('Ваш вибір: Тарас ✗')).toBeTruthy();
    expect(screen.getByText(t('truthYouSkipped'))).toBeTruthy();
    cleanup();
    render(<TruthRecapView recap={recap} mine={{ id: 'p2', own: (id) => id === 'p2' }} />);
    expect(screen.getByText('Ви вгадали 1 з 1')).toBeTruthy();
    expect(screen.getByText('Ваш вибір: Олена ✓')).toBeTruthy();
    expect(screen.getByText(t('truthRecapOwn'))).toBeTruthy();
    expect(container.querySelector('.is-big')).toBeNull();
  });

  it('in a team game the phone recap and the held pick speak of the team, not of «you»', () => {
    render(<TruthRecapView recap={recap} mine={{ id: 'p3', own: (id) => id === 'p3', team: true }} />);
    expect(screen.getByText('Команда вгадала 0 з 2')).toBeTruthy();
    expect(screen.getByText('Вибір команди: Тарас ✗')).toBeTruthy();
    expect(screen.getByText(t('truthTeamSkipped'))).toBeTruthy();
    expect(screen.queryByText(/Ви вгадали|Ваш вибір/)).toBeNull();
    cleanup();
    render(<TruthRecapView recap={recap} mine={{ id: 'p2', own: (id) => id === 'p2', team: true }} />);
    expect(screen.getByText(t('truthRecapOwnTeam'))).toBeTruthy();
    cleanup();
    render(<TruthHeldPick question={question} answer={{ type: 'single', optionId: 'p2' }} team />);
    expect(screen.getByText(/^Вибір команди: /)).toBeTruthy();
    cleanup();
    render(<TruthHeldPick question={question} answer={null} team />);
    expect(screen.getByText(t('truthTeamSkipped'))).toBeTruthy();
  });

  it('many guessers become a count, many facts a denser grid; an early end says so', () => {
    const crowd = Array.from({ length: 8 }, (_, i) => ({ id: `g${i}`, nickname: `Гравець ${i}`, pickedId: 'p1', picked: 'Олена', correct: i < 7 }));
    const facts = Array.from({ length: 12 }, (_, i) => ({ ...recap.facts[0], text: `Факт ${i}`, picks: crowd }));
    const { container } = render(<TruthRecapView recap={{ early: true, facts }} big />);
    expect(container.querySelector('.truth-recap')?.className).toBe('truth-recap is-big cols-4 is-many');
    expect(screen.getAllByText(/Вгадали: 7 з 8/)).toHaveLength(12);
    expect(screen.getByText(t('truthRecapEarly'))).toBeTruthy();
  });

  it('a host fake in the recap: made up by the host, no author points (52)', () => {
    const withFake: TruthRecap = {
      early: false,
      facts: [
        recap.facts[0]!,
        { text: 'Я вмію жонглювати', author: { id: 'fake-1', nickname: '' }, points: 0, fake: true, picks: [{ id: 'p2', nickname: 'Тарас', pickedId: 'fake', picked: 'Вигадка', correct: true }, { id: 'p3', nickname: 'Хосе', pickedId: 'p1', picked: 'Олена', correct: false }] },
      ],
    };
    const { container } = render(<TruthRecapView recap={withFake} mine={{ id: 'p2', own: (id) => id === 'p2' }} />);
    const cards = [...container.querySelectorAll('.truth-recap-card')];
    expect(cards[1]!.className).toBe('truth-recap-card is-fake');
    // Одне слово «Вигадка», як ім'я: не переноситься на сцені жодною мовою.
    expect(cards[1]!.querySelector('.truth-recap-author')?.textContent).toBe(t('truthFakeOption'));
    expect(cards[1]!.textContent).not.toContain(t('truthFakeLabel'));
    expect(cards[1]!.textContent).not.toContain('Автор:');
    expect(cards[1]!.textContent).toContain('Ваш вибір: Вигадка ✓');
    expect(screen.getByText('Ви вгадали 2 з 2')).toBeTruthy();
  });

  it('the held phone pick of «made up» reads in the language (52)', () => {
    render(<TruthHeldPick question={faked} answer={{ type: 'single', optionId: 'fake' }} />);
    expect(screen.getByText('Ваш вибір: Вигадка')).toBeTruthy();
  });

  it('round end folds the recap away', () => {
    const { container } = render(<TruthRecapFold recap={recap} open={false} />);
    expect(container.querySelector('details')?.open).toBe(false);
    expect(container.querySelector('summary')?.textContent).toBe(`${t('truthRecapTitle')} (2)`);
    expect(container.querySelector('.truth-recap-title')).toBeNull();
  });
});

describe('TruthSkipped', () => {
  it('a skipped round says so', () => {
    render(<TruthSkipped />);
    expect(screen.getByText(t('truthSkipped')).getAttribute('role')).toBe('status');
  });
});
