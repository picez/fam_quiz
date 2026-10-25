import type { PlayerView } from '@quiz/shared';
import { t } from '../i18n';
import { useGuardedSend } from '../live/useGuardedSend';
import type { Send } from '../live/types';
import { teamOf } from './TeamBar';

/** Капітан команди-дуелянта: хто з товаришів на зв'язку піде на дуель; вибраний позначений. */
export function DuelistPicker({ view, send, onError }: { view: PlayerView; send: Send; onError: (text: string | null) => void }) {
  const guard = useGuardedSend(send, onError);
  const team = view.team;
  const own = teamOf(view);
  if (team === null || own === null || !team.canPickDuelist) return null;
  return (
    <section className="duelist-picker">
      <p className="lead">{t('teamDuelistPick')}</p>
      <ul className="duelist-list">
        {own.members
          .filter((member) => member.connected || member.id === team.duelistId)
          .map((member) => (
            <li key={member.id}>
              <button
                type="button"
                className="btn duelist-option"
                aria-pressed={member.id === team.duelistId}
                disabled={guard.busy || view.paused}
                onClick={() => void guard.run('player:duelist', { memberId: member.id })}
              >
                {member.nickname}
              </button>
            </li>
          ))}
      </ul>
    </section>
  );
}
