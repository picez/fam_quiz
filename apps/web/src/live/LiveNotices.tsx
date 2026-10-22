import { useEffect, useState } from 'react';
import type { AdjustmentNotice, BlitzPlayer } from '@quiz/shared';
import { signed } from '../format';
import { t } from '../i18n';

/** Скільки сповіщення про бали видно, мс. */
export const NOTICE_MS = 4000;

/** Видиме сповіщення: нове (seq або at змінилися) і молодше за NOTICE_MS за часом сервера; ховається таймером. */
export function useNotice(notice: AdjustmentNotice | null, offsetMs: number): AdjustmentNotice | null {
  const [shown, setShown] = useState<AdjustmentNotice | null>(null);
  const key = notice === null ? null : `${notice.seq}-${notice.at}`;
  useEffect(() => {
    if (notice === null) {
      setShown(null);
      return;
    }
    const left = NOTICE_MS - (Date.now() + offsetMs - notice.at);
    if (left <= 0) {
      setShown(null);
      return;
    }
    setShown(notice);
    const timer = setTimeout(() => setShown(null), left);
    return () => clearTimeout(timer);
    // Ключ — єдина ознака нового сповіщення; offsetMs перераховується з кожним оновленням і не має його перезапускати.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return shown;
}

/** Сповіщення про бали від ведучого; position: fixed, тож нічого не зсуває. */
export function AdjustmentToast({ notice, offsetMs }: { notice: AdjustmentNotice | null; offsetMs: number }) {
  const shown = useNotice(notice, offsetMs);
  if (shown === null) return null;
  return (
    <div className={shown.points > 0 ? 'live-notice is-up' : 'live-notice is-down'} role="status" aria-live="polite">
      {t('adjustNotice', { points: signed(shown.points), name: shown.nickname })}
    </div>
  );
}

/** Значки сцени: «🐞 Оля» біля кожного гравця з дебафом; без виду дебафу. */
export function StageDebuffs({ debuffs }: { debuffs: BlitzPlayer[] }) {
  if (debuffs.length === 0) return null;
  return (
    <ul className="stage-debuffs" aria-label={t('stageDebuffsLabel')}>
      {debuffs.map((player) => (
        <li key={player.playerId}>{`🐞 ${player.nickname}`}</li>
      ))}
    </ul>
  );
}
