import { useEffect, useState } from 'react';
import { AWAY_MS, awaySeconds, type OwnAway } from '@quiz/shared';
import { t } from '../i18n';
import { playSiren } from '../siren';
import { loadAlarmSeen, saveAlarmSeen } from '../storage';

/**
 * Ключ тривоги для цього стану (12e): `${code}:${play}:${count}`, якщо вихід закрито (out false), ms ≥ AWAY_MS.mark, count > 0
 * і ключ ще не показано (seen); інакше null. Не «count зріс між зрізами»: зміна могла прийти, поки сторінку було сховано.
 */
export function alarmKey(code: string, away: OwnAway | null, seen: string | null): string | null {
  if (away === null || away.out || away.ms < AWAY_MS.mark || away.count <= 0) return null;
  const key = `${code}:${away.play}:${away.count}`;
  return key === seen ? null : key;
}

/**
 * Тривога (12e): повноекранний червоний шар role="alert" на AWAY_MS.alarm з «🚨 Ти виходив із гри під час запитання!»
 * (і «0 балів за це запитання» зі штрафом) і сирена; дотик закриває. Раз на вихід: ключ у localStorage, тож оновлення
 * сторінки чи перепідключення її не повторює. Лише коли сторінку видно: сховану — чекає на повернення. away — view.lastAway.
 */
export function AwayAlarm({ code, away }: { code: string; away: OwnAway | null }) {
  const [shown, setShown] = useState<{ key: string; penalty: boolean } | null>(null);
  // Ключ без урахування показаного: показане читається з localStorage в мить спрацювання.
  const key = alarmKey(code, away, null);
  const penalty = away?.penalty === true;

  useEffect(() => {
    if (key === null) return;
    const fire = () => {
      if (document.visibilityState !== 'visible' || loadAlarmSeen(code) === key) return;
      saveAlarmSeen(code, key);
      setShown({ key, penalty });
    };
    fire();
    document.addEventListener('visibilitychange', fire);
    return () => document.removeEventListener('visibilitychange', fire);
  }, [code, key, penalty]);

  // Сирена й таймер живуть, поки шар видно: закриття (дотик, час, новий вихід, розмонтування) зупиняє звук.
  useEffect(() => {
    if (shown === null) return;
    const stop = playSiren(AWAY_MS.alarm);
    const timer = setTimeout(() => setShown(null), AWAY_MS.alarm);
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [shown]);

  if (shown === null) return null;
  return (
    <div className="away-alarm" role="alert" onClick={() => setShown(null)}>
      <p className="away-alarm-title">{t('awayAlarmTitle')}</p>
      {shown.penalty && <p className="away-alarm-penalty">{t('awayAlarmPenalty')}</p>}
    </div>
  );
}

/** Рядок під запитанням (12e): «Ти виходив із гри на 8 с — це видно всім» (+ «За це запитання буде 0 балів»), від AWAY_MS.mark. away — view.away. */
export function AwayNote({ away }: { away: OwnAway | null }) {
  if (away === null || away.ms < AWAY_MS.mark) return null;
  return (
    <p className="meta away-note">
      {t('awayNote', { seconds: awaySeconds(away.ms) })}
      {away.penalty && (
        <>
          <br />
          {t('awayNotePenalty')}
        </>
      )}
    </p>
  );
}
