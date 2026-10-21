// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quizSchema, roundQuestions, type BoardRound, type Quiz } from '@quiz/shared';
import { t } from '../i18n';
import { newBoardRound, newClassicRound, newQuestion, newQuiz } from './draft';
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
const addRound = (type: 'Класичний' | 'Бліц') => {
  click('+ Раунд');
  click(type);
};
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
    const [question] = roundQuestions(quiz.rounds[0]);
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
    const [question] = roundQuestions(saved(onSave).rounds[0]);
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
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ type: 'numeric', correct: 2061, tolerance: 100 });
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
    const [first, second] = roundQuestions(saved(onSave).rounds[0]);
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
    expect(quiz.settings).toEqual({ leaderboard: 'end' });
    expect(quiz.rounds[0]).toMatchObject({ speedBonus: false, shuffleOptions: true });
    expect(roundQuestions(quiz.rounds[0])[0]).toMatchObject({ timeLimit: 45, points: 500, correct: true });
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
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ correct: -2.5, tolerance: 0.5, timeLimit: 45, points: 500 });
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
    expect(roundQuestions(saved(onSave).rounds[0]).map((q) => q.text)).toEqual(['Третє', 'Перше', 'Друге']);
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
    const [first, second] = roundQuestions(saved(onSave).rounds[0]);
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
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ type: 'boolean', correct: false });
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
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question.type === 'order' && question.items.map((i) => i.text)).toEqual(['Львів', 'Київ', 'Харків']);
  });
});

describe('QuizEditor: match questions', () => {
  it('creates a match question and saves its pairs in the author order', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Місто і річка');
    click('пари');
    const texts: [string, string][] = [
      ['Київ', 'Дніпро'],
      ['Львів', 'Полтва'],
      ['Ужгород', 'Уж'],
    ];
    texts.forEach(([l, r], i) => {
      fill(`Ліворуч ${i + 1}`, l);
      fill(`Праворуч ${i + 1}`, r);
    });
    click('Додати пару');
    fill('Ліворуч 4', 'Харків');
    fill('Праворуч 4', 'Лопань');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question.type).toBe('match');
    expect(question.type === 'match' && question.pairs.map((p) => [p.left.text, p.right.text])).toEqual([
      ...texts,
      ['Харків', 'Лопань'],
    ]);
  });

  it('a match question cannot have fewer than three or more than six pairs', () => {
    open();
    click('пари');
    expect((screen.getByRole('button', { name: 'Прибрати пару 1' }) as HTMLButtonElement).disabled).toBe(true);
    for (let i = 0; i < 3; i += 1) click('Додати пару');
    expect((screen.getByRole('button', { name: 'Додати пару' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Прибрати пару 1' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('QuizEditor: question image', () => {
  const IMAGE = '/uploads/0123456789abcdef0123456789abcdef.png';
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'photo', { type });
  const choose = (picked: File) => fireEvent.change(screen.getByLabelText('Додати зображення'), { target: { files: [picked] } });
  const answer = (status: number, body: unknown) => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  };

  afterEach(() => vi.unstubAllGlobals());

  it('uploads the chosen file, shows it and saves its address with the question', async () => {
    const fetchMock = answer(201, { url: IMAGE });
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що на фото?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    const picked = file('image/png');
    choose(picked);

    const image = (await screen.findByAltText('Зображення до запитання')) as HTMLImageElement;
    expect(image.getAttribute('src')).toBe(IMAGE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/uploads');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(picked);
    expect(new Headers(init?.headers).get('content-type')).toBe('image/png');

    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0].imageUrl).toBe(IMAGE);
  });

  it('removes the image', async () => {
    answer(201, { url: IMAGE });
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що на фото?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    choose(file('image/png'));
    await screen.findByAltText('Зображення до запитання');
    click('Прибрати зображення');
    expect(screen.queryByAltText('Зображення до запитання')).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0].imageUrl).toBeNull();
  });

  it('refuses a wrong format or an oversized file before sending anything', () => {
    const fetchMock = answer(201, { url: IMAGE });
    open();
    choose(file('image/gif'));
    expect(screen.getByRole('alert').textContent).toBe('Підходять лише зображення JPEG, PNG або WebP.');
    choose(file('image/png', 2 * 1024 * 1024 + 1));
    expect(screen.getByRole('alert').textContent).toBe('Зображення завелике: дозволено до 2 МБ.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('says why the server refused the image and keeps the question intact', async () => {
    answer(400, { error: 'bad_image' });
    open();
    fill('Текст запитання', 'Що на фото?');
    choose(file('image/png'));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Підходять лише зображення JPEG, PNG або WebP.'));
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Що на фото?');
    expect(screen.queryByAltText('Зображення до запитання')).toBeNull();
  });

  it('keeps what was typed while the image was uploading', async () => {
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))));
    open();
    fill('Текст запитання', 'Що');
    choose(file('image/png'));
    fill('Текст запитання', 'Що на фото?');
    finish(new Response(JSON.stringify({ url: IMAGE }), { status: 201 }));
    await screen.findByAltText('Зображення до запитання');
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Що на фото?');
  });

  it('does not touch another question when the upload ends after the host moved on', async () => {
    let finish: (response: Response) => void = () => undefined;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (finish = resolve))));
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    choose(file('image/png'));
    click('Додати запитання');
    fill('Текст запитання', 'Друге');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    finish(new Response(JSON.stringify({ url: IMAGE }), { status: 201 }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0]).map((q) => [q.text, q.imageUrl])).toEqual([
      ['Перше', null],
      ['Друге', null],
    ]);
  });

  it('keeps the image when the question is duplicated or its type changes', async () => {
    answer(201, { url: IMAGE });
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що на фото?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    choose(file('image/png'));
    await screen.findByAltText('Зображення до запитання');
    click('Дублювати');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0]).map((q) => q.imageUrl)).toEqual([IMAGE, IMAGE]);
  });
});

describe('QuizEditor: cancelled drag', () => {
  it('forgets a drag that ended without a drop', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    for (const [index, text] of ['Перше', 'Друге', 'Третє'].entries()) {
      if (index > 0) click('Додати запитання');
      fill('Текст запитання', text);
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    }
    const rows = () => screen.getAllByRole('listitem').filter((row) => row.getAttribute('draggable') === 'true');
    fireEvent.dragStart(rows()[2]);
    fireEvent.dragEnd(rows()[2]);
    // Пізніше на список кидають щось стороннє: порядок не має змінитися.
    fireEvent.drop(rows()[0]);
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0]).map((q) => q.text)).toEqual(['Перше', 'Друге', 'Третє']);
  });

  describe('same time for the round', () => {
    const twoQuestions = (): Quiz => ({
      ...newQuiz(),
      title: 'Гра',
      rounds: [
        {
          ...newClassicRound(),
          questions: [20, 45].map((timeLimit, i) => ({
            ...newQuestion('boolean'),
            text: `Питання ${i + 1}?`,
            timeLimit,
          })),
        },
      ],
    });

    it('applies one time to all questions of the round', async () => {
      const { onSave } = open(twoQuestions());
      fireEvent.click(screen.getByText('Налаштування раунду'));
      fill('Секунд', '40');
      click('Застосувати');
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
      expect(roundQuestions(saved(onSave).rounds[0]).map((q) => q.timeLimit)).toEqual([40, 40]);
    });

    it('the apply button is disabled outside 5–120 seconds', () => {
      open(twoQuestions());
      fireEvent.click(screen.getByText('Налаштування раунду'));
      const apply = screen.getByRole('button', { name: 'Застосувати' }) as HTMLButtonElement;
      for (const [value, disabled] of [['4', true], ['121', true], ['120', false], ['5', false], ['7.5', true]] as const) {
        fill('Секунд', value);
        expect(apply.disabled, value).toBe(disabled);
      }
    });
  });

  describe('rounds', () => {
    const roundButton = (name: string) => screen.queryByRole('button', { name });

    it('looks like before for a simple quiz: only "+ Раунд" and collapsed round settings', () => {
      open();
      expect(roundButton('+ Раунд')).toBeTruthy();
      expect(roundButton('Раунд 1')).toBeNull();
      expect(roundButton('Раунд 2')).toBeNull();
      const details = screen.getByText('Налаштування раунду').closest('details') as HTMLDetailsElement;
      expect(details.open).toBe(false);
      expect(screen.queryByRole('button', { name: 'Видалити раунд' })).toBeNull();
    });

    it('adds a round, switches between rounds and shows their own questions', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Перше?');
      addRound('Класичний');
      expect(roundButton('Раунд 1')).toBeTruthy();
      expect(roundButton('Раунд 2')).toBeTruthy();
      // Після додавання відкривається новий раунд з порожнім запитанням.
      expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('');
      fill('Текст запитання', 'Друге?');
      click('Раунд 1');
      expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Перше?');
      click('Раунд 2');
      expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Друге?');

      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      click('Раунд 1');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const quiz = saved(onSave);
      expect(quizSchema.safeParse(quiz).success).toBe(true);
      expect(quiz.rounds.map((r) => roundQuestions(r)[0].text)).toEqual(['Перше?', 'Друге?']);
    });

    it('adds a blitz round and saves its settings', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Перше?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      addRound('Бліц');
      expect(roundButton('Бліц')).toBeTruthy();
      fireEvent.click(screen.getAllByText('Налаштування раунду')[0]);
      fill('Вікно відповіді', '30');
      fill('Спроб на запитання', '2');
      fill('Перевірка', 'manual');
      fill('Текст запитання', 'Друге?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const quiz = saved(onSave);
      expect(quizSchema.safeParse(quiz).success).toBe(true);
      const blitz = quiz.rounds[1];
      expect(blitz.type).toBe('blitz');
      if (blitz.type === 'blitz') {
        expect(blitz.answerWindow).toBe(30);
        expect(blitz.attempts).toBe(2);
        expect(blitz.check).toBe('manual');
      }
    });

    it('blitz settings hide the speed bonus and partial credit', () => {
      open();
      expect(screen.queryByLabelText(t('speedBonus'))).toBeTruthy();
      addRound('Бліц');
      expect(screen.queryByLabelText(t('speedBonus'))).toBeNull();
      expect(screen.queryByLabelText(t('rulePartial'))).toBeNull();
      expect(screen.queryByLabelText('Вікно відповіді')).toBeTruthy();
    });

    it('never removes the only round, but removes one of several', () => {
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      open();
      addRound('Класичний');
      click('Видалити раунд');
      expect(roundButton('Раунд 2')).toBeNull();
      expect(roundButton('Раунд 1')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Видалити раунд' })).toBeNull();
    });

    it('reorders rounds', () => {
      open();
      fill('Текст запитання', 'Перше?');
      addRound('Класичний');
      fill('Текст запитання', 'Друге?');
      click('Раунд 2 вище');
      click('Раунд 1');
      expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Друге?');
    });

    it('limits the number of rounds', () => {
      open();
      for (let i = 1; i < 10; i++) addRound('Класичний');
      expect((screen.getByRole('button', { name: '+ Раунд' }) as HTMLButtonElement).disabled).toBe(true);
    });

    it('jumps to the broken question of another round when saving', () => {
      open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Перше?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      addRound('Класичний');
      click('Раунд 1');
      click('Зберегти');
      expect(screen.getByRole('alert').textContent).toContain('Раунд 2: Запитання 1: впишіть текст запитання.');
      expect(screen.getByRole('button', { name: 'Раунд 2' }).getAttribute('aria-current')).toBe('true');
      expect(screen.getByRole('button', { name: /Запитання 1/ }).getAttribute('aria-current')).toBe('true');
    });

    it('edits the rules of a round and saves them', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Так?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      fill('Назва раунду', 'Розминка');
      fireEvent.click(screen.getByLabelText('Штраф: мінус ціна запитання за хибну відповідь'));
      fireEvent.click(screen.getByLabelText('Кнопка «частково»'));
      fill('Частка балів за «частково», %', '40');
      fireEvent.click(screen.getByLabelText('Серії: бонус за правильні відповіді підряд'));
      fill('Правильних відповідей підряд', '3');
      fireEvent.change(screen.getByLabelText('Вид бонусу за серію'), { target: { value: 'fixed' } });
      fill('Бонус за серію', '250');
      fill('Множник балів', '2');
      click('Зберегти');

      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const [round] = saved(onSave).rounds;
      expect(round.title).toBe('Розминка');
      expect(round.rules).toEqual({
        penalty: 'minus',
        partial: 40,
        streak: { length: 3, bonus: { kind: 'fixed', value: 250 } },
        multiplier: 2,
      });
    });

    it('keeps default rules untouched for a fresh quiz', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Так?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      expect(saved(onSave).rounds[0].rules).toEqual({ penalty: 'none', partial: null, streak: null, multiplier: 1 });
    });
  });
});

describe('QuizEditor board rounds', () => {
  const cell = (category: number, index: number) => screen.getByRole('button', { name: new RegExp(`^Категорія ${category}, клітинка ${index}:`) });
  const fillQuestion = () => {
    fill('Текст запитання', 'Питання?');
    fill('Варіант 1', 'Так');
    fill('Варіант 2', 'Ні');
  };
  const addBoard = () => {
    click('+ Раунд');
    click('Ігрове поле');
  };

  it('adds a board round, edits points and marks, and saves', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fillQuestion();
    addBoard();
    [1, 2, 3].forEach((n) => fill(`Назва категорії ${n}`, `Тема ${n}`));
    fireEvent.click(screen.getAllByRole('button', { name: '+ Запитання' })[0]);
    expect(screen.getAllByRole('button', { name: /^Категорія 1, клітинка \d+:/ })).toHaveLength(4);
    expect(cell(1, 4).textContent).toContain('400');
    fillQuestion();
    fireEvent.click(cell(1, 2));
    fireEvent.change(screen.getByLabelText('Позначка'), { target: { value: 'x2' } });
    fill('Бали', '250');
    for (const [category, count] of [[1, 4], [2, 3], [3, 3]]) {
      for (let index = 1; index <= count; index += 1) {
        fireEvent.click(cell(category, index));
        fillQuestion();
      }
    }
    fireEvent.click(cell(1, 2));
    expect(cell(1, 2).textContent).toContain('×2');
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    const board = quiz.rounds[1] as BoardRound;
    expect(board.type).toBe('board');
    expect(board.categories[0].cells).toHaveLength(4);
    expect(board.categories[0].cells[1]).toMatchObject({ mark: 'x2', question: { points: 250 } });
    expect(board.categories.map((c) => c.title)).toEqual(['Тема 1', 'Тема 2', 'Тема 3']);
  });

  it('board limits show in the editor', () => {
    open();
    addBoard();
    expect(screen.queryByRole('button', { name: 'Прибрати категорію' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Прибрати запитання' })).toBeNull();
    for (let i = 0; i < 5; i += 1) click('+ Категорія');
    expect(screen.queryByRole('button', { name: '+ Категорія' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Прибрати категорію' })).toHaveLength(8);
    for (let i = 0; i < 7; i += 1) fireEvent.click(screen.getAllByRole('button', { name: '+ Запитання' })[0]);
    expect(screen.getAllByRole('button', { name: '+ Запитання' })).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Прибрати запитання' })).toBeTruthy();
  });

  it('removes a category and a cell', () => {
    open();
    addBoard();
    click('+ Категорія');
    fireEvent.click(screen.getAllByRole('button', { name: 'Прибрати категорію' })[3]);
    expect(screen.getAllByLabelText(/^Назва категорії/)).toHaveLength(3);
    fireEvent.click(screen.getAllByRole('button', { name: '+ Запитання' })[0]);
    click('Прибрати запитання');
    expect(screen.getAllByRole('button', { name: /^Категорія 1, клітинка \d+:/ })).toHaveLength(3);
  });

  it('board settings offer the default mode, which leaves existing cells alone', () => {
    open();
    addBoard();
    expect(screen.getByLabelText(t('boardCheck'))).toBeTruthy();
    expect(screen.queryByLabelText(t('speedBonus'))).toBeNull();
    fireEvent.change(screen.getByLabelText('Спосіб відповіді для нових клітинок'), { target: { value: 'voice' } });
    expect(screen.getByLabelText(t('boardCheck'))).toBeTruthy();
    expect((screen.getByLabelText('Як відповідати') as HTMLSelectElement).value).toBe('phone');
  });

  it('each board cell gets a kind, an answer mode and a blitz penalty', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fillQuestion();
    addBoard();
    [1, 2, 3].forEach((n) => fill(`Назва категорії ${n}`, `Тема ${n}`));
    for (const [category, count] of [[1, 3], [2, 3], [3, 3]]) {
      for (let index = 1; index <= count; index += 1) {
        fireEvent.click(cell(category, index));
        fillQuestion();
      }
    }
    fireEvent.click(cell(1, 1));
    expect(screen.queryByLabelText('Штраф бліцу')).toBeNull();
    fireEvent.change(screen.getByLabelText('Тип клітинки'), { target: { value: 'blitz' } });
    fireEvent.change(screen.getByLabelText('Штраф бліцу'), { target: { value: 'all' } });
    fireEvent.change(screen.getByLabelText('Як відповідати'), { target: { value: 'voice' } });
    expect(cell(1, 1).textContent).toContain('Бліц');
    expect(cell(1, 2).textContent).not.toContain('Бліц');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const board = saved(onSave).rounds[1] as BoardRound;
    expect(board.categories[0].cells[0]).toMatchObject({ kind: 'blitz', penalty: 'all', answerMode: 'voice' });
    expect(board.categories[0].cells[1]).toMatchObject({ kind: 'normal', penalty: 'none', answerMode: 'phone' });
  });

  it('the phone check setting shows only while some cell answers by phone', () => {
    open();
    addBoard();
    expect(screen.getByLabelText('Перевірка відповідей з телефона')).toBeTruthy();
    for (const category of [1, 2, 3]) {
      for (const index of [1, 2, 3]) {
        fireEvent.click(cell(category, index));
        fireEvent.change(screen.getByLabelText('Як відповідати'), { target: { value: 'voice' } });
      }
    }
    expect(screen.queryByLabelText('Перевірка відповідей з телефона')).toBeNull();
    fireEvent.change(screen.getByLabelText('Як відповідати'), { target: { value: 'phone' } });
    expect(screen.getByLabelText('Перевірка відповідей з телефона')).toBeTruthy();
  });

  it('hides the question list for a board and opens the broken cell on save', () => {
    open();
    addBoard();
    expect(screen.queryByRole('button', { name: 'Додати запитання' })).toBeNull();
    fill('Назва вікторини', 'Гра');
    click('Зберегти');
    expect(screen.getByRole('alert').textContent).toContain('Категорія 1: немає назви.');
  });
});

describe('QuizEditor board focus and limits', () => {
  const brokenBoard = (): Quiz => {
    const board = newBoardRound();
    board.categories.forEach((category, ci) => {
      category.title = `Тема ${ci + 1}`;
      category.cells.forEach((cell, i) => {
        const q = cell.question;
        if (q.type !== 'single') return;
        cell.question = { ...q, text: `Питання ${ci}${i}`, options: q.options.map((o, k) => ({ ...o, text: `В${k}` })) };
      });
    });
    board.categories[1].cells[2].question = { ...board.categories[1].cells[2].question, text: '' };
    return { ...newQuiz(), title: 'Гра', rounds: [board, newClassicRound()] };
  };

  it('opens the broken board cell after a failed save', () => {
    open(brokenBoard());
    click('Зберегти');
    const broken = screen.getByRole('button', { name: /^Категорія 2, клітинка 3:/ });
    expect(broken.getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('region', { name: 'Клітинка 3 категорії 2' })).toBeTruthy();
  });

  it('does not jump back to the old problem cell after switching rounds', () => {
    open(brokenBoard());
    click('Зберегти');
    fireEvent.click(screen.getByRole('button', { name: 'Раунд 2' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ігрове поле' }));
    expect(screen.getByRole('region', { name: 'Клітинка 1 категорії 1' })).toBeTruthy();
  });

  it('disables a new category when three more questions would pass the quiz limit', () => {
    const board = newBoardRound();
    const classic = newClassicRound();
    const extra = Array.from({ length: 100 }, () => newQuestion('single'));
    const second = { ...newClassicRound(), questions: extra };
    const third = { ...newClassicRound(), questions: extra.map((q) => ({ ...q, id: `${q.id}-b` })).slice(0, 89) };
    open({ ...newQuiz(), rounds: [board, second, { ...third, id: 'r3' }, classic] });
    expect(screen.getByRole('button', { name: '+ Категорія' })).toHaveProperty('disabled', true);
  });
});
