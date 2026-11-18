// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question, QuestionBankItem, QuestionBankPage } from '@quiz/shared';
import { searchQuestionBank } from '../api';
import { errorText, t } from '../i18n';
import { newQuestion } from './draft';
import { QuestionBank } from './QuestionBank';

vi.mock('../api', () => ({ searchQuestionBank: vi.fn() }));

const TYPES = ['single', 'boolean', 'text'] as const;
const item = (text: string, over: Partial<QuestionBankItem> = {}, question: Partial<Question> = {}): QuestionBankItem => ({
  quizId: 'q1',
  quizTitle: 'Річки України',
  roundIndex: 0,
  roundTitle: '',
  question: { ...newQuestion('single'), text, points: 1000, ...question } as Question,
  ...over,
});
const page = (items: QuestionBankItem[], extra: Partial<QuestionBankPage> = {}): QuestionBankPage => ({ items, page: 1, pages: 1, total: items.length, ...extra });
const reply = (data: QuestionBankPage) => vi.mocked(searchQuestionBank).mockResolvedValueOnce({ ok: true, data });
const fitAll = () => ({ question: newQuestion('single') });

function open(over: Partial<Parameters<typeof QuestionBank>[0]> = {}) {
  const onCopy = vi.fn();
  const onClose = vi.fn();
  render(<QuestionBank types={TYPES} room={5} fit={fitAll} onCopy={onCopy} onClose={onClose} {...over} />);
  return { onCopy, onClose };
}
const pick = (text: string) => fireEvent.click(screen.getByLabelText(t('bankPick', { text })));

beforeEach(() => {
  vi.mocked(searchQuestionBank).mockReset();
});
afterEach(() => {
  vi.useRealTimers();
  document.querySelectorAll('.help-pop').forEach((node) => node.remove());
  cleanup();
});

describe('QuestionBank', () => {
  it("opens with the round's types and lists the results", async () => {
    reply(page([item('Яка найдовша річка?', {}, { imageUrl: '/uploads/abcdefabcdefabcd.png' } as Partial<Question>)]));
    open();
    expect(await screen.findByText('Яка найдовша річка?')).toBeTruthy();
    expect(searchQuestionBank).toHaveBeenCalledWith({ q: '', types: TYPES, page: 1 });
    expect(screen.getByText(/Річки України/).textContent).toContain('Раунд 1');
    expect(screen.getByText('Бали: 1000')).toBeTruthy();
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/uploads/abcdefabcdefabcd.png');
  });

  it('marks the current quiz', async () => {
    reply(page([item('Перше'), item('Друге', { quizId: 'other' })]));
    open({ quizId: 'q1' });
    await screen.findByText('Перше');
    expect(screen.getAllByText(t('bankThisQuiz'))).toHaveLength(1);
  });

  it('search waits and resets the page', async () => {
    reply(page([item('Перше')]));
    open();
    await screen.findByText('Перше');
    vi.useFakeTimers();
    reply(page([item('Дніпро')]));
    fireEvent.change(screen.getByRole('searchbox', { name: t('bankSearch') }), { target: { value: 'дніпро' } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250);
    });
    expect(searchQuestionBank).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(searchQuestionBank).toHaveBeenCalledTimes(2);
    expect(searchQuestionBank).toHaveBeenLastCalledWith({ q: 'дніпро', types: TYPES, page: 1 });
  });

  it('type filter sends one type', async () => {
    reply(page([item('Перше')]));
    open();
    await screen.findByText('Перше');
    reply(page([item('Так?')]));
    fireEvent.change(screen.getByLabelText(t('bankType')), { target: { value: 'boolean' } });
    await screen.findByText('Так?');
    expect(searchQuestionBank).toHaveBeenLastCalledWith({ q: '', types: ['boolean'], page: 1 });
    reply(page([item('Перше')]));
    fireEvent.change(screen.getByLabelText(t('bankType')), { target: { value: '' } });
    await screen.findByText('Перше');
    expect(searchQuestionBank).toHaveBeenLastCalledWith({ q: '', types: TYPES, page: 1 });
  });

  it('more pages append', async () => {
    reply(page([item('Перше')], { pages: 2, total: 2 }));
    open();
    await screen.findByText('Перше');
    reply(page([item('Друге')], { page: 2, pages: 2, total: 2 }));
    fireEvent.click(screen.getByRole('button', { name: t('bankMore') }));
    await screen.findByText('Друге');
    expect(searchQuestionBank).toHaveBeenLastCalledWith({ q: '', types: TYPES, page: 2 });
    expect(screen.getByText('Перше')).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('bankMore') })).toBeNull();
  });

  it('a question that does not fit is disabled with the reason', async () => {
    reply(page([item('Не влізе')]));
    const reason = t('bankNoFitLadder', { count: 4 });
    open({ fit: () => ({ issue: 'bankNoFitLadder', vars: { count: 4 }, text: reason }) });
    await screen.findByText('Не влізе');
    expect((screen.getByLabelText(t('bankPick', { text: 'Не влізе' })) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('copy respects the room', async () => {
    reply(page([item('А'), item('Б'), item('В')]));
    const { onCopy } = open({ room: 2 });
    await screen.findByText('А');
    pick('В');
    pick('А');
    pick('Б');
    const button = screen.getByRole('button', { name: t('bankCopy', { count: 3 }) }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByRole('status').textContent).toBe(t('bankRoomLeft', { count: 2 }));
    pick('Б');
    const ready = screen.getByRole('button', { name: t('bankCopy', { count: 2 }) }) as HTMLButtonElement;
    expect(ready.disabled).toBe(false);
    fireEvent.click(ready);
    expect(onCopy).toHaveBeenCalledTimes(1);
    expect(onCopy.mock.calls[0][0].map((each: QuestionBankItem) => each.question.text)).toEqual(['В', 'А']);
  });

  it('picks survive a new search', async () => {
    reply(page([item('А')]));
    open();
    await screen.findByText('А');
    pick('А');
    reply(page([item('Б')]));
    fireEvent.change(screen.getByLabelText(t('bankType')), { target: { value: 'text' } });
    await screen.findByText('Б');
    expect(screen.getByRole('button', { name: t('bankCopy', { count: 1 }) })).toBeTruthy();
  });

  it('nothing found and errors', async () => {
    reply(page([]));
    open();
    expect(await screen.findByText(t('bankNone'))).toBeTruthy();
    reply(page([]));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'щось' } });
    expect(await screen.findByText(t('bankEmpty'), {}, { timeout: 2000 })).toBeTruthy();
    vi.mocked(searchQuestionBank).mockResolvedValueOnce({ ok: false, error: 'offline' });
    fireEvent.change(screen.getByLabelText(t('bankType')), { target: { value: 'text' } });
    expect((await screen.findByRole('alert')).textContent).toBe(errorText('offline'));
  });

  it('Escape closes, but not over open help', async () => {
    reply(page([item('Перше')]));
    const { onClose } = open();
    const heading = await screen.findByRole('heading', { name: t('bankTitle') });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    const help = document.createElement('div');
    help.className = 'help-pop';
    document.body.append(help);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    help.remove();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: t('bankClose') }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
