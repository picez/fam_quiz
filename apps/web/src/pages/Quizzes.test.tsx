// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { roundQuestions } from '@quiz/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount } from '../useAccount';
import { checkCode, createGame, createQuiz, deleteQuiz, getAutopilotCheck, getChallengeCheck, getMyProfile, listMyChallenges, listQuizzes, me } from '../api';
import { t } from '../i18n';
import { loadHost, loadLastGame, saveAuthor, saveHost, saveLastGame } from '../storage';
import { myLibrary } from '../library/library-api';
import { importQuizFile } from '../quiz-io/actions';
import { listFolders, moveQuizToFolder } from '../quiz-folders/folder-api';
import { Quizzes } from './Quizzes';

vi.mock('../api', () => ({
  me: vi.fn(),
  checkCode: vi.fn(),
  listQuizzes: vi.fn(),
  createQuiz: vi.fn(),
  deleteQuiz: vi.fn(),
  createGame: vi.fn(),
  getAutopilotCheck: vi.fn(),
  getChallengeCheck: vi.fn(),
  listMyChallenges: vi.fn(),
  getMyProfile: vi.fn(),
  createAutopilotGame: vi.fn(),
}));

vi.mock('../quiz-io/actions');
vi.mock('../quiz-folders/folder-api', () => ({
  listFolders: vi.fn(),
  createFolder: vi.fn(),
  renameFolder: vi.fn(),
  reorderFolders: vi.fn(),
  deleteFolder: vi.fn(),
  moveQuizToFolder: vi.fn(),
}));
vi.mock('../library/library-api', () => ({ myLibrary: vi.fn(), openInLibrary: vi.fn(), closeInLibrary: vi.fn(), appealLibrary: vi.fn() }));

const account = { ok: true as const, id: 'u1', name: 'Олена', email: 'o@example.com', admin: false };
const summary = { id: 'q1', title: 'Географія', description: 'Про Україну', questionCount: 6, updatedAt: '2026-10-12T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z', folderId: null };

beforeEach(() => {
  // Відома людина (stale-while-revalidate) не переходить з тесту в тест.
  forgetAccount();
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(me).mockResolvedValue(account);
  vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [summary] });
  vi.mocked(listMyChallenges).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(myLibrary).mockResolvedValue({ ok: true, data: [] });
  vi.mocked(listFolders).mockResolvedValue({ ok: true, data: [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** Адреса для перевірки параметрів (як у Library.test.tsx). */
function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const open = (url = '/quizzes') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/quizzes"
          element={
            <>
              <Quizzes />
              <Where />
            </>
          }
        />
        <Route path="/login" element={<p>сторінка входу</p>} />
        <Route path="/host/:code" element={<p>пульт</p>} />
        <Route path="/play/:code" element={<p>телефон</p>} />
        <Route path="/quizzes/:id" element={<p>редактор</p>} />
        <Route path="/library" element={<p>бібліотека</p>} />
        <Route path="/" element={<p>головна</p>} />
      </Routes>
    </MemoryRouter>,
  );

const mineEntry = { quizId: 'q1', entryId: 'e1', listed: true, moderation: 'ok' as const, appealed: false, appealOpen: false, language: 'uk' as const, updatedAt: '2026-10-12T10:00:00.000Z', likes: 0, plays: 0 };

describe('Quizzes', () => {
  it('shows the library state of a quiz in its row', async () => {
    vi.mocked(myLibrary).mockResolvedValue({ ok: true, data: [mineEntry] });
    open();
    expect(await screen.findByText('📚 Відкрито для всіх')).toBeTruthy();
  });

  it('shows a quiz hidden by a moderator', async () => {
    vi.mocked(myLibrary).mockResolvedValue({ ok: true, data: [{ ...mineEntry, moderation: 'hidden' }] });
    open();
    expect(await screen.findByText('🚫 Приховано модератором')).toBeTruthy();
  });

  it('keeps the quiz list when the library state does not load', async () => {
    vi.mocked(myLibrary).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    expect(await screen.findByText('Географія')).toBeTruthy();
    expect(screen.queryByText('📚 Відкрито для всіх')).toBeNull();
  });

  it('opens the library sheet from the row; the library itself is a tab (77)', async () => {
    open();
    const tabs = await screen.findByRole('navigation', { name: 'Вікторини' });
    expect([...tabs.querySelectorAll('a')].map((a) => a.getAttribute('href'))).toEqual(['/quizzes', '/library', '/quizzes/liked']);
    expect(screen.getByRole('link', { name: 'Мої' }).getAttribute('aria-current')).toBe('page');
    expect(screen.queryByRole('link', { name: '📚 Бібліотека' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: '📚 Бібліотека' }));
    expect(await screen.findByRole('dialog', { name: '📚 Відкрити для всіх' })).toBeTruthy();
    expect(screen.getByText(t('libraryShareWarning'))).toBeTruthy();
  });

  it('sends a visitor without a session to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
    expect(listQuizzes).not.toHaveBeenCalled();
  });

  it('sends the host to sign in when the session ends while the list is open', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: false, error: 'unauthorized' });
    open();
    expect(await screen.findByText('сторінка входу')).toBeTruthy();
  });

  it('links to the host reference', async () => {
    open();
    const link = await screen.findByRole('link', { name: 'Довідка ведучого' });
    expect(link.getAttribute('href')).toBe('/help');
  });

  it('keeps the «Author: …» line of a copy on its own line', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [{ ...summary, description: 'Автор: Олена\nПро Україну' }] });
    open();
    const description = await screen.findByText((_, node) => node?.tagName === 'P' && node.textContent === 'Автор: Олена\nПро Україну');
    expect(description.classList.contains('quiz-description')).toBe(true);
    expect(description.getAttribute('dir')).toBe('auto');
  });

  it('lists the host’s quizzes', async () => {
    open();
    expect(await screen.findByText('Географія')).toBeTruthy();
    expect(screen.getByText('Запитань: 6')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Редагувати' }).getAttribute('href')).toBe('/quizzes/q1');
    expect(screen.getByRole('link', { name: 'Нова вікторина' }).getAttribute('href')).toBe('/quizzes/new');
  });

  it('invites to create the first quiz when there are none', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByText(/Тут з’являться ваші вікторини/)).toBeTruthy();
  });

  it('starts a game, remembers the host tokens and opens the control panel', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(createGame).toHaveBeenCalledWith('q1');
    expect(loadHost('123456')).toEqual({ hostToken: 'h', stageToken: 's' });
  });

  it('explains why a game could not be started', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: false, error: 'server_busy' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Сервер перевантажений. Спробуйте за хвилину.');
  });

  it('deletes a quiz only after confirmation and reloads the list', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    vi.mocked(deleteQuiz).mockResolvedValue({ ok: true });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Видалити' }));
    expect(deleteQuiz).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith('Видалити вікторину «Географія»? Це не можна скасувати.');

    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Видалити' }));
    await waitFor(() => expect(deleteQuiz).toHaveBeenCalledWith('q1'));
    await waitFor(() => expect(listQuizzes).toHaveBeenCalledTimes(2));
  });

  it('adds the example quiz', async () => {
    vi.mocked(createQuiz).mockResolvedValue({ ok: true, id: 'q2' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Додати приклад' }));
    await waitFor(() => expect(createQuiz).toHaveBeenCalledTimes(1));
    expect(roundQuestions(vi.mocked(createQuiz).mock.calls[0][0].rounds[0])).toHaveLength(8);
    await waitFor(() => expect(listQuizzes).toHaveBeenCalledTimes(2));
  });

  it('offers Export on each quiz and Import next to the new quiz', async () => {
    open();
    await screen.findByText('Географія');
    expect(screen.getAllByText('Експорт')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Імпорт' })).toBeTruthy();
  });

  it('imports a file, opens the editor and returns focus on close', async () => {
    vi.mocked(importQuizFile).mockResolvedValue({ ok: true, id: 'n1' });
    open();
    const button = await screen.findByRole('button', { name: 'Імпорт' });
    button.focus();
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: 'Імпорт вікторини' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'a.quiz')] } });
    expect(await screen.findByText('редактор')).toBeTruthy();
  });

  it('the challenge button and the active line', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [summary, { ...summary, id: 'q2', title: 'Історія' }] });
    vi.mocked(listMyChallenges).mockResolvedValue({ ok: true, data: [{ quizId: 'q1', code: 'abcdefghjkmn', expiresAt: new Date(Date.now() + 6.5 * 86_400_000).toISOString(), played: 2 }] });
    vi.mocked(getChallengeCheck).mockResolvedValue({ ok: true, data: { skipped: { rounds: [], questions: [], settings: [] }, empty: false, active: null } });
    open();
    await screen.findByText('Історія');
    const rows = screen.getAllByRole('listitem');
    const first = rows.find((row) => row.textContent!.includes('Географія'))!;
    const second = rows.find((row) => row.textContent!.includes('Історія'))!;
    await waitFor(() => expect(first.textContent).toContain('🏁 Виклик: лишилося 7 днів · зіграли 2 людини'));
    const link = [...first.querySelectorAll('a')].find((a) => a.textContent === 'Таблиця')!;
    expect(link.getAttribute('href')).toBe('/challenge/abcdefghjkmn');
    expect(second.textContent).not.toContain('лишилося');
    expect(screen.getAllByRole('button', { name: '🏁 Виклик' })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: '🏁 Виклик' })[1]!);
    expect(screen.getByRole('dialog', { name: 'Виклик другові' })).toBeTruthy();
    expect(getChallengeCheck).toHaveBeenCalledWith('q2');
  });

  it('has no sign-out button: it moved to the profile', async () => {
    open();
    await screen.findByText('Географія');
    expect(screen.queryByRole('button', { name: 'Вийти' })).toBeNull();
  });
});

describe('Quizzes: a game in progress', () => {
  it('remembers the game it starts', async () => {
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g1', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Грати' }));
    await screen.findByText('пульт');
    expect(loadLastGame()).toBe('123456');
  });

  it('offers a way back to a game that is still running', async () => {
    saveHost('654321', { hostToken: 'h', stageToken: 's' });
    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'question', title: 'Географія', locked: false, late: false });
    open();
    const link = await screen.findByRole('link', { name: 'Повернутися до гри 654 321' });
    expect(link.getAttribute('href')).toBe('/host/654321');
    expect(checkCode).toHaveBeenCalledWith('654321');
  });

  it('forgets a game that has ended or no longer exists', async () => {
    saveHost('654321', { hostToken: 'h', stageToken: 's' });
    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: false, error: 'game_not_found' });
    open();
    await screen.findByText('Географія');
    await waitFor(() => expect(loadLastGame()).toBeNull());
    expect(screen.queryByRole('link', { name: /Повернутися до гри/ })).toBeNull();

    saveLastGame('654321');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'finished', title: 'Географія', locked: false, late: false });
    cleanup();
    open();
    await screen.findByText('Географія');
    await waitFor(() => expect(loadLastGame()).toBeNull());
  });
});

describe('Quizzes: when the session check fails', () => {
  it('explains the problem instead of sending a signed-in host to sign in', async () => {
    vi.mocked(me).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    expect((await screen.findByRole('alert')).textContent).toBe('Немає зв’язку із сервером.');
    expect(screen.queryByText('сторінка входу')).toBeNull();
    expect(listQuizzes).not.toHaveBeenCalled();
  });

  it('opens the no-host launch for the quiz from «Провести ботом» and leaves «Грати» alone', async () => {
    vi.mocked(getAutopilotCheck).mockResolvedValue({ ok: true, blocked: [], changed: [] });
    vi.mocked(getMyProfile).mockResolvedValue({ ok: true, data: { nickname: 'Олена' } as never });
    vi.mocked(createGame).mockResolvedValue({ ok: true, gameId: 'g', code: '123456', hostToken: 'h', stageToken: 's' });
    open();
    fireEvent.click(await screen.findByRole('button', { name: t('autopilotLaunch') }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.textContent).toContain('Географія');
    expect(createGame).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: t('play') }));
    expect(await screen.findByText('пульт')).toBeTruthy();
    expect(createGame).toHaveBeenCalledWith('q1');
  });

  it('sends the back-to-game banner of an author game to the phone screen', async () => {
    saveAuthor('123456', { stageToken: 's' });
    saveLastGame('123456');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'lobby', title: 'Географія', locked: false, late: false });
    open();
    const banner = await screen.findByRole('link', { name: /123 456/ });
    expect(banner.getAttribute('href')).toBe('/play/123456');
  });

  it('a reused code with an old author key and a newer hosted game goes to the console', async () => {
    // Ключ автора лишився від давньої гри з тим самим кодом (його записано напряму, повз saveHost).
    localStorage.setItem('quiz:author:123456', JSON.stringify({ stageToken: 'old' }));
    localStorage.setItem('quiz:host:123456', JSON.stringify({ hostToken: 'h', stageToken: 's' }));
    saveLastGame('123456');
    vi.mocked(checkCode).mockResolvedValue({ ok: true, phase: 'lobby', title: 'Географія', locked: false, late: false });
    open();
    const banner = await screen.findByRole('link', { name: /123 456/ });
    expect(banner.getAttribute('href')).toBe('/host/123456');
  });
});

describe('Quizzes: dates and sort (73)', () => {
  // Сервер віддає за «нещодавно зміненими»; дати створення й назви — в іншому порядку.
  const three = [
    { ...summary, id: 'q1', title: 'Їжак', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-11-03T10:00:00.000Z' },
    { ...summary, id: 'q2', title: 'Гора', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
    { ...summary, id: 'q3', title: 'Ґанок', createdAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' },
  ];
  const titles = () => screen.getAllByRole('heading', { level: 2 }).map((one) => one.textContent);
  const sortSelect = () => screen.getByRole('combobox', { name: t('quizSort') }) as HTMLSelectElement;
  const where = () => screen.getByTestId('where').textContent;

  beforeEach(() => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: three });
  });

  it('shows the created day on every card', async () => {
    open();
    await screen.findByText('Їжак');
    expect(screen.getByText('Створено 2 вересня 2026 · змінено 3 листопада 2026')).toBeTruthy();
    expect(document.querySelectorAll('.quiz-dates time')).toHaveLength(3);
    expect(document.querySelector('.quiz-dates time')!.getAttribute('dateTime')).toBe('2026-09-02T10:00:00.000Z');
  });

  it('keeps the server order by default, with «Нещодавно змінені» picked and no sort in the address', async () => {
    open();
    await screen.findByText('Їжак');
    expect(titles()).toEqual(['Їжак', 'Гора', 'Ґанок']);
    expect(sortSelect().value).toBe('changed');
    expect(sortSelect().selectedOptions[0]!.textContent).toBe('Нещодавно змінені');
    expect(where()).toBe('/quizzes');
  });

  it('sorts oldest first and by Ukrainian name, keeping the sort in the address', async () => {
    open();
    await screen.findByText('Їжак');
    fireEvent.change(sortSelect(), { target: { value: 'old' } });
    expect(titles()).toEqual(['Гора', 'Їжак', 'Ґанок']);
    expect(where()).toBe('/quizzes?sort=old');
    fireEvent.change(sortSelect(), { target: { value: 'name' } });
    expect(titles()).toEqual(['Гора', 'Ґанок', 'Їжак']);
    expect(where()).toBe('/quizzes?sort=name');
    fireEvent.change(sortSelect(), { target: { value: 'changed' } });
    expect(where()).toBe('/quizzes');
  });

  it('opens with the sort from the address', async () => {
    open('/quizzes?sort=new');
    await screen.findByText('Їжак');
    expect(sortSelect().value).toBe('new');
    expect(titles()).toEqual(['Ґанок', 'Їжак', 'Гора']);
  });

  it('drops an unknown sort from the address', async () => {
    open('/quizzes?sort=zzz');
    await screen.findByText('Їжак');
    expect(sortSelect().value).toBe('changed');
    await waitFor(() => expect(where()).toBe('/quizzes'));
  });
});

describe('Quizzes: folders (73)', () => {
  const asya = { id: 'f1', name: 'Для Асі', position: 0, createdAt: '2026-11-01T10:00:00.000Z' };
  const kino = { id: 'f2', name: 'Кіно', position: 1, createdAt: '2026-11-01T10:00:00.000Z' };
  const three = [
    { ...summary, id: 'q1', title: 'Їжак', folderId: 'f1', updatedAt: '2026-11-03T10:00:00.000Z' },
    { ...summary, id: 'q2', title: 'Гора', updatedAt: '2026-11-02T10:00:00.000Z' },
    { ...summary, id: 'q3', title: 'Ґанок', updatedAt: '2026-11-01T10:00:00.000Z' },
  ];
  const chips = () => [...screen.getByRole('group', { name: t('quizFoldersLabel') }).querySelectorAll('button')].map((one) => one.textContent);
  const titles = () => screen.queryAllByRole('heading', { level: 2 }).map((one) => one.textContent);
  const where = () => screen.getByTestId('where').textContent;

  beforeEach(() => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: three });
    vi.mocked(listFolders).mockResolvedValue({ ok: true, data: [asya, kino] });
  });

  it('without folders shows no chips and no folder pick, but offers to manage them', async () => {
    vi.mocked(listFolders).mockResolvedValue({ ok: true, data: [] });
    open();
    expect(await screen.findByRole('button', { name: t('quizFoldersManage') })).toBeTruthy();
    expect(screen.queryByRole('group', { name: t('quizFoldersLabel') })).toBeNull();
    expect(screen.queryByRole('combobox', { name: t('quizFolderPick') })).toBeNull();
  });

  it('shows chips with counts in the author order, «Без категорії» last, «Усі» picked', async () => {
    open();
    await screen.findByText('Для Асі (1)');
    expect(chips()).toEqual(['Усі (3)', 'Для Асі (1)', 'Кіно (0)', 'Без категорії (2)']);
    expect(screen.getByRole('button', { name: 'Усі (3)' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getAllByRole('combobox', { name: t('quizFolderPick') })).toHaveLength(3);
  });

  it('filters by a folder, by «Без категорії», shows the empty texts and works with the sort', async () => {
    open('/quizzes?sort=name');
    fireEvent.click(await screen.findByRole('button', { name: 'Для Асі (1)' }));
    expect(titles()).toEqual(['Їжак']);
    expect(where()).toBe('/quizzes?sort=name&folder=f1');
    expect(screen.getByRole('button', { name: 'Для Асі (1)' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Без категорії (2)' }));
    expect(titles()).toEqual(['Гора', 'Ґанок']);
    expect(where()).toBe('/quizzes?sort=name&folder=none');
    fireEvent.click(screen.getByRole('button', { name: 'Кіно (0)' }));
    expect(titles()).toEqual([]);
    expect(screen.getByText('У цій категорії поки немає вікторин.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Усі (3)' }));
    expect(where()).toBe('/quizzes?sort=name');
  });

  it('says every quiz is in a folder when «Без категорії» is empty', async () => {
    vi.mocked(listQuizzes).mockResolvedValue({ ok: true, data: [three[0]!] });
    open('/quizzes?folder=none');
    expect(await screen.findByText('Усі вікторини вже в категоріях.')).toBeTruthy();
  });

  it('opens with the folder from the address and drops an unknown one', async () => {
    open('/quizzes?folder=f1');
    await screen.findByText('Для Асі (1)');
    expect(titles()).toEqual(['Їжак']);
    cleanup();
    open('/quizzes?folder=gone');
    await screen.findByText('Для Асі (1)');
    await waitFor(() => expect(where()).toBe('/quizzes'));
    expect(titles()).toHaveLength(3);
    expect(screen.getByRole('button', { name: 'Усі (3)' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('moves a quiz into a folder and updates the chip counts without reloading', async () => {
    vi.mocked(moveQuizToFolder).mockResolvedValue({ ok: true, folderId: 'f2' });
    open();
    await screen.findByText('Кіно (0)');
    const pick = screen.getAllByRole('combobox', { name: t('quizFolderPick') })[0] as HTMLSelectElement;
    expect(pick.value).toBe('f1');
    fireEvent.change(pick, { target: { value: 'f2' } });
    expect(await screen.findByText('Кіно (1)')).toBeTruthy();
    expect(screen.getByText('Для Асі (0)')).toBeTruthy();
    expect(moveQuizToFolder).toHaveBeenCalledWith('q1', 'f2');
    expect(listQuizzes).toHaveBeenCalledTimes(1);
  });

  it('puts the pick back and explains when the move fails', async () => {
    vi.mocked(moveQuizToFolder).mockResolvedValue({ ok: false, error: 'not_found' });
    open();
    await screen.findByText('Кіно (0)');
    const pick = screen.getAllByRole('combobox', { name: t('quizFolderPick') })[1] as HTMLSelectElement;
    fireEvent.change(pick, { target: { value: 'f2' } });
    expect((await screen.findByRole('alert')).textContent).toBe(t('err_not_found'));
    expect(pick.value).toBe('');
    expect(screen.getByText('Кіно (0)')).toBeTruthy();
  });

  it('keeps the quizzes when the folders do not load', async () => {
    vi.mocked(listFolders).mockResolvedValue({ ok: false, error: 'offline' });
    open();
    expect(await screen.findByText('Їжак')).toBeTruthy();
    expect(screen.queryByRole('group', { name: t('quizFoldersLabel') })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('opens the manager and turns quizzes of a deleted folder into «Без категорії»', async () => {
    const { deleteFolder } = await import('../quiz-folders/folder-api');
    vi.mocked(deleteFolder).mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    open('/quizzes?folder=f1');
    const manage = await screen.findByRole('button', { name: t('quizFoldersManage') });
    expect(manage.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(manage);
    expect(manage.getAttribute('aria-expanded')).toBe('true');
    const manager = screen.getByRole('region', { name: t('quizFoldersManage') });
    fireEvent.click(within(manager).getAllByRole('button', { name: t('quizFolderDelete') })[0]!);
    await waitFor(() => expect(chips()).toEqual(['Усі (3)', 'Кіно (0)', 'Без категорії (3)']));
    await waitFor(() => expect(where()).toBe('/quizzes'));
    expect(titles()).toHaveLength(3);
  });
});
