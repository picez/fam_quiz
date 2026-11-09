// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { EMPTY_DECOR, type TrophyDecor, type TrophyKind } from '@quiz/shared';
import { useReducer } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrizeStudio } from '../PrizeStudio';
import { draftFrom, studioReducer, type StudioDraft } from '../studio-draft';
import { TextTool } from './TextTool';

vi.mock('../../nick-fonts', () => ({ loadNickFont: vi.fn(async () => undefined) }));
vi.mock('../../editor/ImageField', () => ({ ACCEPT: 'image/png', ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: vi.fn(() => true) }));
vi.mock('../../trophy/TrophyView', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    TrophyView: ({ trophy, ref }: { trophy: unknown; ref?: unknown }) => {
      useImperativeHandle(ref as never, () => ({ replayAppearance: vi.fn() }), []);
      return <div data-testid="trophy" data-look={JSON.stringify(trophy)} />;
    },
  };
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

let current: StudioDraft;
function Harness({ start, level, stored }: { start: StudioDraft; level: number; stored: TrophyDecor | null }) {
  const [draft, dispatch] = useReducer(studioReducer, start);
  current = draft;
  return <TextTool draft={draft} dispatch={(action) => dispatch(action)} level={level} replay={() => {}} stored={stored} />;
}

function open(kind: TrophyKind = 'cup', { level = 1, decor = EMPTY_DECOR }: { level?: number; decor?: TrophyDecor } = {}) {
  const start = draftFrom(null);
  start.trophy = { kind, material: 'gold' };
  start.decor = decor;
  render(<Harness start={start} level={level} stored={decor} />);
}

const place = (name: string) => screen.getByRole('group', { name });
const toggle = (name: string) => within(place(name)).getByRole('checkbox') as HTMLInputElement;
const radio = (group: HTMLElement, name: string | RegExp) => within(group).getByRole('radio', { name }) as HTMLInputElement;
const fonts = (name: string) => within(place(name)).getByRole('group', { name: 'Шрифт' });

describe('TextTool', () => {
  it('places follow the kind', () => {
    open('cup');
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual([
      'По колу на вінці',
      'Поясок',
      'Табличка',
      'Зворот',
    ]);
    cleanup();
    open('medal');
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(['Зворот']);
    cleanup();
    open('crown');
    expect(screen.getAllByRole('checkbox').map((box) => box.closest('label')?.textContent)).toEqual(['Поясок', 'Табличка']);
  });

  it('typing an inscription', () => {
    open('cup');
    fireEvent.click(toggle('По колу на вінці'));
    const field = within(place('По колу на вінці')).getByLabelText('Текст') as HTMLInputElement;
    expect(field.tagName).toBe('INPUT');
    expect(field.maxLength).toBe(80);
    fireEvent.change(field, { target: { value: 'Чемпіон' } });
    expect(current.decor.inscriptions).toEqual([{ place: 'rim', text: 'Чемпіон', font: null, look: 'engraved', color: '#3a2a0e' }]);
    expect(within(place('По колу на вінці')).getByText('7/80')).toBeTruthy();
    fireEvent.click(toggle('По колу на вінці'));
    expect(current.decor.inscriptions).toEqual([]);
    expect(within(place('По колу на вінці')).queryByLabelText('Текст')).toBeNull();
  });

  it('the plaque takes two lines', () => {
    open('cup');
    fireEvent.click(toggle('Табличка'));
    const field = within(place('Табличка')).getByLabelText('Текст') as HTMLTextAreaElement;
    expect(field.tagName).toBe('TEXTAREA');
    expect(field.rows).toBe(2);
    expect(field.maxLength).toBe(40);
  });

  it('typing settles before the trophy', () => {
    vi.useFakeTimers();
    render(<PrizeStudio initial={null} readOnly={false} level={1} busy={false} error={null} onSave={() => {}} onCancel={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /Написи/ }));
    const look = () => JSON.parse(screen.getByTestId('trophy').getAttribute('data-look')!) as { decor: TrophyDecor };
    fireEvent.click(toggle('По колу на вінці'));
    fireEvent.change(within(place('По колу на вінці')).getByLabelText('Текст'), { target: { value: 'Чемпіон' } });
    expect(look().decor.inscriptions).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(look().decor.inscriptions.map((i) => i.text)).toEqual(['Чемпіон']);
    fireEvent.click(radio(within(place('По колу на вінці')).getByRole('group', { name: 'Вигляд' }), 'Рельєфний'));
    expect(look().decor.inscriptions[0]!.look).toBe('embossed');
  });

  it('fonts lock by level', () => {
    open('cup', { level: 1 });
    fireEvent.click(toggle('Поясок'));
    expect(radio(fonts('Поясок'), /Класичний/).disabled).toBe(false);
    expect(radio(fonts('Поясок'), /Рукописний/).disabled).toBe(false);
    expect(radio(fonts('Поясок'), /Круглий/).disabled).toBe(false);
    const mono = radio(fonts('Поясок'), /Моноширинний/);
    expect(mono.disabled).toBe(true);
    expect(mono.closest('label')!.textContent).toContain('🔒 з рівня 3');
    cleanup();
    open('cup', { level: 3 });
    fireEvent.click(toggle('Поясок'));
    expect(radio(fonts('Поясок'), /Моноширинний/).disabled).toBe(false);
    fireEvent.change(within(place('Поясок')).getByLabelText('Текст'), { target: { value: 'Ура' } });
    fireEvent.click(radio(fonts('Поясок'), /Моноширинний/));
    expect(current.decor.inscriptions[0]!.font).toBe('mono');
  });

  it('a saved locked font stays', () => {
    const decor: TrophyDecor = { ...EMPTY_DECOR, inscriptions: [{ place: 'band', text: 'Ура', font: 'heavy', look: 'engraved', color: '#3a2a0e' }] };
    open('cup', { level: 1, decor });
    const heavy = radio(fonts('Поясок'), /Грубий/);
    expect(heavy.checked).toBe(true);
    expect(heavy.disabled).toBe(false);
    // Повернутися до збереженого можна й після іншого вибору, як дозволяє сервер.
    fireEvent.click(radio(fonts('Поясок'), /Класичний/));
    expect(radio(fonts('Поясок'), /Грубий/).disabled).toBe(false);
  });

  it('look and colour', () => {
    open('cup');
    fireEvent.click(toggle('Зворот'));
    fireEvent.change(within(place('Зворот')).getByLabelText('Текст'), { target: { value: 'Для Асі' } });
    fireEvent.click(radio(within(place('Зворот')).getByRole('group', { name: 'Вигляд' }), 'Рельєфний'));
    expect(current.decor.inscriptions[0]!.look).toBe('embossed');
    const colour = within(place('Зворот')).getByRole('group', { name: 'Колір' });
    expect(radio(colour, 'Темний').checked).toBe(true);
    fireEvent.click(radio(colour, 'Блакитний'));
    expect(current.decor.inscriptions[0]!.color).toBe('#4fc3f7');
    fireEvent.change(within(colour).getByLabelText('Свій колір'), { target: { value: '#123456' } });
    expect(current.decor.inscriptions[0]!.color).toBe('#123456');
  });

  it('plaque taken by a photo', () => {
    open('cup', { decor: { ...EMPTY_DECOR, photoPlace: 'plaque', photos: [{ url: '/uploads/1.png', crop: { x: 0.5, y: 0.5, scale: 1 } }] } });
    expect(toggle('Табличка').disabled).toBe(true);
    expect(screen.getByText('Табличку зайняло фото.')).toBeTruthy();
    expect(toggle('Поясок').disabled).toBe(false);
  });
});
