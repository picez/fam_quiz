// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEBUFF_KINDS, type HostPlayer } from '@quiz/shared';
import type { Send } from '../live/types';
import { DebuffPanel, parseAdjust, PointsPanel } from './HostPlayerTools';

afterEach(cleanup);

const player = (over: Partial<HostPlayer> = {}): HostPlayer => ({ id: 'p1', nickname: 'Олена', connected: true, score: 0, streak: 0, debuff: null, ...over });
const okSend = () => vi.fn(async () => ({ ok: true as const })) as unknown as Send & ReturnType<typeof vi.fn>;
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement;

describe('parseAdjust', () => {
  it('parseAdjust accepts signed whole numbers within the limit', () => {
    expect(parseAdjust('−150')).toBe(-150);
    expect(parseAdjust('-150')).toBe(-150);
    expect(parseAdjust('+75')).toBe(75);
    expect(parseAdjust(' 75 ')).toBe(75);
    for (const bad of ['0', '1,5', 'abc', '', '10001']) expect(parseAdjust(bad)).toBeNull();
  });
});

describe('PointsPanel', () => {
  it('quick buttons send the sum at once', async () => {
    const send = okSend();
    render(<PointsPanel player={player()} send={send} onError={vi.fn()} />);
    for (const label of ['−50', '−100', '−200', '+50', '+100']) expect(button(label)).toBeTruthy();
    fireEvent.click(button('−100'));
    expect(send).toHaveBeenCalledWith('host:adjust', { playerId: 'p1', points: -100 });
    await waitFor(() => expect(button('−50').disabled).toBe(false));
  });

  it('the own sum is checked before sending', async () => {
    const send = okSend();
    render(<PointsPanel player={player()} send={send} onError={vi.fn()} />);
    const input = screen.getByLabelText('Своя сума') as HTMLInputElement;
    expect(input.closest('label.field')).not.toBeNull();
    // Цифрова клавіатура iOS без мінуса: звичайна клавіатура, щоб ведучий міг набрати від'ємну суму.
    expect(input.getAttribute('inputmode')).toBeNull();
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(button('Нарахувати'));
    expect(send).not.toHaveBeenCalled();
    expect(screen.getByText('Введіть ціле число, наприклад −150 або 75.')).toBeTruthy();
    fireEvent.change(input, { target: { value: '−150' } });
    fireEvent.click(button('Нарахувати'));
    expect(send).toHaveBeenCalledWith('host:adjust', { playerId: 'p1', points: -150 });
    await waitFor(() => expect(input.value).toBe(''));
  });
});

describe('failed send', () => {
  it('a rejected send shows a generic error and releases the buttons', async () => {
    const send = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as Send;
    const onError = vi.fn();
    render(<PointsPanel player={player()} send={send} onError={onError} />);
    fireEvent.click(button('+50'));
    await waitFor(() => expect(onError).toHaveBeenCalledWith('Щось пішло не так. Спробуйте ще раз.'));
    await waitFor(() => expect(button('+50').disabled).toBe(false));
  });
});

describe('DebuffPanel', () => {
  it('the debuff panel lists six debuffs and sends the chosen one', () => {
    const send = okSend();
    render(<DebuffPanel player={player()} kinds={[...DEBUFF_KINDS]} send={send} onError={vi.fn()} />);
    for (const label of ['📳 Тремтіння екрана', '🌫️ Туман', '🧊 Заморозка', '🪞 Дзеркало', '🐾 Гості на екрані', '🟫 Брудний екран']) expect(button(label)).toBeTruthy();
    expect(screen.getByText('Спрацює в наступному запитанні, де гравець відповідає.')).toBeTruthy();
    fireEvent.click(button('🌫️ Туман'));
    expect(send).toHaveBeenCalledWith('host:debuff', { playerId: 'p1', kind: 'fog' });
  });

  it('DebuffPanel lists the given kinds only', () => {
    render(<DebuffPanel player={player()} kinds={['fog', 'mud']} send={okSend()} onError={vi.fn()} />);
    const picks = [...document.querySelectorAll('.debuff-picks button')].map((node) => node.textContent);
    expect(picks).toEqual(['🌫️ Туман', '🟫 Брудний екран']);
  });

  it('a waiting debuff can be cancelled, a firing one cannot', () => {
    const send = okSend();
    const { rerender } = render(<DebuffPanel player={player({ debuff: { kind: 'fog', fired: false, by: null } })} kinds={[...DEBUFF_KINDS]} send={send} onError={vi.fn()} />);
    expect(screen.getByText('🌫️ Туман · чекає')).toBeTruthy();
    expect(button('🧊 Заморозка').disabled).toBe(true);
    fireEvent.click(button('Скасувати дебаф'));
    expect(send).toHaveBeenCalledWith('host:undebuff', { playerId: 'p1' });
    rerender(<DebuffPanel player={player({ debuff: { kind: 'fog', fired: true, by: null } })} kinds={[...DEBUFF_KINDS]} send={send} onError={vi.fn()} />);
    expect(screen.getByText('🌫️ Туман · діє')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Скасувати дебаф' })).toBeNull();
  });
});
