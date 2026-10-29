// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BUFF_KINDS, DEBUFF_KINDS, emptyBrief, type GuideView } from '@quiz/shared';
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

  it('a page with more than eight buffs or debuffs gets two columns (is-many); a short page does not', () => {
    const many: GuideView = { page: 0, pages: [{ kind: 'buffs', buffs: [...BUFF_KINDS] }, { kind: 'debuffs', debuffs: [...DEBUFF_KINDS] }, { kind: 'buffs', buffs: ['fifty', 'double', 'risk', 'letter', 'peek'] }] };
    render(<GuidePageView guide={many} size="stage" />);
    expect(document.querySelectorAll('.guide-item')).toHaveLength(13);
    expect(document.querySelector('.guide-items')?.classList.contains('is-many')).toBe(true);
    cleanup();
    render(<GuidePageView guide={{ ...many, page: 1 }} size="stage" />);
    expect(document.querySelectorAll('.guide-item')).toHaveLength(11);
    expect(document.querySelector('.guide-items')?.classList.contains('is-many')).toBe(true);
    cleanup();
    render(<GuidePageView guide={{ ...many, page: 2 }} size="stage" />);
    expect(document.querySelector('.guide-items')?.classList.contains('is-many')).toBe(false);
  });
});
