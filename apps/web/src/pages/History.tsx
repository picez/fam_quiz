import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { GameSummary, SavedInfo } from '@quiz/shared';
import { deleteSavedGame, listGames, myHistory } from '../api';
import { HISTORY_TAB_PATH, landingTab, type HistoryTab } from '../history-landing';
import { formatDate } from '../format';
import { useContinueSaved } from '../host-game';
import { errorText, t } from '../i18n';
import { loadAuthor, loadHistoryTab, loadHost } from '../storage';
import { usePrivateData } from '../usePrivateData';
import { HistoryTabs } from './HistoryTabs';
import { EmptyState, Loading, LoadError } from '../ui/PageState';

/** Рядки картки, спільні для збереженої й завершеної гри. */
function GameFacts({ game }: { game: GameSummary }) {
  return (
    <>
      <h2>
        <Link to={`/history/${game.id}`} dir="auto">{game.title}</Link>
      </h2>
      <p className="meta">{`${formatDate(game.startedAt)}, ${t(`status_${game.status}`)}`}</p>
      {game.teams && <p className="meta team-game-mark">{t('historyTeamGame')}</p>}
      {game.autopilot && <p className="meta autopilot-mark">{t('historyAutopilot')}</p>}
      <p className="meta">{t('playersCount', { count: game.playerCount })}</p>
      <p className="meta">{t('questionsProgress', { played: game.questionsPlayed, total: game.questionCount })}</p>
    </>
  );
}

function savedNote(saved: SavedInfo): string | null {
  if (saved.open) return t('savedOpen');
  if (saved.mode === 'blocked') return t('savedBlocked');
  if (saved.mode === 'restart') return t('savedRestartNote');
  return null;
}

/** Куди повернутися до відкритого продовження: лише за кодом його кімнати й лише якщо ключі саме цього коду ще тут; інакше null. */
function returnPath(openCode: string | null): string | null {
  if (openCode === null) return null;
  if (loadHost(openCode) !== null) return `/host/${openCode}`;
  return loadAuthor(openCode) !== null ? `/play/${openCode}` : null;
}

/** Збережена гра (13b): «Продовжити» відкриває кімнату з новим кодом, «Видалити» прибирає запис. */
function SavedGame({ game, saved, onDeleted }: { game: GameSummary; saved: SavedInfo; onDeleted: () => void }) {
  const continueSaved = useContinueSaved();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = savedNote(saved);
  const back = saved.open ? returnPath(saved.openCode) : null;

  const resume = async () => {
    setBusy(true);
    setError(null);
    const failure = await continueSaved(game.id);
    setBusy(false);
    if (failure !== null) setError(errorText(failure));
  };

  const remove = async () => {
    if (!window.confirm(t('deleteSavedConfirm', { title: game.title }))) return;
    setBusy(true);
    setError(null);
    const result = await deleteSavedGame(game.id);
    setBusy(false);
    if (result.ok) onDeleted();
    else setError(errorText(result.error));
  };

  return (
    <li className="panel is-saved">
      <p className="saved-mark">{t('savedMark')}</p>
      <GameFacts game={game} />
      {note !== null && <p className="meta">{note}</p>}
      {back !== null && (
        <Link className="quiet-link" to={back}>
          {t('savedBackToGame')}
        </Link>
      )}
      <div className="saved-actions">
        <button type="button" className="btn btn-primary" disabled={busy || saved.open || saved.mode === 'blocked'} onClick={() => void resume()}>
          {t('continueGame')}
        </button>
        <button type="button" className="btn btn-danger" disabled={busy || saved.open} onClick={() => void remove()}>
          {t('deleteSaved')}
        </button>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </li>
  );
}

/**
 * 79: скільки ігор у «Зіграних» — лише коли вкладку на цьому пристрої ще не обирали (інакше не питаємо);
 * undefined — ще рахуємо, null — збій.
 */
function usePlayedCount(ask: boolean, signedIn: boolean): number | null | undefined {
  const [count, setCount] = useState<number | null | undefined>(undefined);
  useEffect(() => {
    if (!ask || !signedIn) return;
    let alive = true;
    void myHistory().then((result) => {
      if (alive) setCount(result.ok ? result.data.length : null);
    });
    return () => {
      alive = false;
    };
  }, [ask, signedIn]);
  return count;
}

export function History() {
  const [reads, setReads] = useState(0);
  const state = usePrivateData(listGames, String(reads));
  // Вибір вкладки читаємо раз: «Проведені», натиснуті щойно, вже записані до переходу сюди.
  const [chosen] = useState(loadHistoryTab);
  const played = usePlayedCount(chosen === null, state.status !== 'signed-out');
  // Вирішуємо раз за відкриття: видалена збережена гра (перечитування списку) не перекидає на «Зіграні».
  const decided = useRef<HistoryTab | null>(null);

  if (state.status === 'signed-out') return <Navigate to="/login?next=%2Fhistory" replace />;
  // 79: типова вкладка — та, де більше ігор, або обрана раніше на цьому пристрої.
  // Поки «Зіграні» ще рахуються — скелет списку замість «Проведених», щоб гравця не смикало; збій «Проведених» — лишаємось тут.
  const deciding = chosen === null && state.status === 'ready' && played === undefined;
  if (decided.current === null && (chosen !== null || (!deciding && state.status !== 'loading'))) decided.current = landingTab(chosen, state.status === 'ready' ? state.data.length : null, played ?? null);
  const tab = decided.current ?? 'hosted';
  if (tab !== 'hosted') return <Navigate to={HISTORY_TAB_PATH[tab]} replace />;

  const games = state.status === 'ready' && !deciding ? state.data : [];
  const saved = games.filter((game) => game.saved !== undefined);
  const done = games.filter((game) => game.saved === undefined);

  return (
    <main className="app wide">
      <HistoryTabs />
      <h1 className="brand">{t('historyTitle')}</h1>

      {(state.status === 'loading' || deciding) && <Loading list />}
      {state.status === 'error' && <LoadError message={state.message} onRetry={state.retry} />}
      {state.status === 'ready' && !deciding && games.length === 0 && (
        <EmptyState text={t('historyEmpty')}>
          <Link className="btn btn-primary" to="/create">
            {t('emptyHostGame')}
          </Link>
        </EmptyState>
      )}
      {saved.length > 0 && (
        <section aria-labelledby="saved-title" className="saved-games">
          <h2 id="saved-title">{t('savedTitle')}</h2>
          <ul className="quiz-list">
            {saved.map((game) => (
              <SavedGame key={game.id} game={game} saved={game.saved as SavedInfo} onDeleted={() => setReads((count) => count + 1)} />
            ))}
          </ul>
        </section>
      )}
      {done.length > 0 && (
        <ul className="quiz-list">
          {done.map((game) => (
            <li className="panel" key={game.id}>
              <GameFacts game={game} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
