// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlayerSpotdiff, PublicQuestion, PublicSpotdiff } from '@quiz/shared';
import { t } from '../i18n';
import type { Send, SendResult } from '../live/types';
import { SpotdiffPictures, SpotdiffPlay, SpotdiffReveal } from './SpotdiffView';

const SPOT: PublicSpotdiff = { original: '/uploads/0123456789abcdef0001.png', changed: '/uploads/0123456789abcdef0002.png', aspect: 4 / 3, total: 3, spots: null };
const infoOf = (over: Partial<PlayerSpotdiff> = {}): PlayerSpotdiff => ({ found: [], total: 3, done: false, canTap: true, seq: 0, timeMs: null, result: null, ...over });
const questionOf = (spotdiff: Partial<PublicSpotdiff> = {}) => ({ type: 'spotdiff', text: 'Знайдіть відмінності', spotdiff: { ...SPOT, ...spotdiff } }) as unknown as PublicQuestion;

/** Перша картинка 288 × 216 у (16, 100), друга — та сама рамка нижче, у (16, 340). */
const RECTS: Record<string, { left: number; top: number }> = { original: { left: 16, top: 100 }, changed: { left: 16, top: 340 } };
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = this.dataset.pic === undefined ? undefined : RECTS[this.dataset.pic];
    const width = at === undefined ? 0 : 288;
    const height = at === undefined ? 0 : 216;
    const left = at?.left ?? 0;
    const top = at?.top ?? 0;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) };
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const pic = (which: 'original' | 'changed') => document.querySelector<HTMLElement>(`[data-pic="${which}"]`)!;
const tapAt = (el: HTMLElement, clientX: number, clientY: number) => {
  fireEvent.pointerDown(el, { pointerId: 1, clientX, clientY });
  fireEvent.pointerUp(el, { pointerId: 1, clientX, clientY });
};

function mount(over: { info?: PlayerSpotdiff; send?: ReturnType<typeof vi.fn<Send>>; questionIndex?: number } = {}) {
  const send = over.send ?? vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: true }));
  const view = render(<SpotdiffPlay info={over.info ?? infoOf()} question={questionOf()} questionIndex={over.questionIndex ?? 1} paused={false} timeUp={false} send={send} />);
  return { send, ...view };
}

describe('SpotdiffPlay', () => {
  it('both pictures take taps', () => {
    const { send } = mount();
    // Точка (0.25, 0.5) кожної картинки.
    tapAt(pic('original'), 16 + 72, 100 + 108);
    tapAt(pic('changed'), 16 + 72, 340 + 108);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]).toEqual(['player:spotdiff', { questionIndex: 1, x: 0.25, y: 0.5, width: 288 }]);
    expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
  });

  it('a drag is not a tap', () => {
    const { send } = mount();
    fireEvent.pointerDown(pic('changed'), { pointerId: 1, clientX: 50, clientY: 400 });
    fireEvent.pointerUp(pic('changed'), { pointerId: 1, clientX: 50, clientY: 430 });
    expect(send).not.toHaveBeenCalled();
  });

  it('found circles show on both pictures', () => {
    mount({ info: infoOf({ found: [{ index: 1, x: 0.3, y: 0.6, r: 0.05, tone: null }], seq: 1 }) });
    expect(document.querySelectorAll('.spot-ring circle')).toHaveLength(2);
    expect(pic('original').querySelectorAll('.spot-ring')).toHaveLength(1);
    expect(pic('changed').querySelectorAll('.spot-ring')).toHaveLength(1);
    expect(screen.getByText(t('spotdiffFound', { found: 1, total: 3 }))).toBeTruthy();
  });

  it('a teammate tone colours the ring', () => {
    mount({ info: infoOf({ found: [{ index: 0, x: 0.3, y: 0.6, r: 0.05, tone: '2' }] }) });
    expect(document.querySelectorAll('.spot-ring.by-2')).toHaveLength(2);
  });

  it('a miss shows a red cross where the finger was', async () => {
    mount({ send: vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: false, error: 'spotdiff_miss' })) });
    await act(async () => tapAt(pic('changed'), 16 + 144, 340 + 54));
    expect(document.querySelectorAll('.spot-miss')).toHaveLength(2);
    expect(Number(pic('changed').querySelector('.spot-miss line')!.getAttribute('x1'))).toBeCloseTo(0.5 - 0.025);
  });

  it('frozen pictures look frozen', async () => {
    const send = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: false, error: 'spotdiff_freeze' }));
    mount({ send });
    await act(async () => tapAt(pic('original'), 40, 140));
    expect(pic('original').classList.contains('spot-frozen')).toBe(true);
    expect(pic('changed').classList.contains('spot-frozen')).toBe(true);
    expect(screen.getAllByText(t('spotdiffFrozen'))).toHaveLength(2);
    tapAt(pic('changed'), 40, 380);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('all found says so with the time and takes no taps', () => {
    const send = vi.fn<Send>();
    const found = [0, 1, 2].map((index) => ({ index, x: 0.2 * (index + 1), y: 0.5, r: 0.05, tone: null }));
    mount({ send, info: infoOf({ found, done: true, canTap: false, timeMs: 41_500 }) });
    expect(screen.getByRole('status').textContent).toBe(`${t('spotdiffAllFound')} · ${t('jigsawSeconds', { time: '41,5' })}`);
    tapAt(pic('original'), 40, 140);
    expect(send).not.toHaveBeenCalled();
  });

  it('a paused question takes no taps', () => {
    const send = vi.fn<Send>();
    render(<SpotdiffPlay info={infoOf()} question={questionOf()} questionIndex={1} paused timeUp={false} send={send} />);
    tapAt(pic('original'), 40, 140);
    expect(send).not.toHaveBeenCalled();
  });

  it('another spotdiff in the same slot starts afresh', async () => {
    const send = vi.fn<Send>(() => Promise.resolve<SendResult>({ ok: false, error: 'spotdiff_freeze' }));
    const props = { info: infoOf(), questionIndex: 1, paused: false, timeUp: false, send };
    const view = render(<SpotdiffPlay {...props} question={questionOf()} />);
    await act(async () => tapAt(pic('original'), 40, 140));
    expect(pic('original').classList.contains('spot-frozen')).toBe(true);
    expect(document.querySelectorAll('.spot-miss').length).toBeGreaterThan(0);
    view.rerender(<SpotdiffPlay {...props} question={questionOf({ changed: '/uploads/0123456789abcdef0003.png' })} />);
    expect(pic('original').classList.contains('spot-frozen')).toBe(false);
    expect(document.querySelectorAll('.spot-miss')).toHaveLength(0);
  });

  it('fits 320 px', () => {
    mount();
    // Жодної фіксованої ширини в розмітці: рамки тягнуться за шириною екрана.
    for (const el of document.querySelectorAll<HTMLElement>('.spot-play, .spot-pictures, .spot-pic')) expect(el.style.width).toBe('');
    const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
    const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');
    const start = css.indexOf('/* «Знайди відмінності»: телефон (29d)');
    const section = css.slice(start, css.indexOf('/* «Знайди відмінності»: кінець телефона */'));
    expect(start).toBeGreaterThan(0);
    for (const [, value, unit] of section.matchAll(/(?:^|[\s;{])(?:min-)?width:\s*([\d.]+)(px|rem)/g)) {
      expect(Number(value) * (unit === 'rem' ? 16 : 1)).toBeLessThanOrEqual(320);
    }
    // На вузькому екрані — один стовпець (одна над одною), кожна рамка не вища за 38dvh; поруч — лише від 640 px.
    const narrow = section.slice(0, section.indexOf('@media (min-width: 640px)'));
    expect(narrow).toMatch(/\.spot-pictures \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
    expect(narrow).toMatch(/\.spot-pic \{[^}]*width:\s*min\(100%,\s*calc\(38dvh \* var\(--ar/);
    expect(section).toMatch(/@media \(min-width: 640px\) \{\s*\.spot-pictures \{\s*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(narrow).toMatch(/\.spot-pic > img \{[^}]*object-fit:\s*fill/);
  });
});

describe('SpotdiffPictures', () => {
  it('without onTap the pictures only show', () => {
    render(<SpotdiffPictures spotdiff={SPOT} circles={[{ x: 0.5, y: 0.5, r: 0.1, tone: null, label: '1' }]} />);
    expect(pic('original').classList.contains('is-tap')).toBe(false);
    expect(document.querySelectorAll('.spot-ring text')).toHaveLength(2);
    expect(screen.getByAltText(t('spotdiffOriginal'))).toBeTruthy();
    expect(screen.getByAltText(t('spotdiffChanged'))).toBeTruthy();
  });
});

describe('SpotdiffReveal', () => {
  it('shows every circle, mine solid and the rest dashed', () => {
    const spots = [
      { x: 0.2, y: 0.2, r: 0.05 },
      { x: 0.5, y: 0.5, r: 0.05 },
      { x: 0.8, y: 0.8, r: 0.05 },
    ];
    const mine = infoOf({ found: [{ index: 1, ...spots[1], tone: null }], canTap: false, result: { points: 100 } });
    render(<SpotdiffReveal mine={mine} question={questionOf({ spots })} />);
    expect(pic('changed').querySelectorAll('.spot-ring')).toHaveLength(3);
    expect(pic('changed').querySelectorAll('.spot-ring.is-missed')).toHaveLength(2);
    expect(screen.getByText(t('spotdiffFound', { found: 1, total: 3 }))).toBeTruthy();
  });
});
