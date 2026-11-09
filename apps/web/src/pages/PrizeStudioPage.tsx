import type { PrizeContent } from '@quiz/shared';
import { useState, type JSX } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { createPrize, myPrizes, updatePrize } from '../api';
import { errorText, t } from '../i18n';
import { PrizeStudio } from '../prizes/PrizeStudio';
import { loginFor, ProfileSubpage } from '../profile/ProfileSubpage';
import { useMyProfile } from '../profile/useMyProfile';
import { usePrivateData } from '../usePrivateData';

const STORE = '/profile/prizes';

/** Редактор призу: /profile/prizes/new — новий, /profile/prizes/:id — наявний (зарезервований лише для перегляду). */
export function PrizeStudioPage(): JSX.Element {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const store = usePrivateData(myPrizes);
  const { state: profile } = useMyProfile();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (store.status === 'signed-out' || profile.status === 'signed-out') return <Navigate to={loginFor(location.pathname + location.search)} replace />;
  // Новому призу склад не потрібен, лише рівень.
  const failed = profile.status === 'error' ? profile : id !== undefined && store.status === 'error' ? store : null;
  if (failed !== null) return <Message text={failed.message} alert />;
  if (profile.status !== 'ready' || (id !== undefined && store.status !== 'ready')) return <Message text={t('loading')} alert={false} />;

  const item = id === undefined || store.status !== 'ready' ? null : (store.data.find((entry) => entry.id === id) ?? null);
  if (id !== undefined && item === null) return <Message text={t('studioNotFound')} alert={false} />;

  const save = async (content: PrizeContent) => {
    setBusy(true);
    setError(null);
    const result = id === undefined ? await createPrize(content) : await updatePrize(id, content);
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    navigate(STORE);
  };

  return (
    <PrizeStudio
      key={id ?? 'new'}
      initial={item?.content ?? null}
      readOnly={item !== null && item.status !== 'free'}
      level={profile.data.level.progress.level}
      busy={busy}
      error={error}
      onSave={(content) => void save(content)}
      onCancel={() => navigate(STORE)}
    />
  );
}

/** Поки вантажимо, збій чи невідомий приз: звичайна підсторінка з «Назад» на склад. */
function Message({ text, alert }: { text: string; alert: boolean }): JSX.Element {
  return (
    <ProfileSubpage title={null} back={STORE}>
      {alert ? (
        <p className="error" role="alert">
          {text}
        </p>
      ) : (
        <p className="meta">{text}</p>
      )}
    </ProfileSubpage>
  );
}
