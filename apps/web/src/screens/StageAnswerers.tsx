import { isUnscored, type StageView } from '@quiz/shared';
import { t } from '../i18n';

/**
 * Рядок сцени (12g): «Червоні — відповідає: Оля · Сині — відповідає: Марко» в один рядок.
 * Лише командна гра з режимом не captain, на question / locked / reveal, без бліцу, опитування й хмари;
 * на полі — лише команда, що вибрала клітинку (board.turn); у «Мільйонері» — лише учасник. Інакше нічого.
 */
export function StageAnswerers({ view }: { view: StageView }) {
  const { teams, question } = view;
  if (teams === null || teams.answerer === 'captain' || question === null) return null;
  if (view.phase !== 'question' && view.phase !== 'locked' && view.phase !== 'reveal') return null;
  if (view.blitz !== null || isUnscored(question)) return null;
  const only = view.ladder !== null ? (view.ladder.contestant?.playerId ?? null) : view.board !== null ? (view.board.turn?.playerId ?? null) : undefined;
  const rows = teams.teams.flatMap((team) => {
    if (only !== undefined && team.id !== only) return [];
    const name = team.members.find((member) => member.id === team.answererId)?.nickname;
    return name === undefined ? [] : [{ team, name }];
  });
  if (rows.length === 0) return null;
  return (
    <p className="stage-answerers">
      {rows.map(({ team, name }) => (
        <span key={team.id} className={`stage-answerer team-${team.color}`}>
          <span className="team-dot" aria-hidden="true" />
          <strong>{team.name}</strong> — {t('stageAnswerer', { name })}
        </span>
      ))}
    </p>
  );
}
