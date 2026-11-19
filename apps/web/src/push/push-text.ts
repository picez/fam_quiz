import type { PushPayload } from '@quiz/shared';
import { dayHeading, KYIV_ZONE, timeText } from '../calendar/calendar-time';
import { pushLocale, pushStringsFor } from './push-strings';

export interface PushNotice {
  title: string;
  body: string;
  url: string;
  tag: string;
}

/** Тексти з i18n; час — у поясі пристрою, а для розкладу бота — київський з позначкою «(Київ)», як в адмінці (56). */
export function pushNotice(payload: PushPayload, zone: string, now: Date = new Date()): PushNotice {
  const locale = pushLocale(payload.locale);
  const t = pushStringsFor(locale);
  const title = payload.title;
  if (payload.kind === 'bot') {
    const tag = `bot-${payload.planId}`;
    if (payload.code === null) {
      return { title: t('pushBotSoonTitle', { title, time: timeText(payload.startsAt, KYIV_ZONE) }), body: t('pushBotSoonBody'), url: '/', tag };
    }
    return { title: t('pushBotOpenTitle', { title }), body: t('pushBotOpenBody', { code: payload.code }), url: `/play/${payload.code}`, tag };
  }
  const tag = `event-${payload.eventId}`;
  switch (payload.kind) {
    case 'reminder':
      return {
        title: t('pushReminderTitle', { title }),
        body: t('pushReminderBody', { time: timeText(payload.startsAt, zone) }),
        url: `/feed/calendar#${tag}`,
        tag,
      };
    case 'opened':
      return { title: t('pushOpenedTitle', { title }), body: t('pushOpenedBody'), url: `/play/${payload.code}`, tag };
    case 'cancelled':
      return {
        title: t('pushCancelledTitle', { title }),
        body: t('pushCancelledBody', {
          when: `${dayHeading(payload.startsAt, zone, now, locale)}, ${timeText(payload.startsAt, zone)}`,
        }),
        url: `/feed/calendar#${tag}`,
        tag,
      };
  }
}
