// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView, PublicQuestion, SurvivalInfo, SurvivalRow, SurvivalTrialInfo } from '@quiz/shared';
import { SurvivalTrial } from './SurvivalTrial';

afterEach(cleanup);

const trialQuestion: PublicQuestion = {
  id: 't1',
  type: 'single',
  text: 'Скільки ніг у павука?',
  imageUrl: null,
  video: null,
  timeLimit: 15,
  points: 0,
  choices: [
    { id: 'a', text: 'Вісім' },
    { id: 'b', text: 'Шість' },
  ],
} as unknown as PublicQuestion;

const row = (over: Partial<SurvivalRow> & { playerId: string; nickname: string }): SurvivalRow => ({
  status: 'alive',
  outAfter: null,
  ghost: null,
  answer: null,
  trial: null,
  door: null,
  ...over,
});

const trialInfo = (over: Partial<SurvivalTrialInfo> = {}): SurvivalTrialInfo => ({
  kind: 'question',
  fellBack: false,
  stage: 'open',
  endsAt: Date.now() + 15_000,
  remainingMs: null,
  limitMs: 15_000,
  done: 0,
  total: 2,
  question: trialQuestion,
  reveal: null,
  ...over,
});

type Own = NonNullable<PlayerView['me']['survival']>;

function makeView(opts: { own?: Partial<Own>; trial?: Partial<SurvivalTrialInfo>; paused?: boolean; rows?: SurvivalRow[]; splash?: PlayerView['splash'] } = {}): PlayerView {
  const rows = opts.rows ?? [
    row({ playerId: 'p1', nickname: 'Олена', status: 'edge', trial: 'pending' }),
    row({ playerId: 'p2', nickname: 'Іван', status: 'edge', trial: 'pending' }),
    row({ playerId: 'p3', nickname: 'Марко' }),
  ];
  const info = { current: 0, total: 3, target: 1, bonus: 0, trialKind: 'question', trialsLeft: 1, rows, aliveCount: 3, ghostCount: 0, ghosts: { answered: 0, right: null }, verdict: 'trial', trial: trialInfo(opts.trial), ending: false } as SurvivalInfo;
  return {
    paused: opts.paused ?? false,
    splash: opts.splash ?? null,
    survival: info,
    me: {
      id: 'p1',
      survival: { status: 'edge', outAfter: null, ghostCorrect: null, canAnswerTrial: true, trialAnswer: null, canPickDoor: false, door: null, result: null, bonus: null, ...opts.own },
    },
  } as unknown as PlayerView;
}

const noop = () => undefined;

describe('SurvivalTrial', () => {
  it('on the edge shows the survival question and reports the answer', () => {
    const onAnswer = vi.fn();
    render(<SurvivalTrial view={makeView()} offsetMs={0} onAnswer={onAnswer} onDoor={noop} />);
    expect(screen.getByText('Питання на виживання')).toBeTruthy();
    expect(screen.getByText('Скільки ніг у павука?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Вісім/ }));
    expect(onAnswer).toHaveBeenCalledWith({ type: 'single', optionId: 'a' });
  });

  it('on the edge in luck shows the doors and the picks-itself line, then the pick', () => {
    const onDoor = vi.fn();
    const luck = { kind: 'luck' as const, question: null };
    render(<SurvivalTrial view={makeView({ trial: luck, own: { canAnswerTrial: false, canPickDoor: true } })} offsetMs={0} onAnswer={noop} onDoor={onDoor} />);
    expect(screen.getByText('Удача: вибери двері')).toBeTruthy();
    expect(screen.getByText('Не вибереш за 10 с — двері виберуться самі.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Двері 2' }));
    expect(onDoor).toHaveBeenCalledWith(1);
    cleanup();
    render(<SurvivalTrial view={makeView({ trial: luck, own: { canAnswerTrial: false, canPickDoor: false, door: 1 } })} offsetMs={0} onAnswer={noop} onDoor={onDoor} />);
    expect(screen.getByText('Двері 2. Чекаємо інших…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Двері 2' }).hasAttribute('disabled')).toBe(true);
  });

  it('someone not on the edge watches and sees the nicknames', () => {
    render(<SurvivalTrial view={makeView({ own: { status: 'alive', canAnswerTrial: false } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByText('Випробування для: Олена, Іван')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('after the close says safe or out', () => {
    const closed = { stage: 'closed' as const, endsAt: null };
    render(<SurvivalTrial view={makeView({ trial: closed, own: { status: 'alive', canAnswerTrial: false, result: 'safe' } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByText('Пронесло! Ти живий(-а).')).toBeTruthy();
    cleanup();
    render(<SurvivalTrial view={makeView({ trial: closed, own: { status: 'ghost', canAnswerTrial: false, result: 'out' } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByText('Ти вибуваєш — тепер ти привид.')).toBeTruthy();
  });

  it('after the close in luck opens the doors with the trap', () => {
    const rows = [row({ playerId: 'p1', nickname: 'Олена', status: 'alive', trial: 'out', door: { picked: 0, auto: true, trap: 0 } })];
    render(
      <SurvivalTrial
        view={makeView({ rows, trial: { kind: 'luck', question: null, stage: 'closed', endsAt: null }, own: { status: 'ghost', canAnswerTrial: false, result: 'out' } })}
        offsetMs={0}
        onAnswer={noop}
        onDoor={noop}
      />,
    );
    expect(screen.getByText('Пастка!')).toBeTruthy();
    expect(screen.getByText('вибрано самі')).toBeTruthy();
  });

  it('says when the survival questions ran out', () => {
    render(<SurvivalTrial view={makeView({ trial: { kind: 'luck', question: null, fellBack: true }, own: { canAnswerTrial: false, canPickDoor: true } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByText('Питань на виживання не лишилося — удача.')).toBeTruthy();
  });

  it('disables the controls on pause', () => {
    const luck = { kind: 'luck' as const, question: null };
    render(<SurvivalTrial view={makeView({ paused: true, trial: luck, own: { canAnswerTrial: false, canPickDoor: true } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    for (const n of [1, 2, 3]) expect(screen.getByRole('button', { name: `Двері ${n}` }).hasAttribute('disabled')).toBe(true);
    cleanup();
    render(<SurvivalTrial view={makeView({ paused: true })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByRole('button', { name: /Вісім/ }).closest('fieldset')!.hasAttribute('disabled')).toBe(true);
  });

  it('disables the controls once the trial deadline has passed', () => {
    const luck = { kind: 'luck' as const, question: null };
    const onDoor = vi.fn();
    render(<SurvivalTrial view={makeView({ trial: { ...luck, endsAt: Date.now() - 1000 }, own: { canAnswerTrial: false, canPickDoor: true } })} offsetMs={0} onAnswer={noop} onDoor={onDoor} />);
    fireEvent.click(screen.getByRole('button', { name: 'Двері 1' }));
    expect(screen.getByRole('button', { name: 'Двері 1' }).hasAttribute('disabled')).toBe(true);
    expect(onDoor).not.toHaveBeenCalled();
    cleanup();
    render(<SurvivalTrial view={makeView({ trial: { endsAt: Date.now() - 1000 } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByRole('button', { name: /Вісім/ }).closest('fieldset')!.hasAttribute('disabled')).toBe(true);
  });

  it('announces the outcome, the pick and the progress as status', () => {
    const closed = { stage: 'closed' as const, endsAt: null };
    render(<SurvivalTrial view={makeView({ trial: closed, own: { status: 'alive', canAnswerTrial: false, result: 'safe' } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByRole('status').textContent).toBe('Пронесло! Ти живий(-а).');
    cleanup();
    render(<SurvivalTrial view={makeView({ trial: { kind: 'luck', question: null }, own: { canAnswerTrial: false, canPickDoor: false, door: 1 } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByRole('status').textContent).toBe('Двері 2. Чекаємо інших…');
    cleanup();
    render(<SurvivalTrial view={makeView({ own: { status: 'alive', canAnswerTrial: false } })} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(screen.getByRole('status').textContent).toBe('Відповіли 0 з 2');
  });

  it('keeps the controls off under the trial splash even when the server says they are open', () => {
    const luck = { kind: 'luck' as const, question: null };
    const splash = { kind: 'trial' as const, at: Date.now(), until: Date.now() + 60_000 };
    const onDoor = vi.fn();
    render(<SurvivalTrial view={makeView({ splash, trial: luck, own: { canAnswerTrial: false, canPickDoor: true } })} offsetMs={0} onAnswer={noop} onDoor={onDoor} />);
    fireEvent.click(screen.getByRole('button', { name: 'Двері 1' }));
    expect(screen.getByRole('button', { name: 'Двері 1' }).hasAttribute('disabled')).toBe(true);
    expect(onDoor).not.toHaveBeenCalled();
  });

  it('renders nothing without a trial', () => {
    const view = makeView();
    view.survival = { ...view.survival!, trial: null };
    const { container } = render(<SurvivalTrial view={view} offsetMs={0} onAnswer={noop} onDoor={noop} />);
    expect(container.firstChild).toBeNull();
  });
});
