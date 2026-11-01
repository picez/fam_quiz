import { useState } from 'react';
import type { ContinuedView, Phase, ResumeLobby } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';
import { restartNoteText } from '../resume';

/**
 * «Місця збереженої гри» (13b): нік (і команда), «на місці» / «вільне»; «Звільнити» для зайнятих, крім self.
 * На паузі збору поза лобі — підказка; у лобі шляху 12r — з якого раунду почнемо (resume — раунди лобі для підпису).
 */
export function SlotsPanel({
  continued,
  send,
  self = null,
  paused,
  phase,
  resume = null,
}: {
  continued: ContinuedView;
  send: Send;
  self?: string | null;
  paused: boolean;
  phase: Phase;
  resume?: ResumeLobby | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const guard = useGuardedSend(send, setError);
  const lobby = phase === 'lobby';

  return (
    <details className="panel slots-panel" open>
      <summary>{t('slotsPanel')}</summary>
      {paused && !lobby && <p className="meta">{t('continuedHint')}</p>}
      {lobby && continued.carryRound !== null && <p className="meta">{restartNoteText(continued.carryRound, resume)}</p>}
      <ul className="slots-list">
        {continued.slots.map((slot) => (
          <li key={slot.id} className={slot.taken ? 'is-taken' : 'is-free'}>
            <span className="slot-name">{slot.team === null ? slot.nickname : t('slotTeam', { nickname: slot.nickname, team: slot.team })}</span>
            <span className="slot-state">{t(slot.taken ? 'slotTaken' : 'slotFree')}</span>
            {slot.taken && slot.id !== self && (
              <button
                type="button"
                className="btn btn-small"
                disabled={guard.busy}
                onClick={() => {
                  if (window.confirm(t('slotReleaseConfirm', { nickname: slot.nickname }))) void guard.run('host:release', { playerId: slot.id });
                }}
              >
                {t('slotRelease')}
              </button>
            )}
          </li>
        ))}
      </ul>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}
