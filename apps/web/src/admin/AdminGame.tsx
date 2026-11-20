import type { JSX } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { t } from '../i18n';
import { GameDetailView } from '../pages/GameHistory';
import { adminGame } from './admin-api';
import { useAdminData } from './useAdminData';

/** Є куди повертатися в межах застосунку (react-router пише idx у history.state); інакше «Назад» — до списку гравців. */
const cameHere = (): boolean => ((window.history.state as { idx?: number } | null)?.idx ?? 0) > 0;

/** Адмінський перегляд будь-якої гри (58): та сама сторінка, що й в історії гравця; «Назад» — туди, звідки прийшли; завершеної — «Повтор по кроках» (65). */
export function AdminGame(): JSX.Element {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const state = useAdminData(() => adminGame(id), id);
  if (state.status === 'home') return <Navigate to="/" replace />;
  const back = (
    <header className="bar">
      <Link
        className="quiet-link"
        to="/admin/users"
        onClick={(event) => {
          if (!cameHere()) return;
          event.preventDefault();
          navigate(-1);
        }}
      >
        {t('adminGameBack')}
      </Link>
      {state.status === 'ready' && state.data.status !== 'running' && (
        <Link className="quiet-link" to={`/admin/games/${encodeURIComponent(id)}/replay`}>
          {t('adminReplayOpen')}
        </Link>
      )}
    </header>
  );
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        {back}
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }
  return <GameDetailView game={state.data} back={back} heading="h2" />;
}
