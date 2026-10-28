import { useEffect, useRef, useState } from 'react';
import { AWAY_MS, awaySeconds, type OwnAway } from '@quiz/shared';
import { t } from '../i18n';
import { playSiren, sirenReady, sirenSupported, unlockSiren } from '../siren';
import { loadAlarmSeen, saveAlarmSeen } from '../storage';

/** Вібрація разом із тривогою: три довгі поштовхи. */
const ALARM_VIBRATION = [300, 100, 300, 100, 300];

/**
 * Ключ тривоги для цього стану (12e): `${code}:${person}:${play}:${count}`, якщо вихід закрито (out false), ms ≥ AWAY_MS.mark
 * і count > 0; інакше null. Чи ключ уже показано, AwayAlarm звіряє з localStorage в мить спрацювання. person — людина (соло — гравець, у командній грі — учасник, не команда):
 * коди кімнат повторюються, тож ключ з людиною не збігається з давньою грою. Не «count зріс між зрізами»: зміна могла прийти,
 * поки сторінку було сховано.
 */
export function alarmKey(code: string, person: string, away: OwnAway | null): string | null {
  if (away === null || away.out || away.ms < AWAY_MS.mark || away.count <= 0) return null;
  return `${code}:${person}:${away.play}:${away.count}`;
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
 * Сирена могла не прозвучати (iOS після фону призупиняє звук, а жесту ще не було — sirenReady() false в мить спрацювання):
 * тоді перший дотик не закриває шар, а розблоковує звук і грає сирену заново (і час шару починається знову);
 * закриває другий дотик, Escape чи час.
 * away — view.lastAway; person — соло view.me.id, у командній грі view.team.memberId.
 */
export function AwayAlarm({ code, person, away }: { code: string; person: string; away: OwnAway | null }) {
  const [shown, setShown] = useState<{ key: string; penalty: boolean; silent: boolean; replayed: boolean } | null>(null);
  const shownKey = shown?.key ?? null;
  const replayed = shown?.replayed === true;
  const layer = useRef<HTMLDivElement>(null);
  // Показане читається з localStorage в мить спрацювання.
  const key = alarmKey(code, person, away);

  useEffect(() => {
    if (key === null) return;
    const fire = () => {
      if (document.visibilityState !== 'visible' || loadAlarmSeen() === key) return;
      saveAlarmSeen(key);
      vibrate();
      setShown({ key, penalty: away?.penalty === true, silent: sirenSupported() && !sirenReady(), replayed: false });
    };
    fire();
    document.addEventListener('visibilitychange', fire);
    return () => document.removeEventListener('visibilitychange', fire);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- штраф у мить спрацювання; далі — свіжий з away
  }, [key]);

  // Сирена, таймер, Escape й inert живуть, поки шар видно: закриття (дотик, час, новий вихід, розмонтування) зупиняє звук.
  // Залежність — ключ і повтор: зміна штрафу того самого виходу оновлює текст, а не перезапускає тривогу; повтор — новий звук і час.
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
  }, [shownKey, replayed]);

  if (shown === null) return null;
  // Штраф — свіжий для того самого виходу (міг з'явитися, поки шар видно).
  const penalty = key === shown.key ? away?.penalty === true : shown.penalty;
  const close = () => {
    // Дотик — жест: заодно розблоковує сирену на iOS для наступного разу.
    unlockSiren();
    // Сирена мовчала (звук не був розблокований): перший дотик лише вмикає її знову, шар лишається.
    if (shown.silent && !shown.replayed) setShown({ ...shown, replayed: true });
    else setShown(null);
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
