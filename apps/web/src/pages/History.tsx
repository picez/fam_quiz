import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { GameSummary, SavedInfo } from '@quiz/shared';
import { continueGame, deleteSavedGame, listGames } from '../api';
import { formatDate } from '../format';
import { errorText, t } from '../i18n';
import { loadAuthor, loadHost, saveAuthor, saveHost, saveLastGame, savePlayer } from '../storage';
import { usePrivateData } from '../usePrivateData';
import { HistoryTabs } from './HistoryTabs';

/** Рядки картки, спільні для збереженої й завершеної гри. */
function GameFacts({ game }: { game: GameSummary }) {
  return (
    <>
      <h2>
        <Link to={`/history/${game.id}`}>{game.title}</Link>
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
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const note = savedNote(saved);
  const back = saved.open ? returnPath(saved.openCode) : null;

  const resume = async () => {
    setBusy(true);
    setError(null);
    const result = await continueGame(game.id);
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    saveLastGame(result.code);
    if ('token' in result) {
      savePlayer(result.code, result.token);
      saveAuthor(result.code, { stageToken: result.stageToken });
      navigate(`/play/${result.code}`);
    } else {
      saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
      navigate(`/host/${result.code}`);
    }
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

export function History() {
  const [reads, setReads] = useState(0);
  const state = usePrivateData(listGames, String(reads));

  if (state.status === 'signed-out') return <Navigate to="/login?next=%2Fhistory" replace />;

  const games = state.status === 'ready' ? state.data : [];
  const saved = games.filter((game) => game.saved !== undefined);
  const done = games.filter((game) => game.saved === undefined);

  return (
    <main className="app wide">
      <HistoryTabs />
      <h1 className="brand">{t('historyTitle')}</h1>

      {state.status === 'loading' && <p className="meta">{t('loading')}</p>}
      {state.status === 'error' && (
        <p className="error" role="alert">
          {state.message}
        </p>
      )}
      {state.status === 'ready' && games.length === 0 && <p className="lead">{t('historyEmpty')}</p>}
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
