import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { checkCode } from '../api';
import { errorText, t } from '../i18n';
import { MotifHero } from '../motifs/Motifs';
import { loadPlayer } from '../storage';
import { HomeFooter } from './HomeFooter';
import { NextUpCard } from './HomeTop';
import { LobbyList } from './LobbyList';
import { QuickStart } from './QuickStart';
import { WelcomeCard } from './WelcomeCard';
import { useAccount } from '../useAccount';
import { NumberInput } from '../ui/NumberInput';

/** Скільки чекати на перевірку входу, перш ніж показати гостю решту головної. */
export const ACCOUNT_WAIT_MS = 4000;

/** Форма коду гри: та сама для гостя й акаунта, відкрита з першого показу (78). */
function JoinForm({ initialCode }: { initialCode: string }): JSX.Element {
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
    // Після старту повернутися може лише той, хто вже був у грі на цьому пристрої; у продовжену гру пускає сервер (late).
    else if (result.phase !== 'lobby' && !result.late && loadPlayer(digits) === null) setError(errorText('game_started'));
    else navigate(`/play/${digits}`);
  };

  return (
    <form className="panel join-form" onSubmit={submit}>
      <h2>{t('joinTitle')}</h2>
      <label className="field">
        <span>{t('codeLabel')}</span>
        <NumberInput
          className="code-input"
          dir="ltr"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          autoComplete="off"
          maxLength={7}
          placeholder="000 000"
          aria-describedby="code-hint"
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

/**
 * Головна (78), зверху вниз. Акаунт: поле коду (одразу відкрите) і «Провести гру» → «З чого почати» (лише новачку) →
 * «Що далі» → «Відкриті ігри» → «Швидкий запуск» → низ. Гість: два рядки «що це», поле коду → «Що далі» (лише жива гра
 * цього пристрою) → «Відкриті ігри» → бібліотека й вхід → низ. Плиток-дублікатів меню більше немає.
 *
 * Поле коду стоїть на тому самому місці дерева в усіх станах: поки з'ясовується, чи людина увійшла, його вже можна
 * заповнювати, і набраний код не губиться, коли головна дорисовує решту.
 */
export function Home() {
  const account = useAccount();
  const [params] = useSearchParams();
  // /?code=123456: поле вже з кодом.
  const initialCode = (params.get('code') ?? '').replace(/\D/g, '').slice(0, 6);

  // Якщо перевірка зависла, гість усе одно отримує решту головної за кілька секунд.
  const [waited, setWaited] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), ACCOUNT_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  const signedIn = account.status === 'signed-in';
  const guest = !signedIn && (account.status !== 'loading' || waited);

  return (
    <main className={signedIn ? 'app wide start home' : 'app narrow home'}>
      <MotifHero>
        <h1 className="brand">{t('appName')}</h1>
        {guest && (
          <div className="home-about">
            <p>{t('homeGuestAbout')}</p>
            <p className="meta">{t('homeGuestHow')}</p>
          </div>
        )}
        <JoinForm initialCode={initialCode} />
        {signedIn && (
          <Link className="btn btn-primary home-host" to="/create">
            {t('startCreate')}
          </Link>
        )}
      </MotifHero>
      {signedIn && <WelcomeCard accountId={account.account.id} />}
      {/* Гостю картка — лише для живої гри цього пристрою. */}
      {(signedIn || guest) && <NextUpCard signedIn={signedIn} />}
      {(signedIn || guest) && <LobbyList />}
      {signedIn && <QuickStart />}
      {guest && (
        <div className="home-guest-links">
          <Link className="btn" to="/library">
            {t('homeGuestLibrary')}
          </Link>
          <Link className="btn btn-primary" to="/login">
            {t('homeGuestSignIn')}
          </Link>
        </div>
      )}
      {(signedIn || guest) && <HomeFooter />}
    </main>
  );
}
