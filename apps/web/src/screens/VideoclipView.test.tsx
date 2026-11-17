// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SNIPPET_REVEAL_SECONDS, SNIPPET_SHARES, SNIPPET_STEPS, type PlayerSnippets, type PublicQuestion, type PublicVideoclip } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import type { VideoPlayState } from '../live/useVideoClip';

const calls: string[] = [];
const opts: { muted: boolean; reveal?: boolean }[] = [];
const clip = {
  play: vi.fn((seconds: number) => {
    calls.push(`play:${seconds}`);
  }),
  stop: vi.fn(() => {
    calls.push('stop');
  }),
  unmute: vi.fn(),
  state: 'idle' as VideoPlayState,
  playing: null as number | null,
  covered: true,
  duration: null,
};

vi.mock('../live/useVideoClip', () => ({
  useVideoClip: (_clip: unknown, o: { muted: boolean; reveal?: boolean }) => {
    opts.push(o);
    return { ...clip, element: <div className="videoclip-frame" data-testid="videoclip-frame" /> };
  },
}));

const { VideoclipPlay, VideoclipReveal, VideoclipStage } = await import('./VideoclipView');

const VIDEOCLIP: PublicVideoclip = { id: 'q-vid', clip: { id: 'djV11Xbc914', start: 30 }, muted: true, answer: null };
const questionOf = (videoclip: Partial<PublicVideoclip> = {}) =>
  ({ type: 'videoclip', text: 'Що це за відео?', choices: [], videoclip: { ...VIDEOCLIP, ...videoclip } }) as unknown as PublicQuestion & { videoclip: PublicVideoclip };
const infoOf = (over: Partial<PlayerSnippets> = {}): PlayerSnippets => ({ heard: 0, canOpen: true, canAnswer: false, openedBy: null, ...over });

beforeEach(() => {
  calls.length = 0;
  opts.length = 0;
  clip.play.mockClear();
  clip.stop.mockClear();
  clip.unmute.mockClear();
  clip.state = 'idle';
  clip.playing = null;
});

afterEach(() => {
  cleanup();
});

function mount(over: { info?: PlayerSnippets; send?: ReturnType<typeof vi.fn<Send>>; question?: PublicQuestion & { videoclip: PublicVideoclip }; answer?: string | null } = {}) {
  const send =
    over.send ??
    vi.fn<Send>(() => {
      calls.push('send');
      return Promise.resolve<SendResult>({ ok: true });
    });
  const onSubmit = vi.fn();
  const view = render(
    <VideoclipPlay info={over.info ?? infoOf()} question={over.question ?? questionOf()} questionIndex={0} paused={false} live send={send} onSubmit={onSubmit} answer={over.answer ?? null} />,
  );
  return { send, onSubmit, ...view };
}

/** aria-label відкритої чи наступної комірки: дія й частка ціни. */
const lab = (key: 'videoclipReplay' | 'videoclipWatch' | 'melodyMore', seconds: number) => `${t(key, { seconds })} · ${Math.round(SNIPPET_SHARES[SNIPPET_STEPS.indexOf(seconds as never)] * 100)} %`;

const cells = () => [...document.querySelectorAll<HTMLButtonElement>('.melody-step')];

describe('VideoclipPlay', () => {
  it('the first tap plays and sends the round-local number', async () => {
    const { send } = mount();
    expect(cells()).toHaveLength(5);
    expect(screen.getByTestId('videoclip-frame')).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: lab('videoclipWatch', 1) })));
    expect(clip.play).toHaveBeenCalledWith(1);
    expect(send).toHaveBeenCalledWith('player:melody', { questionIndex: 0, step: 1 });
    expect(calls).toEqual(['play:1', 'send']);
    // Поки ack немає, шматок уже відкритий локально.
    expect(cells()[0].getAttribute('aria-label')).toBe(lab('videoclipReplay', 1));
  });

  it('only the next chunk can be opened', async () => {
    const { send } = mount({ info: infoOf({ heard: 2, canAnswer: true }) });
    const all = cells();
    expect(all[0].getAttribute('aria-label')).toBe(lab('videoclipReplay', 1));
    expect(all[1].getAttribute('aria-label')).toBe(lab('videoclipReplay', 2));
    expect(all[2].getAttribute('aria-label')).toBe(lab('melodyMore', 4));
    expect(all[2].disabled).toBe(false);
    expect(all[3].disabled).toBe(true);
    expect(all[4].disabled).toBe(true);
    await act(async () => fireEvent.click(all[0]));
    expect(clip.play).toHaveBeenCalledWith(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('a refused chunk stops the video', async () => {
    const send = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: false, error: 'time_over' }));
    clip.playing = 1;
    mount({ send });
    await act(async () => fireEvent.click(cells()[0]));
    expect(clip.play).toHaveBeenCalledWith(1);
    expect(clip.stop).toHaveBeenCalled();
    expect(cells()[0].getAttribute('aria-label')).toBe(lab('videoclipWatch', 1));
    expect(screen.getByText(errorText('time_over'))).toBeTruthy();
    cleanup();
    const step = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: false, error: 'melody_step' }));
    mount({ send: step });
    await act(async () => fireEvent.click(cells()[0]));
    expect(screen.getByRole('status').textContent).toBe('Спершу перегляньте попередній шматок.');
    expect(screen.queryByText(errorText('melody_step'))).toBeNull();
  });

  it('the answer waits for a chunk', () => {
    const view = mount();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect((screen.getByRole('button', { name: t('submit') }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Спершу перегляньте шматок')).toBeTruthy();
    const onSubmit = vi.fn();
    view.rerender(<VideoclipPlay info={infoOf({ heard: 1, canAnswer: true })} question={questionOf()} questionIndex={0} paused={false} live send={view.send} onSubmit={onSubmit} answer={null} />);
    const enabled = screen.getByRole('textbox') as HTMLInputElement;
    expect(enabled.disabled).toBe(false);
    fireEvent.change(enabled, { target: { value: ' Take On Me ' } });
    fireEvent.click(screen.getByRole('button', { name: t('submit') }));
    expect(onSubmit).toHaveBeenCalledWith({ type: 'videoclip', value: 'Take On Me' });
  });

  it('the sound note follows the switch', () => {
    mount();
    expect(screen.getByText('🔇 Без звуку')).toBeTruthy();
    expect(opts.at(-1)?.muted).toBe(true);
    cleanup();
    mount({ question: questionOf({ muted: false }) });
    expect(screen.queryByText('🔇 Без звуку')).toBeNull();
    expect(opts.at(-1)?.muted).toBe(false);
  });

  it('a teammate chunk shows who opened it', () => {
    mount({ info: infoOf({ heard: 2, canAnswer: true, openedBy: 'Тарас' }) });
    expect(screen.getByText('Тарас: відкрито 2 с')).toBeTruthy();
    expect(screen.getByText(t('melodyShareNow', { share: 80 }))).toBeTruthy();
    expect(clip.play).not.toHaveBeenCalled();
  });

  it('after the answer only replays', () => {
    mount({ info: infoOf({ heard: 3, canOpen: false, canAnswer: false }), answer: 'Take On Me' });
    expect(screen.getByText(t('melodyAnswered', { seconds: 4 }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: lab('melodyMore', 8) })).toBeNull();
    expect(cells()[2].getAttribute('aria-label')).toBe(lab('videoclipReplay', 4));
    expect(cells()[3].disabled).toBe(true);
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(cells()[2]);
    expect(clip.play).toHaveBeenCalledWith(4);
  });

  it('a blocked or failed video says so in a status line', () => {
    clip.state = 'blocked';
    mount({ info: infoOf({ heard: 1, canAnswer: true }) });
    expect(screen.getByRole('status').textContent).toBe(t('videoclipBlocked'));
    cleanup();
    clip.state = 'failed';
    mount({ info: infoOf({ heard: 1, canAnswer: true }) });
    expect(screen.getByRole('status').textContent).toBe(t('videoclipFailed'));
  });

  it('the frame and the ladder fit 320 px', () => {
    mount({ info: infoOf({ heard: 2, canAnswer: true }) });
    for (const el of document.querySelectorAll<HTMLElement>('.videoclip-play, .videoclip-frame, .melody-steps, .melody-step')) expect(el.style.width).toBe('');
    const css = cssSection('/* «Відео за фрагментами» (36): видима рамка', '/* «Відео за фрагментами»: кінець рамки */');
    const frame = /\.videoclip-frame \{([^}]*)\}/.exec(css)![1];
    expect(frame).toMatch(/(?:^|[\s;])width:\s*100%/);
    expect(frame).toMatch(/max-width:\s*100%/);
    expect(frame).toMatch(/aspect-ratio:\s*16 \/ 9/);
    for (const [, value, unit] of css.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    // Рамка на всю ширину поля телефона 320 − 2·12: 296 × 166,5 px.
    const width = 320 - 2 * 12;
    expect(width).toBeLessThanOrEqual(296);
    expect((width * 9) / 16).toBe(166.5);
    // П'ять комірок в один ряд — спільна з «Мелодією» драбинка.
    const ladder = cssSection('/* «Мелодія за нотами»: телефон (29e)', '/* «Мелодія за нотами»: кінець телефона */');
    expect(ladder).toMatch(/\.melody-steps \{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
    expect(ladder).toMatch(/\.melody-play \{[^}]*min-width:\s*0/);
    expect(document.querySelector('.videoclip-play')?.classList.contains('melody-play')).toBe(true);
  });

  it('another videoclip in the same slot starts afresh', async () => {
    const send = vi.fn<Send>(() => new Promise<SendResult>(() => undefined));
    const view = mount({ send });
    await act(async () => fireEvent.click(cells()[0]));
    expect(cells()[0].getAttribute('aria-label')).toBe(lab('videoclipReplay', 1));
    view.rerender(<VideoclipPlay info={infoOf()} question={questionOf({ id: 'q-other' })} questionIndex={0} paused={false} live send={send} onSubmit={vi.fn()} answer={null} />);
    expect(cells()[0].getAttribute('aria-label')).toBe(lab('videoclipWatch', 1));
  });
});

describe('VideoclipReveal', () => {
  const revealed: PublicVideoclip = { ...VIDEOCLIP, answer: 'Take On Me' };

  it('on demand plays only from a tap, with sound', () => {
    render(<VideoclipReveal videoclip={revealed} ready paused={false} onDemand />);
    expect(clip.play).not.toHaveBeenCalled();
    expect(opts.at(-1)?.reveal).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути ще раз' }));
    expect(clip.play).toHaveBeenCalledWith(SNIPPET_REVEAL_SECONDS);
  });

  it('the stage starts it once when ready and follows host commands', () => {
    const view = render(<VideoclipReveal videoclip={revealed} ready={false} paused={false} command={{ action: 'replay', seq: 3 }} />);
    expect(clip.play).not.toHaveBeenCalled();
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} command={{ action: 'replay', seq: 3 }} />);
    expect(clip.play).toHaveBeenCalledTimes(1);
    expect(clip.play).toHaveBeenCalledWith(SNIPPET_REVEAL_SECONDS);
    expect(screen.queryByRole('button', { name: 'Переглянути ще раз' })).toBeNull();
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} command={{ action: 'stop', seq: 4 }} />);
    expect(clip.stop).toHaveBeenCalledTimes(1);
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} command={{ action: 'replay', seq: 5 }} />);
    expect(clip.play).toHaveBeenCalledTimes(2);
  });

  it('a muted fallback offers the sound', () => {
    clip.state = 'muted-fallback';
    render(<VideoclipReveal videoclip={revealed} ready paused={false} />);
    fireEvent.click(screen.getByRole('button', { name: '🔊 Увімкнути звук' }));
    expect(clip.unmute).toHaveBeenCalled();
  });

  it('a host replay waits for a ready reveal and for the pause to end', () => {
    const view = render(<VideoclipReveal videoclip={revealed} ready={false} paused={false} command={null} />);
    view.rerender(<VideoclipReveal videoclip={revealed} ready={false} paused={false} command={{ action: 'replay', seq: 1 }} />);
    expect(clip.play).not.toHaveBeenCalled();
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused command={{ action: 'replay', seq: 1 }} />);
    expect(clip.play).not.toHaveBeenCalled();
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused command={{ action: 'replay', seq: 2 }} />);
    expect(clip.play).not.toHaveBeenCalled();
    // Кінець паузи: автостарт (він же — відкладене «Ще раз») грає один раз.
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} command={{ action: 'replay', seq: 2 }} />);
    expect(clip.play).toHaveBeenCalledTimes(1);
  });

  it('a pause mid-reveal resumes the video afterwards', () => {
    const view = render(<VideoclipReveal videoclip={revealed} ready paused={false} />);
    expect(clip.play).toHaveBeenCalledTimes(1);
    clip.playing = SNIPPET_REVEAL_SECONDS;
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} />);
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused />);
    clip.playing = null;
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused />);
    expect(clip.play).toHaveBeenCalledTimes(1);
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} />);
    expect(clip.play).toHaveBeenCalledTimes(2);
    expect(clip.play).toHaveBeenLastCalledWith(SNIPPET_REVEAL_SECONDS);
    // Пауза, коли нічого не грало, після себе нічого не вмикає.
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused />);
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} />);
    expect(clip.play).toHaveBeenCalledTimes(2);
  });

  it('a stop during a pause cancels the resume', () => {
    const view = render(<VideoclipReveal videoclip={revealed} ready paused={false} command={null} />);
    clip.playing = SNIPPET_REVEAL_SECONDS;
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} command={null} />);
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused command={null} />);
    clip.playing = null;
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused command={{ action: 'stop', seq: 1 }} />);
    view.rerender(<VideoclipReveal videoclip={revealed} ready paused={false} command={{ action: 'stop', seq: 1 }} />);
    expect(clip.play).toHaveBeenCalledTimes(1);
  });
});

describe('VideoclipStage', () => {
  const revealed: PublicVideoclip = { ...VIDEOCLIP, answer: 'Take On Me' };
  const info = { rows: [{ playerId: 'p1', nickname: 'Оля', heard: 2, answered: true, correct: true, points: 800, timeMs: 4000 }] };

  it('before reveal only tiles, no frame and no title', () => {
    render(<VideoclipStage info={info} videoclip={VIDEOCLIP} reveal={false} />);
    expect(document.querySelector('.melody-board')?.textContent).toBe('Оля👁 2 с ✓');
    expect(screen.queryByTestId('videoclip-frame')).toBeNull();
  });

  it('on reveal the stage plays with sound and follows the host stop', () => {
    const view = render(<VideoclipStage info={info} videoclip={revealed} reveal ready paused={false} command={null} />);
    expect(screen.getByText('Це було: «Take On Me»')).toBeTruthy();
    expect(screen.getByTestId('videoclip-frame')).toBeTruthy();
    expect(opts.at(-1)?.reveal).toBe(true);
    expect(clip.play).toHaveBeenCalledWith(SNIPPET_REVEAL_SECONDS);
    view.rerender(<VideoclipStage info={info} videoclip={revealed} reveal ready paused={false} command={{ action: 'stop', seq: 1 }} />);
    expect(clip.stop).toHaveBeenCalledTimes(1);
  });

  it('a muted autoplay offers sound on the stage', () => {
    clip.state = 'muted-fallback';
    render(<VideoclipStage info={info} videoclip={revealed} reveal ready paused={false} />);
    fireEvent.click(screen.getByRole('button', { name: '🔊 Увімкнути звук' }));
    expect(clip.unmute).toHaveBeenCalledTimes(1);
  });

  it('the host gets the table without the title or a frame', () => {
    render(<VideoclipStage info={info} videoclip={revealed} reveal host />);
    expect(screen.queryByText('Це було: «Take On Me»')).toBeNull();
    expect(screen.queryByTestId('videoclip-frame')).toBeNull();
    expect(document.querySelectorAll('.melody-table tbody tr')).toHaveLength(1);
  });
});

function cssSection(from: string, to: string): string {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  const start = css.indexOf(from);
  expect(start).toBeGreaterThan(0);
  return css.slice(start, css.indexOf(to, start));
}
