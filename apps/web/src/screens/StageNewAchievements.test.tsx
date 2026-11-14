// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '@quiz/shared';
import { StageNewAchievements } from './StageNewAchievements';

afterEach(cleanup);

const rows = () => [...document.querySelectorAll('.stage-new-achievements-row')];

describe('StageNewAchievements (12j)', () => {
  it('one row per person with the nickname and named badges; anti ones framed', () => {
    render(<StageNewAchievements stage={{ people: [{ nickname: 'Оля', ids: ['sniper', 'in_debt'] }, { nickname: 'Петро', ids: ['in_debt'] }] }} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Нові досягнення');
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Оля');
    expect(rows()[0].textContent).toContain('🎯 Снайперська точність');
    expect(rows()[0].textContent).toContain('🕳️ У мінусі');
    const badges = rows()[0].querySelectorAll('.stage-new-achievement');
    expect(badges[0].classList.contains('is-anti')).toBe(false);
    expect(badges[1].classList.contains('is-anti')).toBe(true);
    expect(rows()[1].textContent).toContain('Петро');
  });

  it('five achievements show three and «+2»', () => {
    render(<StageNewAchievements stage={{ people: [{ nickname: 'Оля', ids: ACHIEVEMENTS.slice(0, 5) }] }} />);
    expect(rows()[0].querySelectorAll('.stage-new-achievement')).toHaveLength(3);
    expect(rows()[0].querySelector('.stage-new-achievements-more')?.textContent).toBe('+2');
  });

  it('ten people show eight rows and «Ще людей: 2»', () => {
    const people = Array.from({ length: 10 }, (_, i) => ({ nickname: `Гравець ${i + 1}`, ids: ['first_game' as const] }));
    render(<StageNewAchievements stage={{ people }} />);
    expect(rows()).toHaveLength(8);
    expect(screen.getByText('Ще людей: 2')).toBeTruthy();
  });
});
