// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { newQuestion, questionTypesFor } from './draft';
import { QuestionEditor } from './QuestionEditor';

type Draw = Extract<Question, { type: 'drawing' }>;

afterEach(cleanup);

describe('QuestionEditor drawing (28c)', () => {
  it('edits the word and spellings of a drawing', () => {
    const onChange = vi.fn();
    const question: Draw = { ...(newQuestion('drawing') as Draw), text: 'Що це?', accepted: ['Соняшник', 'соняшнік'] };
    const { rerender } = render(<QuestionEditor question={question} onChange={onChange} types={questionTypesFor('classic')} />);
    const first = screen.getByLabelText(t('spellingN', { index: 1 })) as HTMLInputElement;
    expect(first.value).toBe('Соняшник');
    expect(first.maxLength).toBe(LIMITS.drawGuess);
    expect((screen.getByLabelText(t('spellingN', { index: 2 })) as HTMLInputElement).value).toBe('соняшнік');
    expect(screen.getByText(t('drawingWordHint'))).toBeTruthy();
    expect(screen.getByText(t('drawingHelp'))).toBeTruthy();

    fireEvent.change(first, { target: { value: 'Парасолька' } });
    expect((onChange.mock.calls.at(-1)?.[0] as Draw).accepted).toEqual(['Парасолька', 'соняшнік']);
    fireEvent.click(screen.getByRole('button', { name: t('addSpelling') }));
    expect((onChange.mock.calls.at(-1)?.[0] as Draw).accepted).toEqual(['Соняшник', 'соняшнік', '']);

    // Ні відео, ні звуку, ні підказки для бафів: у малюнку їх немає. Час і ціна — є.
    expect(screen.queryByText(t('videoLabel'))).toBeNull();
    expect(screen.queryByText(t('audioLabel'))).toBeNull();
    expect(screen.queryByLabelText(t('hintLabel'))).toBeNull();
    expect((screen.getByLabelText(t('timeLimit')) as HTMLInputElement).value).toBe(String(LIMITS.defaultDrawingTime));
    expect((screen.getByLabelText(t('pointsLabel')) as HTMLInputElement).value).toBe(String(LIMITS.defaultDrawingPoints));

    // Чип типу «Малюнок» є в класиці.
    rerender(<QuestionEditor question={newQuestion('text')} onChange={onChange} types={questionTypesFor('classic')} />);
    fireEvent.click(screen.getByRole('button', { name: t('typeShort_drawing') }));
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'drawing' });
  });
});

describe('QuestionEditor points after a type switch (29c)', () => {
  it('the points field shows the new type points on the first paint', () => {
    const seen: string[] = [];
    // Шар над редактором: його layout-ефект іде після DOM, але до звичайних ефектів поля — те, що побачить око.
    function Probe({ question }: { question: Question }) {
      useLayoutEffect(() => {
        seen.push((screen.getByLabelText(t('pointsLabel')) as HTMLInputElement).value);
      });
      return <QuestionEditor question={question} onChange={vi.fn()} types={questionTypesFor('classic')} />;
    }
    const text = { ...newQuestion('text'), points: 100 } as Question;
    const jigsaw = { ...newQuestion('jigsaw'), id: text.id, points: 777 } as Question;
    const { rerender } = render(<Probe question={text} />);
    rerender(<Probe question={jigsaw} />);
    expect(seen).toEqual(['100', '777']);
  });
});

describe('QuestionEditor: a question drafted from a group (12l)', () => {
  it('shows the reminders above the text inside the provider and nothing outside', async () => {
    const { GroupDraftsProvider } = await import('./group-drafts');
    const question = { ...newQuestion('single'), text: 'Хто це? Як тато заблукав' };
    const { container, unmount } = render(<QuestionEditor question={question} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(container.querySelector('.group-draft-notes')).toBeNull();
    unmount();

    render(
      <GroupDraftsProvider initial={{ entries: { [question.id]: { groupId: 'g1', itemId: 'i1', notes: [{ key: 'groupNoteBlankName' }] } } }} onChange={vi.fn()}>
        <QuestionEditor question={question} onChange={vi.fn()} types={questionTypesFor('classic')} />
      </GroupDraftsProvider>,
    );
    const notes = screen.getByRole('note');
    expect(notes.textContent).toContain('Заміни ім’я героя');
    const text = screen.getByLabelText(t('questionText'));
    expect(notes.compareDocumentPosition(text) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
