import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { parseQuizSort, sortQuizzes, type ChallengeMine, type LibraryMine, type QuizFolder } from '@quiz/shared';
import { deleteQuiz, listMyChallenges, listQuizzes, type QuizSummary } from '../api';
import { ChallengeLaunch } from '../challenge/ChallengeLaunch';
import { daysLeftText, playedText } from '../challenge/challenge-text';
import { RunningGameBanner, addDemoQuiz, useStartGame } from '../host-game';
import { quizDatesText, quizSizeText } from '../format';
import { errorText, t } from '../i18n';
import { myLibrary } from '../library/library-api';
import { LibraryShare, libraryStatusText } from '../library/LibraryShare';
import { useAccount } from '../useAccount';
import { ExportMenu } from '../quiz-io/ExportMenu';
import { ImportDialog } from '../quiz-io/ImportDialog';
import { FolderFilter, filterByFolder, folderless, type FolderPick } from '../quiz-folders/FolderFilter';
import { FolderManager } from '../quiz-folders/FolderManager';
import { QuizSortField } from '../quiz-folders/QuizSortField';
import { listFolders, moveQuizToFolder } from '../quiz-folders/folder-api';
import { AutopilotLaunch } from './AutopilotLaunch';

const LOGIN = '/login?next=%2Fquizzes';

export function Quizzes() {
  const startGame = useStartGame();
  const account = useAccount();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [launch, setLaunch] = useState<QuizSummary | null>(null);
  const [challengeFor, setChallengeFor] = useState<QuizSummary | null>(null);
  const [challenges, setChallenges] = useState<ChallengeMine[]>([]);
  const [libraryFor, setLibraryFor] = useState<QuizSummary | null>(null);
  const [library, setLibrary] = useState<LibraryMine[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  // 73: особисті категорії; null — ще не прийшли чи не вдалося (тоді фільтра просто немає).
  const [folders, setFolders] = useState<QuizFolder[] | null>(null);
  const [managing, setManaging] = useState(false);
  const navigate = useNavigate();
  const signedIn = account.status === 'signed-in';
  const [params, setParams] = useSearchParams();
  const sortParam = params.get('sort');
  const sort = parseQuizSort(sortParam);
  const folderParam = params.get('folder');
  const folderKnown =
    folders !== null && folderParam !== null && (folderParam === 'none' ? folders.length > 0 : folders.some((one) => one.id === folderParam));
  const pick: FolderPick = folderKnown ? folderParam : null;

  // Найсвіжіші параметри: перехід роутера рендериться не одразу (transition), і друга зміна поспіль
  // (чип, тоді «Порядок») інакше взяла б старі параметри й повернула б щойно прибраний фільтр.
  const latest = useRef(params);
  useLayoutEffect(() => {
    latest.current = params;
  }, [params]);

  /** Міняє параметри адреси; типові значення («Усі», «Нещодавно змінені») з адреси прибираються. */
  const update = useCallback(
    (changes: Record<string, string>) => {
      const copy = new URLSearchParams(latest.current);
      for (const [key, value] of Object.entries(changes)) {
        if (value === '' || (key === 'sort' && value === 'changed')) copy.delete(key);
        else copy.set(key, value);
      }
      latest.current = copy;
      setParams(copy, { replace: true });
    },
    [setParams],
  );

  // Невідомий чи типовий порядок в адресі — прибрати, показується «Нещодавно змінені».
  useEffect(() => {
    if (sortParam !== null && (sortParam !== sort || sort === 'changed')) update({ sort: '' });
  }, [sortParam, sort, update]);

  // Невідома категорія (видалена, чуже посилання) — показуються «Усі», параметр прибирається.
  useEffect(() => {
    if (folders !== null && folderParam !== null && !folderKnown) update({ folder: '' });
  }, [folders, folderParam, folderKnown, update]);

  /** Показує помилку; закінчену сесію перетворює на перехід до входу. */
  const fail = useCallback((code: string) => {
    if (code === 'unauthorized') setExpired(true);
    else setError(errorText(code));
  }, []);

  const reload = useCallback(async () => {
    const [result, shelf] = await Promise.all([listQuizzes(), listFolders()]);
    if (result.ok) setQuizzes(result.data);
    else fail(result.error);
    // Категорії — додаткові: збій їхнього запиту не ховає вікторин.
    if (shelf.ok) setFolders(shelf.data);
    // Рядок про виклик — додатковий: якщо список викликів не прийшов, вікторини все одно видно.
    const active = await listMyChallenges();
    if (active.ok) setChallenges(active.data);
    // Так само — стан «у бібліотеці»: окремий запит, його збій не ховає вікторини.
    const shared = await myLibrary();
    if (shared.ok) setLibrary(shared.data);
  }, [fail]);

  useEffect(() => {
    if (signedIn) void reload();
  }, [signedIn, reload]);

  if (account.status === 'anonymous' || expired) return <Navigate to={LOGIN} replace />;
  if (account.status === 'unknown') {
    return (
      <main className="app narrow">
        <p className="error" role="alert">
          {errorText(account.error)}
        </p>
      </main>
    );
  }
  if (account.status === 'loading') {
    return (
      <main className="app narrow">
        <p className="lead">{t('loading')}</p>
      </main>
    );
  }

  /** Виконує дію зі списком, не даючи запустити другу одночасно. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    await action();
    setBusy(false);
  };

  const play = (quiz: QuizSummary) =>
    run(async () => {
      const error = await startGame(quiz.id);
      if (error !== null) fail(error);
    });

  const remove = (quiz: QuizSummary) => {
    if (!window.confirm(t('removeConfirm', { title: quiz.title }))) return;
    void run(async () => {
      const result = await deleteQuiz(quiz.id);
      if (!result.ok) return fail(result.error);
      await reload();
    });
  };

  /** Перекладає вікторину одразу в стані; якщо сервер відмовив — повертає як було й пояснює. */
  const moveTo = async (quiz: QuizSummary, folderId: string | null) => {
    const before = quiz.folderId;
    const place = (id: string | null) => setQuizzes((all) => all?.map((one) => (one.id === quiz.id ? { ...one, folderId: id } : one)) ?? all);
    setError(null);
    place(folderId);
    const result = await moveQuizToFolder(quiz.id, folderId);
    if (!result.ok) {
      place(before);
      fail(result.error);
    }
  };

  /** Новий список категорій з панелі; вікторини видаленої категорії стають «Без категорії» (так робить і сервер). */
  const foldersChanged = (next: QuizFolder[]) => {
    setFolders(next);
    setQuizzes((all) => all?.map((one) => (folderless(one.folderId, next) && one.folderId !== null ? { ...one, folderId: null } : one)) ?? all);
  };

  const addDemo = () =>
    run(async () => {
      const error = await addDemoQuiz();
      if (error !== null) return fail(error);
      await reload();
    });

  // Спершу фільтр категорії, потім порядок.
  const shown = quizzes === null || quizzes.length === 0 ? null : sortQuizzes(filterByFolder(quizzes, folders ?? [], pick), sort);

  return (
    <main className="app wide">
      <h1 className="brand">{t('quizzesTitle')}</h1>

      <RunningGameBanner enabled={signedIn} />

      <div className="toolbar">
        <Link className="btn btn-primary" to="/quizzes/new">
          {t('newQuiz')}
        </Link>
        <button type="button" className="btn" disabled={busy} onClick={addDemo}>
          {t('addDemo')}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={() => setImportOpen(true)}>
          {t('ioImport')}
        </button>
        <Link className="btn" to="/library">
          {t('libraryButton')}
        </Link>
        <Link className="btn" to="/help">
          {t('helpLink')}
        </Link>
      </div>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {quizzes === null && <p className="meta">{t('loading')}</p>}
      {quizzes !== null && quizzes.length === 0 && <p className="lead">{t('noQuizzes')}</p>}
      {quizzes !== null && quizzes.length > 0 && (
        <div className="quiz-folders">
          <div className="quiz-folder-bar">
            {folders !== null && folders.length > 0 && <FolderFilter folders={folders} quizzes={quizzes} pick={pick} onPick={(one) => update({ folder: one ?? '' })} />}
            {folders !== null && (
              <button type="button" className="btn btn-quiet quiz-folder-manage" aria-expanded={managing} onClick={() => setManaging((open) => !open)}>
                {t('quizFoldersManage')}
              </button>
            )}
          </div>
          <QuizSortField sort={sort} onChange={(one) => update({ sort: one })} />
          {folders !== null && managing && <FolderManager folders={folders} onChanged={foldersChanged} />}
        </div>
      )}
      {shown !== null && shown.length === 0 && <p className="meta">{t(pick === 'none' ? 'quizNoFolderEmptyList' : 'quizFolderEmptyList')}</p>}
      {shown !== null && shown.length > 0 && (
        <ul className="quiz-list">
          {shown.map((quiz) => (
            <li className="panel" key={quiz.id}>
              <div>
                <h2 dir="auto">{quiz.title}</h2>
                {quiz.description !== '' && (
                  <p className="meta quiz-description" dir="auto">
                    {quiz.description}
                  </p>
                )}
                <p className="meta quiz-dates">
                  <time dateTime={quiz.createdAt}>{quizDatesText(quiz)}</time>
                </p>
                <p className="meta">{quizSizeText(t('questionCount', { count: quiz.questionCount }), quiz.questionCount, quiz.truth)}</p>
                {library.filter((one) => one.quizId === quiz.id).map((one) => (
                  <p className="meta library-line" key={one.entryId}>
                    {libraryStatusText(one)}
                  </p>
                ))}
                {challenges.filter((one) => one.quizId === quiz.id).map((one) => (
                  <p className="meta challenge-line" key={one.code}>
                    {t('challengeActive', { days: daysLeftText(one.expiresAt), played: playedText(one.played) })}{' '}
                    <Link to={`/challenge/${one.code}`}>{t('challengeResultsLink')}</Link>
                  </p>
                ))}
                {folders !== null && folders.length > 0 && (
                  <label className="field quiz-folder-pick">
                    <span>{t('quizFolderPick')}</span>
                    <select value={folderless(quiz.folderId, folders) ? '' : quiz.folderId!} onChange={(event) => void moveTo(quiz, event.target.value === '' ? null : event.target.value)}>
                      <option value="">{t('quizFolderPickNone')}</option>
                      {folders.map((folder) => (
                        <option key={folder.id} value={folder.id} dir="auto">
                          {folder.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              <div className="toolbar">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={() => play(quiz)}>
                  {t('play')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setLaunch(quiz)}>
                  {t('autopilotLaunch')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setChallengeFor(quiz)}>
                  {t('challengeButton')}
                </button>
                <button type="button" className="btn" disabled={busy} onClick={() => setLibraryFor(quiz)}>
                  {t('libraryButton')}
                </button>
                <Link className="btn" to={`/quizzes/${quiz.id}`}>
                  {t('edit')}
                </Link>
                <ExportMenu quizId={quiz.id} disabled={busy} />
                <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove(quiz)}>
                  {t('remove')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {importOpen && <ImportDialog onClose={() => setImportOpen(false)} onImported={(id) => navigate(`/quizzes/${id}`)} />}
      {challengeFor !== null && (
        <ChallengeLaunch
          quiz={challengeFor}
          onClose={() => setChallengeFor(null)}
          onCreated={(mine) => setChallenges((all) => [...all.filter((one) => one.quizId !== mine.quizId), mine])}
        />
      )}
      {libraryFor !== null && (
        <LibraryShare
          quiz={libraryFor}
          entry={library.find((one) => one.quizId === libraryFor.id) ?? null}
          onClose={() => setLibraryFor(null)}
          onChanged={(mine) => setLibrary((all) => [...all.filter((one) => one.quizId !== libraryFor.id), ...(mine === null ? [] : [mine])])}
        />
      )}
      {launch !== null && <AutopilotLaunch quiz={launch} onClose={() => setLaunch(null)} />}
    </main>
  );
}
