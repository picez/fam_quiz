import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { checkCode } from '../api';
import { errorText, t } from '../i18n';
import { loadPlayer } from '../storage';
import { useAccount } from '../useAccount';

export function Home() {
  const navigate = useNavigate();
  const account = useAccount();
  const [code, setCode] = useState('');
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
    <main className="app narrow">
      <h1 className="brand">{t('appName')}</h1>
      <form className="panel" onSubmit={submit}>
        <h2>{t('joinTitle')}</h2>
        <label className="field">
          <span>{t('codeLabel')}</span>
          <input
            className="code-input"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            inputMode="numeric"
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
      {account.status !== 'signed-in' && (
        <Link className="quiet-link" to="/quizzes">
          {t('hostEntry')}
        </Link>
      )}
    </main>
  );
}
