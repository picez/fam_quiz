import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Navigate } from 'react-router-dom';
import { BROADCAST_PEOPLE_MAX, BROADCAST_TEXT_MAX, BROADCAST_TITLE_MAX, BROADCAST_URL_MAX, isAnnouncementUrl, type AdminBotGroup, type AdminBroadcast as Row, type AdminBroadcastTo, type BroadcastRecipients } from '@quiz/shared';
import type { ApiData } from '../api';
import { timeText, viewerZone } from '../calendar/calendar-time';
import { formatDay } from '../format';
import { countText, errorText, t, type TextKey } from '../i18n';
import { nickText } from '../nick';
import { adminBroadcasts, previewBroadcast, sendBroadcast } from './admin-api';
import { PeoplePicker, type PickedPerson } from './PeoplePicker';
import { useAdminData } from './useAdminData';

const PREVIEW_DELAY_MS = 300;
/** Після відправки — ще одне перечитування: фон тим часом дорахує доставлені й помилки. */
const RECHECK_MS = 3_000;
const ICON = '/icon-192.png';

type ToKind = BroadcastRecipients['kind'];
const TO_KINDS: { kind: ToKind; key: TextKey }[] = [
  { kind: 'all', key: 'adminBroadcastToAll' },
  { kind: 'group', key: 'adminBroadcastToGroup' },
  { kind: 'people', key: 'adminBroadcastToPeople' },
];

const knownGroup = (groups: AdminBotGroup[], wanted: string): string => (groups.some((group) => group.id === wanted) ? wanted : (groups[0]?.id ?? ''));

/** Адресати запиту або null, поки вибір неповний (немає групи чи людей). */
function recipientsOf(to: ToKind, groupId: string, people: PickedPerson[]): BroadcastRecipients | null {
  if (to === 'group') return groupId === '' ? null : { kind: 'group', groupId };
  if (to === 'people') return people.length === 0 ? null : { kind: 'people', userIds: people.map((person) => person.id) };
  return { kind: 'all' };
}

const peopleText = (count: number): string => countText('adminBroadcastPeople', count, { count });

function toText(to: AdminBroadcastTo): string {
  switch (to.kind) {
    case 'all':
      return t('adminBroadcastShownAll');
    case 'group':
      return to.name === null ? t('adminBroadcastGroupGone') : t('adminBroadcastShownGroup', { name: to.name });
    case 'people':
      return t('adminBroadcastShownPeople', { names: to.people.map((person) => nickText(person.nickname)).join(', ') });
  }
}

function statusText(row: Row): string {
  if (row.status === 'sending') return t('adminBroadcastSending');
  if (row.status === 'interrupted') return t('adminBroadcastInterrupted');
  return t('adminBroadcastCounts', { delivered: row.delivered, failed: row.failed });
}

/** «Отримають N людей» для вибраних адресатів: перечитується із затримкою на кожну зміну вибору. */
function useAudience(recipients: BroadcastRecipients | null, enabled: boolean): { key: string; result: ApiData<{ people: number; push: number }> } | null {
  const key = recipients === null ? '' : JSON.stringify(recipients);
  const [state, setState] = useState<{ key: string; result: ApiData<{ people: number; push: number }> } | null>(null);
  useEffect(() => {
    if (!enabled || recipients === null) return;
    let current = true;
    const timer = setTimeout(() => {
      void previewBroadcast(recipients).then((result) => {
        if (current) setState({ key, result });
      });
    }, PREVIEW_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key описує recipients повністю
  }, [key, enabled]);
  return state !== null && state.key === key && recipients !== null ? state : null;
}

/** Вкладка «Розсилка» (59, 70): повідомлення адміна у «Вхідні» людей і, додатково, сповіщенням; ліміти й історія. */
export function AdminBroadcast(): JSX.Element {
  const state = useAdminData(adminBroadcasts, 'broadcast', { keep: true });
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [to, setTo] = useState<ToKind>('all');
  const [wantedGroup, setGroup] = useState('');
  const [people, setPeople] = useState<PickedPerson[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const recheck = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zone = viewerZone();

  const ready = state.status === 'ready' ? state.data : null;
  const groups = ready?.groups ?? [];
  const groupId = knownGroup(groups, wantedGroup);
  const recipients = recipientsOf(to, groupId, people);
  const audience = useAudience(recipients, ready !== null);
  const nextAt = ready?.limits.nextAt ?? null;
  const { reload } = state;

  /** Коли настане nextAt — перечитуємо ліміти, щоб кнопка ожила без оновлення сторінки. */
  useEffect(() => {
    if (nextAt === null) return;
    const timer = setTimeout(reload, Math.max(0, Date.parse(nextAt) - Date.now()) + 1_000);
    return () => clearTimeout(timer);
  }, [nextAt, reload]);
  useEffect(
    () => () => {
      if (recheck.current !== null) clearTimeout(recheck.current);
    },
    [],
  );

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
  const { rows, limits, pushOn } = state.data;

  const link = url.trim();
  const linkBad = link !== '' && !isAnnouncementUrl(link);
  const titleOk = title.trim() !== '' && title.trim().length <= BROADCAST_TITLE_MAX;
  const textOk = text.trim() !== '' && text.trim().length <= BROADCAST_TEXT_MAX;
  const count = audience?.result.ok === true ? audience.result.data.people : null;
  const waiting = nextAt !== null && Date.parse(nextAt) > Date.now();
  const canSend = titleOk && textOk && !linkBad && recipients !== null && count !== null && count > 0 && !waiting && !busy;

  const clear = () => {
    setTitle('');
    setText('');
    setUrl('');
    setTo('all');
    setPeople([]);
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSend || recipients === null || count === null) return;
    const input = { title: title.trim(), text: text.trim(), url: link === '' ? null : link, recipients };
    if (!window.confirm(t('adminBroadcastConfirm', { title: input.title, people: peopleText(count) }))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const result = await sendBroadcast(input);
    setBusy(false);
    if (result.ok) {
      setNotice(t('adminBroadcastSent'));
      clear();
      if (recheck.current !== null) clearTimeout(recheck.current);
      recheck.current = setTimeout(reload, RECHECK_MS);
    } else {
      const when = result.nextAt === undefined ? '' : ` ${t('adminBroadcastNextAt', { time: timeText(result.nextAt, zone) })}`;
      setError(`${errorText(result.error)}${when}`);
    }
    reload();
  };

  const audienceText =
    recipients === null || audience === null
      ? ''
      : !audience.result.ok
        ? errorText(audience.result.error)
        : count === 0
          ? t('adminBroadcastInboxNobody')
          : t('adminBroadcastInboxAudience', { people: audience.result.data.people, push: audience.result.data.push });

  return (
    <div className="admin-broadcast">
      <section className="panel" aria-labelledby="broadcast-new">
        <h2 id="broadcast-new">{t('adminTabBroadcast')}</h2>
          <>
            {!pushOn && <p className="meta">{t('adminBroadcastInboxNoPush')}</p>}
            <p className="meta">{t('adminBroadcastLead')}</p>
            <p className="meta">{t('adminBroadcastLastDay', { count: limits.lastDay, max: limits.dayMax })}</p>
            {waiting && nextAt !== null && <p className="meta">{t('adminBroadcastNextAt', { time: timeText(nextAt, zone) })}</p>}
            <form onSubmit={(e) => void send(e)}>
              <label className="field" htmlFor="broadcast-title">
                {t('adminBroadcastTitleLabel')}
              </label>
              <input id="broadcast-title" type="text" value={title} maxLength={BROADCAST_TITLE_MAX} dir="auto" autoComplete="off" aria-describedby="broadcast-title-count" onChange={(e) => setTitle(e.target.value)} />
              <p className="meta broadcast-count" id="broadcast-title-count">
                {t('adminBroadcastChars', { used: title.length, max: BROADCAST_TITLE_MAX })}
              </p>
              <label className="field" htmlFor="broadcast-text">
                {t('adminBroadcastTextLabel')}
              </label>
              <textarea id="broadcast-text" value={text} maxLength={BROADCAST_TEXT_MAX} rows={3} dir="auto" aria-describedby="broadcast-text-count" onChange={(e) => setText(e.target.value)} />
              <p className="meta broadcast-count" id="broadcast-text-count">
                {t('adminBroadcastChars', { used: text.length, max: BROADCAST_TEXT_MAX })}
              </p>
              <label className="field" htmlFor="broadcast-url">
                {t('adminBroadcastUrlLabel')}
              </label>
              <input id="broadcast-url" type="text" inputMode="url" dir="ltr" value={url} maxLength={BROADCAST_URL_MAX} autoComplete="off" aria-invalid={linkBad} aria-describedby="broadcast-url-hint broadcast-url-error" onChange={(e) => setUrl(e.target.value)} />
              <p className="meta" id="broadcast-url-hint">
                {t('adminBroadcastUrlHint')}
              </p>
              <p className="error broadcast-live" id="broadcast-url-error" role="alert">
                {linkBad ? t('adminBroadcastUrlBad') : ''}
              </p>
              <fieldset className="admin-broadcast-to">
                <legend>{t('adminBroadcastTo')}</legend>
                {TO_KINDS.map(({ kind, key }) => (
                  <label key={kind} className="field field-check" htmlFor={`broadcast-to-${kind}`}>
                    <input id={`broadcast-to-${kind}`} type="radio" name="broadcast-to" checked={to === kind} disabled={kind === 'group' && groups.length === 0} onChange={() => setTo(kind)} />
                    {t(key)}
                  </label>
                ))}
                {groups.length === 0 && <p className="meta">{t('adminBroadcastNoGroups')}</p>}
                {to === 'group' && groups.length > 0 && (
                  <label className="field compact" htmlFor="broadcast-group">
                    <span>{t('adminBroadcastToGroup')}</span>
                    <select id="broadcast-group" value={groupId} onChange={(e) => setGroup(e.target.value)}>
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {`${group.emoji} ${group.name}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {to === 'people' && <PeoplePicker id="broadcast" value={people} max={BROADCAST_PEOPLE_MAX} onChange={setPeople} />}
              </fieldset>
              <p className="meta broadcast-audience" role="status">
                {audienceText}
              </p>
              {(title.trim() !== '' || text.trim() !== '') && (
                <div className="broadcast-preview-wrap">
                  <h3>{t('adminBroadcastPreview')}</h3>
                  <div className="broadcast-preview">
                    <img src={ICON} alt="" width={40} height={40} />
                    <div>
                      <strong dir="auto">{title.trim()}</strong>
                      <p dir="auto">{text.trim()}</p>
                      {link !== '' && !linkBad && (
                        <p className="meta" dir="ltr">
                          {link}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              <p className="error broadcast-live" role="alert">
                {error ?? ''}
              </p>
              <p className="meta broadcast-live" role="status">
                {notice ?? ''}
              </p>
              <div className="admin-actions">
                <button type="submit" className="btn btn-primary" disabled={!canSend}>
                  {t('adminBroadcastSend')}
                </button>
              </div>
            </form>
          </>
      </section>
      <section className="panel" aria-labelledby="broadcast-history">
        <h2 id="broadcast-history">{t('adminBroadcastHistory')}</h2>
        {rows.length === 0 ? (
          <p className="meta">{t('adminBroadcastHistoryEmpty')}</p>
        ) : (
          <ul className="admin-list is-rows">
            {rows.map((row) => (
              <li key={row.id} className="admin-card">
                <p className="meta">
                  {`${formatDay(row.at)}, ${timeText(row.at, zone)}`} · <span dir="auto">{row.admin === null ? t('deletedPlayer') : nickText(row.admin)}</span>
                </p>
                <h3 dir="auto">{row.title}</h3>
                <p dir="auto">{row.text}</p>
                {row.url !== null && (
                  <p className="meta" dir="ltr">
                    {row.url}
                  </p>
                )}
                <p className="meta" dir="auto">
                  {toText(row.to)}
                </p>
                <p className="meta">{t('adminBroadcastRecipients', { count: row.people })}</p>
                <p className="meta">{t('adminBroadcastInboxStats', { people: row.people, read: row.read, push: row.pushPeople })}</p>
                <p className={`admin-mark tag ${row.status === 'sent' ? 'is-correct' : row.status === 'sending' ? 'is-pending' : 'is-muted'}`}>{statusText(row)}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
