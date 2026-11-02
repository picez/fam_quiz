import type { CalendarEvent, CalendarRequest } from '@quiz/shared';
import type { JSX } from 'react';
import { Link } from 'react-router-dom';
import { countText, t } from '../i18n';
import { Avatar } from '../profile/Avatar';
import { Nick } from '../screens/Nick';
import { timeText } from './calendar-time';
import { nickText } from '../nick';

export type CalendarAction = 'request' | 'withdraw' | 'open' | 'edit' | 'cancel' | { decide: string; decision: 'approved' | 'rejected' };

const STATUS_TEXT = { pending: 'calendarPending', approved: 'calendarApproved', rejected: 'calendarRejected' } as const;
const STATE_TEXT = { open: 'calendarLive', played: 'calendarPlayed', cancelled: 'calendarCancelled' } as const;

export function CalendarCard({
  event,
  zone,
  busy,
  onAction,
}: {
  event: CalendarEvent;
  zone: string;
  busy: boolean;
  onAction: (event: CalendarEvent, action: CalendarAction) => void;
}): JSX.Element {
  const live = event.state === 'planned' || event.state === 'open';
  const act = (label: string, action: CalendarAction, secondary = true) => (
    <button type="button" className={secondary ? 'secondary' : undefined} disabled={busy} onClick={() => onAction(event, action)}>
      {label}
    </button>
  );
  const stateLabel = event.state === 'open' || event.state === 'played' || event.state === 'cancelled' ? t(STATE_TEXT[event.state]) : null;

  const requestRow = (request: CalendarRequest) => (
    <li key={request.user.id} className="calendar-request">
      <Avatar profile={request.user} size="small" />
      <span className="calendar-request-who">
        <Nick nickname={nickText(request.user.nickname)} />
      </span>
      <span className="meta">{t(STATUS_TEXT[request.status])}</span>
      {live && request.status !== 'approved' && act(t('calendarApprove'), { decide: request.user.id, decision: 'approved' }, false)}
      {live && request.status !== 'rejected' && act(t('calendarReject'), { decide: request.user.id, decision: 'rejected' })}
    </li>
  );

  return (
    <li className="calendar-card" id={`event-${event.id}`} data-state={event.state}>
      <h3 className="calendar-title">{event.title}</h3>
      <p className="calendar-when">
        <span aria-hidden="true">🕖 </span>
        {timeText(event.startsAt, zone)}
      </p>
      <p className="meta">{event.mine ? t('calendarYouHost') : t('calendarHost', { nickname: nickText(event.host.nickname) })}</p>
      <p className="meta">{event.quiz.title ?? t('calendarQuizGone')}</p>
      <p className="meta calendar-marks">
        <span>{countText('calendarParticipants', event.approved, { count: event.approved })}</span>
        {stateLabel !== null && <span className="calendar-mark">{stateLabel}</span>}
        {event.editedAt !== null && event.state !== 'cancelled' && <span className="calendar-mark">{t('calendarEdited')}</span>}
      </p>

      {event.mine ? (
        <>
          {live && (
            <div className="calendar-actions">
              {event.state === 'planned' ? (
                <>
                  {act(t('calendarOpen'), 'open', false)}
                  {act(t('calendarEdit'), 'edit')}
                </>
              ) : (
                act(t('calendarToHost'), 'open', false)
              )}
              {act(t('calendarCancel'), 'cancel')}
            </div>
          )}
          {event.requests !== null && event.requests.length > 0 && (
            <div className="calendar-requests">
              <h4>{t('calendarRequests')}</h4>
              <ul>{event.requests.map(requestRow)}</ul>
            </div>
          )}
        </>
      ) : (
        <div className="calendar-actions">
          {event.myRequest !== null && <span className="calendar-mark">{t(STATUS_TEXT[event.myRequest])}</span>}
          {live && event.myRequest === null && act(t('calendarRequest'), 'request', false)}
          {live && event.myRequest === 'pending' && act(t('calendarWithdraw'), 'withdraw')}
          {event.myRequest === 'approved' && event.state === 'open' && event.joinCode !== null && (
            <Link className="button" to={`/play/${event.joinCode}`}>
              {t('calendarJoin')}
            </Link>
          )}
        </div>
      )}
    </li>
  );
}
