import { useEffect, useState } from 'react';
import type { HostView, WipeoutInfo } from '@quiz/shared';
import { secondsLeft } from '../clock';
import { HelpButton } from '../help/HelpButton';
import { t } from '../i18n';
import { WipeoutLadder } from './WipeoutLadder';

/** Підпис вимкненої «Далі» на час вікна: «Гравці вирішують… N с». */
export function DecidingLabel({ decide, offsetMs }: { decide: NonNullable<WipeoutInfo['decide']>; offsetMs: number }) {
  const [, setTick] = useState(0);
  const running = decide.endsAt !== null;
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 500);
    return () => clearInterval(id);
  }, [running, decide.endsAt]);
  const seconds = secondsLeft(decide, offsetMs, Date.now()) ?? 0;
  // «0 с» не показуємо: вікно ось-ось закриється.
  return <>{seconds > 0 ? t('wipeoutDeciding', { seconds }) : t('wipeoutDecidingNow')}</>;
}

/** Пульт «Ва-банк»: драбина, гравці з банками й рішеннями наживо, «ⓘ» раунду. */
export function HostWipeout({ view, offsetMs }: { view: HostView; offsetMs: number }) {
  const info = view.wipeout;
  if (info === null) return null;
  return (
    <section className="panel host-wipeout">
      <h2>
        {t('hostWipeoutTitle')}
        <HelpButton id="round.wipeout" />
      </h2>
      {info.decide !== null && (
        <p className="meta" role="status">
          <DecidingLabel decide={info.decide} offsetMs={offsetMs} />
        </p>
      )}
      <WipeoutLadder info={info} size="host" />
    </section>
  );
}
