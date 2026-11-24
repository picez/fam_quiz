// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { chooseType, currentTypeLabel, typeOptions } from './editor-testing';
import { groupedTypes } from './type-groups';
import { newQuestion, questionTypesFor } from './draft';
import { QuestionEditor } from './QuestionEditor';

type Draw = Extract<Question, { type: 'drawing' }>;

afterEach(cleanup);

describe('QuestionEditor type combobox (74)', () => {
  it('picks the type from a grouped combobox', () => {
    const onChange = vi.fn();
    render(<QuestionEditor question={newQuestion('text')} onChange={onChange} types={questionTypesFor('classic')} />);
    expect(screen.getByRole('button', { name: `${t('questionType')}: ${t('type_text')}` })).toBeTruthy();
    expect(currentTypeLabel()).toBe(t('type_text'));
    expect(typeOptions()).toEqual(groupedTypes(questionTypesFor('classic')).flatMap((g) => g.types));
    chooseType('drawing');
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ type: 'drawing' });
  });

  it('offers only the round types', () => {
    render(<QuestionEditor question={newQuestion('single')} onChange={vi.fn()} types={questionTypesFor('blitz')} />);
    const options = typeOptions();
    expect(options).not.toContain('drawing');
    expect(options).toContain('single');
  });

  it('finds a type by its short name', () => {
    render(<QuestionEditor question={newQuestion('text')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${t('questionType')}:`) }));
    fireEvent.change(screen.getByRole('combobox', { name: t('comboSearch') }), { target: { value: t('typeShort_clues') } });
    const shown = screen.getAllByRole('option').map((o) => o.getAttribute('data-value'));
    expect(shown).toContain('clues');
    expect(shown).not.toContain('single');
  });

  it('keeps a type that is not allowed visible on the button', () => {
    render(<QuestionEditor question={newQuestion('drawing')} onChange={vi.fn()} types={questionTypesFor('blitz')} />);
    expect(currentTypeLabel()).toBe(t('type_drawing'));
  });
});

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
    chooseType('drawing');
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

describe('QuestionEditor 37 editors', () => {
  type Num = Extract<Question, { type: 'numeric' }>;

  it('no overshoot hides tolerance', () => {
    const onChange = vi.fn();
    const question: Num = { ...(newQuestion('numeric') as Num), text: 'Скільки?', correct: 10, tolerance: 5 };
    const { rerender } = render(<QuestionEditor question={question} onChange={onChange} types={questionTypesFor('classic')} />);
    expect(screen.getByLabelText(t('tolerance'))).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: t('overshootLabel') }));
    const on = onChange.mock.calls.at(-1)?.[0] as Num;
    expect(on.noOvershoot).toBe(true);
    rerender(<QuestionEditor question={on} onChange={onChange} types={questionTypesFor('classic')} />);
    expect(screen.queryByLabelText(t('tolerance'))).toBeNull();
    expect(screen.getByText(t('overshootHint'))).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: t('overshootLabel') }));
    const off = onChange.mock.calls.at(-1)?.[0] as Num;
    expect('noOvershoot' in off).toBe(false);
    rerender(<QuestionEditor question={off} onChange={onChange} types={questionTypesFor('classic')} />);
    expect((screen.getByLabelText(t('tolerance')) as HTMLInputElement).value).toBe('5');
  });

  it('thinkalike shows only the theme hint', () => {
    render(<QuestionEditor question={newQuestion('thinkalike')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(screen.getByText(t('alikeEditorHint'))).toBeTruthy();
    expect(screen.queryByLabelText(t('hintLabel'))).toBeNull();
    expect(screen.queryByRole('group', { name: t('revealLabel') })).toBeNull();
  });
});

describe('QuestionEditor spy (38)', () => {
  it('spy hides hint and media', () => {
    render(<QuestionEditor question={newQuestion('spy')} onChange={vi.fn()} types={questionTypesFor('classic')} showReveal />);
    expect(screen.getByText(t('spyEditorHint'))).toBeTruthy();
    expect(screen.queryByLabelText(t('hintLabel'))).toBeNull();
    expect(screen.queryByRole('group', { name: t('revealLabel') })).toBeNull();
    expect(screen.queryByLabelText(t('videoLabel'))).toBeNull();
    expect(screen.queryByText(t('addAudio'))).toBeNull();
  });
});

describe('QuestionEditor wordle (48)', () => {
  it('wordle hides video, hint and reveal but keeps the picture', () => {
    render(<QuestionEditor question={newQuestion('wordle')} onChange={vi.fn()} types={questionTypesFor('classic')} showReveal />);
    expect(screen.getByLabelText(t('wordleWord'))).toBeTruthy();
    expect(screen.queryByLabelText(t('videoLabel'))).toBeNull();
    expect(screen.queryByLabelText(t('hintLabel'))).toBeNull();
    expect(screen.queryByRole('group', { name: t('revealLabel') })).toBeNull();
    expect(screen.getByText(t('addImage'))).toBeTruthy();
  });

  it('61: wordle has no question text field, only the word', () => {
    render(<QuestionEditor question={{ ...newQuestion('wordle'), text: 'Ягода з колючого куща' }} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(screen.queryByLabelText(t('questionText'))).toBeNull();
    expect(screen.queryByDisplayValue('Ягода з колючого куща')).toBeNull();
    expect(screen.getByLabelText(t('wordleWord'))).toBeTruthy();
  });

  it('67: single and multiple answer options sit in an option-rows container', () => {
    for (const type of ['single', 'multi'] as const) {
      const { container } = render(<QuestionEditor question={newQuestion(type)} onChange={vi.fn()} types={questionTypesFor('classic')} />);
      expect(container.querySelector('.answer-rows.option-rows'), type).not.toBeNull();
      cleanup();
    }
  });
});

describe('QuestionEditor cards (74)', () => {
  const card = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-card="${name}"]`);

  it('groups the fields into cards in the agreed order', () => {
    const { container } = render(<QuestionEditor question={newQuestion('single')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect([...container.querySelectorAll<HTMLElement>('[data-card]')].map((el) => el.dataset.card)).toEqual(['question', 'media', 'answers', 'time']);
    const question = card(container, 'question')!;
    expect(question.contains(screen.getByLabelText(t('questionText')))).toBe(true);
    expect(question.contains(screen.getByLabelText(t('hintLabel')))).toBe(true);
    expect(card(container, 'answers')!.contains(screen.getByLabelText(t('optionN', { index: 1 })))).toBe(true);
    const time = card(container, 'time')!;
    expect(time.contains(screen.getByLabelText(t('timeLimit')))).toBe(true);
    expect(time.contains(screen.getByLabelText(t('pointsLabel')))).toBe(true);
  });

  it('folds the media card while the question has no media and names what is inside', () => {
    const { container, rerender } = render(<QuestionEditor question={newQuestion('single')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    const media = container.querySelector<HTMLDetailsElement>('details[data-card="media"]')!;
    expect(media.open).toBe(false);
    expect(media.querySelector('summary')!.textContent).toContain(t('cardMediaAdd'));
    // Те саме запитання отримало медіа: картка розгортається.
    const same = newQuestion('single');
    rerender(<QuestionEditor question={same} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(container.querySelector<HTMLDetailsElement>('details[data-card="media"]')!.open).toBe(false);
    rerender(<QuestionEditor question={{ ...same, imageUrl: 'https://x/i.png' }} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    const opened = container.querySelector<HTMLDetailsElement>('details[data-card="media"]')!;
    expect(opened.open).toBe(true);
    expect(opened.querySelector('summary')!.textContent).toContain(t('cardMediaImage'));
  });

  it('keeps the cover image of a melody and the sound of a pin in the answers card', () => {
    const { container } = render(<QuestionEditor question={newQuestion('melody')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(card(container, 'media')).toBeNull();
    expect(within(card(container, 'answers')!).getByText(t('addImage'))).toBeTruthy();
    cleanup();
    const pin = render(<QuestionEditor question={newQuestion('pin')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(card(pin.container, 'media')).toBeNull();
    expect(card(pin.container, 'answers')!.querySelector('.audio-field')).not.toBeNull();
  });

  it('marks the question text and the answers as required without changing their names', () => {
    const { container } = render(<QuestionEditor question={newQuestion('single')} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(card(container, 'question')!.querySelector('.editor-card-title.is-required')).not.toBeNull();
    expect(card(container, 'answers')!.querySelector('.editor-card-title.is-required')).not.toBeNull();
    expect(card(container, 'time')!.querySelector('.is-required')).toBeNull();
    const text = screen.getByLabelText(t('questionText'), { exact: true });
    expect(text.getAttribute('aria-required')).toBe('true');
  });

  it('shows a grey timer reminder under a short timer and none when the timer is hidden', () => {
    const short = { ...newQuestion('single'), timeLimit: 15 } as Question;
    const { container, rerender } = render(<QuestionEditor question={short} onChange={vi.fn()} types={questionTypesFor('classic')} />);
    expect(card(container, 'time')!.textContent).toContain(t('reminderTimerInline', { min: 25 }));
    rerender(<QuestionEditor question={short} onChange={vi.fn()} types={questionTypesFor('classic')} showTime={false} />);
    expect(container.textContent).not.toContain(t('reminderTimerInline', { min: 25 }));
  });

  it('puts an issue text into its card', () => {
    const { container } = render(<QuestionEditor question={newQuestion('single')} onChange={vi.fn()} types={questionTypesFor('classic')} issue={{ card: 'answers', text: 'X' }} />);
    const answers = card(container, 'answers')!;
    expect(answers.classList.contains('has-error')).toBe(true);
    expect(answers.textContent).toContain('X');
    expect(container.querySelectorAll('.has-error')).toHaveLength(1);
  });
});

describe('QuestionEditor explanation', () => {
  const ALL_TYPES = [...new Set([...questionTypesFor('classic'), ...questionTypesFor('puzzles'), ...questionTypesFor('think')])];

  it('every type has the explanation field at the end of the answers card, hint or not', () => {
    for (const type of ALL_TYPES) {
      const { container } = render(<QuestionEditor question={newQuestion(type)} onChange={vi.fn()} types={ALL_TYPES} />);
      const field = screen.getByLabelText(t('explanationLabel')) as HTMLTextAreaElement;
      expect(field.maxLength, type).toBe(LIMITS.explanationText);
      expect(container.querySelector('[data-card="answers"]')!.contains(field), type).toBe(true);
      cleanup();
    }
  });

  it('is shown for a spare too, where the hint is hidden', () => {
    render(<QuestionEditor question={newQuestion('single')} onChange={vi.fn()} types={['single']} showHint={false} />);
    expect(screen.queryByLabelText(t('hintLabel'))).toBeNull();
    expect(screen.getByLabelText(t('explanationLabel'))).toBeTruthy();
  });

  it('writes the text and an empty value removes the key', () => {
    const onChange = vi.fn();
    const question = { ...newQuestion('text'), explanation: 'Було' } as Question;
    render(<QuestionEditor question={question} onChange={onChange} types={questionTypesFor('classic')} />);
    const field = screen.getByLabelText(t('explanationLabel')) as HTMLTextAreaElement;
    expect(field.value).toBe('Було');
    fireEvent.change(field, { target: { value: 'Бо так.\nІ ще.' } });
    expect((onChange.mock.calls.at(-1)?.[0] as Question).explanation).toBe('Бо так.\nІ ще.');
    fireEvent.change(field, { target: { value: '' } });
    expect(onChange.mock.calls.at(-1)?.[0]).not.toHaveProperty('explanation');
  });
});
