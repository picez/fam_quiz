import { useEffect, useState, type FormEvent, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PROBLEM_TEXT_MAX, type MyProblemReport } from '@quiz/shared';
import { myProblemReports, sendProblemReport } from '../api';
import { formatDate } from '../format';
import { errorText, t } from '../i18n';
import { LOCALE_NAMES } from '../locales/locales';
import { useAccount } from '../useAccount';
import { clearMoment, readMoment } from './problem-moment';
import { pageSnapshot } from './problem-page';
import { BackLink } from '../nav/BackLink';
import { pageTitle } from '../nav/page-meta';

/** Куди «назад» з повідомлення про проблему (76): сторінка з ?from=, якщо це сторінка сайту поза грою; інакше головна. */
function reportParent(from: string): string {
  if (!from.startsWith('/') || from.startsWith('//')) return '/';
  const path = from.split(/[?#]/)[0];
  return path === '/report' || pageTitle(path) === null ? '/' : from;
}

type Mine = { status: 'loading' } | { status: 'ready'; items: MyProblemReport[] } | { status: 'error'; error: string };

/**
 * /report (64): «Щось не працює?» — текст до 1000 символів і (за бажанням) відомості про сторінку, з якої людина прийшла
 * (?from=, лише шлях). Надіслати може й гість; акаунт бачить «Мої повідомлення» з відповідями адміністратора.
 */
export function ProblemReport(): JSX.Element {
  const [params] = useSearchParams();
  const from = params.get('from') ?? '/report';
  const account = useAccount();
  const accountId = account.status === 'signed-in' ? account.account.id : null;
  const [text, setText] = useState('');
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mine, setMine] = useState<Mine>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (accountId === null) return;
    let current = true;
    void myProblemReports().then((result) => {
      if (!current) return;
      setMine(result.ok ? { status: 'ready', items: result.data } : { status: 'error', error: result.error });
    });
    return () => {
      current = false;
    };
  }, [accountId, reload]);

  const page = pageSnapshot(from);
  // 70: момент гри, з якої людина прийшла (той самий код кімнати, не старший за 30 хв).
  const [game] = useState(() => readMoment(from));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || text.trim() === '') return;
    setBusy(true);
    setError(null);
    setSent(false);
    const result = await sendProblemReport({ text: text.trim(), page: attach ? pageSnapshot(from) : null, game: attach ? game : null });
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setText('');
    if (game !== null) clearMoment();
    setSent(true);
    setReload((n) => n + 1);
  };

  return (
    <main className="app problem-page">
      <BackLink parent={reportParent(from)} />
      <h1>{t('problemLink')}</h1>
      <form className="panel problem-form" onSubmit={(e) => void submit(e)}>
        <h2>{t('problemReportTitle')}</h2>
        <p className="meta">{t('problemLead')}</p>
        <label className="field" htmlFor="problem-text">
          <span>{t('problemTextLabel')}</span>
          <textarea
            id="problem-text"
            value={text}
            maxLength={PROBLEM_TEXT_MAX}
            rows={5}
            dir="auto"
            aria-describedby="problem-text-count"
            onChange={(e) => {
              setText(e.target.value.slice(0, PROBLEM_TEXT_MAX));
              setSent(false);
            }}
          />
        </label>
        <p className="meta problem-count" id="problem-text-count">
          {t('problemChars', { used: text.length, max: PROBLEM_TEXT_MAX })}
        </p>
        <label className="field field-check" htmlFor="problem-attach">
          <input id="problem-attach" type="checkbox" checked={attach} aria-describedby="problem-attach-hint" onChange={(e) => setAttach(e.target.checked)} />
          {t('problemAttach')}
        </label>
        <p className="meta" id="problem-attach-hint">
          {t('problemAttachHint')}
        </p>
        {attach && (
          <ul className="problem-page-info">
            {game !== null && <li dir="auto">{game.round === null || game.question === null || game.question < 0 ? t('problemPageGameLobby', { code: game.code }) : t('problemPageGame', { code: game.code, round: game.round + 1, question: game.question + 1 })}</li>}
            <li dir="auto">{t('problemPagePath', { path: page.path })}</li>
            <li dir="auto">{t('problemPageBrowser', { browser: page.browser })}</li>
            <li dir="auto">{t('problemPageScreen', { screen: page.screen })}</li>
            <li dir="auto">{t('problemPageLang', { lang: LOCALE_NAMES[page.lang] })}</li>
            <li dir="auto">{t('problemPageTheme', { theme: t(page.theme === 'light' ? 'problemThemeLight' : 'problemThemeDark') })}</li>
          </ul>
        )}
        {account.status === 'anonymous' && <p className="meta">{t('problemGuestHint')}</p>}
        {/* Живі області стоять з першого показу (порожні), щоб читач екрана почув і першу помилку. */}
        <div className="problem-live">
          <p className="error" role="alert">
            {error ?? ''}
          </p>
          <p className="meta" role="status">
            {sent ? t('problemSent') : ''}
          </p>
        </div>
        <div className="toolbar">
          <button type="submit" className="btn btn-primary" disabled={busy || text.trim() === ''}>
            {t('problemSend')}
          </button>
        </div>
      </form>
      {accountId !== null && (
        <section className="panel problem-mine" aria-labelledby="problem-mine-title">
          <h2 id="problem-mine-title">{t('problemMine')}</h2>
          {mine.status === 'loading' && <p className="meta">{t('loading')}</p>}
          {mine.status === 'error' && <p className="meta">{errorText(mine.error)}</p>}
          {mine.status === 'ready' && mine.items.length === 0 && <p className="meta">{t('problemMineEmpty')}</p>}
          {mine.status === 'ready' && mine.items.length > 0 && (
            <ul className="problem-mine-list">
              {mine.items.map((item) => (
                <li key={item.id} className="problem-mine-item">
                  <p className="meta problem-mine-head">
                    <span>{formatDate(item.at)}</span>
                    <span className={item.status === 'resolved' ? 'problem-status is-resolved' : 'problem-status'}>{t(item.status === 'resolved' ? 'problemResolved' : 'problemOpen')}</span>
                  </p>
                  <p className="problem-mine-text" dir="auto">
                    {item.text}
                  </p>
                  {item.reply !== null && (
                    <p className="problem-reply" dir="auto">
                      {t('problemReplyFrom', { text: item.reply })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
