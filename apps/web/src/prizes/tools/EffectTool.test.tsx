// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TROPHY_EFFECTS, type PrizeContent, type TrophyDecor } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PrizeStudio } from '../PrizeStudio';

const replay = vi.hoisted(() => vi.fn());

vi.mock('../../editor/ImageField', () => ({ ACCEPT: 'image/png', ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../../trophy/loadEngine', () => ({ loadTrophyEngine: vi.fn(async () => null), webglAvailable: vi.fn(() => true) }));
vi.mock('../../trophy/TrophyView', async () => {
  const { useImperativeHandle } = await import('react');
  return {
    TrophyView: ({ trophy, ref }: { trophy: unknown; ref?: unknown }) => {
      useImperativeHandle(ref as never, () => ({ replayAppearance: replay }), []);
      return <div data-testid="trophy" data-look={JSON.stringify(trophy)} />;
    },
  };
});

beforeEach(() => replay.mockClear());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const decorOf = () => (JSON.parse(screen.getByTestId('trophy').getAttribute('data-look')!) as { decor: TrophyDecor }).decor;
const tab = (name: string) => fireEvent.click(screen.getByRole('tab', { name: new RegExp(name) }));
const radio = (name: string | RegExp) => screen.getByRole('radio', { name }) as HTMLInputElement;

function open() {
  render(<PrizeStudio initial={null} readOnly={false} level={1} busy={false} error={null} onSave={vi.fn<(c: PrizeContent) => void>()} onCancel={vi.fn()} />);
}
const calm = () => vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query }));

describe('EffectTool', () => {
  it('effects: six radios, glow with a colour', () => {
    open();
    tab('Ефекти');
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')?.textContent)).toEqual(
      TROPHY_EFFECTS.map((kind) => ({ glow: 'Сяйво', sparks: 'Іскри', rays: 'Промені', fire: 'Вогонь', snow: 'Сніжинки', none: 'Без ефекту' })[kind]),
    );
    expect(screen.queryByText('Колір сяйва')).toBeNull();
    fireEvent.click(radio('Сяйво'));
    expect(decorOf().effect).toEqual({ kind: 'glow', color: '#ffd36b' });
    expect(screen.getByText('Колір сяйва')).toBeTruthy();
    fireEvent.click(radio('Блакитний'));
    expect(decorOf().effect).toEqual({ kind: 'glow', color: '#4fc3f7' });
    fireEvent.click(radio('Вогонь'));
    expect(decorOf().effect).toEqual({ kind: 'fire' });
    expect(screen.queryByText('Колір сяйва')).toBeNull();
  });

  it('re-selecting glow keeps the last glow colour', () => {
    open();
    tab('Ефекти');
    fireEvent.click(radio('Сяйво'));
    fireEvent.click(radio('Блакитний'));
    fireEvent.click(radio('Іскри'));
    fireEvent.click(radio('Сяйво'));
    expect(decorOf().effect).toEqual({ kind: 'glow', color: '#4fc3f7' });
  });

  it('appearance plays: on pick and on the button', () => {
    open();
    tab('Поява');
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(replay).not.toHaveBeenCalled();
    fireEvent.click(radio('Падіння з неба'));
    expect(decorOf().appearance).toBe('drop');
    expect(replay).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Показати появу' }));
    expect(replay).toHaveBeenCalledTimes(2);
  });

  it('reduced motion: the button is off, the note is in both tools, picking plays nothing', () => {
    calm();
    open();
    tab('Ефекти');
    expect(screen.getByText(/менше руху/)).toBeTruthy();
    tab('Поява');
    const note = screen.getByText(/менше руху/);
    const button = screen.getByRole('button', { name: 'Показати появу' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(note.id);
    fireEvent.click(radio('Спалах'));
    expect(decorOf().appearance).toBe('flash');
    expect(replay).not.toHaveBeenCalled();
  });
});
