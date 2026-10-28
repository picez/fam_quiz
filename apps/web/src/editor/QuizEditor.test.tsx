// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quizSchema, roundQuestions, rulesOf, type BoardRound, type Question, type Quiz } from '@quiz/shared';
import { t } from '../i18n';
import { newBoardRound, newClassicRound, newLadderRound, newQuestion, newQuiz, newSurvivalRound } from './draft';
import { QuizEditor } from './QuizEditor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function open(initial: Quiz = newQuiz(), result: string | null = null) {
  const onSave = vi.fn(async (_quiz: Quiz) => result);
  const onCancel = vi.fn();
  render(<QuizEditor initial={initial} heading="Нова вікторина" onSave={onSave} onCancel={onCancel} />);
  return { onSave, onCancel };
}

const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const addRound = (type: 'Класичний' | 'Бліц' | 'Фінал' | 'Ва-банк' | 'Вибування' | 'Мільйонер') => {
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

  it('an option takes a picture instead of text', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: '/uploads/abcdefabcdefabcd.png' }), { status: 201 }));
    vi.stubGlobal('fetch', fetchMock);
    const { onSave } = open();
    fill('Назва вікторини', 'Географія');
    fill('Текст запитання', 'Де Київ?');
    fill('Варіант 1', 'Львів');
    fill('Варіант 2', 'Київ');
    const file = new File(['x'], 'kyiv.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Картинка для варіанта 2'), { target: { files: [file] } });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Прибрати картинку варіанта 2' })).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fill('Варіант 2', '');
    fireEvent.click(screen.getByLabelText('Правильний: варіант 2'));
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    const [question] = roundQuestions(quiz.rounds[0]);
    if (question.type !== 'single') throw new Error('single');
    expect(question.options[1]).toEqual({ id: question.options[1].id, text: '', imageUrl: '/uploads/abcdefabcdefabcd.png' });
    expect(question.correctId).toBe(question.options[1].id);

    fill('Варіант 2', 'Київ');
    click('Прибрати картинку варіанта 2');
    expect(screen.queryByRole('button', { name: 'Прибрати картинку варіанта 2' })).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const [again] = roundQuestions(onSave.mock.calls[1][0].rounds[0]);
    expect(again.type === 'single' && again.options[1]).not.toHaveProperty('imageUrl');
  });

  it('an order question takes optional top and bottom labels', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Розставте');
    fireEvent.click(screen.getByRole('button', { name: 'порядок' }));
    fill('Елемент 1', 'Один');
    fill('Елемент 2', 'Два');
    fill('Елемент 3', 'Три');
    expect(screen.getByLabelText('Що зверху (необов’язково)').getAttribute('maxlength')).toBe('40');
    expect(screen.getByLabelText('Що знизу (необов’язково)').getAttribute('maxlength')).toBe('40');
    fill('Що зверху (необов’язково)', ' Найбільший ');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'order', topLabel: 'Найбільший' });
    expect('bottomLabel' in question).toBe(false);
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
    fireEvent.click(screen.getByLabelText(/^Бали за швидкість/));
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

  it('a new quiz shows every debuff on and every buff off, and saves without power fields', async () => {
    const { onSave } = open();
    const debuffs = within(screen.getByRole('group', { name: t('powersDebuffs') }));
    const buffs = within(screen.getByRole('group', { name: t('powersBuffs') }));
    expect(debuffs.getAllByRole('checkbox')).toHaveLength(6);
    debuffs.getAllByRole('checkbox').forEach((box) => expect((box as HTMLInputElement).checked).toBe(true));
    expect(buffs.getAllByRole('checkbox')).toHaveLength(8);
    buffs.getAllByRole('checkbox').forEach((box) => expect((box as HTMLInputElement).checked).toBe(false));
    for (const name of ['Запитання в залі', 'Підказка ведучого', 'Заміна запитання']) {
      expect((buffs.getByLabelText(new RegExp('(?<!Довідка: )' + name)) as HTMLInputElement).disabled).toBe(false);
    }
    expect(buffs.queryAllByText(/скоро/)).toHaveLength(0);

    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Так?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).settings).toEqual({ leaderboard: 'each' });
  });

  it('all / none and single boxes write both lists', async () => {
    const { onSave } = open();
    const debuffs = () => within(screen.getByRole('group', { name: t('powersDebuffs') }));
    const buffs = () => within(screen.getByRole('group', { name: t('powersBuffs') }));
    fireEvent.click(buffs().getByRole('button', { name: t('powersAll') }));
    expect(buffs().getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked)).toHaveLength(8);
    // Заміна без запасних не збережеться (пул — у редакторі запасних), тож її знімаємо.
    fireEvent.click(buffs().getByLabelText(/(?<!Довідка: )Заміна запитання/));
    fireEvent.click(debuffs().getByRole('button', { name: t('powersNone') }));
    expect(debuffs().getAllByRole('checkbox').some((box) => (box as HTMLInputElement).checked)).toBe(false);
    fireEvent.click(buffs().getByLabelText(/(?<!Довідка: )Щит/));
    fireEvent.click(debuffs().getByLabelText(/(?<!Довідка: )Туман/));

    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Так?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).settings).toEqual({
      leaderboard: 'each',
      debuffs: ['fog'],
      buffs: ['fifty', 'double', 'retry', 'time', 'audience', 'hint'],
    });
  });

  it('an existing quiz shows its stored powers', () => {
    const initial = newQuiz();
    open({ ...initial, settings: { ...initial.settings, debuffs: ['shake'], buffs: ['time'] } });
    const checked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked && box.closest('.powers') !== null)
      .map((box) => box.closest('label')?.textContent ?? '')
      .filter((text) => text !== t('powersShop'));
    expect(checked).toHaveLength(2);
    expect(checked[0]).toMatch(/Тремтіння/);
    expect(checked[1]).toMatch(/Додатковий час/);
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
      fill('Перевірка', 'manual');
      fill('Вікно відповіді', '30');
      fill('Спроб на запитання', '2');
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

    it('the window and attempts are hidden for an automatic blitz', async () => {
      const { onSave } = open();
      fill('Назва вікторини', 'Гра');
      fill('Текст запитання', 'Перше?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      addRound('Бліц');
      fireEvent.click(screen.getAllByText('Налаштування раунду')[0]);
      expect((screen.getByLabelText('Перевірка') as HTMLSelectElement).value).toBe('auto');
      expect(screen.queryByLabelText('Вікно відповіді')).toBeNull();
      expect(screen.queryByLabelText('Спроб на запитання')).toBeNull();
      fill('Перевірка', 'manual');
      expect(screen.queryByLabelText('Вікно відповіді')).toBeTruthy();
      expect(screen.queryByLabelText('Спроб на запитання')).toBeTruthy();
      fill('Вікно відповіді', '30');
      fill('Спроб на запитання', '3');
      fill('Перевірка', 'auto');
      expect(screen.queryByLabelText('Вікно відповіді')).toBeNull();
      expect(screen.queryByLabelText('Спроб на запитання')).toBeNull();
      fill('Текст запитання', 'Друге?');
      fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
      click('Зберегти');
      await waitFor(() => expect(onSave).toHaveBeenCalled());
      const blitz = saved(onSave).rounds[1];
      expect(blitz.type === 'blitz' && [blitz.check, blitz.answerWindow, blitz.attempts]).toEqual(['auto', null, 1]);
    });

    it('blitz settings hide the speed bonus and partial credit', () => {
      open();
      expect(screen.queryByLabelText(t('speedBonus'))).toBeTruthy();
      addRound('Бліц');
      expect(screen.queryByLabelText(t('speedBonus'))).toBeNull();
      expect(screen.queryByLabelText(t('rulePartial'))).toBeNull();
      expect(screen.queryByLabelText('Перевірка')).toBeTruthy();
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
      expect(rulesOf(round)).toEqual({
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
      expect(rulesOf(saved(onSave).rounds[0])).toEqual({ penalty: 'none', partial: null, streak: null, multiplier: 1 });
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
  const removeButton = () => screen.getByRole('button', { name: 'Прибрати запитання' }) as HTMLButtonElement;
  const column = (n: number) => screen.getAllByRole('button', { name: new RegExp(`^Категорія ${n}, клітинка \\d+:`) });
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
    expect(removeButton().disabled).toBe(true);
    for (let i = 0; i < 5; i += 1) click('+ Категорія');
    expect(screen.queryByRole('button', { name: '+ Категорія' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Прибрати категорію' })).toHaveLength(8);
    for (let i = 0; i < 7; i += 1) fireEvent.click(screen.getAllByRole('button', { name: '+ Запитання' })[0]);
    expect(screen.getAllByRole('button', { name: '+ Запитання' })).toHaveLength(7);
    expect(removeButton().disabled).toBe(false);
  });

  it('deletes a cell right from the grid and explains the minimum', () => {
    open();
    addBoard();
    // Одна кнопка на все поле, у стовпці вибраної клітинки, і вона вимкнена на мінімумі.
    expect(screen.getAllByRole('button', { name: 'Прибрати запитання' })).toHaveLength(1);
    expect(removeButton().disabled).toBe(true);
    const hint = screen.getByText('Щонайменше 3 запитання в категорії');
    expect(removeButton().getAttribute('aria-describedby')).toBe(hint.id);
    expect(removeButton().closest('.board-column')).toBe(cell(1, 1).closest('.board-column'));

    fireEvent.click(screen.getAllByRole('button', { name: '+ Запитання' })[1]);
    expect(removeButton().closest('.board-column')).toBe(cell(2, 4).closest('.board-column'));
    expect(removeButton().disabled).toBe(false);
    expect(screen.queryByText('Щонайменше 3 запитання в категорії')).toBeNull();

    // Запитання з текстом прибирається лише після підтвердження.
    fill('Текст запитання', 'Питання?');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    click('Прибрати запитання');
    expect(column(2)).toHaveLength(4);
    click('Прибрати запитання');
    expect(confirm).toHaveBeenCalledWith('Прибрати запитання разом із його текстом?');
    expect(column(2)).toHaveLength(3);
    expect(cell(2, 3).getAttribute('aria-current')).toBe('true');
    expect(removeButton().disabled).toBe(true);
    // У панелі клітинки кнопки видалення більше немає.
    expect(screen.getByRole('region', { name: /^Клітинка/ }).querySelector('.btn-danger')).toBeNull();
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

describe('QuizEditor: YouTube video', () => {
  const LINK = 'Відео з YouTube';
  const withVideoQuestion = (extra: Record<string, unknown>) => {
    const quiz = newQuiz();
    const [round] = quiz.rounds;
    if (round.type === 'board') throw new Error('unexpected');
    return { ...quiz, title: 'Гра', rounds: [{ ...round, questions: [{ ...round.questions[0], text: 'Так?', ...extra }] }] } as Quiz;
  };

  it('a pasted YouTube link becomes a video with a preview and hides the time field', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що за пісня?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    fill(LINK, 'https://youtu.be/dQw4w9WgXcQ?t=1m30s');
    const frame = document.querySelector('iframe');
    expect(frame?.getAttribute('src')).toContain('embed/dQw4w9WgXcQ');
    expect(frame?.getAttribute('src')).toContain('start=90');
    expect(screen.queryByLabelText('Час, с')).toBeNull();
    expect(screen.getByText(/Без таймера/)).toBeTruthy();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ video: { id: 'dQw4w9WgXcQ', start: 90 }, timeLimit: 30 });
  });

  it('a wrong link is a field error and leaves the question without a video', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Що за пісня?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    fill(LINK, 'https://example.com/watch?v=dQw4w9WgXcQ');
    expect(screen.getByRole('alert').textContent).toBe('Це не посилання на відео YouTube');
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByLabelText('Час, с')).toBeTruthy();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0].video).toBeNull();
  });

  it('removing the video brings the time field back with the old time', () => {
    open(withVideoQuestion({ type: 'boolean', correct: true, timeLimit: 45, video: { id: 'dQw4w9WgXcQ', start: 0 } }));
    expect(screen.queryByLabelText('Час, с')).toBeNull();
    click('Прибрати відео');
    expect((screen.getByLabelText('Час, с') as HTMLInputElement).value).toBe('45');
    expect((screen.getByLabelText(LINK) as HTMLInputElement).value).toBe('');
  });

  it('a question keeps its image when a video is added', async () => {
    const { onSave } = open(withVideoQuestion({ type: 'boolean', correct: true, imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png' }));
    fill(LINK, 'https://youtu.be/dQw4w9WgXcQ');
    expect(screen.getByAltText('Зображення до запитання')).toBeTruthy();
    expect(document.querySelector('iframe')).not.toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ imageUrl: '/uploads/0123456789abcdef0123456789abcdef.png', video: { id: 'dQw4w9WgXcQ', start: 0 } });
  });

  it('keeps the time field visible while the time is out of range, so a video cannot hide an unsaveable value', async () => {
    const { onSave } = open(withVideoQuestion({ type: 'boolean', correct: true, timeLimit: 2 }));
    fill(LINK, 'https://youtu.be/dQw4w9WgXcQ');
    expect(document.querySelector('iframe')).not.toBeNull();
    const time = screen.getByLabelText('Час, с') as HTMLInputElement;
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(time, { target: { value: '30' } });
    await waitFor(() => expect(screen.queryByLabelText('Час, с')).toBeNull());
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ video: { id: 'dQw4w9WgXcQ', start: 0 }, timeLimit: 30 });
  });
});

describe('QuizEditor: final round', () => {
  const addFinal = () => {
    open();
    addRound('Фінал');
  };

  it('adds a final round with a theme and a question and saves it', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    addRound('Фінал');
    fireEvent.click(screen.getAllByText('Налаштування раунду')[0]);
    fill(t('finalTheme'), 'Космос');
    fill('Текст запитання', 'Яка планета перша від Сонця?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    expect(screen.queryByLabelText(t('pointsLabel'))).toBeNull();
    expect(screen.queryByRole('button', { name: t('addQuestion') })).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(quiz.rounds[1]).toMatchObject({ type: 'final', title: 'Космос', check: 'auto' });
    expect(roundQuestions(quiz.rounds[1])).toHaveLength(1);
  });

  it('the final round chooses the wager type, classic by default', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    expect(screen.queryByLabelText(t('finalWagerMode'))).toBeNull();
    addRound('Фінал');
    fireEvent.click(screen.getAllByText('Налаштування раунду')[0]);
    const select = screen.getByLabelText(t('finalWagerMode')) as HTMLSelectElement;
    expect(select.closest('label')?.className).toContain('field');
    expect(select.value).toBe('classic');
    expect(screen.getByText(t('wagerModeClassicHint'))).toBeTruthy();
    fireEvent.change(select, { target: { value: 'bank' } });
    expect(screen.getByText(t('wagerModeBankHint'))).toBeTruthy();
    expect(screen.queryByText(t('wagerModeClassicHint'))).toBeNull();
    fill('Текст запитання', 'Яка планета перша?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(saved(onSave).rounds[1]).toMatchObject({ type: 'final', wagerMode: 'bank' });
  });

  it('final settings show only the theme, shuffle and check', () => {
    addFinal();
    expect(screen.getByLabelText(t('finalTheme'))).toBeTruthy();
    expect(screen.getByLabelText(t('shuffleOptions'))).toBeTruthy();
    expect(screen.getByLabelText(t('finalCheck'))).toBeTruthy();
    for (const key of ['speedBonus', 'ruleMinus', 'ruleStreak', 'ruleMultiplier'] as const) {
      expect(screen.queryByLabelText(t(key)), key).toBeNull();
    }
    expect(screen.queryByText(t('sameTimeTitle'))).toBeNull();
  });

  it('a final question with a video hides the time field', () => {
    addFinal();
    expect(screen.getByLabelText('Час, с')).toBeTruthy();
    fill('Відео з YouTube', 'https://youtu.be/dQw4w9WgXcQ');
    expect(screen.queryByLabelText('Час, с')).toBeNull();
  });
});

describe('QuizEditor: quiz on top and round notes', () => {
  it('puts the quiz title and the game rules above the rounds', () => {
    open();
    const title = screen.getByLabelText('Назва вікторини');
    const rules = screen.getByText('Правила гри');
    const addRoundButton = screen.getByRole('button', { name: '+ Раунд' });
    const roundSettings = screen.getByText('Налаштування раунду');
    const before = (a: Element, b: Element) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    expect(before(title, rules)).toBe(true);
    expect(before(rules, addRoundButton)).toBe(true);
    expect(before(rules, roundSettings)).toBe(true);
  });

  it('saves an author note of the round and previews the rules summary', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    expect(screen.getByText('Так гравці побачать раунд на заставці')).toBeTruthy();
    expect(screen.getByText('Відповідають усі: бали отримує кожен, хто відповів правильно.')).toBeTruthy();
    expect(screen.getByLabelText('Опис раунду для гравців').getAttribute('maxlength')).toBe('600');
    fill('Опис раунду для гравців', 'Кіно 90-х');
    expect(screen.getAllByText('Кіно 90-х').length).toBeGreaterThan(1);

    addRound('Бліц');
    expect(screen.getByText('Бали отримує лише той, хто першим правильно відповість.')).toBeTruthy();
    fill('Текст запитання', 'Друге?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(saved(onSave).rounds[0].description).toBe('Кіно 90-х');
  });

  it('round description counter', () => {
    open();
    const field = () => screen.getByLabelText('Опис раунду для гравців');
    const count = (text: string) => screen.getByText(text);
    expect(field().getAttribute('rows')).toBe('4');
    expect(count('0 / 600').classList.contains('is-near')).toBe(false);
    fill('Опис раунду для гравців', 'Кіно 90-х');
    expect(count('9 / 600')).toBeTruthy();
    fill('Опис раунду для гравців', 'а'.repeat(500));
    expect(count('500 / 600').classList.contains('is-near')).toBe(false);
    fill('Опис раунду для гравців', 'а'.repeat(501));
    expect(count('501 / 600').classList.contains('is-near')).toBe(true);
    expect(document.getElementById(field().getAttribute('aria-describedby') ?? '')?.textContent).toBe('501 / 600');
    expect(field().getAttribute('aria-live')).toBeNull();
  });
});

describe('QuizEditor: chain questions', () => {
  it('creates a chain question and saves its words and hint seconds', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Слова');
    click('ланцюжок');
    fill('Текст запитання', 'Від форелі до корабля');
    fill('Слово 1', 'Форель');
    fill('Слово 2', 'Риба');
    fill('Слово 3', 'Океан');
    click('Додати слово');
    fill('Слово 4', 'Корабель');
    fill('Підказка додає, с', '7');
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'chain', words: ['Форель', 'Риба', 'Океан', 'Корабель'], hintSeconds: 7, video: null });
  });

  it('a blitz round shows no chain chip', () => {
    open();
    addRound('Бліц');
    expect(screen.queryByRole('button', { name: 'ланцюжок' })).toBeNull();
  });
});

describe('QuizEditor: sort questions', () => {
  it('the author builds a sort question', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Сортування');
    click('сортування');
    fill('Текст запитання', 'Розкладіть');
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    expect(screen.queryByLabelText(t('pointsLabel'))).toBeNull();
    fill('Категорія 1', 'Овочі');
    fill('Категорія 2', 'Фрукти');
    click('Додати категорію');
    fill('Категорія 3', 'Ягоди');
    const add = screen.getByRole('button', { name: 'Додати категорію' }) as HTMLButtonElement;
    click('Додати категорію');
    expect(add.disabled).toBe(true);
    click('Прибрати категорію 4');
    ['Морква', 'Яблуко', 'Буряк', 'Груша'].forEach((word, i) => fill(`Слово ${i + 1}`, word));
    const pickers = [1, 2, 3, 4].map((n) => screen.getByLabelText(`Категорія слова ${n}`) as HTMLSelectElement);
    expect(pickers[0].closest('label.field')).not.toBeNull();
    expect(Array.from(pickers[0].options).map((o) => o.text)).toEqual(['Овочі', 'Фрукти', 'Ягоди']);
    fireEvent.change(pickers[2], { target: { value: Array.from(pickers[2].options)[2].value } });
    expect(screen.getByText('Разом до 400 балів (не більше 2000)')).toBeTruthy();
    expect(screen.getByText(t('sortHint'))).toBeTruthy();
    fill('Бали за слово', '100');
    fill('Підвисання після помилки, с', '4');
    // Прибрати третю категорію: слово з неї переходить до першої.
    click('Прибрати категорію 3');
    expect((screen.getByLabelText('Категорія слова 3') as HTMLSelectElement).selectedIndex).toBe(0);
    click('Зберегти');

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    const [question] = roundQuestions(quiz.rounds[0]);
    expect(question).toMatchObject({ type: 'sort', points: 100, lockSeconds: 4, video: null });
    if (question.type !== 'sort') throw new Error('unexpected');
    expect(question.categories.map((c) => c.text)).toEqual(['Овочі', 'Фрукти']);
    expect(question.words[2].categoryId).toBe(question.categories[0].id);
  });

  it('a sort in a final has no per-word price and no total', () => {
    open();
    addRound('Фінал');
    click('сортування');
    expect(screen.getByLabelText('Підвисання після помилки, с')).toBeTruthy();
    expect(screen.queryByLabelText('Бали за слово')).toBeNull();
    expect(screen.queryByText(/Разом до/)).toBeNull();
  });

  it('a blank per-word price shows no total', () => {
    open();
    click('сортування');
    expect(screen.getByText('Разом до 400 балів (не більше 2000)')).toBeTruthy();
    fill('Бали за слово', '');
    expect(screen.queryByText(/Разом до/)).toBeNull();
  });

  it('a sort cell on the board is always a normal phone cell', () => {
    open();
    click('+ Раунд');
    click('Ігрове поле');
    fireEvent.change(screen.getByLabelText('Як відповідати'), { target: { value: 'voice' } });
    expect(screen.getByLabelText('Тип клітинки')).toBeTruthy();
    click('сортування');
    expect(screen.queryByLabelText('Тип клітинки')).toBeNull();
    expect(screen.queryByLabelText('Як відповідати')).toBeNull();
    expect(screen.getByText(t('sortCellNote'))).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Категорія 1, клітинка 1: 400/ })).toBeTruthy();
  });

  it('every sort input has a field wrapper', () => {
    open();
    click('сортування');
    const controls = [
      ...screen.getAllByLabelText(/^Категорія слова \d$/),
      screen.getByLabelText('Бали за слово'),
      screen.getByLabelText('Підвисання після помилки, с'),
    ];
    expect(controls.length).toBe(6);
    for (const control of controls) expect(control.closest('label.field')).not.toBeNull();
  });
});

describe('QuizEditor duels', () => {
  const filledQuiz = (): Quiz => {
    const quiz = newQuiz();
    return {
      ...quiz,
      title: 'Гра',
      // Два раунди: до останнього є запитання, тож дуель досяжна.
      rounds: [
        { ...newClassicRound(), questions: [{ ...newQuestion('boolean'), text: 'Так?' }] },
        { ...newClassicRound(), questions: [{ ...newQuestion('boolean'), text: 'Ні?' }] },
      ],
    };
  };
  const duelsToggle = () => screen.getByLabelText('Дуелі між гравцями');
  const fillPool = () => {
    const section = within(screen.getByText('Дуелі', { selector: 'summary' }).closest('details')!);
    const set = (label: string, value: string) => fireEvent.change(section.getByLabelText(label), { target: { value } });
    set('Назва категорії', 'Столиці');
    for (let i = 1; i <= 3; i += 1) set(`Запитання ${i}`, `Столиця ${i}?`);
    for (const input of section.getAllByLabelText('Написання 1')) fireEvent.change(input, { target: { value: 'Київ' } });
  };

  it('the author turns on duels and fills the pool', async () => {
    const { onSave } = open(filledQuiz());
    const details = screen.getByText('Дуелі', { selector: 'summary' }).closest('details')!;
    expect(details.open).toBe(false);
    fireEvent.click(duelsToggle());
    expect((screen.getByLabelText('Запитань за дуель') as HTMLInputElement).value).toBe('3');
    expect((screen.getByLabelText('Час на запитання дуелі, с') as HTMLInputElement).value).toBe('30');
    expect((screen.getByLabelText('Ставка: програвший віддає переможцю') as HTMLInputElement).value).toBe('300');
    expect(screen.getByText(t('duelsHint'))).toBeTruthy();
    expect(screen.getByText(t('duelsStakeHint'))).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Категорія 1 · 3 запитання' })).toBeTruthy();
    fillPool();
    click('Додати категорію');
    expect(screen.getByRole('button', { name: 'Категорія 2 · 3 запитання' }).className).toContain('is-on');
    click('Прибрати категорію «Категорія 2»');
    expect(screen.queryByRole('button', { name: /Категорія 2 ·/ })).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    expect(quiz.duels?.categories).toHaveLength(1);
    expect(quiz.duels?.categories[0]).toMatchObject({ title: 'Столиці' });
  });

  it('too few questions in a duel category stops saving with a clear message', async () => {
    const { onSave } = open(filledQuiz());
    fireEvent.click(duelsToggle());
    fillPool();
    fill('Запитань за дуель', '4');
    click('Зберегти');
    await waitFor(() => expect(document.querySelector('.problems')).not.toBeNull());
    expect(document.querySelector('.problems')!.textContent).toContain('Дуелі, «Столиці»: замало запитань — потрібно щонайменше 4.');
    expect((screen.getByText('Дуелі', { selector: 'summary' }).closest('details') as HTMLDetailsElement).open).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('duels in a single round can never start: saving stops with the reason', async () => {
    const quiz = filledQuiz();
    const { onSave } = open({ ...quiz, rounds: quiz.rounds.slice(0, 1) });
    fireEvent.click(duelsToggle());
    fillPool();
    click('Зберегти');
    await waitFor(() => expect(document.querySelector('.problems')).not.toBeNull());
    expect(document.querySelector('.problems')!.textContent).toContain(t('problemDuelUnreachable', { needed: 1 }));
    expect((screen.getByText('Дуелі', { selector: 'summary' }).closest('details') as HTMLDetailsElement).open).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it('turning duels off asks before dropping a filled pool', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { onSave } = open(filledQuiz());
    fireEvent.click(duelsToggle());
    // порожній пул — без запитання
    fireEvent.click(duelsToggle());
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Запитань за дуель')).toBeNull();
    fireEvent.click(duelsToggle());
    fillPool();
    fireEvent.click(duelsToggle());
    expect(confirm).toHaveBeenCalledWith(t('duelsOffConfirm'));
    expect(screen.getByLabelText('Запитань за дуель')).toBeTruthy();
    confirm.mockReturnValue(true);
    fireEvent.click(duelsToggle());
    expect(screen.queryByLabelText('Запитань за дуель')).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect('duels' in saved(onSave)).toBe(false);
  });

  it('every duel input sits in a field wrapper', () => {
    open(filledQuiz());
    const toggle = duelsToggle();
    expect(toggle.closest('label.check')).not.toBeNull();
    fireEvent.click(toggle);
    const section = screen.getByText('Дуелі', { selector: 'summary' }).closest('details')!;
    const fields = [...section.querySelectorAll('input, textarea')].filter((el) => el !== toggle && !el.closest('.answer-row'));
    expect(fields.length).toBeGreaterThan(5);
    for (const el of fields) expect(el.closest('label.field')).not.toBeNull();
  });
});

describe('QuizEditor hints and spares', () => {
  const base = (): Quiz => {
    const quiz = newQuiz();
    return { ...quiz, title: 'Гра', rounds: [{ ...newClassicRound(), questions: [{ ...newQuestion('boolean'), text: 'Так?' }] }] };
  };
  const buffs = () => within(screen.getByRole('group', { name: t('powersBuffs') }));
  const sparesSection = () => within(screen.getByText(t('sparesTitle'), { selector: 'summary' }).closest('details')!);

  it('all eight buffs can be chosen; «Усі» turns on all eight', async () => {
    const { onSave } = open(base());
    buffs().getAllByRole('checkbox').forEach((box) => expect((box as HTMLInputElement).disabled).toBe(false));
    expect(buffs().queryAllByText(/скоро/)).toHaveLength(0);
    fireEvent.click(buffs().getByRole('button', { name: t('powersAll') }));
    expect(buffs().getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked)).toHaveLength(8);
    expect(screen.getByText(t('powersSwapNeedsSpares'))).toBeTruthy();
    click('Зберегти');
    await waitFor(() => expect(document.querySelector('.problems')).not.toBeNull());
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.problems')!.textContent).toContain(t('problemSparesEmpty'));
    expect((screen.getByText(t('sparesTitle'), { selector: 'summary' }).closest('details') as HTMLDetailsElement).open).toBe(true);
  });

  it('the spare pool: add, edit, remove; saving sends the pool', async () => {
    const quiz = base();
    const { onSave } = open({ ...quiz, settings: { ...quiz.settings, buffs: ['swap'] } });
    fireEvent.click(screen.getByText(t('sparesTitle'), { selector: 'summary' }));
    const section = sparesSection();
    fireEvent.click(section.getByRole('button', { name: t('addSpare') }));
    expect(section.getByRole('button', { name: /^Запасне 1 · / })).toBeTruthy();
    const names = within(section.getByRole('group', { name: t('questionType') }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toHaveLength(6);
    for (const gone of ['порядок', 'пари', 'ланцюжок', 'сортування']) expect(names.some((n) => n?.toLowerCase().includes(gone))).toBe(false);
    expect(section.queryByLabelText(t('timeLimit'))).toBeNull();
    expect(section.queryByLabelText(t('pointsLabel'))).toBeNull();
    expect(section.queryByLabelText(t('hintLabel'))).toBeNull();
    expect(section.queryByLabelText(t('videoLabel'))).toBeNull();
    expect(screen.queryByText(t('powersSwapNeedsSpares'))).toBeNull();

    fireEvent.change(section.getByLabelText('Текст запитання'), { target: { value: 'Запасне?' } });
    fireEvent.change(section.getByLabelText('Варіант 1'), { target: { value: 'А' } });
    fireEvent.change(section.getByLabelText('Варіант 2'), { target: { value: 'Б' } });
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const sent = saved(onSave);
    expect(quizSchema.safeParse(sent).success).toBe(true);
    expect(sent.spares).toHaveLength(1);
    expect(sent.spares?.[0]).toMatchObject({ type: 'single', text: 'Запасне?' });
    expect('hint' in sent.spares![0]).toBe(false);

    fireEvent.click(buffs().getByLabelText(/(?<!Довідка: )Заміна запитання/));
    fireEvent.click(sparesSection().getByRole('button', { name: t('removeSpare') }));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect('spares' in onSave.mock.calls[1][0]).toBe(false);
  });

  it('saving is blocked when swap is on and the pool is empty', () => {
    const quiz = base();
    const { onSave } = open({ ...quiz, settings: { ...quiz.settings, buffs: ['swap'] } });
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain(t('problemSparesEmpty'));
  });

  it('a question hint is optional; an empty one is not saved', async () => {
    const { onSave } = open(base());
    const field = () => screen.getByLabelText(t('hintLabel')) as HTMLTextAreaElement;
    expect(field().getAttribute('maxlength')).toBe('200');
    fireEvent.change(field(), { target: { value: 'Тече через Київ' } });
    fireEvent.click(screen.getByRole('button', { name: 'один варіант' }));
    expect(field().value).toBe('Тече через Київ');
    fireEvent.change(screen.getByLabelText('Варіант 1'), { target: { value: 'А' } });
    fireEvent.change(screen.getByLabelText('Варіант 2'), { target: { value: 'Б' } });
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0].hint).toBe('Тече через Київ');

    fireEvent.change(field(), { target: { value: '' } });
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    expect('hint' in roundQuestions(onSave.mock.calls[1][0].rounds[0])[0]).toBe(false);
  });
});

describe('QuizEditor: explanations for newcomers', () => {
  it('the flag is off by default and is written only when on', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    const box = screen.getByLabelText('Пояснення для новачків') as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    fireEvent.click(box);
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect('newcomers' in saved(onSave).settings).toBe(false);
  });

  it('turning it on saves newcomers: true and a saved quiz opens with it checked', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
    fireEvent.click(screen.getByLabelText('Пояснення для новачків'));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quiz.settings.newcomers).toBe(true);
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    cleanup();
    open(quiz);
    expect((screen.getByLabelText('Пояснення для новачків') as HTMLInputElement).checked).toBe(true);
  });
  it('ⓘ next to the settings, spares, duels and the reference link — reading help does not change the quiz', () => {
    open();
    const link = screen.getByRole('link', { name: 'Довідка ведучого' });
    expect(link.getAttribute('href')).toBe('/help');
    expect(link.getAttribute('target')).toBe('_blank');
    for (const name of ['Показувати рейтинг', 'Пояснення для новачків', 'Запасні запитання', 'Дуелі', 'Крамниця дебафів', 'Щит', 'Туман']) {
      fireEvent.click(screen.getByRole('button', { name: `Довідка: ${name}` }));
      screen.getByRole('dialog', { name });
    }
    expect(screen.queryByText('Зберегти зміни?')).toBeNull();
    expect((screen.getByLabelText('Пояснення для новачків') as HTMLInputElement).checked).toBe(false);
  });

  it('round types: ⓘ for each kind in «+ Раунд» and for the current round in its settings', () => {
    open();
    click('+ Раунд');
    for (const name of ['Класичний', 'Бліц', 'Ігрове поле', 'Фінал']) screen.getAllByRole('button', { name: `Довідка: ${name}` });
    const settings = document.querySelector('details.round-settings') as HTMLElement;
    within(settings).getByRole('button', { name: 'Довідка: Класичний' });
    for (const name of ['Бали за швидкість', 'Штраф «мінус»', 'Кнопка «частково»', 'Серії', 'Множник балів']) {
      within(settings).getByRole('button', { name: `Довідка: ${name}` });
    }
  });

  it('the question ⓘ follows the chosen type', () => {
    open();
    screen.getByRole('button', { name: 'Довідка: Один правильний варіант' });
    click('число');
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Число' }));
    screen.getByRole('dialog', { name: 'Число' });
  });
});

describe('QuizEditor: slider, audio, revealing picture (10b)', () => {
  const IMAGE = '/uploads/0123456789abcdef0123456789abcdef.png';
  const withQuestion = (extra: Record<string, unknown>) => {
    const quiz = newQuiz();
    const [round] = quiz.rounds;
    if (round.type === 'board') throw new Error('unexpected');
    return { ...quiz, title: 'Гра', rounds: [{ ...round, questions: [{ ...round.questions[0], text: 'Так?', type: 'boolean', correct: true, ...extra }] }] } as Quiz;
  };

  it('the slider chip shows its fields and saves them with the unit and the zero line', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'У якому році?');
    fireEvent.click(screen.getByRole('button', { name: 'повзунок' }));
    fill('Мінімум', '1900');
    fill('Максимум', '2025');
    fill('Крок', '1');
    fill('Одиниця', 'рік');
    fill('Правильне значення', '1991');
    fill('Допуск ±', '0');
    fill('Нуль балів далі ніж ±', '10');
    expect(screen.getByRole('slider', { name: 'Повзунок' })).toBeTruthy();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'slider', min: 1900, max: 2025, step: 1, correct: 1991, tolerance: 0, zeroBeyond: 10, unit: 'рік' });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('an empty zero line and an empty unit are not saved', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Скільки?');
    fireEvent.click(screen.getByRole('button', { name: 'повзунок' }));
    fill('Нуль балів далі ніж ±', '10');
    fill('Нуль балів далі ніж ±', '');
    fill('Одиниця', 'км');
    fill('Одиниця', '');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect('zeroBeyond' in question).toBe(false);
    expect('unit' in question).toBe(false);
  });

  it('a classic round with a picture offers the pixel mode', async () => {
    const { onSave } = open(withQuestion({ imageUrl: IMAGE, type: 'numeric', correct: 5, tolerance: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'З пікселів' }));
    expect(screen.getByRole('button', { name: 'З пікселів' }).getAttribute('aria-pressed')).toBe('true');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ reveal: 'pixels' });
  });

  it('the picture mode is for single, text and numeric only, and goes with the picture', async () => {
    const { onSave } = open(withQuestion({ imageUrl: IMAGE, reveal: 'blur' }));
    expect(screen.queryByRole('group', { name: 'Картинка, що проявляється' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'число' }));
    expect(screen.getByRole('button', { name: 'З розмиття' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Звичайна' }));
    expect(screen.getByRole('button', { name: 'Звичайна' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'З пікселів' }));
    click('Прибрати зображення');
    expect(screen.queryByRole('group', { name: 'Картинка, що проявляється' })).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect('reveal' in roundQuestions(saved(onSave).rounds[0])[0]).toBe(false);
  });

  it('ⓘ next to the audio and the picture mode open help; the quiz does not become changed', () => {
    open(withQuestion({ imageUrl: IMAGE }));
    fireEvent.click(screen.getByRole('button', { name: 'число' }));
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Аудіо до запитання' }));
    screen.getByRole('dialog', { name: 'Аудіо до запитання' });
    fireEvent.click(screen.getByRole('button', { name: 'Довідка: Картинка, що проявляється' }));
    screen.getByRole('dialog', { name: 'Картинка, що проявляється' });
    expect(screen.queryByText('Зберегти зміни?')).toBeNull();
    expect(screen.getByRole('group', { name: 'Картинка, що проявляється' })).toBeTruthy();
  });

  it('a final round has no picture mode', () => {
    open(withQuestion({ imageUrl: IMAGE }));
    addRound('Фінал');
    expect(screen.queryByRole('group', { name: 'Картинка, що проявляється' })).toBeNull();
  });

  it('«Лише звук» moves the video link into YouTube audio', async () => {
    const { onSave } = open(withQuestion({ video: { id: 'dQw4w9WgXcQ', start: 0 } }));
    expect(screen.queryByRole('button', { name: 'Додати аудіо' })).toBeNull();
    fireEvent.click(screen.getByLabelText('Лише звук (картинку сховано)'));
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    expect(screen.getByText(/YouTube — лише звук/)).toBeTruthy();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question.video).toBeNull();
    expect(question.audio).toEqual({ source: 'youtube', id: 'dQw4w9WgXcQ', start: 0, duration: 15 });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('spare questions have no audio and no picture mode', () => {
    open();
    fireEvent.click(screen.getByText(t('sparesTitle'), { selector: 'summary' }));
    const section = within(screen.getByText(t('sparesTitle'), { selector: 'summary' }).closest('details')!);
    fireEvent.click(section.getByRole('button', { name: t('addSpare') }));
    expect(section.queryByRole('button', { name: 'Додати аудіо' })).toBeNull();
    expect(section.queryByRole('group', { name: 'Картинка, що проявляється' })).toBeNull();
  });
});

describe('QuizEditor: reveal, video and audio together (10b)', () => {
  const IMAGE = '/uploads/0123456789abcdef0123456789abcdef.png';
  const startWith = (extra: Record<string, unknown>) => {
    const quiz = newQuiz();
    const [round] = quiz.rounds;
    if (round.type === 'board') throw new Error('unexpected');
    return { ...quiz, title: 'Гра', rounds: [{ ...round, questions: [{ ...round.questions[0], text: 'Число?', type: 'numeric', correct: 1, tolerance: 0, ...extra }] }] } as Quiz;
  };

  it('adding a video link drops the reveal mode, and the quiz still saves', async () => {
    const { onSave } = open(startWith({ imageUrl: IMAGE, reveal: 'pixels' }));
    fill('Відео з YouTube', 'https://youtu.be/dQw4w9WgXcQ');
    expect(screen.queryByRole('group', { name: 'Картинка, що проявляється' })).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question.video).not.toBeNull();
    expect('reveal' in question).toBe(false);
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('an audio upload refused by the server shows its message and changes nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'audio_too_large' }), { status: 413 })));
    const probe = { preload: '', duration: 10, onloadedmetadata: null as null | (() => void), onerror: null, removeAttribute() {}, set src(_v: string) { queueMicrotask(() => this.onloadedmetadata?.()); } };
    vi.stubGlobal('Audio', function () { return probe; });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    open(startWith({}));
    fireEvent.change(screen.getByLabelText('Додати аудіо'), { target: { files: [new File([new Uint8Array(4)], 'a.mp3', { type: 'audio/mpeg' })] } });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Аудіо завелике: дозволено до 5 МБ.'));
    expect(screen.getByLabelText('Додати аудіо')).toBeTruthy();
  });

  it('junk in the zero line is flagged and blocks saving', () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Скільки?');
    fireEvent.click(screen.getByRole('button', { name: 'повзунок' }));
    fill('Нуль балів далі ніж ±', 'abc');
    expect(screen.getByText('Впишіть число або залиште поле порожнім.')).toBeTruthy();
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('QuizEditor: «Who am I?» and pins (10c)', () => {
  it('the clues chip shows three clues, the interval and the time hint; adding clues raises the time to fit', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Хто я?');
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    for (const n of [1, 2, 3]) fill(`Підказка ${n}`, `Ключ ${n}`);
    screen.getByLabelText('Нова підказка кожні, с');
    screen.getByText('Остання підказка відкриється на 16-й секунді з 30.');
    fill('Написання 1', 'Шевченко');
    for (let i = 0; i < 3; i += 1) click('Додати підказку');
    expect((screen.getByLabelText('Час, с') as HTMLInputElement).value).toBe('45');
    screen.getByText('Остання підказка відкриється на 40-й секунді з 45.');
    for (const n of [4, 5, 6]) fill(`Підказка ${n}`, `Ключ ${n}`);
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({
      type: 'clues',
      clues: ['Ключ 1', 'Ключ 2', 'Ключ 3', 'Ключ 4', 'Ключ 5', 'Ключ 6'],
      accepted: ['Шевченко'],
      interval: 8,
      timeLimit: 45,
    });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('a longer interval raises the time; a clue can move up and down', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    fill('Підказка 1', 'А');
    fill('Підказка 2', 'Б');
    fireEvent.click(screen.getByRole('button', { name: 'Перемістити елемент 2 вище' }));
    expect((screen.getByLabelText('Підказка 1') as HTMLInputElement).value).toBe('Б');
    fill('Нова підказка кожні, с', '20');
    expect((screen.getByLabelText('Час, с') as HTMLInputElement).value).toBe('45');
  });

  it('«кожен сам» hides the interval and the time hint, raises the time to 20 s and saves cluePace self; «за таймером» brings them back without the key (12c)', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Хто я?');
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    for (const n of [1, 2, 3]) fill(`Підказка ${n}`, `Ключ ${n}`);
    fill('Написання 1', 'Шевченко');
    const group = screen.getByRole('group', { name: 'Підказки відкриваються' });
    const timer = within(group).getByRole('radio', { name: 'за таймером' }) as HTMLInputElement;
    const self = within(group).getByRole('radio', { name: 'кожен сам' }) as HTMLInputElement;
    expect([timer.checked, self.checked]).toEqual([true, false]);
    screen.getByLabelText('Нова підказка кожні, с');
    fill('Час, с', '10');
    fireEvent.click(self);
    expect(screen.queryByLabelText('Нова підказка кожні, с')).toBeNull();
    expect(screen.queryByText(/^Остання підказка відкриється/)).toBeNull();
    screen.getByText(t('cluesSelfHint', { min: 20 }));
    expect(screen.getByText(/^Кожен гравець сам відкриває наступну підказку/)).toBeTruthy();
    expect((screen.getByLabelText('Час, с') as HTMLInputElement).value).toBe('20');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'clues', cluePace: 'self', timeLimit: 20 });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);

    fireEvent.click(within(screen.getByRole('group', { name: 'Підказки відкриваються' })).getByRole('radio', { name: 'за таймером' }));
    screen.getByLabelText('Нова підказка кожні, с');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    const [back] = roundQuestions(onSave.mock.calls[1][0].rounds[0]);
    expect('cluePace' in back).toBe(false);
    expect(back).toMatchObject({ type: 'clues', interval: 8, timeLimit: 21 });
    expect(quizSchema.safeParse(onSave.mock.calls[1][0]).success).toBe(true);
  });

  it('clues take no video but take audio', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'хто я?' }));
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    screen.getByText('Аудіо до запитання');
  });

  it('the pin chip has the four bases, no general picture and no video; it saves a pin', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Де?');
    fireEvent.click(screen.getByRole('button', { name: 'точка' }));
    expect(screen.queryByRole('button', { name: 'Додати зображення' })).toBeNull();
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    for (const name of ['Світ', 'Європа', 'Україна', 'Своя картинка']) screen.getByRole('button', { name });
    fireEvent.click(screen.getByRole('button', { name: 'Україна' }));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'pin', map: 'ukraine', imageUrl: null });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('a blitz round offers neither clues nor pin', () => {
    open();
    addRound('Бліц');
    expect(screen.queryByRole('button', { name: 'хто я?' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'точка' })).toBeNull();
  });
});

describe('QuizEditor: wall, poll and word cloud (10d)', () => {
  it('the wall chip shows four group cards and the mistake limit, no video; it saves a wall', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Знайдіть зв’язки');
    click('стіна');
    expect(screen.getAllByRole('group', { name: /^Група \d$/ })).toHaveLength(4);
    screen.getByLabelText('Помилок до замикання');
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemWallEmpty', { index: 1 })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
    for (let g = 1; g <= 4; g += 1) {
      fill(`Назва групи ${g}`, `Зв’язок ${g}`);
      const card = screen.getByRole('group', { name: `Група ${g}` });
      for (let k = 1; k <= 4; k += 1) fireEvent.change(within(card).getByLabelText(`Плитка ${k}`), { target: { value: `Т${g}${k}` } });
    }
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'wall', mistakes: 3, timeLimit: 90, video: null, points: 1000 });
    if (question.type !== 'wall') throw new Error('unexpected');
    expect(question.groups).toHaveLength(4);
    expect(question.groups.every((group) => group.tiles.length === 4)).toBe(true);
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('a repeated tile blocks saving with a named message', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Знайдіть зв’язки');
    click('стіна');
    for (let g = 1; g <= 4; g += 1) {
      fill(`Назва групи ${g}`, `З${g}`);
      const card = screen.getByRole('group', { name: `Група ${g}` });
      for (let k = 1; k <= 4; k += 1) fireEvent.change(within(card).getByLabelText(`Плитка ${k}`), { target: { value: g === 2 && k === 1 ? ' т11 ' : `Т${g}${k}` } });
    }
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemWallDuplicate', { index: 1, tile: 'т11' })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the poll chip has no price, says so, and saves points 0', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Яка пора найкраща?');
    click('опитування');
    expect(screen.queryByLabelText('Бали')).toBeNull();
    expect(screen.queryByLabelText('Правильний: варіант 1')).toBeNull();
    screen.getByText(t('noPointsNote'));
    screen.getByText(t('pollHint'));
    fill('Варіант 1', 'Літо');
    fill('Варіант 2', 'Зима');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'poll', points: 0 });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('the cloud chip asks for the words per player (3), has no price and saves', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'З чим асоціюється Київ?');
    click('хмара');
    expect((screen.getByLabelText('Слів від гравця') as HTMLInputElement).value).toBe('3');
    expect(screen.queryByLabelText('Бали')).toBeNull();
    screen.getByText(t('cloudHint'));
    screen.getByText(t('noPointsNote'));
    fill('Слів від гравця', '2');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(roundQuestions(saved(onSave).rounds[0])[0]).toMatchObject({ type: 'wordcloud', words: 2, points: 0 });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('switching a poll back to a question brings the price back', () => {
    open();
    click('опитування');
    expect(screen.queryByLabelText('Бали')).toBeNull();
    click('один варіант');
    expect((screen.getByLabelText('Бали') as HTMLInputElement).value).toBe('1000');
  });

  it('a blitz round has no wall, poll or cloud chips; the board has the wall but no poll or cloud', () => {
    open();
    addRound('Бліц');
    for (const name of ['стіна', 'опитування', 'хмара']) expect(screen.queryByRole('button', { name })).toBeNull();
    click('+ Раунд');
    click('Ігрове поле');
    screen.getByRole('button', { name: 'стіна' });
    expect(screen.queryByRole('button', { name: 'опитування' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'хмара' })).toBeNull();
  });
});

describe('QuizEditor: «100 до 1» (10e)', () => {
  const rowCard = (n: number) => screen.getByRole('group', { name: `Рядок ${n}` });
  const fillRows = (count: number) => {
    for (let n = 1; n <= count; n += 1) {
      fireEvent.change(within(rowCard(n)).getByLabelText(`Відповідь ${n}`), { target: { value: `Відповідь ${n}` } });
      fireEvent.change(within(rowCard(n)).getByLabelText('Людей зі 100'), { target: { value: String(10 * n) } });
    }
  };

  it('the chip shows five blank rows and three answers; four filled rows save the survey', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Назвіть фрукт');
    click('100 до 1');
    expect(screen.getAllByRole('group', { name: /^Рядок \d$/ })).toHaveLength(5);
    expect((screen.getByLabelText('Відповідей від гравця') as HTMLInputElement).value).toBe('3');
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemSurveyRows', { index: 1, surveyMin: 4 })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
    fillRows(4);
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'survey', answers: 3, timeLimit: 45, points: 1000 });
    if (question.type !== 'survey') throw new Error('unexpected');
    expect(question.rows).toHaveLength(4);
    expect(question.rows.map((row) => [row.text, row.popularity])).toEqual([
      ['Відповідь 1', 10],
      ['Відповідь 2', 20],
      ['Відповідь 3', 30],
      ['Відповідь 4', 40],
    ]);
    expect('cloudId' in question).toBe(false);
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('a total over 100 blocks saving with the total named', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Назвіть фрукт');
    click('100 до 1');
    fillRows(5);
    screen.getByText(/^Разом: 150 зі 100/);
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemSurveyTotal', { index: 1, total: 150 })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a classic round with a cloud above offers answers from the cloud; the saved survey has the cloudId and no rows', async () => {
    const cloud = { ...newQuestion('wordcloud'), id: 'cloud-1', text: 'Фрукти' } as Question;
    const quiz = { ...newQuiz(), title: 'Гра', rounds: [{ ...newClassicRound(), questions: [cloud, { ...newQuestion('survey'), text: 'Назвіть фрукт' } as Question] }] };
    const { onSave } = open(quiz);
    fireEvent.click(screen.getByRole('button', { name: /Назвіть фрукт/ }));
    const source = screen.getByRole('button', { name: 'Відповіді з хмари' });
    expect((source as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(source);
    expect((screen.getByLabelText('Хмара слів для дошки') as HTMLSelectElement).value).toBe('cloud-1');
    screen.getByRole('option', { name: 'Хмара №1: «Фрукти»' });
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const question = roundQuestions(saved(onSave).rounds[0])[1];
    expect(question).toMatchObject({ type: 'survey', cloudId: 'cloud-1', rows: [] });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('a cloud that moved below the survey blocks saving with a message', async () => {
    const cloud = { ...newQuestion('wordcloud'), id: 'cloud-1', text: 'Фрукти' } as Question;
    const survey = { ...newQuestion('survey'), text: 'Назвіть фрукт', cloudId: 'cloud-1', rows: [] } as Question;
    const quiz = { ...newQuiz(), title: 'Гра', rounds: [{ ...newClassicRound(), questions: [survey, cloud] }] };
    const { onSave } = open(quiz);
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemSurveyCloud', { index: 1 })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('the first survey in a round without clouds has the cloud source disabled with the explanation', () => {
    open();
    fill('Текст запитання', 'Назвіть фрукт');
    click('100 до 1');
    expect((screen.getByRole('button', { name: 'Відповіді з хмари' }) as HTMLButtonElement).disabled).toBe(true);
    screen.getByText(t('surveyNoClouds'));
  });

  it('a blitz round and the final have no «100 до 1» chip', () => {
    open();
    addRound('Бліц');
    expect(screen.queryByRole('button', { name: '100 до 1' })).toBeNull();
    addRound('Фінал');
    expect(screen.queryByRole('button', { name: '100 до 1' })).toBeNull();
  });

  it('switching the type away from a cloud survey drops the cloud and the rows', () => {
    const cloud = { ...newQuestion('wordcloud'), id: 'cloud-1', text: 'Фрукти' } as Question;
    const survey = { ...newQuestion('survey'), text: 'Назвіть фрукт', cloudId: 'cloud-1', rows: [] } as Question;
    open({ ...newQuiz(), title: 'Гра', rounds: [{ ...newClassicRound(), questions: [cloud, survey] }] });
    fireEvent.click(screen.getByRole('button', { name: /Назвіть фрукт/ }));
    click('текст');
    expect(screen.queryByLabelText('Хмара слів для дошки')).toBeNull();
    expect(screen.queryByRole('group', { name: /^Рядок \d$/ })).toBeNull();
  });
});

describe('QuizEditor: bluff (10f)', () => {
  it('the chip shows the truth, two spares and both times; filled in, it saves a bluff', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перший чемпіон світу … був з Уругваю');
    click('Блеф');
    expect(screen.queryByLabelText('Відео з YouTube')).toBeNull();
    expect(screen.getAllByLabelText(/^Запасна вигадка \d$/)).toHaveLength(2);
    expect((screen.getByLabelText('Час на вигадки, с') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Час на вибір, с') as HTMLInputElement).value).toBe('30');
    expect(screen.queryByLabelText('Час, с')).toBeNull();
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemBluffTruth', { index: 1 })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
    fill('Правда', 'Барселона');
    fill('Запасна вигадка 1', 'Мадрид');
    fill('Запасна вигадка 2', 'Лондон');
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const [question] = roundQuestions(saved(onSave).rounds[0]);
    expect(question).toMatchObject({ type: 'bluff', accepted: ['Барселона'], lies: ['Мадрид', 'Лондон'], timeLimit: 60, choiceTime: 30 });
    expect(quizSchema.safeParse(saved(onSave)).success).toBe(true);
  });

  it('a spare that is the truth blocks saving with a named message', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Де?');
    click('Блеф');
    fill('Правда', 'Барселона');
    fill('Запасна вигадка 1', 'барселона');
    fill('Запасна вигадка 2', 'Лондон');
    click('Зберегти');
    await waitFor(() => expect(screen.getAllByText(t('problemBluffSpareTruth', { index: 1, text: 'барселона' })).length).toBeGreaterThan(0));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a blitz round and the final have no bluff chip; neither has the board', () => {
    open();
    addRound('Бліц');
    expect(screen.queryByRole('button', { name: 'Блеф' })).toBeNull();
    addRound('Фінал');
    expect(screen.queryByRole('button', { name: 'Блеф' })).toBeNull();
    click('+ Раунд');
    click('Ігрове поле');
    expect(screen.queryByRole('button', { name: 'Блеф' })).toBeNull();
  });
});

describe('QuizEditor: wipeout round', () => {
  const prices = () => Array.from(document.querySelectorAll('.question-item-price')).map((el) => el.textContent);
  const removeButton = () => screen.getByRole('button', { name: /^Видалити запитання \d+$/ }) as HTMLButtonElement;

  it('a new wipeout round has five questions priced 100…500', () => {
    open();
    addRound('Ва-банк');
    expect(prices()).toEqual(['100', '200', '300', '400', '500']);
    const names = within(screen.getByRole('group', { name: t('questionType') }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toHaveLength(5);
  });

  it('adding a question continues the price and stops at fifteen; removing stops at five', () => {
    open();
    addRound('Ва-банк');
    expect(removeButton().disabled).toBe(true);
    expect(removeButton().title).toBe(t('wipeoutMinHint', { min: 5 }));
    click(t('addQuestion'));
    expect(prices()[5]).toBe('600');
    expect(removeButton().disabled).toBe(false);
    for (let i = 0; i < 9; i += 1) click(t('addQuestion'));
    expect(prices()).toHaveLength(15);
    expect((screen.getByRole('button', { name: t('addQuestion') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('remove goes back to disabled at five after a removal, and duplicate is disabled at fifteen', () => {
    open();
    addRound('Ва-банк');
    click(t('addQuestion'));
    expect(prices()).toHaveLength(6);
    expect(removeButton().disabled).toBe(false);
    fireEvent.click(removeButton());
    expect(prices()).toHaveLength(5);
    expect(removeButton().disabled).toBe(true);
    const duplicateButton = () => screen.getByRole('button', { name: t('duplicate') }) as HTMLButtonElement;
    expect(duplicateButton().disabled).toBe(false);
    for (let i = 0; i < 10; i += 1) click(t('addQuestion'));
    expect(prices()).toHaveLength(15);
    expect(duplicateButton().disabled).toBe(true);
  });

  it('settings show no rule controls, only the note', () => {
    open();
    addRound('Ва-банк');
    expect(screen.queryByLabelText(t('ruleMinus'))).toBeNull();
    expect(screen.queryByLabelText(t('speedBonus'))).toBeNull();
    expect(screen.queryByLabelText(t('ruleStreak'))).toBeNull();
    expect(screen.queryByLabelText(t('ruleMultiplier'))).toBeNull();
    expect(screen.getByText(t('wipeoutSettingsNote'))).toBeTruthy();
  });

  it('saving with an empty ladder lists the problems instead of failing silently', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Т');
    addRound('Ва-банк');
    click('Зберегти');
    await waitFor(() => expect(document.querySelector('.problems')).not.toBeNull());
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('QuizEditor: survival round', () => {
  const removeButton = () => screen.getByRole('button', { name: /^Видалити запитання \d+$/ }) as HTMLButtonElement;
  const typeNames = (scope: HTMLElement) =>
    within(within(scope).getByRole('group', { name: t('questionType') })).getAllByRole('button').map((b) => b.textContent);
  const settings = () => document.querySelector('.round-settings') as HTMLElement;
  const trialsBlock = () => document.querySelector('.survival-settings') as HTMLElement;
  const questionItems = () => document.querySelectorAll('.question-item');
  const savedRound = async (onSave: ReturnType<typeof open>['onSave']) => {
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const round = saved(onSave).rounds[0];
    if (round.type !== 'survival') throw new Error('not a survival round');
    return round;
  };

  it('a new survival round has three questions and two survival questions', () => {
    open();
    addRound('Вибування');
    expect(questionItems()).toHaveLength(3);
    expect(within(trialsBlock()).getByRole('button', { name: /^Питання 1/ })).toBeTruthy();
    expect(within(trialsBlock()).getByRole('button', { name: /^Питання 2/ })).toBeTruthy();
    expect(within(trialsBlock()).queryByRole('button', { name: /^Питання 3/ })).toBeNull();
  });

  it('the type choice has five types, in the survival questions too', () => {
    open();
    addRound('Вибування');
    expect(typeNames(document.querySelector('.editor-stage') as HTMLElement)).toHaveLength(5);
    expect(typeNames(trialsBlock())).toHaveLength(5);
  });

  it('adding a question gives a fourth one worth 100; removing is disabled at three', () => {
    open();
    addRound('Вибування');
    expect(removeButton().disabled).toBe(true);
    expect(removeButton().title).toBe(t('survivalMinHint', { min: 3 }));
    click(t('addQuestion'));
    expect(questionItems()).toHaveLength(4);
    expect(removeButton().disabled).toBe(false);
    expect((screen.getByLabelText(t('pointsLabel')) as HTMLInputElement).value).toBe('100');
    fireEvent.click(removeButton());
    expect(questionItems()).toHaveLength(3);
    expect(removeButton().disabled).toBe(true);
  });

  it('adding stops at thirty questions', () => {
    open();
    addRound('Вибування');
    for (let i = 0; i < 27; i += 1) click(t('addQuestion'));
    expect(questionItems()).toHaveLength(30);
    expect((screen.getByRole('button', { name: t('addQuestion') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the trial kind, survivors and bonus are saved', async () => {
    const { onSave } = open();
    fill('Назва вікторини', 'Т');
    addRound('Вибування');
    fireEvent.click(within(settings()).getByLabelText(t('survivalTrialLuckOpt')));
    fireEvent.change(within(settings()).getByLabelText(t('survivalSurvivors')), { target: { value: '2' } });
    fireEvent.change(within(settings()).getByLabelText(t('survivalBonusLabel')), { target: { value: '0' } });
    // Порожні запитання не пройдуть перевірку, тож перевіряємо чернетку через повідомлення й стан полів.
    expect((within(settings()).getByLabelText(t('survivalTrialLuckOpt')) as HTMLInputElement).checked).toBe(true);
    expect((within(settings()).getByLabelText(t('survivalSurvivors')) as HTMLInputElement).value).toBe('2');
    expect((within(settings()).getByLabelText(t('survivalBonusLabel')) as HTMLInputElement).value).toBe('0');
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a filled survival round saves with luck, two survivors and no bonus', async () => {
    const base = newSurvivalRound();
    const fillQ = (q: Question, i: number): Question => (q.type === 'single' ? { ...q, text: `Q${i}`, options: q.options.map((o, k) => ({ ...o, text: `V${k}` })) } : q);
    const initial: Quiz = { ...newQuiz(), title: 'Т', rounds: [{ ...base, questions: base.questions.map(fillQ), trials: base.trials.map(fillQ) }] };
    const { onSave } = open(initial);
    fireEvent.click(within(settings()).getByLabelText(t('survivalTrialLuckOpt')));
    fireEvent.change(within(settings()).getByLabelText(t('survivalSurvivors')), { target: { value: '2' } });
    fireEvent.change(within(settings()).getByLabelText(t('survivalBonusLabel')), { target: { value: '0' } });
    click('Зберегти');
    const round = await savedRound(onSave);
    expect([round.trial, round.survivors, round.bonus]).toEqual(['luck', 2, 0]);
  });

  it('a luck round saves with the default blank survival questions, they are dropped', async () => {
    const base = newSurvivalRound();
    const fillQ = (q: Question, i: number): Question => (q.type === 'single' ? { ...q, text: `Q${i}`, options: q.options.map((o, k) => ({ ...o, text: `V${k}` })) } : q);
    const initial: Quiz = { ...newQuiz(), title: 'Т', rounds: [{ ...base, questions: base.questions.map(fillQ) }] };
    const { onSave } = open(initial);
    fireEvent.click(within(settings()).getByLabelText(t('survivalTrialLuckOpt')));
    click('Зберегти');
    const round = await savedRound(onSave);
    expect([round.trial, round.trials]).toEqual(['luck', []]);
  });

  it('a broken survival question opens the round settings', () => {
    const base = newSurvivalRound();
    const fillQ = (q: Question, i: number): Question => (q.type === 'single' ? { ...q, text: `Q${i}`, options: q.options.map((o, k) => ({ ...o, text: `V${k}` })) } : q);
    const initial: Quiz = { ...newQuiz(), title: 'Т', rounds: [{ ...base, questions: base.questions.map(fillQ) }] };
    const { onSave } = open(initial);
    expect((settings() as HTMLDetailsElement).open).toBe(false);
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    expect((settings() as HTMLDetailsElement).open).toBe(true);
  });

  it('adding and removing a survival question', () => {
    open();
    addRound('Вибування');
    click(t('addTrial'));
    expect(within(trialsBlock()).getByRole('button', { name: /^Питання 3/ })).toBeTruthy();
    fireEvent.click(within(trialsBlock()).getByRole('button', { name: t('removeTrial') }));
    expect(within(trialsBlock()).queryByRole('button', { name: /^Питання 3/ })).toBeNull();
  });

  it('settings keep the classic penalty and speed bonus', () => {
    open();
    addRound('Вибування');
    expect(screen.getByLabelText(t('ruleMinus'))).toBeTruthy();
    expect(screen.getByLabelText(t('speedBonus'))).toBeTruthy();
  });

  it('the round strip offers the survival round with a help button', () => {
    open();
    click('+ Раунд');
    expect(screen.getByRole('button', { name: 'Вибування' })).toBeTruthy();
  });
});

describe('QuizEditor: ladder round', () => {
  const removeButton = () => screen.getByRole('button', { name: /^Видалити запитання \d+$/ }) as HTMLButtonElement;
  const chips = () => Array.from(document.querySelectorAll('.question-item-price')).map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
  const settings = () => document.querySelector('.round-settings') as HTMLElement;
  const field = (label: string) => within(settings()).getByLabelText(label) as HTMLInputElement;
  const fillLadder = () => {
    const base = newLadderRound();
    const fillQ = (q: Question, i: number): Question =>
      q.type === 'single' ? { ...q, text: `Q${i}`, options: q.options.map((o, k) => ({ ...o, text: `V${k}` })) } : q;
    return { ...newQuiz(), title: 'Т', rounds: [{ ...base, questions: base.questions.map(fillQ) }] } as Quiz;
  };
  const savedLadder = async (onSave: ReturnType<typeof open>['onSave']) => {
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const round = saved(onSave).rounds[0];
    if (round.type !== 'ladder') throw new Error('not a ladder round');
    return round;
  };

  it('a new ladder round has five questions with level chips and a shield at 1000', () => {
    open();
    addRound('Мільйонер');
    expect(document.querySelectorAll('.question-item')).toHaveLength(5);
    expect(chips()).toEqual(['100', '300', '🛡 1000', '3000', '10000']);
  });

  it('a question has only the single type, four options without add or remove, no price and no time', () => {
    open();
    addRound('Мільйонер');
    const names = within(screen.getByRole('group', { name: t('questionType') }))
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(names).toHaveLength(1);
    expect(document.querySelectorAll('.answer-row')).toHaveLength(4);
    expect(screen.queryByRole('button', { name: t('addOption') })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Прибрати варіант/ })).toBeNull();
    expect(screen.queryByLabelText(t('pointsLabel'))).toBeNull();
    expect(screen.queryByLabelText(t('timeLimit'))).toBeNull();
  });

  it('adding a question takes the preset for six; removing is disabled at five', () => {
    open();
    addRound('Мільйонер');
    expect(removeButton().disabled).toBe(true);
    expect(removeButton().title).toBe(t('ladderMinHint', { min: 5 }));
    click(t('addQuestion'));
    expect(chips()).toEqual(['100', '250', '600', '🛡 1500', '4000', '10000']);
    expect(removeButton().disabled).toBe(false);
    fireEvent.click(removeButton());
    expect(chips()).toEqual(['100', '300', '🛡 1000', '3000', '10000']);
    expect(removeButton().disabled).toBe(true);
  });

  it('a question with a wrong option count gets add and remove buttons back', () => {
    const quiz = fillLadder();
    const round = quiz.rounds[0];
    if (round.type !== 'ladder') throw new Error('x');
    const first = round.questions[0];
    if (first.type !== 'single') throw new Error('x');
    open({ ...quiz, rounds: [{ ...round, questions: [{ ...first, options: first.options.slice(0, 3) }, ...round.questions.slice(1)] }] });
    expect(screen.getByRole('button', { name: t('addOption') })).toBeTruthy();
  });

  it('adding stops at fifteen', () => {
    open();
    addRound('Мільйонер');
    for (let i = 0; i < 10; i += 1) click(t('addQuestion'));
    expect(document.querySelectorAll('.question-item')).toHaveLength(15);
    expect((screen.getByRole('button', { name: t('addQuestion') }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('the pick, the lifelines and the timer are saved', async () => {
    const { onSave } = open(fillLadder());
    fireEvent.click(within(settings()).getByLabelText(t('ladderPick_random')));
    fireEvent.click(within(settings()).getByLabelText(t('ladderLifeline_audience')));
    click('Зберегти');
    const round = await savedLadder(onSave);
    expect(round.pick).toBe('random');
    expect(round.lifelines).toEqual(['fifty', 'hint']);
    expect(round.timer).toBe(false);
  });

  it('the timer checkbox brings the time field into the question', () => {
    open();
    addRound('Мільйонер');
    expect(screen.queryByLabelText(t('timeLimit'))).toBeNull();
    fireEvent.click(within(settings()).getByLabelText(t('ladderTimer')));
    expect(screen.getByLabelText(t('timeLimit'))).toBeTruthy();
  });

  it('a level, a safe mark and the preset button edit the table', async () => {
    const { onSave } = open(fillLadder());
    fireEvent.change(field(t('ladderLevel', { n: 3 })), { target: { value: '1200' } });
    fireEvent.click(field(`${t('ladderSafeMark')} 4`));
    expect(field(`${t('ladderSafeMark')} 5`).disabled).toBe(true);
    click('Зберегти');
    const round = await savedLadder(onSave);
    expect(round.levels[2]).toBe(1200);
    expect(round.safe).toContain(3);
  });

  it('the preset button brings back the preset sums and safe steps', () => {
    open(fillLadder());
    fireEvent.change(field(t('ladderLevel', { n: 3 })), { target: { value: '1200' } });
    fireEvent.click(field(`${t('ladderSafeMark')} 4`));
    fireEvent.click(within(settings()).getByRole('button', { name: t('ladderUsePreset') }));
    expect(field(t('ladderLevel', { n: 3 })).value).toBe('1000');
    expect(field(`${t('ladderSafeMark')} 4`).checked).toBe(false);
    expect(field(`${t('ladderSafeMark')} 3`).checked).toBe(true);
  });

  it('broken levels name the problem and open the round settings', () => {
    const { onSave } = open(fillLadder());
    expect((settings() as HTMLDetailsElement).open).toBe(false);
    fireEvent.change(field(t('ladderLevel', { n: 2 })), { target: { value: '50' } });
    fireEvent.change(field(t('ladderLevel', { n: 1 })), { target: { value: '100' } });
    fireEvent.change(field(t('ladderLevel', { n: 2 })), { target: { value: '100' } });
    click('Зберегти');
    expect(onSave).not.toHaveBeenCalled();
    expect(document.querySelector('.problems')?.textContent).toContain(t('problemLadderLevels', { max: 10000 }));
    expect((settings() as HTMLDetailsElement).open).toBe(true);
  });

  it('settings show no rule controls, only the note', () => {
    open();
    addRound('Мільйонер');
    expect(screen.queryByLabelText(t('ruleMinus'))).toBeNull();
    expect(screen.queryByLabelText(t('speedBonus'))).toBeNull();
    expect(screen.getByText(t('ladderSettingsNote'))).toBeTruthy();
  });

  it('the round strip offers the ladder round', () => {
    open();
    click('+ Раунд');
    expect(screen.getByRole('button', { name: 'Мільйонер' })).toBeTruthy();
  });
});

describe('QuizEditor: team play', () => {
  const fillBasics = () => {
    fill('Назва вікторини', 'Гра');
    fill('Текст запитання', 'Перше?');
    fireEvent.click(screen.getByRole('button', { name: 'так чи ні' }));
  };

  it('a quiz saved without teams has no settings.teams', async () => {
    const { onSave } = open();
    fillBasics();
    fireEvent.click(screen.getByLabelText('Грати командами'));
    fireEvent.click(screen.getByLabelText('Грати командами'));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect('teams' in saved(onSave).settings).toBe(false);
  });

  it('turning it on saves two names and a saved team quiz opens with the toggle on and the names', async () => {
    const { onSave } = open();
    fillBasics();
    fireEvent.click(screen.getByLabelText('Грати командами'));
    click('Зберегти');
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const quiz = saved(onSave);
    expect(quiz.settings.teams).toEqual({ count: 2, names: ['Червоні', 'Сині'] });
    expect(quizSchema.safeParse(quiz).success).toBe(true);
    cleanup();
    open(quiz);
    expect((screen.getByLabelText('Грати командами') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Назва команди 2') as HTMLInputElement).value).toBe('Сині');
  });

  it('name fields are rendered in the shrinking name grid (the class that keeps them inside 375 px)', () => {
    open();
    fireEvent.click(screen.getByLabelText('Грати командами'));
    const grid = screen.getByLabelText('Назва команди 1').closest('.teams-names');
    expect(grid).not.toBeNull();
    expect(screen.getByLabelText('Назва команди 1').closest('.team-name')).not.toBeNull();
  });

  it('an empty or repeated team name blocks saving with a clear message', async () => {
    const { onSave } = open();
    fillBasics();
    fireEvent.click(screen.getByLabelText('Грати командами'));
    fill('Назва команди 2', '  червоні ');
    click('Зберегти');
    expect(await screen.findByText(t('problemTeamNames'))).toBeTruthy();
    fill('Назва команди 2', '');
    click('Зберегти');
    expect(await screen.findByText(t('problemTeamName'))).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe('QuizEditor board tab badge (11a)', () => {
  const board = (): Quiz => {
    const round = newBoardRound();
    round.categories.forEach((category, ci) => {
      category.title = `Тема ${ci + 1}`;
      category.cells.forEach((cell, i) => {
        const q = cell.question;
        if (q.type !== 'single') return;
        cell.question = { ...q, text: `Питання ${ci}${i}`, options: q.options.map((o, k) => ({ ...o, text: `В${k}` })) };
      });
    });
    round.categories[1].cells[2].question = { ...round.categories[1].cells[2].question, text: '' };
    return { ...newQuiz(), title: 'Гра', rounds: [round, newClassicRound()] };
  };

  it('badges the board tab with the not-ready count without changing its name, and drops it when fixed', () => {
    open(board());
    const tab = screen.getByRole('button', { name: 'Ігрове поле' });
    const badge = document.getElementById(tab.getAttribute('aria-describedby') ?? '');
    expect(badge?.textContent).toBe('1 не готова');
    expect(screen.getByRole('button', { name: 'Раунд 2' }).getAttribute('aria-describedby')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^Категорія 2, клітинка 3:/ }));
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Тепер є' } });
    expect(screen.getByRole('button', { name: 'Ігрове поле' }).getAttribute('aria-describedby')).toBeNull();
  });

  it('with a long round name only the name is clipped: the badge sits outside the name', () => {
    const quiz = board();
    const long = 'Річки, гори й острови Європи та Азії для найсміливіших гравців вечора';
    quiz.rounds[0] = { ...quiz.rounds[0], title: long };
    open(quiz);
    const tab = screen.getByRole('button', { name: long });
    expect(tab.querySelector('.round-tab-name')?.textContent).toBe(long);
    const badge = tab.querySelector('.round-tab-badge');
    expect(badge?.textContent).toBe('1 не готова');
    expect(badge?.closest('.round-tab-name')).toBeNull();
    expect(badge?.parentElement).toBe(tab);
  });
});
