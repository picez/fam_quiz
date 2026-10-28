import { useState } from 'react';
import type { AnswererScope, PlayerView } from '@quiz/shared';
import { t } from '../i18n';
import { useGuardedSend } from '../live/useGuardedSend';
import type { Send } from '../live/types';
import { teamOf } from './TeamBar';

/**
 * Смужка капітана (12g): «Відповідає:» і кнопки людей команди на зв'язку (своя — «Я»), у rotate ще «Черга»; перемикач «на весь раунд».
 * Шле player:pick-answerer { memberId, scope }; у chosen «Я» — memberId null. Зміна перемикача з наявним вибором шле той самий memberId з новим scope.
 * Немає team.canPickAnswerer — нічого.
 */
export function AnswererPicker({ view, send, onError }: { view: PlayerView; send: Send; onError: (text: string | null) => void }) {
  const guard = useGuardedSend(send, onError);
  // Перемикач без вибору: запам'ятовується тут і йде з наступним дотиком.
  const [roundWanted, setRoundWanted] = useState(false);
  const team = view.team;
  const own = teamOf(view);
  if (team === null || own === null || !team.canPickAnswerer) return null;
  const pick = team.answererPick;
  const rotate = team.answererMode === 'rotate';
  const round = pick !== null ? pick.scope === 'round' : roundWanted;
  const scope: AnswererScope = round ? 'round' : 'question';
  const choose = (memberId: string | null) => void guard.run('player:pick-answerer', { memberId, scope });
  const toggle = (on: boolean) => {
    setRoundWanted(on);
    if (pick !== null) void guard.run('player:pick-answerer', { memberId: pick.memberId, scope: on ? 'round' : 'question' });
  };
  // Без вибору в chosen відповідає капітан («Я»), у rotate — черга.
  const pressedId = pick?.memberId ?? (rotate ? null : team.memberId);
  const options = own.members.filter((member) => member.connected || member.id === pick?.memberId || member.id === team.memberId);
  return (
    <section className={`answerer-picker team-${own.color}`}>
      <p className="lead">{t('answererPickLead')}</p>
      <div className="answerer-options">
        {options.map((member) => {
          const me = member.id === team.memberId;
          return (
            <button
              key={member.id}
              type="button"
              className="btn answerer-option"
              aria-pressed={member.id === pressedId}
              disabled={guard.busy}
              onClick={() => choose(me && !rotate ? null : member.id)}
            >
              {me ? t('answererMe') : member.nickname}
            </button>
          );
        })}
        {rotate && (
          <button type="button" className="btn answerer-option" aria-pressed={pick === null} disabled={guard.busy} onClick={() => choose(null)}>
            {t('answererQueue')}
          </button>
        )}
      </div>
      <label className="field field-check">
        <input type="checkbox" checked={round} disabled={guard.busy} onChange={(event) => toggle(event.target.checked)} />
        <span>{t('answererRound')}</span>
      </label>
      <p className="meta answerer-hint">{t(round ? 'answererHintRound' : 'answererHintQuestion')}</p>
    </section>
  );
}
