import { useEffect, useRef, useState } from 'react';
import { AWAY_MS, awaySeconds, type OwnAway } from '@quiz/shared';
import { t } from '../i18n';
import { playSiren, unlockSiren } from '../siren';
import { loadAlarmSeen, saveAlarmSeen } from '../storage';

/** Вібрація разом із тривогою: три довгі поштовхи. */
const ALARM_VIBRATION = [300, 100, 300, 100, 300];

/**
 * Ключ тривоги для цього стану (12e): `${code}:${person}:${play}:${count}`, якщо вихід закрито (out false), ms ≥ AWAY_MS.mark,
 * count > 0 і ключ ще не показано (seen); інакше null. person — людина (соло — гравець, у командній грі — учасник, не команда):
 * коди кімнат повторюються, тож ключ з людиною не збігається з давньою грою. Не «count зріс між зрізами»: зміна могла прийти,
 * поки сторінку було сховано.
 */
export function alarmKey(code: string, person: string, away: OwnAway | null, seen: string | null): string | null {
  if (away === null || away.out || away.ms < AWAY_MS.mark || away.count <= 0) return null;
  const key = `${code}:${person}:${away.play}:${away.count}`;
  return key === seen ? null : key;
}

function vibrate(): void {
  try {
    navigator.vibrate?.(ALARM_VIBRATION);
  } catch {
    // Немає вібрації чи браузер не дозволив.
  }
}

/** Поки тривога видно, решта екрана недоступна (inert): фокус і читач екрана лишаються на тривозі. Повертає відновлення. */
function inertSiblings(layer: HTMLElement): () => void {
  const parent = layer.parentElement;
  if (parent === null) return () => undefined;
  const set = Array.from(parent.children).filter((el) => el !== layer && !el.hasAttribute('inert'));
  for (const el of set) el.setAttribute('inert', '');
  return () => {
    for (const el of set) el.removeAttribute('inert');
  };
}

/**
 * Тривога (12e): повноекранний червоний шар role="alert" на AWAY_MS.alarm з «🚨 Вихід із гри під час запитання!»
 * (і «0 балів за це запитання» зі штрафом), сирена й вібрація; дотик чи Escape закриває. Раз на вихід: ключ у localStorage,
 * тож оновлення сторінки чи перепідключення її не повторює. Лише коли сторінку видно: сховану — чекає на повернення.
 * away — view.lastAway; person — соло view.me.id, у командній грі view.team.memberId.
 */
export function AwayAlarm({ code, person, away }: { code: string; person: string; away: OwnAway | null }) {
  const [shown, setShown] = useState<{ key: string; penalty: boolean } | null>(null);
  const shownKey = shown?.key ?? null;
  const layer = useRef<HTMLDivElement>(null);
  // Ключ без урахування показаного: показане читається з localStorage в мить спрацювання.
  const key = alarmKey(code, person, away, null);

  useEffect(() => {
    if (key === null) return;
    const fire = () => {
      if (document.visibilityState !== 'visible' || loadAlarmSeen() === key) return;
      saveAlarmSeen(key);
      vibrate();
      setShown({ key, penalty: away?.penalty === true });
    };
    fire();
    document.addEventListener('visibilitychange', fire);
    return () => document.removeEventListener('visibilitychange', fire);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- штраф у мить спрацювання; далі — свіжий з away
  }, [key]);

  // Сирена, таймер, Escape й inert живуть, поки шар видно: закриття (дотик, час, новий вихід, розмонтування) зупиняє звук.
  // Залежність — лише ключ: зміна штрафу того самого виходу оновлює текст, а не перезапускає тривогу.
  useEffect(() => {
    if (shownKey === null) return;
    const stop = playSiren(AWAY_MS.alarm);
    const timer = setTimeout(() => setShown(null), AWAY_MS.alarm);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShown(null);
    };
    document.addEventListener('keydown', onKey);
    const restore = layer.current === null ? () => undefined : inertSiblings(layer.current);
    return () => {
      clearTimeout(timer);
      stop();
      document.removeEventListener('keydown', onKey);
      restore();
    };
  }, [shownKey]);

  if (shown === null) return null;
  // Штраф — свіжий для того самого виходу (міг з'явитися, поки шар видно).
  const penalty = key === shown.key ? away?.penalty === true : shown.penalty;
  const close = () => {
    // Дотик — жест: заодно розблоковує сирену на iOS для наступного разу.
    unlockSiren();
    setShown(null);
  };
  return (
    <div ref={layer} className="away-alarm" role="alert" onClick={close}>
      <p className="away-alarm-title">
        <span aria-hidden="true">🚨</span> {t('awayAlarmTitle')}
      </p>
      {penalty && <p className="away-alarm-penalty">{t('awayAlarmPenalty')}</p>}
    </div>
  );
}

/** Рядок під запитанням (12e): «Тебе не було в грі 8 с — ведучий і екран це бачать» (+ «За це запитання буде 0 балів»), від AWAY_MS.mark. away — view.away. */
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
