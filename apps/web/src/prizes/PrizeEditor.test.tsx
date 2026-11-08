// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrizeEditor } from './PrizeEditor';

vi.mock('../editor/ImageField', () => ({ ImageField: () => <div data-testid="image-field" /> }));
vi.mock('../trophy/loadViewer', () => ({ loadViewer: vi.fn(async () => false), webglAvailable: () => false }));

afterEach(cleanup);

function open(onSave = vi.fn()) {
  render(<PrizeEditor initial={null} busy={false} onSave={onSave} onCancel={() => {}} />);
  fireEvent.change(screen.getByLabelText('Назва'), { target: { value: 'Головний приз' } });
  return onSave;
}
const save = () => screen.getByRole('button', { name: 'Зберегти' }) as HTMLButtonElement;

describe('PrizeEditor', () => {
  it('with no option on, Save is disabled and the reason is shown', () => {
    open();
    expect(save().disabled).toBe(true);
    expect(screen.getByText('Увімкни хоча б одну опцію.')).toBeTruthy();
    expect(screen.getByText('Церемонія у фіналі — завжди, коли в грі є приз')).toBeTruthy();
  });

  it('the diploma alone is enough', () => {
    open();
    fireEvent.click(screen.getByLabelText('Диплом'));
    expect(save().disabled).toBe(false);
  });

  it('the 3D trophy offers kind and material, gold by default', () => {
    const onSave = open();
    expect(screen.queryByRole('radio', { name: /кубок/ })).toBeNull();
    fireEvent.click(screen.getByLabelText('3D-трофей'));
    expect((screen.getByRole('radio', { name: 'Золото' }) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(save());
    expect(onSave).toHaveBeenCalledWith({
      name: 'Головний приз',
      trophy: { kind: 'cup', material: 'gold' },
      engraving: null,
      real: null,
      title: null,
      diploma: false,
    });
  });

  it('does not offer the grail for a new prize, but keeps it for a prize that already is one', () => {
    open();
    fireEvent.click(screen.getByLabelText('3D-трофей'));
    expect(screen.queryByRole('radio', { name: /грааль/ })).toBeNull();
    cleanup();

    const grail = { name: 'Наш Ґрааль', trophy: { kind: 'grail', material: 'gold' }, engraving: null, real: null, title: null, diploma: false } as const;
    render(<PrizeEditor initial={grail} busy={false} onSave={vi.fn()} onCancel={() => {}} />);
    expect((screen.getByRole('radio', { name: /грааль/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('a switched-off real prize is saved as null even with text typed', () => {
    const onSave = open();
    fireEvent.click(screen.getByLabelText('Справжній приз'));
    fireEvent.change(screen.getByLabelText('Що за приз'), { target: { value: 'Піца' } });
    fireEvent.click(screen.getByLabelText('Диплом'));
    fireEvent.click(screen.getByLabelText('Справжній приз'));
    fireEvent.click(save());
    expect(onSave.mock.calls[0]![0].real).toBeNull();
  });

  it('engraving cannot exceed 80 characters', () => {
    open();
    fireEvent.click(screen.getByLabelText('Гравіювання'));
    expect(screen.getByLabelText('Текст гравіювання').getAttribute('maxlength')).toBe('80');
  });

  it('an enabled option with empty text keeps Save disabled', () => {
    open();
    fireEvent.click(screen.getByLabelText('Гравіювання'));
    expect(save().disabled).toBe(true);
  });
});
