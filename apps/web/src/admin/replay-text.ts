import type { ReplayEvent, ReplayVerdict } from '@quiz/shared';
import { KYIV_ZONE } from '../calendar/calendar-time';
import { historyAppealText } from '../appeal-text';
import { num, secondsText, signed } from '../format';
import { t } from '../i18n';
import { nickText } from '../nick';

/** 65: час відповіді в секундах з однією цифрою («4,0»); немає часу — «—». */
export function replayTime(ms: number | null): string {
  return ms === null ? '—' : secondsText(ms);
}

/** Рішення словами; ручне — з позначкою «(вручну)». */
export function verdictText(verdict: ReplayVerdict, manual: boolean): string {
  const text = t(`adminReplayVerdict_${verdict}`);
  return manual ? t('adminReplayManual', { verdict: text }) : text;
}

/** Ціна запитання; клітинка ×2/×3 — з позначкою. */
export function priceText(price: number, multiplier: number): string {
  return multiplier > 1 ? t('adminReplayPriceMark', { points: price, mark: multiplier }) : t('adminReplayPrice', { points: price });
}

/** Київський час події «HH:MM:SS»; погана дата — порожньо. */
function kyivClock(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: KYIV_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Рядок події кроку: рішення ведучого, коригування, апеляція, баф, дебаф, приєднання, вилучення, пауза. */
export function eventLine(event: ReplayEvent): string {
  switch (event.kind) {
    case 'manual':
      return t('adminReplayEventManual', { name: nickText(event.nickname), from: event.from === null ? '—' : verdictText(event.from, false), to: verdictText(event.to, false) });
    case 'adjustment': {
      const source = t(`scoreSource_${event.source}`);
      return t('adminReplayEventAdjust', { name: nickText(event.nickname), points: signed(event.points), source: event.debuff === undefined ? source : `${source} (${t(`debuff_${event.debuff}`)})` });
    }
    case 'appeal':
      return t('adminReplayEventAppeal', { name: nickText(event.nickname), result: historyAppealText(event.appeal) });
    case 'buff':
      return t('adminReplayEventBuff', { name: nickText(event.nickname), buff: t(`buff_${event.buff}`) });
    case 'debuff':
      return t('adminReplayEventDebuff', { name: nickText(event.nickname), debuff: t(`debuff_${event.debuff}`) });
    case 'join':
    case 'leave': {
      const name = event.team === undefined ? nickText(event.nickname) : `${nickText(event.nickname)} (${event.team})`;
      if (event.kind === 'join') return t('adminReplayEventJoin', { time: kyivClock(event.at), name });
      return t('adminReplayEventLeave', { time: kyivClock(event.at), name, score: event.score === undefined ? '—' : num(event.score) });
    }
    case 'pause':
      // ms: null — пауза без тривалості (не знята до кінця чи знята вже після збереження).
      return event.ms === null ? t('adminReplayEventPauseOpen', { time: kyivClock(event.at) }) : t('adminReplayEventPause', { time: kyivClock(event.at), seconds: Math.round(event.ms / 1000) });
  }
}
