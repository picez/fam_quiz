import { useState, type FormEvent, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { ANNOUNCEMENT_TEXT_MAX, ANNOUNCEMENT_URL_MAX, isAnnouncementUrl, type Announcement } from '@quiz/shared';
import { AnnouncementView } from '../announcement/AnnouncementView';
import { dayHeading, isoToLocalInput, localInputToIso, timeText, viewerZone } from '../calendar/calendar-time';
import { errorText, t } from '../i18n';
import { adminAnnouncement, clearAnnouncement, saveAnnouncement } from './admin-api';
import { useAdminData } from './useAdminData';

/** Вкладка «Оголошення»: що показується зараз, форма нового (замінює чинне), прибрати. */
export function AdminAnnouncement(): JSX.Element {
  const state = useAdminData(adminAnnouncement, 'announcement');
  const [published, setPublished] = useState<Announcement | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [forever, setForever] = useState(true);
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const zone = viewerZone();

  if (state.status === 'home') return <Navigate to="/" replace />;
  if (state.status === 'loading') return <p className="meta">{t('loading')}</p>;
  if (state.status === 'error') {
    return (
      <>
        <p className="error" role="alert">
          {state.message}
        </p>
        <button type="button" className="btn" onClick={state.reload}>
          {t('prizesRetry')}
        </button>
      </>
    );
  }

  const current = published === undefined ? state.data.announcement : published;
  const link = url.trim();
  const linkBad = link !== '' && !isAnnouncementUrl(link);
  const expiresAt = forever ? null : localInputToIso(until, zone);
  const ready = text.trim() !== '' && !linkBad && (forever || expiresAt !== null);

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await saveAnnouncement({ text: text.trim(), url: link === '' ? null : link, expiresAt });
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setPublished(result.data);
    setNotice(t('adminAnnounceSaved'));
  };

  const remove = async () => {
    if (!window.confirm(t('adminAnnounceClearConfirm'))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await clearAnnouncement();
    setBusy(false);
    if (!result.ok) {
      setError(errorText(result.error));
      return;
    }
    setPublished(null);
  };

  return (
    <div className="admin-announce">
      <section className="panel">
        <h2>{t('adminAnnounceCurrent')}</h2>
        {current === null ? (
          <p className="meta">{t('adminAnnounceNone')}</p>
        ) : (
          <>
            <AnnouncementView announcement={current} />
            {current.expiresAt !== null && <p className="meta">{t('adminAnnounceExpires', { date: `${dayHeading(current.expiresAt, zone)}, ${timeText(current.expiresAt, zone)}` })}</p>}
            <div className="admin-actions">
              <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>
                {t('adminAnnounceClear')}
              </button>
            </div>
          </>
        )}
      </section>
      <form className="panel" onSubmit={(e) => void publish(e)}>
        <label className="field" htmlFor="announce-text">
          {t('adminAnnounceText')}
        </label>
        <textarea id="announce-text" value={text} maxLength={ANNOUNCEMENT_TEXT_MAX} rows={3} dir="auto" onChange={(e) => setText(e.target.value)} />
        <p className="meta">{t('adminAnnounceCount', { count: text.length, max: ANNOUNCEMENT_TEXT_MAX })}</p>
        <label className="field" htmlFor="announce-url">
          {t('adminAnnounceUrl')}
        </label>
        <input id="announce-url" type="text" inputMode="url" value={url} maxLength={ANNOUNCEMENT_URL_MAX} aria-invalid={linkBad} onChange={(e) => setUrl(e.target.value)} />
        {linkBad ? (
          <p className="error" role="alert">
            {t('adminAnnounceUrlHint')}
          </p>
        ) : (
          <p className="meta">{t('adminAnnounceUrlHint')}</p>
        )}
        <fieldset className="admin-announce-until">
          <legend>{t('adminAnnounceUntil')}</legend>
          <label className="field field-check" htmlFor="announce-forever">
            <input id="announce-forever" type="radio" name="announce-until" checked={forever} onChange={() => setForever(true)} />
            {t('adminAnnounceForever')}
          </label>
          <label className="field field-check" htmlFor="announce-date">
            <input id="announce-date" type="radio" name="announce-until" checked={!forever} onChange={() => setForever(false)} />
            {t('adminAnnounceDate')}
          </label>
          {!forever && (
            <input
              type="datetime-local"
              aria-label={t('adminAnnounceDate')}
              value={until}
              min={isoToLocalInput(new Date().toISOString(), zone)}
              onChange={(e) => setUntil(e.target.value)}
            />
          )}
        </fieldset>
        {text.trim() !== '' && (
          <div className="admin-announce-preview">
            <h3>{t('adminAnnouncePreview')}</h3>
            <AnnouncementView announcement={{ text: text.trim(), url: link === '' || linkBad ? null : link }} />
          </div>
        )}
        {error !== null && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {notice !== null && (
          <p className="meta" role="status">
            {notice}
          </p>
        )}
        <div className="admin-actions">
          <button type="submit" disabled={!ready || busy}>
            {current === null ? t('adminAnnouncePublish') : t('adminAnnounceReplace')}
          </button>
        </div>
      </form>
    </div>
  );
}
