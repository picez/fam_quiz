// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_MS, type OwnAway } from '@quiz/shared';
// Vitest підміняє CSS порожнім рядком (і з ?raw), тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { playSiren } from '../siren';
import { loadAlarmSeen } from '../storage';
import { alarmKey, AwayAlarm, AwayNote } from './AwayAlarm';

const { stop } = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock('../siren', () => ({ playSiren: vi.fn(() => stop) }));

let visibility: 'visible' | 'hidden' = 'visible';
const away = (over: Partial<OwnAway> = {}): OwnAway => ({ play: 3, ms: 4200, count: 1, out: false, penalty: false, ...over });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vi.mocked(playSiren).mockClear();
  stop.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
});

describe('alarmKey', () => {
  it('a closed leave from the mark that was not shown yet gives its key', () => {
    expect(alarmKey('123456', away(), null)).toBe('123456:3:1');
    expect(alarmKey('123456', away({ ms: AWAY_MS.mark }), '123456:3:0')).toBe('123456:3:1');
  });

  it('nothing for no leave, a leave still open, a short one or one already shown', () => {
    expect(alarmKey('123456', null, null)).toBeNull();
    expect(alarmKey('123456', away({ out: true }), null)).toBeNull();
    expect(alarmKey('123456', away({ ms: AWAY_MS.mark - 1 }), null)).toBeNull();
    expect(alarmKey('123456', away({ count: 0 }), null)).toBeNull();
    expect(alarmKey('123456', away(), '123456:3:1')).toBeNull();
  });
});

describe('AwayAlarm', () => {
  it('turns the screen red with the alarm text and the siren', () => {
    render(<AwayAlarm code="123456" away={away()} />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toBe('away-alarm');
    expect(alert.textContent).toContain('🚨 Ти виходив із гри під час запитання!');
    expect(alert.textContent).not.toContain('0 балів');
    expect(playSiren).toHaveBeenCalledTimes(1);
    expect(playSiren).toHaveBeenCalledWith(AWAY_MS.alarm);
    expect(loadAlarmSeen('123456')).toBe('123456:3:1');
  });

  it('says the question gives 0 with the penalty', () => {
    render(<AwayAlarm code="123456" away={away({ penalty: true })} />);
    expect(screen.getByRole('alert').textContent).toContain('0 балів за це запитання');
  });

  it('goes away by itself after the alarm time and stops the siren', () => {
    render(<AwayAlarm code="123456" away={away()} />);
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm - 1));
    expect(screen.queryByRole('alert')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(stop).toHaveBeenCalled();
  });

  it('a tap closes it early and stops the siren', () => {
    render(<AwayAlarm code="123456" away={away()} />);
    fireEvent.click(screen.getByRole('alert'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(stop).toHaveBeenCalled();
  });

  it('once per leave: a fresh mount with the same leave (reload) stays quiet, the next leave alarms again', () => {
    const first = render(<AwayAlarm code="123456" away={away()} />);
    first.unmount();
    expect(stop).toHaveBeenCalled();
    vi.mocked(playSiren).mockClear();
    const again = render(<AwayAlarm code="123456" away={away()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).not.toHaveBeenCalled();
    again.rerender(<AwayAlarm code="123456" away={away({ count: 2, ms: 6100 })} />);
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(1);
  });

  it('a leave seen on the next question (no count growth seen by this mount) still alarms once', () => {
    const { rerender } = render(<AwayAlarm code="123456" away={null} />);
    rerender(<AwayAlarm code="123456" away={away({ play: 4, count: 1 })} />);
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(loadAlarmSeen('123456')).toBe('123456:4:1');
  });

  it('nothing while the leave is open, below the mark or without a leave', () => {
    const { rerender } = render(<AwayAlarm code="123456" away={away({ out: true })} />);
    rerender(<AwayAlarm code="123456" away={away({ ms: 1500 })} />);
    rerender(<AwayAlarm code="123456" away={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).not.toHaveBeenCalled();
  });

  it('a hidden page waits and alarms the moment it is visible again', () => {
    visibility = 'hidden';
    render(<AwayAlarm code="123456" away={away()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).not.toHaveBeenCalled();
    expect(loadAlarmSeen('123456')).toBeNull();
    visibility = 'visible';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(1);
  });

  it('broken storage still alarms', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    render(<AwayAlarm code="123456" away={away()} />);
    expect(screen.getByRole('alert')).not.toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('AwayNote', () => {
  it('says how long the phone was out, from the mark', () => {
    const { container, rerender } = render(<AwayNote away={away({ ms: 8400 })} />);
    expect(container.querySelector('.away-note')?.textContent).toBe('Ти виходив із гри на 8 с — це видно всім');
    rerender(<AwayNote away={away({ ms: 8400, penalty: true })} />);
    expect(container.querySelector('.away-note')?.textContent).toContain('За це запитання буде 0 балів');
    rerender(<AwayNote away={away({ ms: 1500 })} />);
    expect(container.querySelector('.away-note')).toBeNull();
    rerender(<AwayNote away={null} />);
    expect(container.querySelector('.away-note')).toBeNull();
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

/** Чи стоїть позиція всередині блоку @media (prefers-reduced-motion: no-preference). */
function insideNoPreference(index: number): boolean {
  const open = css.lastIndexOf('@media (prefers-reduced-motion: no-preference) {', index);
  if (open < 0) return false;
  const close = css.indexOf('\n}\n', open);
  return close > index;
}

describe('away alarm styles', () => {
  it('a fixed red layer above the splash, sheets and the offline banner', () => {
    const layer = rule('.away-alarm');
    expect(layer).toContain('position: fixed;');
    expect(layer).toContain('inset: 0;');
    expect(Number(/z-index: (\d+);/.exec(layer)?.[1])).toBeGreaterThan(90);
    expect(layer).toContain('background: #c62828;');
    expect(layer).not.toContain('animation');
  });

  it('pulses only without reduced motion', () => {
    const at = css.indexOf('animation: away-pulse');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(insideNoPreference(at)).toBe(true);
    expect(css.indexOf('animation: away-pulse', at + 1)).toBe(-1);
  });
});
