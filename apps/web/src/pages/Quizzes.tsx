import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { parseQuizSort, sortQuizzes, type ChallengeMine, type LibraryMine, type QuizFolder } from '@quiz/shared';
import { deleteQuiz, listMyChallenges, listQuizzes, type QuizSummary } from '../api';
import { ChallengeLaunch } from '../challenge/ChallengeLaunch';
import { RunningGameBanner, addDemoQuiz, useStartGame } from '../host-game';
import { errorText, t } from '../i18n';
import { myLibrary } from '../library/library-api';
import { LibraryShare } from '../library/LibraryShare';
import { useAccount } from '../useAccount';
import { ImportDialog } from '../quiz-io/ImportDialog';
import { FolderFilter, filterByFolder, folderless, type FolderPick } from '../quiz-folders/FolderFilter';
import { FolderManager } from '../quiz-folders/FolderManager';
import { QuizSortField } from '../quiz-folders/QuizSortField';
import { listFolders, moveQuizToFolder } from '../quiz-folders/folder-api';
import { AutopilotLaunch } from './AutopilotLaunch';
import { Loading, LoadError } from '../ui/PageState';
import { QuizCard } from './QuizCard';
import { QuizzesTabs } from './QuizzesTabs';

const LOGIN = '/login?next=%2Fquizzes';

export function Quizzes() {
  const startGame = useStartGame();
  // 76: «Спробувати ще раз», коли не вдалося з'ясувати, хто на сторінці.
  const [accountTry, setAccountTry] = useState(0);
  const account = useAccount(accountTry === 0 ? undefined : accountTry);
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Збій самого списку (76): окремо від помилок дій. */
  const [loadError, setLoadError] = useState<string | null>(null);
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
    if (result.ok) {
      setQuizzes(result.data);
      setLoadError(null);
    } else if (result.error === 'unauthorized') setExpired(true);
    else setLoadError(errorText(result.error));
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
        <LoadError message={errorText(account.error)} onRetry={() => setAccountTry((n) => n + 1)} />
      </main>
    );
  }
  if (account.status === 'loading') {
    // 81: та сама ширина й вкладки, що й у готового списку, — перехід з «Бібліотеки» чи «Вподобаних» не смикає сторінку.
    return (
      <main className="app wide">
        <QuizzesTabs />
        <Loading />
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
      // Категорію могли видалити в іншій вкладці — оновити список, щоб її не було у виборі.
      if (result.error === 'not_found') {
        const shelf = await listFolders();
        if (shelf.ok) setFolders(shelf.data);
      }
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
      <QuizzesTabs />
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
        <Link className="btn" to="/help">
          {t('helpLink')}
        </Link>
      </div>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {quizzes === null && loadError === null && <Loading list />}
      {quizzes === null && loadError !== null && (
        <LoadError
          message={loadError}
          onRetry={() => {
            setLoadError(null);
            void reload();
          }}
        />
      )}
      {quizzes !== null && loadError !== null && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
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
            <QuizCard
              key={quiz.id}
              quiz={quiz}
              busy={busy}
              library={library.filter((one) => one.quizId === quiz.id)}
              challenges={challenges.filter((one) => one.quizId === quiz.id)}
              folders={folders}
              actions={{
                onPlay: () => void play(quiz),
                onAutopilot: () => setLaunch(quiz),
                onChallenge: () => setChallengeFor(quiz),
                onLibrary: () => setLibraryFor(quiz),
                onRemove: () => remove(quiz),
                onMove: (folderId) => void moveTo(quiz, folderId),
              }}
            />
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
