// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { t } from '../i18n';
import type { PlacedProblem } from './draft';
import { IssuesPanel } from './IssuesPanel';
import type { Reminder } from './reminders';

afterEach(cleanup);

const errors: PlacedProblem[] = [
  { text: 'Впишіть назву вікторини.', place: { kind: 'title' } },
  { text: 'Запитання 2: впиши текст запитання.', place: { kind: 'question', round: 0, question: 1, card: 'question' } },
];
const reminders: Reminder[] = [{ text: 'У вікторини немає опису — додай кілька слів, про що вона.', place: { kind: 'general', card: 'about' } }];

function show() {
  const onGo = vi.fn();
  const onClose = vi.fn();
  render(<IssuesPanel id="issues" errors={errors} reminders={reminders} onGo={onGo} onClose={onClose} />);
  return { onGo, onClose };
}

describe('IssuesPanel', () => {
  it('lists errors and reminders in two sections', () => {
    show();
    const panel = screen.getByRole('region', { name: t('issuesTitle') });
    expect(panel.id).toBe('issues');
    const problems = panel.querySelector('ul.problems')!;
    expect([...problems.querySelectorAll('li > button')].map((el) => el.textContent)).toEqual(errors.map((e) => e.text));
    const notes = panel.querySelector('ul.reminders')!;
    expect(notes.textContent).toContain(reminders[0].text);
    expect(within(panel).getByText(t('issuesErrors'))).toBeTruthy();
    expect(within(panel).getByText(t('issuesReminders'))).toBeTruthy();
  });

  it('goes to the place of a clicked row and closes', () => {
    const { onGo, onClose } = show();
    fireEvent.click(screen.getByRole('button', { name: errors[1].text }));
    expect(onGo).toHaveBeenCalledWith(errors[1].place);
    fireEvent.click(screen.getByRole('button', { name: reminders[0].text }));
    expect(onGo).toHaveBeenLastCalledWith(reminders[0].place);
    fireEvent.click(screen.getByRole('button', { name: t('issuesClose') }));
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    const { onClose } = show();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
