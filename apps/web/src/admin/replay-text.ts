import { isRtl, type ReplayEvent, type ReplayVerdict } from '@quiz/shared';
import { KYIV_ZONE } from '../calendar/calendar-time';
import { historyAppealText } from '../appeal-text';
import { num, secondsText, signed } from '../format';
import { t } from '../i18n';
import { currentLocale } from '../locales/current';
import { nickText } from '../nick';

const FSI = String.fromCharCode(0x2068);
const PDI = String.fromCharCode(0x2069);

/** Нік у рядку події; у мові справа наліво — ізольований (FSI…PDI), щоб латинський чи кириличний нік не розвернув стрілку рядка. */
function who(nickname: string | null): string {
  const text = nickText(nickname);
  return isRtl(currentLocale()) ? FSI + text + PDI : text;
}

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

/** Оцінка до рішення ведучого: стара гра — «—», запису не було — «без відповіді». */
function beforeText(from: ReplayVerdict | null): string {
  if (from === null) return '—';
  return from === 'none' ? t('adminReplayVerdict_noAnswer') : verdictText(from, false);
}

/** Рядок події кроку: рішення ведучого, коригування, апеляція, баф, дебаф, приєднання, вилучення, пауза. */
export function eventLine(event: ReplayEvent): string {
  switch (event.kind) {
    case 'manual':
      return t('adminReplayEventManual', { name: who(event.nickname), from: beforeText(event.from), to: verdictText(event.to, false) });
    case 'adjustment': {
      const named = t(`scoreSource_${event.source}`);
      const parts = [event.debuff === undefined ? named : `${named} (${t(`debuff_${event.debuff}`)})`];
      // Ціль дебафу чи ставки дуелі; «↶ Бали» — що саме скасовано (запитання від 1 чи коригування за номером).
      if (event.undoes !== undefined) parts.push('question' in event.undoes ? t('adminReplayUndoesQuestion', { n: event.undoes.question + 1 }) : t('adminReplayUndoesSeq', { seq: event.undoes.seq }));
      if (event.target !== undefined && event.target !== null) parts.push(t('adminReplayTarget', { name: who(event.target) }));
      return t('adminReplayEventAdjust', { name: who(event.nickname), points: signed(event.points), source: parts.join(' ') });
    }
    case 'appeal':
      return t('adminReplayEventAppeal', { name: who(event.nickname), result: historyAppealText(event.appeal) });
    case 'buff':
      return t('adminReplayEventBuff', { name: who(event.nickname), buff: t(`buff_${event.buff}`) });
    case 'debuff':
      return t('adminReplayEventDebuff', { name: who(event.nickname), debuff: t(`debuff_${event.debuff}`) });
    case 'join':
    case 'leave': {
      const name = event.team === undefined ? who(event.nickname) : `${who(event.nickname)} (${event.team})`;
      if (event.kind === 'join') return t('adminReplayEventJoin', { time: kyivClock(event.at), name });
      return t('adminReplayEventLeave', { time: kyivClock(event.at), name, score: event.score === undefined ? '—' : num(event.score) });
    }
    case 'pause':
      // Знята — з тривалістю; не знята до кінця гри — «до кінця гри»; гру збережено на паузі — тривалість невідома.
      if (event.ended === 'unknown') return t('adminReplayEventPauseUnknown', { time: kyivClock(event.at) });
      return event.ended === 'game' || event.ms === null ? t('adminReplayEventPauseOpen', { time: kyivClock(event.at) }) : t('adminReplayEventPause', { time: kyivClock(event.at), seconds: Math.round(event.ms / 1000) });
  }
}
