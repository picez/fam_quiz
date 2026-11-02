import type { CalendarEvent, CalendarInput, CalendarPage } from '@quiz/shared';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  cancelCalendarEvent,
  createCalendarEvent,
  decideCalendarRequest,
  getCalendar,
  listQuizzes,
  markCalendarSeen,
  openCalendarGame,
  requestCalendarEvent,
  updateCalendarEvent,
  withdrawCalendarRequest,
  type QuizSummary,
} from '../api';
import { dayHeading, dayKey, viewerZone } from '../calendar/calendar-time';
import { CalendarCard, type CalendarAction } from '../calendar/CalendarCard';
import { CalendarForm } from '../calendar/CalendarForm';
import { FeedTabs } from '../feed/FeedTabs';
import { errorText, t } from '../i18n';
import { saveHost } from '../storage';
import { announceFeedSeen, useFeedBadge } from '../useFeedBadge';
import { usePrivateData } from '../usePrivateData';

const LOGIN = '/login?next=%2Ffeed%2Fcalendar';

/** Календар (/feed/calendar): заплановані ігри мої й друзів. */
export function Calendar(): JSX.Element {
  const { key } = useLocation();
  const [attempt, setAttempt] = useState(0);
  const state = usePrivateData(async () => {
    const result = await getCalendar();
    if (!result.ok) return result;
    const { ok: _ok, ...data } = result;
    return { ok: true as const, data: data as CalendarPage };
  }, `${key}:${attempt}`);
  if (state.status === 'signed-out') return <Navigate to={LOGIN} replace />;
  if (state.status === 'loading') return <main className="app wide"><p className="meta">{t('loading')}</p></main>;
  if (state.status === 'error')
    return (
      <main className="app wide">
        <p className="error" role="alert">
          {t('calendarError')}
        </p>
        <button type="button" className="secondary" onClick={() => setAttempt((n) => n + 1)}>
          {t('prizesRetry')}
        </button>
      </main>
    );
  return <CalendarList key={state.data.asOf} first={state.data} />;
}

interface FormState {
  event?: CalendarEvent;
  quizzes: QuizSummary[];
  now: Date;
}

function CalendarList({ first }: { first: CalendarPage }): JSX.Element {
  const [events, setEvents] = useState<CalendarEvent[]>(first.events);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const badge = useFeedBadge(true);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const zone = useMemo(() => viewerZone(), []);
  const now = useMemo(() => new Date(), []);
  const marked = useRef(false);

  useEffect(() => {
    if (marked.current) return;
    marked.current = true;
    void markCalendarSeen(first.asOf).then((result) => {
      if (result.ok) announceFeedSeen();
    });
  }, [first.asOf]);

  useEffect(() => {
    if (hash.length < 2) return;
    document.getElementById(decodeURIComponent(hash.slice(1)))?.scrollIntoView?.({ block: 'center' });
  }, [hash]);

  const reload = async () => {
    const result = await getCalendar();
    if (result.ok) {
      setEvents(result.events);
      announceFeedSeen();
    } else setError(errorText(result.error));
  };

  const openForm = async (event?: CalendarEvent) => {
    setError(null);
    setBusy(true);
    const result = await listQuizzes();
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    setForm({ event, quizzes: result.data, now: new Date() });
  };

  const save = async (input: CalendarInput): Promise<string | null> => {
    const editing = form?.event;
    const result = editing ? await updateCalendarEvent(editing.id, input) : await createCalendarEvent(input);
    if (!result.ok) return errorText(result.error);
    setForm(null);
    await reload();
    return null;
  };

  const run = async (event: CalendarEvent, action: CalendarAction) => {
    if (action === 'edit') return void openForm(event);
    if (action === 'cancel' && !window.confirm(t('calendarCancelConfirm', { title: event.title }))) return;
    setError(null);
    setBusy(true);
    if (action === 'open') {
      const result = await openCalendarGame(event.id);
      setBusy(false);
      if (!result.ok) {
        setError(errorText(result.error));
        return void reload();
      }
      saveHost(result.code, { hostToken: result.hostToken, stageToken: result.stageToken });
      return navigate(`/host/${result.code}`);
    }
    const result =
      action === 'request'
        ? await requestCalendarEvent(event.id)
        : action === 'withdraw'
          ? await withdrawCalendarRequest(event.id)
          : action === 'cancel'
            ? await cancelCalendarEvent(event.id)
            : await decideCalendarRequest(event.id, action.decide, action.decision);
    if (!result.ok) setError(errorText(result.error));
    await reload();
    setBusy(false);
  };

  const days = useMemo(() => {
    const groups: { key: string; first: string; events: CalendarEvent[] }[] = [];
    for (const event of events) {
      const key = dayKey(event.startsAt, zone);
      const last = groups[groups.length - 1];
      if (last?.key === key) last.events.push(event);
      else groups.push({ key, first: event.startsAt, events: [event] });
    }
    return groups;
  }, [events, zone]);

  return (
    <main className="app wide feed-page">
      <FeedTabs badge={badge} />
      {form === null ? (
        <button type="button" disabled={busy} onClick={() => void openForm()}>
          {t('calendarNew')}
        </button>
      ) : (
        <CalendarForm
          key={form.event?.id ?? 'new'}
          initial={form.event}
          quizzes={form.quizzes}
          zone={zone}
          now={form.now}
          onSubmit={save}
          onCancel={() => setForm(null)}
        />
      )}
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {events.length === 0 ? (
        <p className="meta feed-empty">{t('calendarEmpty')}</p>
      ) : (
        days.map((day) => (
          <section key={day.key} className="calendar-day">
            <h2>{dayHeading(day.first, zone, now)}</h2>
            <ol className="feed-list">
              {day.events.map((event) => (
                <CalendarCard key={event.id} event={event} zone={zone} busy={busy} onAction={run} />
              ))}
            </ol>
          </section>
        ))
      )}
    </main>
  );
}
