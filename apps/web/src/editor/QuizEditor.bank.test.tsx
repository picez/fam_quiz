// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { quizSchema, roundQuestions, type Question, type QuestionBankItem, type Quiz } from '@quiz/shared';
import { searchQuestionBank } from '../api';
import { t } from '../i18n';
import { chooseRound, roundNames } from './editor-testing';
import { newClassicRound, newLadderRound, newQuestion, newQuiz } from './draft';
import { QuizEditor } from './QuizEditor';

vi.mock('../api', async (importOriginal) => ({ ...(await importOriginal<typeof import('../api')>()), searchQuestionBank: vi.fn() }));

const filled = (text: string, options = 4): Question => {
  const base = newQuestion('single');
  if (base.type !== 'single') throw new Error('single expected');
  const list = Array.from({ length: options }, (_, index) => ({ ...(base.options[index] ?? { id: `x${index}` }), id: `${text}-${index}`, text: `Варіант ${index + 1}` }));
  return { ...base, text, options: list, correctId: list[0].id };
};
const sourceItem = (question: Question, quizId = 'other'): QuestionBankItem => ({ quizId, quizTitle: 'Чужа', roundIndex: 0, roundTitle: 'Перший', question });
const serve = (...items: QuestionBankItem[]) => vi.mocked(searchQuestionBank).mockResolvedValue({ ok: true, data: { items, page: 1, pages: 1, total: items.length } });
const quizWith = (...questions: Question[]): Quiz => ({ ...newQuiz(), title: 'Моя', rounds: [{ ...newClassicRound(), questions }] });
const addRound = (type: string) => {
  fireEvent.click(screen.getByRole('button', { name: '+ Раунд' }));
  fireEvent.click(screen.getByRole('button', { name: type }));
};
const bankButton = () => screen.queryByRole('button', { name: t('bankButton') }) as HTMLButtonElement | null;

function open(initial: Quiz, quizId?: string) {
  const onDraft = vi.fn();
  render(<QuizEditor initial={initial} heading="Редактор" onDraft={onDraft} onSave={async () => null} onCancel={() => undefined} quizId={quizId} />);
  return { onDraft };
}

beforeEach(() => {
  vi.mocked(searchQuestionBank).mockReset();
});
afterEach(() => {
  cleanup();
});

describe('QuizEditor question bank', () => {
  it('every list round has the bank button', () => {
    open(quizWith(filled('Своє')));
    expect(bankButton()).not.toBeNull();
    for (const type of ['Бліц', 'Ва-банк', 'Мільйонер', 'Головоломки', 'Думай інакше']) {
      addRound(type);
      expect(bankButton(), type).not.toBeNull();
    }
    for (const type of ['Фінал', 'Правда про гравця']) {
      addRound(type);
      expect(bankButton(), type).toBeNull();
    }
  });

  it('the board has no bank button', () => {
    open(quizWith(filled('Своє')));
    addRound('Ігрове поле');
    expect(bankButton()).toBeNull();
  });

  it('copies append with new ids', async () => {
    const own = filled('Своє');
    const a = filled('Перше чуже');
    const b = filled('Друге чуже');
    const c = filled('Із цієї вікторини');
    serve(sourceItem(a), sourceItem(b), sourceItem(c, 'mine'));
    const { onDraft } = open(quizWith(own), 'mine');
    fireEvent.click(bankButton()!);
    await screen.findByText('Перше чуже');
    for (const text of ['Перше чуже', 'Друге чуже', 'Із цієї вікторини']) fireEvent.click(screen.getByLabelText(t('bankPick', { text })));
    fireEvent.click(screen.getByRole('button', { name: t('bankCopy', { count: 3 }) }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const next: Quiz = onDraft.mock.calls.at(-1)![0];
    const questions = roundQuestions(next.rounds[0]);
    expect(questions.map((q) => q.text)).toEqual(['Своє', 'Перше чуже', 'Друге чуже', 'Із цієї вікторини']);
    const ids = questions.flatMap((q) => [q.id, ...(q.type === 'single' ? q.options.map((o) => o.id) : [])]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of [a, b, c]) expect(questions.some((q) => q.id === source.id)).toBe(false);
    expect(quizSchema.safeParse(next).success).toBe(true);
    // Виділено першу копію.
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement | HTMLInputElement).value).toBe('Перше чуже');
  });

  it('a full round disables the bank; the panel gets the room left in the quiz', async () => {
    const full = quizWith(...Array.from({ length: 100 }, (_, index) => filled(`Q${index}`)));
    open(full);
    expect(bankButton()!.disabled).toBe(true);
    cleanup();

    serve(sourceItem(filled('А')), sourceItem(filled('Б')));
    const wide: Quiz = { ...quizWith(...Array.from({ length: 100 }, (_, index) => filled(`Q${index}`))), rounds: [{ ...newClassicRound(), questions: Array.from({ length: 100 }, (_, index) => filled(`Q${index}`)) }, { ...newClassicRound(), questions: Array.from({ length: 99 }, (_, index) => filled(`R${index}`)) }] };
    open(wide);
    chooseRound(roundNames()[1]);
    fireEvent.click(bankButton()!);
    await screen.findByText('А');
    fireEvent.click(screen.getByLabelText(t('bankPick', { text: 'А' })));
    fireEvent.click(screen.getByLabelText(t('bankPick', { text: 'Б' })));
    expect(within(screen.getByRole('dialog')).getByRole('status').textContent).toBe(t('bankRoomLeft', { count: 1 }));
  });

  it('a ladder copy keeps the levels', async () => {
    const source = filled('Для драбини', 4);
    serve(sourceItem(source));
    const { onDraft } = open(quizWith(filled('Своє')));
    addRound('Мільйонер');
    fireEvent.click(bankButton()!);
    await screen.findByText('Для драбини');
    fireEvent.click(screen.getByLabelText(t('bankPick', { text: 'Для драбини' })));
    fireEvent.click(screen.getByRole('button', { name: t('bankCopy', { count: 1 }) }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    const round = (onDraft.mock.calls.at(-1)![0] as Quiz).rounds[1];
    expect(round.type).toBe('ladder');
    if (round.type === 'ladder') {
      expect(round.questions.some((q) => q.text === 'Для драбини')).toBe(true);
      expect(round.levels.length).toBe(round.questions.length);
    }
    if (round.type === 'ladder') expect(round.questions.at(-1)!.text).toBe('Для драбини');
  });
});
