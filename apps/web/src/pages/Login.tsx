import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { signIn, signUp } from '../api';
import { errorText, t } from '../i18n';

const MIN_PASSWORD = 8;

/** Адреса повернення має бути шляхом усередині застосунку, а не чужим сайтом. */
function safeNext(next: string | null): string {
  // Один слеш на початку й жодних зворотних слешів чи керівних символів: браузери
  // трактують "/\\host" і "/<tab>/host" як адресу іншого сайта.
  const local = next !== null && /^\/(?![/\\])/.test(next) && !/[\\\u0000-\u001f]/.test(next);
  return local ? next : '/quizzes';
}

export function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [registering, setRegistering] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready =
    email.trim() !== '' &&
    (registering ? name.trim().length >= 2 && password.length >= MIN_PASSWORD : password !== '');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const result = registering ? await signUp(name.trim(), email.trim(), password) : await signIn(email.trim(), password);
    setBusy(false);
    if (result.ok) navigate(safeNext(params.get('next')), { replace: true });
    else setError(errorText(result.error));
  };

  return (
    <main className="app narrow">
      <h1 className="brand">{t(registering ? 'registerTitle' : 'loginTitle')}</h1>
      <form className="panel" onSubmit={submit}>
        {registering && (
          <label className="field">
            <span>{t('nicknameLabel')}</span>
            <input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>{t('emailLabel')}</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={200}
            autoComplete="email"
          />
        </label>
        <label className="field">
          <span>{t('passwordLabel')}</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            maxLength={128}
            autoComplete={registering ? 'new-password' : 'current-password'}
            aria-describedby={registering ? 'password-hint' : undefined}
          />
        </label>
        {registering && (
          <p className="meta" id="password-hint">
            {t('passwordHint')}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={!ready || busy}>
          {t(busy ? 'checking' : registering ? 'registerButton' : 'joinButton')}
        </button>
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <button
        type="button"
        className="btn btn-quiet"
        onClick={() => {
          setRegistering(!registering);
          setError(null);
        }}
      >
        {t(registering ? 'haveAccount' : 'createAccount')}
      </button>
      <Link className="quiet-link" to="/">
        {t('backHome')}
      </Link>
    </main>
  );
}
