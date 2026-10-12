// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quizSchema, type Quiz } from '@quiz/shared';
import { newQuiz } from './draft';
import { QuizEditor } from './QuizEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open(initial: Quiz = newQuiz(), result: string | null = null) {
  const onSave = vi.fn(async (_quiz: Quiz) => result);
  const onCancel = vi.fn();
  render(<QuizEditor initial={initial} heading="Нова вікторина" onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const saved = (onSave: ReturnType<typeof open>['onSave']) => onSave.mock.calls[0][0];

describe('QuizEditor', () => {
  it('saves a quiz with a single-choice question', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Географія');
    fill('Текст запитання', 'Столиця України?');
    fill('Варіант 1', 'Львів');
    fill('Варіант 2', 'Київ');
    fireEvent.click(screen.getByLabelText('Правильний: варіант 2'));
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(quiz.title).toBe('Географія');
    const [question] = quiz.questions;
    expect(question).toMatchObject({ type: 'single', text: 'Столиця України?' });
    if (question.type === 'single') {
      expect(question.options.map((o) => o.text)).toEqual(['Львів', 'Київ']);
      expect(question.correctId).toBe(question.options[1].id);
    }
  });

  it('does not save an unfinished quiz and says what is missing', () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Географія');
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Запитання 1: впишіть текст запитання.');
  });

  it('shows an error returned by the save', async () => {
    open(undefined, 'Немає зв’язку із сервером.');
    fill('Назва вікторини', 'Географія');
    fill('Текст запитання', 'Говерла найвища?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    click('Зберегти');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Немає зв’язку із сервером.'));
  });

  it('adds and removes options within the limits', () => {
    open();
    for (let i = 0; i < 4; i++) click('Додати варіант');
    expect(screen.getByLabelText('Варіант 6')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Додати варіант' }) as HTMLButtonElement).disabled).toBe(true);

    click('Прибрати варіант 6');
    expect(screen.queryByLabelText('Варіант 6')).toBeNull();
    for (const n of [5, 4, 3]) click(`Прибрати варіант ${n}`);
    expect((screen.getByRole('button', { name: 'Прибрати варіант 2' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps a correct option when the marked one is removed', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що?');
    click('Додати варіант');
    fill('Варіант 1', 'А');
    fill('Варіант 2', 'Б');
    fill('Варіант 3', 'В');
    fireEvent.click(screen.getByLabelText('Правильний: варіант 3'));
    click('Прибрати варіант 3');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [question] = saved(onSave).questions;
    if (question.type === 'single') expect(question.options.map((o) => o.id)).toContain(question.correctId);
  });

  it('switches the fields with the question type and keeps the text', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Яка висота Говерли?');
    fireEvent.click(screen.getByRole('button', { name: 'число' }));
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Яка висота Говерли?');
    expect(screen.queryByLabelText('Варіант 1')).toBeNull();

    fill('Правильне число', '2061');
    fill('Допустиме відхилення', '100');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).questions[0]).toMatchObject({ type: 'numeric', correct: 2061, tolerance: 100 });
  });

  it('edits a text question with several spellings and an order question', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Місто із замком Паланок?');
    fireEvent.click(screen.getByRole('button', { name: 'текст' }));
    fill('Написання 1', 'Мукачево');
    click('Додати написання');
    fill('Написання 2', 'Мукачеве');

    click('Додати запитання');
    fill('Текст запитання', 'Із заходу на схід');
    fireEvent.click(screen.getByRole('button', { name: 'порядок' }));
    fill('Елемент 1', 'Львів');
    fill('Елемент 2', 'Київ');
    fill('Елемент 3', 'Харків');
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [first, second] = saved(onSave).questions;
    expect(first).toMatchObject({ type: 'text', accepted: ['Мукачево', 'Мукачеве'] });
    expect(second.type === 'order' && second.items.map((i) => i.text)).toEqual(['Львів', 'Київ', 'Харків']);
  });

  it('adds, reorders and removes questions but never the last one', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    open();
    expect((screen.getByRole('button', { name: 'Видалити запитання 1' }) as HTMLButtonElement).disabled).toBe(true);
    fill('Текст запитання', 'Перше');
    click('Додати запитання');
    fill('Текст запитання', 'Друге');

    click('Перемістити запитання 2 вище');
    expect(screen.getByRole('button', { name: /Запитання 2.*Перше/ })).toBeTruthy();
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Друге');

    click('Видалити запитання 1');
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Перше');
    expect(screen.queryByRole('button', { name: /Запитання 2/ })).toBeNull();
  });

  it('changes the game rules', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Так?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    fireEvent.click(screen.getByLabelText(/Бали за швидкість/));
    fireEvent.click(screen.getByLabelText('Перемішувати варіанти відповідей'));
    fireEvent.change(screen.getByLabelText('Показувати рейтинг'), { target: { value: 'end' } });
    fill('Час, с', '45');
    fill('Бали', '500');
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const quiz = saved(onSave);
    expect(quiz.settings).toEqual({ speedBonus: false, leaderboard: 'end', shuffleOptions: true });
    expect(quiz.questions[0]).toMatchObject({ timeLimit: 45, points: 500, correct: true });
  });

  it('opens an existing quiz for editing and cancels', () => {
    const initial: Quiz = { ...newQuiz(), title: 'Стара назва' };
    const { onCancel } = open(initial);
    expect((screen.getByLabelText('Назва вікторини') as HTMLInputElement).value).toBe('Стара назва');
    click('Скасувати');
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('QuizEditor: numbers as they are typed', () => {
  const typeInto = (label: string, ...steps: string[]) => {
    const input = screen.getByLabelText(label) as HTMLInputElement;
    for (const value of steps) {
      fireEvent.change(input, { target: { value } });
      expect(input.value).toBe(value);
    }
  };

  it('keeps a minus sign and a decimal comma while the number is being typed', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Число?');
    fireEvent.click(screen.getByRole('button', { name: 'число' }));
    typeInto('Правильне число', '', '-', '-2', '-2,', '-2,5');
    typeInto('Допустиме відхилення', '', '0', '0,', '0,5');
    typeInto('Час, с', '', '4', '45');
    typeInto('Бали', '', '5', '50', '500');
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).questions[0]).toMatchObject({ correct: -2.5, tolerance: 0.5, timeLimit: 45, points: 500 });
  });

  it('keeps a mistyped time visible and refuses to save it', () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Так?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    typeInto('Час, с', '30', '30x');
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Запитання 1: час має бути від 5 до 120 секунд');
  });
});

describe('QuizEditor: problems and unsaved work', () => {
  function twoQuestionsSecondEmpty() {
    const result = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше');
    fill('Варіант 1', 'А');
    fill('Варіант 2', 'Б');
    click('Додати запитання');
    fireEvent.click(screen.getByRole('button', { name: /Запитання 1/ }));
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Перше');
    return result;
  }

  it('shows what is wrong next to the save button and opens the question that needs attention', () => {
    const { onSave } = twoQuestionsSecondEmpty();
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('Запитання 2: впишіть текст запитання.');
    expect(alert.closest('footer')).not.toBeNull();
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('');
  });

  it('clears the problem list once the person starts fixing it', () => {
    twoQuestionsSecondEmpty();
    click('Зберегти');
    fill('Текст запитання', 'Друге');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('asks before discarding changes on cancel, and does not ask when nothing changed', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onCancel } = open();
    click('Скасувати');
    expect(confirm).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);

    fill('Назва вікторини', 'Гра');
    click('Скасувати');
    expect(confirm).toHaveBeenCalledWith('Вийти без збереження? Зміни буде втрачено.');
    expect(onCancel).toHaveBeenCalledTimes(1);

    confirm.mockReturnValue(true);
    click('Скасувати');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it('asks before deleting a question that already has text', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open();
    fill('Текст запитання', 'Важливе запитання');
    click('Додати запитання');
    click('Видалити запитання 2');
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /Запитання 2/ })).toBeNull();

    click('Додати запитання');
    fireEvent.click(screen.getByRole('button', { name: /Запитання 1/ }));
    click('Видалити запитання 1');
    expect(confirm).toHaveBeenCalledWith('Видалити запитання 1 разом із його текстом?');
    expect(screen.getByRole('button', { name: /Запитання 1.*Важливе запитання/ })).toBeTruthy();
  });

  it('reports every change as a draft and shows a notice it was given', () => {
    const onDraft = vi.fn();
    render(
      <QuizEditor
        initial={newQuiz()}
        heading="Нова вікторина"
        notice="Відновлено незбережені зміни."
        onDraft={onDraft}
        onSave={async () => null}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('status').textContent).toBe('Відновлено незбережені зміни.');
    fill('Назва вікторини', 'Чернетка');
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Чернетка' }));
  });
});

describe('QuizEditor: list and stage', () => {
  const textarea = () => screen.getByLabelText('Текст запитання') as HTMLTextAreaElement;
  const item = (pattern: RegExp) => screen.getByRole('button', { name: pattern });

  function threeQuestions() {
    const result = open();
    fill('Назва вікторини', 'Гра');
    for (const [index, text] of ['Перше', 'Друге', 'Третє'].entries()) {
      if (index > 0) click('Додати запитання');
      fill('Текст запитання', text);
    }
    return result;
  }

  it('lists every question and shows the one that is picked', () => {
    threeQuestions();
    expect(textarea().value).toBe('Третє');
    fireEvent.click(item(/Запитання 1 Перше/));
    expect(textarea().value).toBe('Перше');
    expect(item(/Запитання 1 Перше/).getAttribute('aria-current')).toBe('true');
    expect(item(/Запитання 3 Третє/).getAttribute('aria-current')).toBe('false');
  });

  it('shows the type of each question in the list', () => {
    open();
    click('число');
    expect(item(/Запитання 1/).textContent).toContain('число');
  });

  it('steps to the previous and the next question', () => {
    threeQuestions();
    click('Попереднє запитання');
    expect(textarea().value).toBe('Друге');
    click('Попереднє запитання');
    expect((screen.getByRole('button', { name: 'Попереднє запитання' }) as HTMLButtonElement).disabled).toBe(true);
    click('Наступне запитання');
    click('Наступне запитання');
    expect(textarea().value).toBe('Третє');
    expect((screen.getByRole('button', { name: 'Наступне запитання' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('opens and closes the question list on a phone', () => {
    threeQuestions();
    const toggle = screen.getByRole('button', { name: 'Усі запитання' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.textContent).toContain('3 / 3');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(item(/Запитання 2 Друге/));
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reorders questions by dragging one onto another', async () => {
    const { onSave } = threeQuestions();
    const row = (pattern: RegExp) => item(pattern).closest('li') as HTMLElement;
    fireEvent.dragStart(row(/Запитання 3 Третє/));
    fireEvent.dragOver(row(/Запитання 1 Перше/));
    fireEvent.drop(row(/Запитання 1 Перше/));
    expect(item(/Запитання 1 Третє/)).toBeTruthy();
    expect(item(/Запитання 2 Перше/)).toBeTruthy();
    expect(textarea().value).toBe('Третє');

    for (const n of [1, 2, 3]) {
      fireEvent.click(item(new RegExp(`Запитання ${n} `)));
      fill('Варіант 1', 'А');
      fill('Варіант 2', 'Б');
    }
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).questions.map((q) => q.text)).toEqual(['Третє', 'Перше', 'Друге']);
  });

  it('duplicates the question with its options and marks, as a separate question', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Столиця?');
    fill('Варіант 1', 'Львів');
    fill('Варіант 2', 'Київ');
    fireEvent.click(screen.getByLabelText('Правильний: варіант 2'));
    click('Дублювати');

    expect(item(/Запитання 2 Столиця\?/).getAttribute('aria-current')).toBe('true');
    fill('Текст запитання', 'Столиця України?');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [first, second] = saved(onSave).questions;
    expect([first.text, second.text]).toEqual(['Столиця?', 'Столиця України?']);
    expect(second.id).not.toBe(first.id);
    if (first.type !== 'single' || second.type !== 'single') throw new Error('unexpected type');
    expect(second.options.map((o) => o.text)).toEqual(['Львів', 'Київ']);
    expect(second.correctId).toBe(second.options[1].id);
    expect(second.options.map((o) => o.id)).not.toEqual(first.options.map((o) => o.id));
  });
});

describe('QuizEditor: answers on the stage', () => {
  const option = (n: number) => screen.getByLabelText(`Варіант ${n}`) as HTMLInputElement;

  it('marks the correct option with one tap and shows it', () => {
    open();
    const mark = (n: number) => screen.getByLabelText(`Правильний: варіант ${n}`);
    expect(mark(1).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(mark(2));
    expect(mark(2).getAttribute('aria-pressed')).toBe('true');
    expect(mark(1).getAttribute('aria-pressed')).toBe('false');
    expect(option(2).closest('.answer-row')?.className).toContain('is-correct');
  });

  it('lets several options be correct in a multi-choice question', () => {
    open();
    click('кілька варіантів');
    const mark = (n: number) => screen.getByLabelText(`Правильний: варіант ${n}`);
    fireEvent.click(mark(2));
    expect([mark(1), mark(2)].map((m) => m.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    fireEvent.click(mark(1));
    expect(mark(1).getAttribute('aria-pressed')).toBe('false');
  });

  it('adds the next option on Enter and moves the cursor into it', () => {
    open();
    fill('Варіант 1', 'Львів');
    fireEvent.keyDown(option(1), { key: 'Enter' });
    expect(document.activeElement).toBe(option(2));

    fill('Варіант 2', 'Київ');
    fireEvent.keyDown(option(2), { key: 'Enter' });
    expect(document.activeElement).toBe(option(3));
    expect(option(3).value).toBe('');
  });

  it('does not add a seventh option on Enter', () => {
    open();
    for (let i = 0; i < 4; i++) click('Додати варіант');
    fireEvent.keyDown(option(6), { key: 'Enter' });
    expect(screen.queryByLabelText('Варіант 7')).toBeNull();
  });

  it('keeps the cursor in the list after an option is removed', () => {
    open();
    click('Додати варіант');
    click('Прибрати варіант 3');
    expect(document.activeElement).toBe(option(2));
  });

  it('picks yes or no with one tap', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Земля пласка?');
    click('так чи ні');
    fireEvent.click(screen.getByRole('button', { name: 'Правильна відповідь: Ні' }));
    expect(screen.getByRole('button', { name: 'Правильна відповідь: Ні' }).getAttribute('aria-pressed')).toBe('true');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).questions[0]).toMatchObject({ type: 'boolean', correct: false });
  });

  it('moves items of an order question up and down', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Із заходу на схід');
    click('порядок');
    fill('Елемент 1', 'Київ');
    fill('Елемент 2', 'Львів');
    fill('Елемент 3', 'Харків');
    click('Перемістити елемент 2 вище');
    expect((screen.getByLabelText('Елемент 1') as HTMLInputElement).value).toBe('Львів');
    expect((screen.getByRole('button', { name: 'Перемістити елемент 1 вище' }) as HTMLButtonElement).disabled).toBe(true);
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [question] = saved(onSave).questions;
    expect(question.type === 'order' && question.items.map((i) => i.text)).toEqual(['Львів', 'Київ', 'Харків']);
  });
});
