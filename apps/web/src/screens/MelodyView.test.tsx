// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerMelody, PublicMelody, PublicQuestion } from '@quiz/shared';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';

const calls: string[] = [];
const clip = {
  play: vi.fn((seconds: number) => {
    calls.push(`play:${seconds}`);
  }),
  stop: vi.fn(() => {
    calls.push('stop');
  }),
  state: 'idle' as 'idle' | 'playing' | 'blocked' | 'failed',
  playing: null as number | null,
};

vi.mock('../live/useMelodyClip', () => ({
  useMelodyClip: () => ({ ...clip, element: <audio data-testid="melody-audio" /> }),
}));

const { MelodyPlay } = await import('./MelodyView');

const MELODY: PublicMelody = { id: 'q-mel', track: { source: 'file', url: '/uploads/0123456789abcdef0001.mp3', start: 12 }, answer: null };
const questionOf = (melody: Partial<PublicMelody> = {}) =>
  ({ type: 'melody', text: 'Що це за пісня?', choices: [], melody: { ...MELODY, ...melody } }) as unknown as PublicQuestion & { melody: PublicMelody };
const infoOf = (over: Partial<PlayerMelody> = {}): PlayerMelody => ({ heard: 0, canOpen: true, canAnswer: false, openedBy: null, ...over });

beforeEach(() => {
  calls.length = 0;
  clip.play.mockClear();
  clip.stop.mockClear();
  clip.state = 'idle';
  clip.playing = null;
});

afterEach(() => {
  cleanup();
});

function mount(over: { info?: PlayerMelody; send?: ReturnType<typeof vi.fn<Send>>; question?: PublicQuestion & { melody: PublicMelody }; answer?: string | null } = {}) {
  const send =
    over.send ??
    vi.fn<Send>(() => {
      calls.push('send');
      return Promise.resolve<SendResult>({ ok: true });
    });
  const onSubmit = vi.fn();
  const view = render(
    <MelodyPlay info={over.info ?? infoOf()} question={over.question ?? questionOf()} questionIndex={0} paused={false} live send={send} onSubmit={onSubmit} answer={over.answer} />,
  );
  return { send, onSubmit, ...view };
}

const cells = () => [...document.querySelectorAll<HTMLButtonElement>('.melody-step')];

describe('MelodyPlay', () => {
  it('the first tap plays and sends the round-local number', async () => {
    const { send } = mount();
    expect(cells()).toHaveLength(5);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: t('melodyListen', { seconds: 1 }) })));
    expect(clip.play).toHaveBeenCalledWith(1);
    expect(send).toHaveBeenCalledWith('player:melody', { questionIndex: 0, step: 1 });
    expect(calls).toEqual(['play:1', 'send']);
    // Поки ack немає, шматок уже відкритий локально.
    expect(cells()[0].getAttribute('aria-label')).toBe(t('melodyReplay', { seconds: 1 }));
  });

  it('only the next chunk can be opened', async () => {
    const { send } = mount({ info: infoOf({ heard: 2, canAnswer: true }) });
    const all = cells();
    expect(all[0].getAttribute('aria-label')).toBe(t('melodyReplay', { seconds: 1 }));
    expect(all[1].getAttribute('aria-label')).toBe(t('melodyReplay', { seconds: 2 }));
    expect(all[2].getAttribute('aria-label')).toBe(t('melodyMore', { seconds: 4 }));
    expect(all[2].disabled).toBe(false);
    expect(all[3].disabled).toBe(true);
    expect(all[4].disabled).toBe(true);
    await act(async () => fireEvent.click(all[0]));
    expect(clip.play).toHaveBeenCalledWith(1);
    expect(send).not.toHaveBeenCalled();
  });

  it('a refused chunk stops the sound', async () => {
    const send = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: false, error: 'time_over' }));
    mount({ send });
    await act(async () => fireEvent.click(cells()[0]));
    expect(clip.play).toHaveBeenCalledWith(1);
    expect(clip.stop).toHaveBeenCalled();
    expect(cells()[0].getAttribute('aria-label')).toBe(t('melodyListen', { seconds: 1 }));
    expect(screen.getByText(errorText('time_over'))).toBeTruthy();
  });

  it('the answer waits for a chunk', () => {
    const view = mount();
    const input = screen.getByRole('textbox') as HTMLInputElement;
    const submit = screen.getByRole('button', { name: t('submit') }) as HTMLButtonElement;
    expect(input.disabled).toBe(true);
    expect(submit.disabled).toBe(true);
    expect(screen.getByText(t('melodyListenFirst'))).toBeTruthy();
    const onSubmit = vi.fn();
    view.rerender(<MelodyPlay info={infoOf({ heard: 1, canAnswer: true })} question={questionOf()} questionIndex={0} paused={false} live send={view.send} onSubmit={onSubmit} />);
    const enabled = screen.getByRole('textbox') as HTMLInputElement;
    expect(enabled.disabled).toBe(false);
    fireEvent.change(enabled, { target: { value: ' Щедрик ' } });
    const button = screen.getByRole('button', { name: t('submit') }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onSubmit).toHaveBeenCalledWith({ type: 'melody', value: 'Щедрик' });
  });

  it('the share follows the longest chunk', () => {
    mount({ info: infoOf({ heard: 3, canAnswer: true }) });
    expect(screen.getByText(t('melodyShareNow', { share: 60 }))).toBeTruthy();
  });

  it('a teammate chunk shows who opened it', () => {
    mount({ info: infoOf({ heard: 2, canAnswer: true, openedBy: 'Тарас' }) });
    expect(screen.getByText(t('melodyOpenedBy', { name: 'Тарас', seconds: 2 }))).toBeTruthy();
    expect(clip.play).not.toHaveBeenCalled();
  });

  it('after the answer only replays', () => {
    mount({ info: infoOf({ heard: 3, canOpen: false, canAnswer: false }), answer: 'Щедрик' });
    expect(screen.getByText(t('melodyAnswered', { seconds: 4 }))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('melodyMore', { seconds: 8 }) })).toBeNull();
    expect(cells()[2].getAttribute('aria-label')).toBe(t('melodyReplay', { seconds: 4 }));
    expect(cells()[3].disabled).toBe(true);
    // Поле відповіді вже не потрібне.
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('a blocked sound says so in a status line', () => {
    clip.state = 'blocked';
    mount({ info: infoOf({ heard: 1, canAnswer: true }) });
    expect(screen.getByRole('status').textContent).toContain(t('melodyBlocked'));
  });

  it('the playing chunk is pressed', () => {
    clip.playing = 2;
    mount({ info: infoOf({ heard: 2, canAnswer: true }) });
    expect(cells()[1].getAttribute('aria-pressed')).toBe('true');
    expect(cells()[0].getAttribute('aria-pressed')).toBe('false');
  });

  it('fits 320 px', () => {
    mount({ info: infoOf({ heard: 2, canAnswer: true }) });
    for (const el of document.querySelectorAll<HTMLElement>('.melody-play, .melody-steps, .melody-step')) expect(el.style.width).toBe('');
    const css = cssSection();
    for (const [, value, unit] of css.matchAll(/(?:^|[\s;{])(?:min-|max-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    const gap = Number(/\.melody-steps \{[^}]*gap:\s*([\d.]+)px/.exec(css)![1]);
    expect(css).toMatch(/\.melody-steps \{[^}]*grid-template-columns:\s*repeat\(5, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.melody-step \{[^}]*min-width:\s*0/);
    // Поле телефона 320 − 2·12, п'ять комірок і чотири проміжки.
    const cell = (320 - 2 * 12 - 4 * gap) / 5;
    expect(cell).toBeLessThanOrEqual((320 - 2 * 12 - 4 * 6) / 5);
    expect(5 * cell + 4 * gap).toBeLessThanOrEqual(320);
  });

  it('another melody in the same slot starts afresh', async () => {
    const send = vi.fn<Send>(() => new Promise<SendResult>(() => undefined));
    const view = mount({ send });
    await act(async () => fireEvent.click(cells()[0]));
    expect(cells()[0].getAttribute('aria-label')).toBe(t('melodyReplay', { seconds: 1 }));
    view.rerender(<MelodyPlay info={infoOf()} question={questionOf({ id: 'q-other' })} questionIndex={0} paused={false} live send={send} onSubmit={vi.fn()} />);
    expect(cells()[0].getAttribute('aria-label')).toBe(t('melodyListen', { seconds: 1 }));
  });
});

function cssSection(): string {
  const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
  const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
  const start = css.indexOf('/* «Мелодія за нотами»: телефон (29e)');
  expect(start).toBeGreaterThan(0);
  return css.slice(start, css.indexOf('/* «Мелодія за нотами»: кінець телефона */'));
}
