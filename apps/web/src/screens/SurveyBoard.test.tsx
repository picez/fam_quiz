// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { SurveyInfo, SurveyRowView } from '@quiz/shared';
import { SurveyBoard } from './SurveyBoard';

afterEach(cleanup);

const closed = (rank: number): SurveyRowView => ({ rank, open: false, text: null, popularity: null, by: null });
const info = (rows: SurveyRowView[], shown: number): SurveyInfo => ({ source: 'host', total: rows.length, shown, rows });

describe('SurveyBoard', () => {
  it('shows closed rows as numbered strips and open rows with text and popularity', () => {
    render(
      <SurveyBoard
        info={info(
          [
            closed(1),
            closed(2),
            closed(3),
            { rank: 4, open: true, text: 'Кавун', popularity: 10, by: ['Анна'] },
            { rank: 5, open: true, text: 'Груша', popularity: 8, by: ['Богдан', 'Анна'] },
          ],
          2,
        )}
      />,
    );
    expect(document.querySelectorAll('li.survey-row')).toHaveLength(5);
    expect(document.querySelectorAll('.survey-row.is-closed')).toHaveLength(3);
    expect(screen.getByLabelText('Рядок 2 закрито')).toBeTruthy();
    expect(document.querySelector('.survey-row.is-closed')!.textContent).toBe('1');
    expect(screen.getByText('Груша')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('Кавун')).toBeTruthy();
    expect(screen.getByText('10')).toBeTruthy();
    expect(screen.getByText('Богдан, Анна')).toBeTruthy();
  });

  it('an open row nobody named says so', () => {
    render(<SurveyBoard info={info([{ rank: 1, open: true, text: 'Ківі', popularity: 3, by: [] }], 1)} />);
    expect(screen.getByText('Ніхто не назвав')).toBeTruthy();
  });

  it('showClosed reveals the texts of closed rows to the host', () => {
    render(
      <SurveyBoard
        showClosed
        info={info([{ rank: 1, open: false, text: 'Яблуко', popularity: 32, by: ['Анна'] }, closed(2)], 0)}
      />,
    );
    expect(screen.getByText('Яблуко')).toBeTruthy();
    expect(screen.getByText('ще закрито')).toBeTruthy();
    expect(document.querySelectorAll('.survey-row.is-closed')).toHaveLength(1);
  });
});
