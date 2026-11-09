// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import type { PrizeContent } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { webglAvailable } from '../trophy/loadEngine';
import { PrizeStudio, type PrizeStudioProps } from './PrizeStudio';
import { contentOf, draftFrom, studioReducer } from './studio-draft';
import { useSettled } from './useSettled';

vi.mock('../editor/ImageField', () => ({ ACCEPT: 'image/png', ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: vi.fn(() => true) }));
vi.mock('../trophy/TrophyView', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    TrophyView: ({ trophy, ref }: { trophy: unknown; ref?: unknown }) => {
      useImperativeHandle(ref as never, () => ({ replayAppearance: vi.fn() }), []);
      return (
        <div data-testid="trophy" data-look={JSON.stringify(trophy)}>
          <canvas />
        </div>
      );
    },
  };
});

beforeEach(() => {
  vi.mocked(webglAvailable).mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const medal: PrizeContent = { name: 'Медаль 14a', trophy: { kind: 'medal', material: 'bronze' }, engraving: null, real: null, title: null, diploma: false };

function open(over: Partial<PrizeStudioProps> = {}) {
  const onSave = vi.fn<(content: PrizeContent) => void>();
  const onCancel = vi.fn<() => void>();
  render(<PrizeStudio initial={null} readOnly={false} level={1} busy={false} error={null} onSave={onSave} onCancel={onCancel} {...over} />);
  return { onSave, onCancel };
}
const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(name) });
const look = () => JSON.parse(screen.getByTestId('trophy').getAttribute('data-look')!) as { kind: string; material: string };
const saveButton = () => screen.getByRole('button', { name: 'Зберегти' }) as HTMLButtonElement;

describe('PrizeStudio', () => {
  it('six tools in a tablist', () => {
    open();
    expect(screen.getByRole('tablist', { name: 'Інструменти' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((t) => t.textContent?.replace(/^\P{L}+/u, ''))).toEqual(['Форма', 'Фото', 'Написи', 'Ефекти', 'Поява', 'Приз']);
    expect(tab('Форма').getAttribute('aria-selected')).toBe('true');
    expect(tab('Форма').getAttribute('id')).toBe('studio-tab-shape');
    expect(tab('Форма').getAttribute('aria-controls')).toBe('studio-panel');
    fireEvent.keyDown(tab('Форма'), { key: 'ArrowRight' });
    expect(tab('Фото').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Фото'));
    fireEvent.keyDown(tab('Фото'), { key: 'End' });
    expect(tab('Приз').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('Приз'));
    fireEvent.keyDown(tab('Приз'), { key: 'Home' });
    expect(tab('Форма').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(tab('Форма'), { key: 'ArrowLeft' });
    expect(tab('Приз').getAttribute('aria-selected')).toBe('true');
  });

  it('arrows follow the reading direction in RTL', () => {
    document.documentElement.dir = 'rtl';
    try {
      open();
      fireEvent.keyDown(tab('Форма'), { key: 'ArrowLeft' });
      expect(tab('Фото').getAttribute('aria-selected')).toBe('true');
    } finally {
      document.documentElement.dir = 'ltr';
    }
  });

  it('a tap on the active tab folds the drawer', () => {
    open();
    const panel = screen.getByRole('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe('studio-tab-shape');
    expect(tab('Форма').getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(tab('Форма'));
    expect(tab('Форма').getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById('studio-panel')!.hidden).toBe(true);
    fireEvent.click(tab('Форма'));
    expect(tab('Форма').getAttribute('aria-expanded')).toBe('true');
    expect(document.getElementById('studio-panel')!.hidden).toBe(false);
  });

  it('shape changes the trophy at once', () => {
    open();
    expect(look()).toMatchObject({ kind: 'cup', material: 'gold' });
    fireEvent.click(screen.getByRole('radio', { name: 'медаль' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Срібло' }));
    expect(look()).toMatchObject({ kind: 'medal', material: 'silver' });
    expect(screen.getByRole('radio', { name: 'грааль' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'Без трофея' }));
    expect(screen.queryByTestId('trophy')).toBeNull();
    expect(screen.getByText('Приз без 3D-трофея.')).toBeTruthy();
    expect(tab('Фото').getAttribute('aria-disabled')).toBe('true');
    expect(tab('Приз').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(tab('Фото'));
    expect(screen.getByText('Спершу обери форму трофея.')).toBeTruthy();
  });

  it('the trophy canvas is described by the rotate hint', () => {
    open();
    const canvas = screen.getByTestId('trophy').querySelector('canvas')!;
    const hint = document.getElementById(canvas.getAttribute('aria-describedby')!)!;
    expect(hint.textContent).toBe('Тягни кубок пальцем, щоб повернути');
  });

  it('the prize tool', () => {
    const { onSave } = open();
    fireEvent.click(tab('Приз'));
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Головний приз' } });
    fireEvent.change(screen.getByLabelText('Підпис під кубком і на дипломі'), { target: { value: 'Чемпіон' } });
    expect(screen.getByRole('group', { name: 'Титул біля ніку' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Який титул (на 7 днів)'), { target: { value: 'Ерудит' } });
    expect(screen.queryByLabelText('Що за приз')).toBeNull();
    fireEvent.click(screen.getByLabelText('Справжній приз'));
    fireEvent.change(screen.getByLabelText('Що за приз'), { target: { value: 'Піца' } });
    expect(screen.getByTestId('image-field')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Диплом'));
    expect(screen.getByText('Церемонія у фіналі — завжди, коли в грі є приз')).toBeTruthy();
    fireEvent.click(saveButton());
    let draft = draftFrom(null);
    for (const action of [
      { type: 'name', value: 'Головний приз' },
      { type: 'engraving', value: 'Чемпіон' },
      { type: 'title', value: 'Ерудит' },
      { type: 'real', value: { text: 'Піца', photoUrl: null } },
      { type: 'diploma', value: true },
    ] as const) {
      draft = studioReducer(draft, action);
    }
    expect(onSave).toHaveBeenCalledWith(contentOf(draft, null));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ name: 'Головний приз', engraving: 'Чемпіон', title: 'Ерудит', real: { text: 'Піца', photoUrl: null }, diploma: true });
  });

  it('a new prize opens without an error; a save attempt shows why and saves nothing', () => {
    const { onSave } = open();
    expect(screen.queryByText('Дай призу назву.')).toBeNull();
    expect(saveButton().disabled).toBe(false);
    expect(saveButton().getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(saveButton());
    expect(onSave).not.toHaveBeenCalled();
    const reason = screen.getByText('Дай призу назву.');
    expect(saveButton().getAttribute('aria-describedby')).toBe(reason.parentElement!.id);
  });

  it('leaving the name field empty shows why save is blocked', () => {
    open();
    fireEvent.click(tab('Приз'));
    const name = screen.getByLabelText('Назва');
    fireEvent.focus(name);
    expect(screen.queryByText('Дай призу назву.')).toBeNull();
    fireEvent.blur(name);
    expect(screen.getByText('Дай призу назву.')).toBeTruthy();
    fireEvent.change(name, { target: { value: 'Кубок' } });
    expect(screen.queryByText('Дай призу назву.')).toBeNull();
    expect(saveButton().getAttribute('aria-disabled')).toBeNull();
  });

  it('saving an old prize sends no decor', () => {
    const { onSave } = open({ initial: medal });
    expect(tab('Приз').getAttribute('aria-selected')).toBe('true');
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Медаль 2' } });
    fireEvent.click(saveButton());
    const saved = onSave.mock.calls[0]![0] as PrizeContent;
    expect(saved.name).toBe('Медаль 2');
    expect(saved.trophy).toEqual({ kind: 'medal', material: 'bronze' });
    expect('decor' in saved.trophy!).toBe(false);
  });

  it('read only', () => {
    open({ initial: medal, readOnly: true });
    expect(screen.queryByRole('button', { name: 'Зберегти' })).toBeNull();
    expect(screen.queryAllByRole('tab')).toEqual([]);
    expect(screen.getByText('Приз лежить у грі — його можна лише переглянути.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Перегляд призу' })).toBeTruthy();
    expect(look()).toMatchObject({ kind: 'medal', material: 'bronze' });
  });

  it('no WebGL explains', () => {
    vi.mocked(webglAvailable).mockReturnValue(false);
    open();
    expect(screen.getByText(/Цей пристрій не показує 3D/)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: 'зірка' }));
    expect(look()).toMatchObject({ kind: 'star' });
  });

  it('with WebGL there is no explanation', () => {
    open();
    expect(screen.queryByText(/Цей пристрій не показує 3D/)).toBeNull();
  });

  it('cancel asks only when changed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onCancel } = open({ initial: medal });
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(confirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Інша' } });
    fireEvent.click(screen.getByRole('button', { name: 'Скасувати' }));
    expect(confirm).toHaveBeenCalledWith('Вийти без збереження?');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('a server error is shown', () => {
    open({ initial: medal, error: 'Цей шрифт чи наліпка ще закриті: вони відкриються з вищим рівнем.' });
    expect(screen.getByRole('alert').textContent).toBe('Цей шрифт чи наліпка ще закриті: вони відкриються з вищим рівнем.');
  });

  it('titles a new prize and an edited one', () => {
    open();
    expect(screen.getByRole('heading', { name: 'Новий приз' })).toBeTruthy();
    cleanup();
    open({ initial: medal });
    expect(screen.getByRole('heading', { name: 'Зміна призу' })).toBeTruthy();
  });
});

describe('useSettled', () => {
  afterEach(() => vi.useRealTimers());

  it('with 300 ms shows a new value only after a quiet 300 ms', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, ms }) => useSettled(value, ms), { initialProps: { value: 'a', ms: 300 } });
    expect(result.current).toBe('a');
    rerender({ value: 'b', ms: 300 });
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(100));
    rerender({ value: 'c', ms: 300 });
    act(() => vi.advanceTimersByTime(299));
    expect(result.current).toBe('a');
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('c');
  });

  it('with 0 ms shows the value in the same render', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ value, ms }) => useSettled(value, ms), { initialProps: { value: 'a', ms: 300 } });
    rerender({ value: 'b', ms: 300 });
    expect(result.current).toBe('a');
    rerender({ value: 'c', ms: 0 });
    expect(result.current).toBe('c');
  });
});
