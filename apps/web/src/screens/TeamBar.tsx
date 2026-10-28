import type { PlayerView, TeamView } from '@quiz/shared';
import { t } from '../i18n';

/** Команда учасника зі складом; null — соло-гра або ще без команди. */
export function teamOf(view: PlayerView): TeamView | null {
  const id = view.team?.teamId ?? null;
  return id === null ? null : (view.teams?.teams.find((team) => team.id === id) ?? null);
}

/** Нікнейм товариша по команді; порожньо, якщо його немає. */
export function memberName(view: PlayerView, memberId: string | null): string {
  if (memberId === null) return '';
  return teamOf(view)?.members.find((member) => member.id === memberId)?.nickname ?? '';
}

/** Хто з натиснувших відповідає: натиснувший, якщо він на зв'язку; інакше відповідає капітан (null — бліцу немає). */
export function buzzerOf(view: PlayerView): string | null {
  const id = view.team?.buzzerId ?? null;
  if (id === null) return null;
  const member = teamOf(view)?.members.find((m) => m.id === id);
  return member !== undefined && member.connected ? id : null;
}

/** Смуга під шапкою: колір і назва команди, хто капітан; хто відповідає, якщо не капітан (12g); у бліці — натиснувший; у дуелі — дуелянт. Один рядок. */
export function TeamBar({ view }: { view: PlayerView }) {
  const team = view.team;
  const own = teamOf(view);
  if (team === null || own === null) return null;
  const line =
    team.duelistId !== null
      ? t('teamDuelist', { name: memberName(view, team.duelistId) })
      : buzzerOf(view) !== null
        ? t('teamBuzzer', { name: memberName(view, buzzerOf(view)) })
        : team.answererId !== null && team.answererId !== team.captainId
          ? team.answerer
            ? t('teamYouAnswerBar')
            : t('teamAnswererBar', { name: memberName(view, team.answererId) })
          : team.captain
            ? t('teamYouCaptain')
            : t('teamCaptain', { name: memberName(view, team.captainId) });
  return (
    <div className={`team-bar team-${own.color}`}>
      <span className="team-dot" aria-hidden="true" />
      <strong className="team-bar-name">{own.name}</strong>
      <span className="team-bar-line">{line}</span>
    </div>
  );
}
