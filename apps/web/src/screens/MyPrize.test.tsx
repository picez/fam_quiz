// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrizesView } from '@quiz/shared';
import { checkCode } from '../api';
import { renderDiploma, shareDiploma } from '../trophy/diploma';
import { MyPrize, PrizeResults, useQuizTitle } from './MyPrize';

vi.mock('../api', () => ({ checkCode: vi.fn() }));

vi.mock('../trophy/diploma', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../trophy/diploma')>()),
  renderDiploma: vi.fn(),
  shareDiploma: vi.fn(),
}));
vi.mock('../trophy/TrophyView', () => ({ TrophyView: () => <span className="trophy-mock" /> }));

const render$ = vi.mocked(renderDiploma);
const share = vi.mocked(shareDiploma);

beforeEach(() => {
  render$.mockReset();
  share.mockReset();
});
afterEach(cleanup);

const blob = new Blob(['png'], { type: 'image/png' });
const prizes = (account: boolean, diploma = true): PrizesView => ({
  mine: { place: 1, account },
  places: [
    {
      place: 1,
      content: { trophy: { kind: 'cup', material: 'gold' }, engraving: 'Чемпіон 2026', real: { text: 'Піца', photoUrl: null }, title: 'Король', diploma },
      winner: { name: 'Оля', members: [] },
    },
    { place: 2, content: { trophy: null, engraving: null, real: null, title: 'Срібло', diploma: true }, winner: { name: 'Петро', members: [] } },
  ],
});

describe('MyPrize', () => {
  it('shows «Твій приз» and makes the diploma with the nickname and the quiz title', async () => {
    render$.mockResolvedValue(blob);
    share.mockResolvedValue('downloaded');
    render(<MyPrize prizes={prizes(true)} nickname="Оля" quizTitle="Новорічна вікторина" />);
    expect(screen.getByText('Твій приз')).toBeTruthy();
    expect(screen.getByText(/Піца/)).toBeTruthy();
    expect(screen.queryByText('Ти граєш як гість: у вітрину приз не потрапить.')).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Диплом' }));
    });
    expect(render$).toHaveBeenCalledTimes(1);
    const data = render$.mock.calls[0]![0];
    expect(data).toMatchObject({ nickname: 'Оля', place: 1, quizTitle: 'Новорічна вікторина', engraving: 'Чемпіон 2026', trophy: { kind: 'cup', material: 'gold' } });
    expect(data.date).toBeInstanceOf(Date);
    expect(share).toHaveBeenCalledWith(blob, 'dyplom-Оля.png');
  });

  it('a title that starts with an emoji gets no second crown', () => {
    const view = prizes(true);
    const crowned: PrizesView = { ...view, places: [{ ...view.places[0]!, content: { ...view.places[0]!.content, title: '👑 Король' } }] };
    const { container } = render(<MyPrize prizes={crowned} nickname="Оля" quizTitle="Вікторина" />);
    expect(container.querySelector('.podium-title')!.textContent).toBe('👑 Король');
  });

  it('the button is off while the diploma is made and a failure says so', async () => {
    let fail: (error: Error) => void = () => {};
    render$.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    render(<MyPrize prizes={prizes(true)} nickname="Оля" quizTitle="Вікторина" />);
    const button = screen.getByRole('button', { name: 'Диплом' }) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(button);
    });
    expect(button.disabled).toBe(true);
    await act(async () => {
      fail(new Error('canvas_unavailable'));
    });
    expect(button.disabled).toBe(false);
    expect(screen.getByRole('alert').textContent).toBe('Не вдалося зробити диплом.');
    expect(share).not.toHaveBeenCalled();
  });

  it('a guest sees the note and can still save the diploma', () => {
    render(<MyPrize prizes={prizes(false)} nickname="Оля" quizTitle="Вікторина" />);
    expect(screen.getByText('Ти граєш як гість: у вітрину приз не потрапить.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Диплом' })).toBeTruthy();
  });

  it('no diploma button without the diploma', () => {
    render(<MyPrize prizes={prizes(true, false)} nickname="Оля" quizTitle="Вікторина" />);
    expect(screen.getByText('Твій приз')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Диплом' })).toBeNull();
  });

  it('«Кубок» opens the trophy viewer next to «Диплом», × closes it', () => {
    render(<MyPrize prizes={prizes(true)} nickname="Оля" quizTitle="Вікторина" />);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Кубок' }));
    const dialog = screen.getByRole('dialog', { name: 'Приз за 1 місце' });
    expect(dialog.querySelector('.trophy-mock')).toBeTruthy();
    expect(dialog.textContent).toContain('Чемпіон 2026');
    fireEvent.click(screen.getByRole('button', { name: 'Закрити' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a tap on the real-prize photo opens it large', () => {
    const view = prizes(true);
    const photo: PrizesView = {
      ...view,
      places: [{ ...view.places[0]!, content: { ...view.places[0]!.content, real: { text: 'Кубок сім’ї', photoUrl: 'https://img/cup.jpg' } } }],
    };
    render(<MyPrize prizes={photo} nickname="Оля" quizTitle="Вікторина" />);
    fireEvent.click(screen.getByRole('button', { name: 'Переглянути фото: Кубок' }));
    const img = screen.getByRole('dialog').querySelector('img.prize-view-photo') as HTMLImageElement;
    expect(img.src).toBe('https://img/cup.jpg');
  });

  it('no «Кубок» when there is neither a trophy nor a photo', () => {
    const view = prizes(true);
    const plain: PrizesView = { ...view, mine: { place: 2, account: true } };
    render(<MyPrize prizes={plain} nickname="Петро" quizTitle="Вікторина" />);
    expect(screen.queryByRole('button', { name: /^(Кубок|Медаль|Приз)$/ })).toBeNull();
  });

  it('nothing without a prize of mine', () => {
    const { container } = render(<MyPrize prizes={{ ...prizes(true), mine: null }} nickname="Оля" quizTitle="Вікторина" />);
    expect(container.textContent).toBe('');
  });
});

describe('PrizeResults', () => {
  it('the host sees nobody rows, the phone only the winners', () => {
    const view = prizes(true);
    const withNobody = { ...view, places: [...view.places, { place: 3 as const, content: view.places[1]!.content, winner: null }] };
    const { unmount } = render(<PrizeResults prizes={withNobody} role="host" />);
    expect(screen.getByRole('heading', { name: 'Призи' })).toBeTruthy();
    expect(screen.getByText('1 місце — Оля')).toBeTruthy();
    expect(screen.getByText('3 місце — нікого, приз повернеться на склад')).toBeTruthy();
    unmount();
    render(<PrizeResults prizes={withNobody} role="player" />);
    expect(screen.getByText('2 місце — Петро')).toBeTruthy();
    expect(screen.queryByText(/нікого/)).toBeNull();
  });
});

describe('useQuizTitle', () => {
  it('asks the room once when needed and never without a code', async () => {
    const check = vi.mocked(checkCode);
    check.mockReset();
    check.mockResolvedValue({ ok: true, phase: 'finished', title: 'Новорічна вікторина', locked: false, late: false });
    const idle = renderHook(() => useQuizTitle('', true));
    expect(idle.result.current).toBe('');
    const off = renderHook(() => useQuizTitle('123456', false));
    expect(off.result.current).toBe('');
    expect(check).not.toHaveBeenCalled();
    const { result } = renderHook(() => useQuizTitle('123456', true));
    await waitFor(() => expect(result.current).toBe('Новорічна вікторина'));
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith('123456');
  });
});
