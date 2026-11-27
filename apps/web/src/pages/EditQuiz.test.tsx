// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGame, createQuiz, fetchQuizLikes, getQuiz, markGroupUses, me, sendEditorTime, updateQuiz } from '../api';
import { forgetAccount } from '../useAccount';
import { roundQuestions } from '@quiz/shared';
import { demoQuiz } from '../demo-quiz';
import type { Question, Quiz } from '@quiz/shared';
import { newClassicRound, newQuestion, newQuiz } from '../editor/draft';
import { saveDraft, saveGroupDrafts } from '../editor/draft-storage';
import { errorText, t } from '../i18n';
import { chooseType, openTab } from '../editor/editor-testing';
import { EditQuiz } from './EditQuiz';

vi.mock('../api', () => ({ me: vi.fn(), createGame: vi.fn(), getQuiz: vi.fn(), createQuiz: vi.fn(), updateQuiz: vi.fn(), fetchQuizLikes: vi.fn(), markGroupUses: vi.fn(), sendEditorTime: vi.fn() }));

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  vi.mocked(fetchQuizLikes).mockResolvedValue(null);
  vi.mocked(sendEditorTime).mockResolvedValue(true);
  vi.mocked(me).mockResolvedValue({ ok: true, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false });
});
afterEach(cleanup);

const open = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/quizzes/new" element={<EditQuiz />} />
        <Route path="/quizzes/:id" element={<EditQuiz />} />
        <Route path="/quizzes" element={<p>мої вікторини</p>} />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('EditQuiz', () => {
  describe('editor time (71)', () => {
    afterEach(() => {
      vi.useRealTimers();
      forgetAccount();
    });
    const work = async (sec: number) => {
      for (let t = 0; t < sec; t += 5) {
        fireEvent.keyDown(document, { key: 'a' });
        await vi.advanceTimersByTimeAsync(5_000);
      }
    };

    it('counts active time of a signed-in author and sends it by the minute', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      open('/quizzes/new');
      await screen.findByLabelText('Назва вікторини');
      await work(60);
      expect(sendEditorTime).toHaveBeenCalledWith({ seconds: 60, start: true }, false);
    });

    it('does not count before the account is known', async () => {
      forgetAccount();
      vi.mocked(me).mockReturnValue(new Promise(() => {}));
      vi.useFakeTimers();
      const view = open('/quizzes/new');
      await work(120);
      view.unmount();
      expect(sendEditorTime).not.toHaveBeenCalled();
    });

    it('does not count for a guest', async () => {
      forgetAccount();
      vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
      open('/quizzes/new');
      expect(await screen.findByText('сторінка входу')).toBeTruthy();
      vi.useFakeTimers();
      await work(120);
      expect(sendEditorTime).not.toHaveBeenCalled();
    });
  });

  it('asks for the likes of a saved quiz and shows them without blocking the editor (17a)', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(fetchQuizLikes).mockResolvedValue({ quiz: 5, questions: {} });
    open('/quizzes/q1');
    expect(await screen.findByText('❤️ Вікторину вподобали: 5')).toBeTruthy();
    expect(fetchQuizLikes).toHaveBeenCalledWith('q1');
  });

  it('does not ask for likes on a new quiz (17a)', async () => {
    open('/quizzes/new');
    await screen.findByLabelText('Назва вікторини');
    expect(fetchQuizLikes).not.toHaveBeenCalled();
  });

  it('opens the editor without hearts when the likes request fails (17a)', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(fetchQuizLikes).mockResolvedValue(null);
    const { container } = open('/quizzes/q1');
    await screen.findByLabelText('Назва вікторини');
    expect(container.querySelector('.like-count')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('loads a saved quiz, saves the changes and returns to the list', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(updateQuiz).mockResolvedValue({ ok: true, id: 'q1' });
    open('/quizzes/q1');

    const title = (await screen.findByLabelText('Назва вікторини')) as HTMLInputElement;
    expect(title.value).toBe(demoQuiz.title);
    fireEvent.change(title, { target: { value: 'Нова назва' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));

    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(updateQuiz).toHaveBeenCalledWith('q1', expect.objectContaining({ title: 'Нова назва', rounds: demoQuiz.rounds }));
    expect(createQuiz).not.toHaveBeenCalled();
  });

  it('gives a repeated question id a fresh one when the quiz is opened (17a)', async () => {
    const first = demoQuiz.rounds[0]!;
    if (first.type === 'board') throw new Error('demo quiz starts with a board');
    const [a, b] = roundQuestions(first);
    const repeated = { ...demoQuiz, rounds: [{ ...first, questions: [a!, { ...b!, id: a!.id }] }] };
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: repeated });
    vi.mocked(updateQuiz).mockResolvedValue({ ok: true, id: 'q1' });
    open('/quizzes/q1');
    await screen.findByLabelText('Назва вікторини');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    const sent = vi.mocked(updateQuiz).mock.calls[0]![1].rounds[0] as { questions: { id: string }[] };
    expect(sent.questions[0]!.id).toBe(a!.id);
    expect(sent.questions[1]!.id).not.toBe(a!.id);
  });

  it('creates a new quiz', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q9' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    chooseType('boolean');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(createQuiz).toHaveBeenCalledWith(expect.objectContaining({ title: 'Гра' }));
    expect(vi.mocked(createQuiz).mock.calls[0][0].rounds).toHaveLength(1);
    expect(vi.mocked(createQuiz).mock.calls[0][0].rounds[0]).toMatchObject({ type: 'classic', speedBonus: true });
    expect(getQuiz).not.toHaveBeenCalled();
  });

  it('keeps the editor open and explains when saving fails', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'offline' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    chooseType('boolean');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Немає зв’язку із сервером.'));
    expect((screen.getByLabelText('Назва вікторини') as HTMLInputElement).value).toBe('Гра');
  });

  it('shows the server refusal of a host word outside the dictionary (48)', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'invalid_payload:wordle_unknown' });
    open('/quizzes/new');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    chooseType('boolean');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(errorText('invalid_payload:wordle_unknown')));
    expect(errorText('invalid_payload:wordle_unknown')).toBe(t('err_invalid_payload_wordle_unknown'));
    expect(errorText('invalid_payload')).toBe(t('err_invalid_payload'));
  });

  it('sends the host to sign in when the session has ended', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/quizzes/q1');
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('«Провести гру» hosts a saved quiz without changes (76)', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open('/quizzes/q1');
    await screen.findByLabelText('Назва вікторини');
    expect(screen.getByRole('link', { name: 'Назад: Мої вікторини' }).getAttribute('href')).toBe('/quizzes');
    fireEvent.click(screen.getByRole('button', { name: 'Провести гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(createGame).toHaveBeenCalledWith('q1');
    expect(updateQuiz).not.toHaveBeenCalled();
  });

  it('with unsaved changes it is «Зберегти й провести гру»: saves first, then hosts (76)', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(updateQuiz).mockResolvedValue({ ok: true, id: 'q1' });
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open('/quizzes/q1');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Нова назва' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти й провести гру' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(updateQuiz).toHaveBeenCalledWith('q1', expect.objectContaining({ title: 'Нова назва' }));
    expect(vi.mocked(updateQuiz).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(createGame).mock.invocationCallOrder[0]!);
  });

  it('does not host a quiz with errors or a failed save (76)', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    vi.mocked(updateQuiz).mockResolvedValue({ ok: false, error: 'offline' });
    open('/quizzes/q1');
    const name = await screen.findByLabelText('Назва вікторини');
    fireEvent.change(name, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти й провести гру' }));
    expect(updateQuiz).not.toHaveBeenCalled();
    fireEvent.change(name, { target: { value: 'Гра' } });
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти й провести гру' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Немає зв’язку із сервером.'));
    expect(createGame).not.toHaveBeenCalled();
  });

  it('a new quiz has no «Провести гру» (76)', async () => {
    open('/quizzes/new');
    await screen.findByLabelText('Назва вікторини');
    expect(screen.queryByRole('button', { name: /провести гру/i })).toBeNull();
  });

  it('asks before leaving through a link with unsaved changes (76)', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    const ask = vi.spyOn(window, 'confirm').mockReturnValue(false);
    open('/quizzes/q1');
    fireEvent.change(await screen.findByLabelText('Назва вікторини'), { target: { value: 'Нова назва' } });
    fireEvent.click(screen.getByRole('link', { name: 'Назад: Мої вікторини' }));
    expect(ask).toHaveBeenCalledWith(t('leaveUnsaved'));
    expect(screen.queryByText('мої вікторини')).toBeNull();
    ask.mockReturnValue(true);
    fireEvent.click(screen.getByRole('link', { name: 'Назад: Мої вікторини' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    ask.mockRestore();
  });

  it('says so when the quiz does not exist', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: false, error: 'not_found' });
    open('/quizzes/q1');
    expect((await screen.findByRole('alert')).textContent).toBe('Не знайдено.');
  });
});

describe('EditQuiz: unsaved work', () => {
  const title = async () => (await screen.findByLabelText('Назва вікторини')) as HTMLInputElement;

  it('restores an unsaved new quiz after the page is reloaded', async () => {
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Чернетка' } });
    cleanup();

    open('/quizzes/new');
    expect((await title()).value).toBe('Чернетка');
    expect(screen.getByRole('status').textContent).toBe('Відновлено незбережені зміни.');
  });

  it('restores an emptied number field as empty, not as a wrong number', async () => {
    open('/quizzes/new');
    await title();
    chooseType('numeric');
    fireEvent.change(screen.getByLabelText('Правильне число'), { target: { value: '' } });
    cleanup();

    open('/quizzes/new');
    await title();
    expect((screen.getByLabelText('Правильне число') as HTMLInputElement).value).toBe('');
  });

  it('forgets the draft once the quiz is saved', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q9' });
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    chooseType('boolean');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    await screen.findByText('мої вікторини');
    cleanup();

    open('/quizzes/new');
    expect((await title()).value).toBe('');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('keeps the work when the session ends during save and brings it back after signing in', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Гра' } });
    fireEvent.change(screen.getByLabelText('Текст запитання'), { target: { value: 'Так?' } });
    chooseType('boolean');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    cleanup();

    open('/quizzes/new');
    expect((await title()).value).toBe('Гра');
    expect((screen.getByLabelText('Текст запитання') as HTMLTextAreaElement).value).toBe('Так?');
  });

  it('restores unsaved changes to a saved quiz instead of the saved version', async () => {
    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    open('/quizzes/q1');
    fireEvent.change(await title(), { target: { value: 'Змінена назва' } });
    cleanup();

    open('/quizzes/q1');
    expect((await title()).value).toBe('Змінена назва');
  });

  it('keeps drafts of different quizzes apart', async () => {
    open('/quizzes/new');
    fireEvent.change(await title(), { target: { value: 'Нова чернетка' } });
    cleanup();

    vi.mocked(getQuiz).mockResolvedValue({ ok: true, data: demoQuiz });
    open('/quizzes/q1');
    expect((await title()).value).toBe(demoQuiz.title);
  });
});

describe('EditQuiz: questions from a group (12l)', () => {
  /** Нова вікторина з двома запитаннями з групи — так, як її кладе «Вікторина з групи». */
  function stored(fresh: boolean) {
    const a = { ...newQuestion('boolean'), text: 'Правда чи вигадка? Як тато заблукав у лісі по гриби' };
    const b = { ...newQuestion('boolean'), text: 'Правда чи вигадка? Бабуся Ніна свистить двома пальцями', correct: false } as Question;
    const quiz: Quiz = { ...newQuiz(), title: 'Вікторина: Родина Квіткових', rounds: [{ ...newClassicRound(), title: 'Родина Квіткових', questions: [a, b] }] };
    saveDraft(undefined, quiz);
    saveGroupDrafts(undefined, {
      entries: { [a.id]: { groupId: 'g1', itemId: 'i1', notes: [{ key: 'groupNotePhoto' }] }, [b.id]: { groupId: 'g1', itemId: 'i2', notes: [{ key: 'groupNoteFiction' }] } },
      ...(fresh ? { fresh: true as const } : {}),
    });
  }

  it('after saving marks the records used, then forgets both drafts and goes to the list', async () => {
    stored(false);
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q-new' });
    vi.mocked(markGroupUses).mockResolvedValue({ ok: true, marked: 2 });
    open('/quizzes/new');
    await screen.findByLabelText('Назва вікторини');
    expect(screen.getByRole('note').textContent).toContain('Перевір, чи фото не підказує відповідь.');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
    expect(markGroupUses).toHaveBeenCalledWith('g1', { quizId: 'q-new', itemIds: ['i1', 'i2'] });
    expect(sessionStorage.getItem('quiz:draft:new')).toBeNull();
    expect(sessionStorage.getItem('quiz:groupdraft:new')).toBeNull();
  });

  it('a failed mark does not stop the save', async () => {
    stored(false);
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q-new' });
    vi.mocked(markGroupUses).mockRejectedValue(new Error('offline'));
    open('/quizzes/new');
    await screen.findByLabelText('Назва вікторини');
    fireEvent.click(screen.getByRole('button', { name: 'Зберегти' }));
    expect(await screen.findByText('мої вікторини')).toBeTruthy();
  });

  it('a quiz just made from the group says so instead of «restored»', async () => {
    stored(true);
    open('/quizzes/new');
    await screen.findByLabelText('Назва вікторини');
    expect(screen.getByRole('status').textContent).toBe('Вікторину складено з записів групи. Над кожним запитанням — що варто перевірити.');
  });
});

describe('EditQuiz tabs (74)', () => {
  const Where = () => <p data-testid="where">{useLocation().pathname + useLocation().search}</p>;
  const openAt = (path: string) =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/quizzes/new" element={<><EditQuiz /><Where /></>} />
          <Route path="/quizzes" element={<p>мої вікторини</p>} />
        </Routes>
      </MemoryRouter>,
    );
  const where = () => screen.getByTestId('where').textContent;

  it('opens the general tab from ?tab=general and keeps it in the address', async () => {
    openAt('/quizzes/new?tab=general');
    await screen.findByLabelText(t('quizDescription'));
    expect(screen.getByRole('tab', { name: /Загальне/ }).getAttribute('aria-selected')).toBe('true');
    expect(where()).toBe('/quizzes/new?tab=general');
  });

  it('falls back to rounds for an unknown tab and drops it from the address', async () => {
    openAt('/quizzes/new?tab=foo');
    await screen.findByLabelText('Текст запитання');
    expect(screen.getByRole('tab', { name: /Раунди й запитання/ }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(where()).toBe('/quizzes/new'));
  });

  it('writes no tab for rounds', async () => {
    openAt('/quizzes/new?tab=general');
    await screen.findByLabelText(t('quizDescription'));
    openTab('rounds');
    await waitFor(() => expect(where()).toBe('/quizzes/new'));
    openTab('general');
    await waitFor(() => expect(where()).toBe('/quizzes/new?tab=general'));
  });

  it('keeps the draft notice above the tabs and asks before cancel after switching tabs', async () => {
    saveDraft(undefined, newQuiz());
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    openAt('/quizzes/new?tab=general');
    const notice = await screen.findByText(t('draftRestored'));
    const tablist = screen.getByRole('tablist');
    expect(notice.compareDocumentPosition(tablist) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.change(screen.getByLabelText(t('quizDescription')), { target: { value: 'Нова' } });
    openTab('rounds');
    fireEvent.click(screen.getByRole('button', { name: t('cancel') }));
    expect(confirm).toHaveBeenCalled();
    confirm.mockRestore();
  });
});
