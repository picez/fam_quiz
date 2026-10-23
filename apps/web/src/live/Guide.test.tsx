// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { emptyBrief, type GuideView } from '@quiz/shared';
import { GuidePageView } from './Guide';

afterEach(cleanup);
const guide: GuideView = {
  page: 1,
  pages: [{ kind: 'phone' }, { kind: 'rounds', rounds: [{ ...emptyBrief('classic'), speedBonus: true }, { ...emptyBrief('final'), wagerMode: 'classic' }] }, { kind: 'questions', types: [{ type: 'order', top: 'Найбільший' }] }],
};

describe('GuidePageView', () => {
  it('the stage shows the page number, items with icons and scoring lines and a note about phones', () => {
    render(<GuidePageView guide={guide} size="stage" />);
    expect(screen.getByRole('heading', { name: 'Раунди цієї гри' })).toBeTruthy();
    expect(screen.getByText('Як грати · 2 з 3')).toBeTruthy();
    expect(screen.getByText('Класичний')).toBeTruthy();
    expect(screen.getByText('Фінал')).toBeTruthy();
    expect(screen.getByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeTruthy();
    expect(document.querySelectorAll('.guide-icon')).toHaveLength(2);
    expect(screen.getByText('Те саме — у ваших телефонах')).toBeTruthy();
  });

  it('the phone shows the same page shorter: names and lines, no icons, no scoring lines', () => {
    render(<GuidePageView guide={guide} size="phone" />);
    expect(screen.getByRole('heading', { name: 'Раунди цієї гри' })).toBeTruthy();
    expect(screen.getByText('Класичний')).toBeTruthy();
    expect(document.querySelector('.guide-icon')).toBeNull();
    expect(screen.queryByText('Якщо є таймер, швидша правильна відповідь дає більше балів.')).toBeNull();
    expect(screen.queryByText('Те саме — у ваших телефонах')).toBeNull();
  });

  it('the host sees the title, the number and only the item names; lead lines show on the phone page', () => {
    render(<GuidePageView guide={guide} size="host" />);
    expect(screen.getByRole('heading', { name: 'Раунди цієї гри' })).toBeTruthy();
    expect(screen.getByText('Класичний')).toBeTruthy();
    expect(document.querySelector('.guide-line')).toBeNull();
    cleanup();
    render(<GuidePageView guide={{ ...guide, page: 0 }} size="phone" />);
    expect(screen.getByRole('heading', { name: 'Відповідайте з телефона' })).toBeTruthy();
    expect(document.querySelectorAll('.guide-lead')).toHaveLength(3);
  });
});
