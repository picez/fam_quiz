// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AWAY_MS, type OwnAway } from '@quiz/shared';
// Vitest підміняє CSS порожнім рядком (і з ?raw), тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { playSiren, sirenReady, unlockSiren } from '../siren';
import { loadAlarmSeen } from '../storage';
import { alarmKey, AwayAlarm, AwayNote } from './AwayAlarm';

const { stop } = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock('../siren', () => ({ playSiren: vi.fn(() => stop), unlockSiren: vi.fn(), sirenReady: vi.fn(() => true), sirenSupported: vi.fn(() => true) }));

let visibility: 'visible' | 'hidden' = 'visible';
let vibrate: ReturnType<typeof vi.fn>;
const away = (over: Partial<OwnAway> = {}): OwnAway => ({ play: 3, ms: 4200, count: 1, out: false, penalty: false, ...over });
const Alarm = ({ value, person = 'p1' }: { value: OwnAway | null; person?: string }) => <AwayAlarm code="123456" person={person} away={value} />;

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
  vibrate = vi.fn(() => true);
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  vi.mocked(playSiren).mockClear();
  vi.mocked(unlockSiren).mockClear();
  vi.mocked(sirenReady).mockReset().mockReturnValue(true);
  stop.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('alarmKey', () => {
  it('a closed leave from the mark gives its key, with the person', () => {
    expect(alarmKey('123456', 'p1', away())).toBe('123456:p1:3:1');
    expect(alarmKey('123456', 'm2', away({ ms: AWAY_MS.mark }))).toBe('123456:m2:3:1');
    // Той самий код і запитання в давній грі (інша людина) — інший ключ.
    expect(alarmKey('123456', 'p9', away())).toBe('123456:p9:3:1');
  });

  it('nothing for no leave, a leave still open or a short one', () => {
    expect(alarmKey('123456', 'p1', null)).toBeNull();
    expect(alarmKey('123456', 'p1', away({ out: true }))).toBeNull();
    expect(alarmKey('123456', 'p1', away({ ms: AWAY_MS.mark - 1 }))).toBeNull();
    expect(alarmKey('123456', 'p1', away({ count: 0 }))).toBeNull();
  });
});

describe('AwayAlarm', () => {
  it('turns the screen red with the alarm text, the siren and the vibration', () => {
    render(<Alarm value={away()} />);
    const alert = screen.getByRole('alert');
    expect(alert.className).toBe('away-alarm');
    expect(alert.textContent).toContain('🚨 Вихід із гри під час запитання!');
    expect(alert.querySelector('[aria-hidden="true"]')?.textContent).toBe('🚨');
    expect(alert.textContent).not.toContain('0 балів');
    expect(playSiren).toHaveBeenCalledTimes(1);
    expect(playSiren).toHaveBeenCalledWith(AWAY_MS.alarm);
    expect(vibrate).toHaveBeenCalledWith([300, 100, 300, 100, 300]);
    expect(loadAlarmSeen()).toBe('123456:p1:3:1');
  });

  it('without vibration it still alarms', () => {
    Reflect.deleteProperty(navigator, 'vibrate');
    render(<Alarm value={away()} />);
    expect(screen.getByRole('alert')).not.toBeNull();
  });

  it('says the question gives 0 with the penalty', () => {
    render(<Alarm value={away({ penalty: true })} />);
    expect(screen.getByRole('alert').textContent).toContain('0 балів за це запитання');
  });

  it('a penalty that arrives for the same leave while shown updates the text without a restart', () => {
    const { rerender } = render(<Alarm value={away()} />);
    act(() => vi.advanceTimersByTime(1000));
    rerender(<Alarm value={away({ penalty: true })} />);
    expect(screen.getByRole('alert').textContent).toContain('0 балів за це запитання');
    expect(playSiren).toHaveBeenCalledTimes(1);
    expect(stop).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm - 1000));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('goes away by itself after the alarm time and stops the siren', () => {
    render(<Alarm value={away()} />);
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm - 1));
    expect(screen.queryByRole('alert')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(stop).toHaveBeenCalled();
  });

  it('a tap closes it early, stops the siren and unlocks the siren for the next time', () => {
    render(<Alarm value={away()} />);
    fireEvent.click(screen.getByRole('alert'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(stop).toHaveBeenCalled();
    expect(unlockSiren).toHaveBeenCalled();
  });

  it('a silent siren (sound not unlocked when it fired): the first tap unlocks and plays it again and keeps the alarm, the second tap closes', () => {
    vi.mocked(sirenReady).mockReturnValue(false);
    render(<Alarm value={away()} />);
    expect(playSiren).toHaveBeenCalledTimes(1);
    // Капчер-слухач сторінки міг уже розбудити звук до onClick шару: рішення — за станом у мить спрацювання.
    vi.mocked(sirenReady).mockReturnValue(true);
    fireEvent.click(screen.getByRole('alert'));
    expect(unlockSiren).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alert')).not.toBeNull();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(playSiren).toHaveBeenCalledTimes(2);
    expect(vi.mocked(playSiren).mock.calls[1]).toEqual([AWAY_MS.alarm]);
    expect(vi.mocked(unlockSiren).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(playSiren).mock.invocationCallOrder[1]);
    fireEvent.click(screen.getByRole('alert'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });

  it('a silent siren replayed by a tap closes after its own time or by Escape', () => {
    vi.mocked(sirenReady).mockReturnValue(false);
    render(<Alarm value={away()} />);
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm - 500));
    fireEvent.click(screen.getByRole('alert'));
    // Час шару починається знову разом із новою сиреною.
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm - 1));
    expect(screen.queryByRole('alert')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    localStorage.clear();
    render(<Alarm value={away({ count: 2 })} />);
    fireEvent.click(screen.getByRole('alert'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a silent siren that times out without a tap just closes', () => {
    vi.mocked(sirenReady).mockReturnValue(false);
    render(<Alarm value={away()} />);
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(1);
  });

  it('a siren that was ready: one tap closes, no replay', () => {
    render(<Alarm value={away()} />);
    fireEvent.click(screen.getByRole('alert'));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(1);
  });

  it('Escape closes it', () => {
    render(<Alarm value={away()} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(stop).toHaveBeenCalled();
  });

  it('the rest of the screen is inert while shown and comes back after', () => {
    const { container } = render(
      <main>
        <button type="button">Відповісти</button>
        <p className="already" inert>
          x
        </p>
        <Alarm value={away()} />
      </main>,
    );
    const button = container.querySelector('button')!;
    expect(button.hasAttribute('inert')).toBe(true);
    expect(container.querySelector('.away-alarm')!.hasAttribute('inert')).toBe(false);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(button.hasAttribute('inert')).toBe(false);
    // Те, що було inert до тривоги, таким і лишається.
    expect(container.querySelector('.already')!.hasAttribute('inert')).toBe(true);
  });

  it('once per leave: a fresh mount with the same leave (reload) stays quiet, the next leave alarms again', () => {
    const first = render(<Alarm value={away()} />);
    first.unmount();
    expect(stop).toHaveBeenCalled();
    vi.mocked(playSiren).mockClear();
    const again = render(<Alarm value={away()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).not.toHaveBeenCalled();
    again.rerender(<Alarm value={away({ count: 2, ms: 6100 })} />);
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(1);
  });

  it('a leave seen on the next question (no count growth seen by this mount) still alarms once', () => {
    const { rerender } = render(<Alarm value={null} />);
    rerender(<Alarm value={away({ play: 4, count: 1 })} />);
    expect(screen.getByRole('alert')).not.toBeNull();
    expect(loadAlarmSeen()).toBe('123456:p1:4:1');
  });

  it('one leave over two questions rings once: the open next question first, then its closed leave', () => {
    // Сервер: поки інтервал наступного запитання відкритий, lastAway — він з out (а не закритий попередній).
    const { rerender } = render(<Alarm value={away({ play: 4, ms: 0, count: 0, out: true })} />);
    expect(screen.queryByRole('alert')).toBeNull();
    rerender(<Alarm value={away({ play: 4, ms: 9000, count: 1, out: false })} />);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(playSiren).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(AWAY_MS.alarm));
    rerender(<Alarm value={away({ play: 4, ms: 9000, count: 1, out: false, penalty: true })} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).toHaveBeenCalledTimes(1);
  });

  it('nothing while the leave is open, below the mark or without a leave', () => {
    const { rerender } = render(<Alarm value={away({ out: true })} />);
    rerender(<Alarm value={away({ ms: 1500 })} />);
    rerender(<Alarm value={null} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('a hidden page waits and alarms the moment it is visible again', () => {
    visibility = 'hidden';
    render(<Alarm value={away()} />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(playSiren).not.toHaveBeenCalled();
    expect(loadAlarmSeen()).toBeNull();
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
    render(<Alarm value={away()} />);
    expect(screen.getByRole('alert')).not.toBeNull();
    getItem.mockRestore();
    setItem.mockRestore();
  });
});

describe('AwayNote', () => {
  it('says how long the phone was out, from the mark', () => {
    const { container, rerender } = render(<AwayNote away={away({ ms: 8400 })} />);
    expect(container.querySelector('.away-note')?.textContent).toBe('Тебе не було в грі 8 с — ведучий і екран це бачать');
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
