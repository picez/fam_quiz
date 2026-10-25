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

/** Смуга під шапкою: колір і назва команди, хто капітан; у бліці — хто відповідає; у дуелі — дуелянт. Один рядок. */
export function TeamBar({ view }: { view: PlayerView }) {
  const team = view.team;
  const own = teamOf(view);
  if (team === null || own === null) return null;
  const line =
    team.duelistId !== null
      ? t('teamDuelist', { name: memberName(view, team.duelistId) })
      : team.buzzerId !== null
        ? t('teamBuzzer', { name: memberName(view, team.buzzerId) })
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
