import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { feedBadgeLabel, feedBadgeTotal } from '@quiz/shared';
import { checkCode } from '../api';
import { RunningGameBanner } from '../host-game';
import { errorText, t, type TextKey } from '../i18n';
import { MotifHero } from '../motifs/Motifs';
import { loadPlayer } from '../storage';
import { useAccount } from '../useAccount';
import { useFeedBadge } from '../useFeedBadge';
import { useInvites } from '../useInvites';

const JOIN_FORM = 'join-form';
/** Скільки чекати на перевірку входу, перш ніж показати гостю форму коду. */
export const ACCOUNT_WAIT_MS = 4000;

/** Форма коду гри: та сама для гостя й під плиткою «Доєднатись до гри». */
function JoinForm({ initialCode, autoFocus = false }: { initialCode: string; autoFocus?: boolean }): JSX.Element {
  const navigate = useNavigate();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const digits = code.replace(/\D/g, '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = await checkCode(digits);
    setBusy(false);
    if (!result.ok) setError(errorText(result.error));
    // Після старту повернутися може лише той, хто вже був у грі на цьому пристрої.
    else if (result.phase !== 'lobby' && loadPlayer(digits) === null) setError(errorText('game_started'));
    else navigate(`/play/${digits}`);
  };

  return (
    <form className="panel" id={JOIN_FORM} onSubmit={submit}>
      <h2>{t('joinTitle')}</h2>
      <label className="field">
        <span>{t('codeLabel')}</span>
        <input
          className="code-input"
          dir="ltr"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={7}
          placeholder="000 000"
          aria-describedby="code-hint"
          autoFocus={autoFocus}
        />
      </label>
      <p className="meta" id="code-hint">
        {t('codeHint')}
      </p>
      <button type="submit" className="btn btn-primary" disabled={digits.length !== 6 || busy}>
        {t(busy ? 'checking' : 'joinButton')}
      </button>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** Вміст плитки: значок (як у меню) у куті, емодзі й підпис. */
function TileFace({ icon, label, badge = null }: { icon: string; label: TextKey; badge?: string | null }): JSX.Element {
  return (
    <>
      {badge !== null && (
        <span className="menu-badge start-badge" aria-hidden="true">
          {badge}
        </span>
      )}
      <span className="start-icon" aria-hidden="true">
        {icon}
      </span>
      <span className="start-label">{t(label)}</span>
    </>
  );
}

function TileLink({ to, icon, label, badge = null, name }: { to: string; icon: string; label: TextKey; badge?: string | null; name?: string }): JSX.Element {
  return (
    <Link className="start-tile" to={to} aria-label={name}>
      <TileFace icon={icon} label={label} badge={badge} />
    </Link>
  );
}

/**
 * Стартове меню того, хто увійшов: 7 плиток (nav.start-menu), форма коду — під ними за плиткою «Доєднатись до гри».
 * Значки ті самі, що в меню: стрічка (useFeedBadge) і запрошення на профілі (useInvites). «Запитів у друзі» в застосунку
 * немає (дружба — односторонній follow), тож плитка «Друзі» без значка.
 */
function StartMenu({ initialCode }: { initialCode: string }): JSX.Element {
  const location = useLocation();
  // Відкрито з ?code= — форма вже розкрита; розкрита кліком — фокус одразу в поле коду.
  const [open, setOpen] = useState(initialCode !== '');
  const [clicked, setClicked] = useState(false);
  const invites = useInvites(true, location.key);
  const feedTotal = feedBadgeTotal(useFeedBadge(true));
  const feedLabel = feedBadgeLabel(feedTotal);

  return (
    <main className="app wide start">
      <MotifHero>
        <h1 className="brand">{t('appName')}</h1>
      </MotifHero>
      <RunningGameBanner enabled />
      <nav className="start-menu" aria-label={t('startMenuLabel')}>
        <TileLink to="/create" icon="🎬" label="startCreate" />
        <button
          type="button"
          className="start-tile"
          aria-expanded={open}
          aria-controls={open ? JOIN_FORM : undefined}
          onClick={() => {
            setClicked(true);
            setOpen(!open);
          }}
        >
          <TileFace icon="🎮" label="startJoin" />
        </button>
        <TileLink to="/profile/friends" icon="👥" label="profileTileFriends" />
        <TileLink
          to="/feed"
          icon="📰"
          label="menuFeed"
          badge={feedLabel}
          name={feedLabel ? `${t('menuFeed')}, ${t('feedBadge', { count: feedTotal })}` : undefined}
        />
        <TileLink to="/quizzes" icon="📝" label="menuQuizzes" />
        <TileLink to="/history" icon="🕘" label="menuHistory" />
        <TileLink
          to="/profile"
          icon="👤"
          label="menuProfile"
          badge={invites.length > 0 ? String(invites.length) : null}
          name={invites.length > 0 ? `${t('menuProfile')}, ${t('invitesBadge', { count: invites.length })}` : undefined}
        />
      </nav>
      {open && <JoinForm initialCode={initialCode} autoFocus={clicked} />}
    </main>
  );
}

export function Home() {
  const account = useAccount();
  const [params] = useSearchParams();
  // /?code=123456: форма розкрита й уже з кодом (такого посилання застосунок поки не дає, але адреса працює).
  const initialCode = (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6);

  // Якщо перевірка зависла, гість усе одно отримує форму за кілька секунд.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (account.status === 'signed-in') return <StartMenu initialCode={initialCode} />;

  // Поки не відомо, чи людина увійшла, лише шапка: тому, хто увійшов, замість форми з'явиться меню.
  const known = account.status !== 'loading' || waited;
  return (
    <main className="app narrow">
      <MotifHero>
        <h1 className="brand">{t('appName')}</h1>
        {known && <JoinForm initialCode={initialCode} />}
      </MotifHero>
      {known && (
        <Link className="quiet-link" to="/quizzes">
          {t('hostEntry')}
        </Link>
      )}
    </main>
  );
}
