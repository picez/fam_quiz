import { isAnnouncementUrl, type PushPayload } from '@quiz/shared';
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
  if (payload.kind === 'broadcast') {
    return { title: payload.title, body: payload.text, url: payload.url !== null && isAnnouncementUrl(payload.url) ? payload.url : '/', tag: `broadcast-${payload.broadcastId}` };
  }
  if (payload.kind === 'problem_reply') {
    return { title: t('pushProblemReplyTitle'), body: payload.text, url: '/inbox', tag: `problem-${payload.reportId}` };
  }
  if (payload.kind === 'group_added') {
    // 72: адмін додав людину до групи — торкнутися й відкрити саму групу
    return { title: t('pushGroupAddedTitle', { title: payload.title }), body: t('pushGroupAddedBody'), url: `/profile/groups/${encodeURIComponent(payload.groupId)}`, tag: `group-${payload.groupId}` };
  }
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
