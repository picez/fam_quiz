// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerShop } from '@quiz/shared';
import type { Send } from '../live/types';
// Vitest підміняє CSS порожнім рядком, тож стилі читаються з диска; типів node у вебі немає.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { DebuffShop } from './DebuffShop';

// Тести запускаються з кореня репозиторію або з apps/web.
const cssPath = ['apps/web/src/styles.css', 'src/styles.css'].find((path) => existsSync(path) as boolean)!;
const css = (readFileSync(cssPath, 'utf8') as string).replace(/\r\n/g, '\n');

/** Тіло першого правила з точно цим селектором у styles.css. */
function rule(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);
  return css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start));
}

afterEach(cleanup);

const shop: PlayerShop = {
  items: [
    { kind: 'fog', price: 100 },
    { kind: 'mud', price: 300 },
  ],
  targets: [
    { playerId: 'p2', nickname: 'Петро', busy: false, offline: false },
    { playerId: 'p3', nickname: 'Іра', busy: true, offline: false },
  ],
  block: null,
};
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;
const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;

describe('DebuffShop', () => {
  it('buys fog for Петро in three taps and closes', async () => {
    const send = okSend();
    const onError = vi.fn();
    render(<DebuffShop shop={shop} score={250} send={send} onError={onError} />);
    const trigger = button('Дебафи');
    expect(trigger.textContent).toBe('😈');
    fireEvent.click(trigger);
    const sheet = screen.getByRole('dialog', { name: 'Дебафи для суперників' });
    expect(sheet.parentElement).toBe(document.body);
    expect(button(/Брудний екран/).disabled).toBe(true); // 300 > 250
    expect(screen.getByText('Не вистачає балів')).toBeTruthy();
    expect(button(/Туман/).textContent).toContain('100');
    expect(button(/Туман/).textContent).toContain('Туман — протріть екран пальцем.');
    fireEvent.click(button(/Туман/));
    expect(screen.getByText('Кому?')).toBeTruthy();
    expect(button(/Іра/).disabled).toBe(true);
    expect(screen.getByText('Уже має дебаф')).toBeTruthy();
    // Купити ще не можна: суперника не вибрано.
    expect(button('Купити за 100').disabled).toBe(true);
    fireEvent.click(button(/Петро/));
    expect(button(/Петро/).getAttribute('aria-pressed')).toBe('true');
    expect(send).not.toHaveBeenCalled();
    fireEvent.click(button('Купити за 100'));
    // Подвійний дотик не шле другого запиту.
    fireEvent.click(button('Купити за 100'));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('player:debuff', { targetId: 'p2', kind: 'fog' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onError).toHaveBeenLastCalledWith(null);
    // Фокус повертає очищення ефекту діалогу, що може виконатися вже після зникнення діалогу з DOM.
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('the sheet lists the five new debuffs with their names and lines, in a list that scrolls inside the card', () => {
    const fresh: PlayerShop = { ...shop, items: (['flip', 'torch', 'sticky', 'noclock', 'bubbles'] as const).map((kind) => ({ kind, price: 200 })) };
    render(<DebuffShop shop={fresh} score={1000} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    for (const name of [/Догори дриґом/, /Ліхтарик/, /Липкі кнопки/, /Без годинника/, /Бульбашки/]) expect(button(name)).toBeTruthy();
    expect(screen.getByText('Кнопки спрацьовують з другого дотику.')).toBeTruthy();
    expect(screen.getByText('Бульбашки закривають відповіді — лопайте.')).toBeTruthy();
    expect(rule('.shop-items')).toMatch(/overflow-y:\s*auto/);
    expect(rule('.shop-items')).toMatch(/max-height/);
  });

  it('an offline rival is shown as «Не в грі» and cannot be picked', () => {
    const away: PlayerShop = { ...shop, targets: [{ playerId: 'p2', nickname: 'Петро', busy: false, offline: true }] };
    render(<DebuffShop shop={away} score={250} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    fireEvent.click(button(/Туман/));
    expect(button(/Петро/).disabled).toBe(true);
    expect(screen.getByText('Не в грі')).toBeTruthy();
    expect(button('Купити за 100').disabled).toBe(true);
  });

  it('«Назад» returns to the debuff list', () => {
    render(<DebuffShop shop={shop} score={250} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    fireEvent.click(button(/Туман/));
    fireEvent.click(button('Назад'));
    expect(screen.queryByText('Кому?')).toBeNull();
    expect(button(/Брудний екран/)).toBeTruthy();
  });

  it('shows why buying is blocked and sends nothing', () => {
    const send = okSend();
    render(<DebuffShop shop={{ ...shop, block: 'bought' }} score={1000} send={send} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    expect(screen.getByText('Ви вже купили дебаф до наступного запитання')).toBeTruthy();
    expect(button(/Туман/).disabled).toBe(true);
    expect(button(/Брудний екран/).disabled).toBe(true);
    fireEvent.click(button(/Туман/));
    expect(screen.queryByText('Кому?')).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('a block that comes while the rival is picked disables the purchase', () => {
    const { rerender } = render(<DebuffShop shop={shop} score={250} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    fireEvent.click(button(/Туман/));
    fireEvent.click(button(/Петро/));
    rerender(<DebuffShop shop={{ ...shop, block: 'paused' }} score={250} send={okSend()} onError={vi.fn()} />);
    expect(screen.getByText('Гра на паузі')).toBeTruthy();
    expect(button('Купити за 100').disabled).toBe(true);
  });

  it('a refused purchase keeps the sheet open with the error', async () => {
    const send = vi.fn(async () => ({ ok: false as const, error: 'debuff_busy' })) as unknown as Send;
    const onError = vi.fn();
    render(<DebuffShop shop={shop} score={250} send={send} onError={onError} />);
    fireEvent.click(button('Дебафи'));
    fireEvent.click(button(/Туман/));
    fireEvent.click(button(/Петро/));
    fireEvent.click(button('Купити за 100'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('На цього гравця вже наслано дебаф.'));
    const sheet = screen.getByRole('dialog');
    expect(within(sheet).getByText('Кому?')).toBeTruthy();
    await waitFor(() => expect(button('Купити за 100').disabled).toBe(false));
  });

  it('Escape and a tap beside the card close the sheet; a tap inside does not', () => {
    render(<DebuffShop shop={shop} score={250} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    const sheet = screen.getByRole('dialog');
    expect(sheet.getAttribute('tabindex')).toBe('-1');
    fireEvent.click(within(sheet).getByText('Дебафи для суперників'));
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.click(sheet);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(button('Дебафи'));
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button('Дебафи'));
  });

  it('Tab stays inside the open sheet', () => {
    render(<DebuffShop shop={shop} score={250} send={okSend()} onError={vi.fn()} />);
    fireEvent.click(button('Дебафи'));
    const sheet = screen.getByRole('dialog');
    const close = within(sheet).getByRole('button', { name: 'Закрити' });
    close.focus();
    fireEvent.keyDown(close, { key: 'Tab' });
    expect(sheet.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(close);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(close);
  });
});
