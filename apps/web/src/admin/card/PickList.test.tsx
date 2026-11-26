// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PickList, type PickItem } from './PickList';

afterEach(cleanup);

const items: PickItem[] = [
  { id: 'a', name: 'Перший' },
  { id: 'b', name: 'Другий' },
];
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement;

describe('PickList (69)', () => {
  it('after a failed run the picks of rows that are gone are dropped, so a row that comes back is not picked', async () => {
    const list = (shown: PickItem[]) => <PickList title="Склад" items={shown} action="Видалити" busy={false} onRun={async () => false} />;
    const view = render(list(items));
    fireEvent.click(box('Перший'));
    fireEvent.click(box('Другий'));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Видалити' })));
    // Перший встиг зникнути до помилки, другий лишився вибраним.
    view.rerender(list([items[1]!]));
    expect(box('Другий').checked).toBe(true);
    view.rerender(list(items));
    expect(box('Перший').checked).toBe(false);
    expect(box('Другий').checked).toBe(true);
  });
});
