import { isUnscored, type StageView } from '@quiz/shared';
import { t } from '../i18n';

/** Більше стількох команд — рядок дрібніший, без «відповідає:» («Червоні: Петро») і може лягти у два рядки. */
const ONE_LINE_TEAMS = 3;

/**
 * Рядок сцени (12g): «Червоні — відповідає: Оля · Сині — відповідає: Марко» в один рядок.
 * Лише командна гра з режимом не captain, на question / locked / reveal, без бліцу, опитування й хмари.
 * Хто на запитанні не відповідає (поле — не та команда, «Ва-банк» — хто вже не в грі), від рушія приходить з answererId null — пропускається;
 * у «Мільйонері» зал теж відповідає, але сцена показує лише учасника. Інакше нічого.
 */
export function StageAnswerers({ view }: { view: StageView }) {
  const { teams, question } = view;
  if (teams === null || teams.answerer === 'captain' || question === null) return null;
  if (view.phase !== 'question' && view.phase !== 'locked' && view.phase !== 'reveal') return null;
  if (view.blitz !== null || isUnscored(question)) return null;
  const contestant = view.ladder?.contestant?.playerId;
  const rows = teams.teams.flatMap((team) => {
    if (view.ladder !== null && team.id !== contestant) return [];
    const name = team.answererId === null ? undefined : team.members.find((member) => member.id === team.answererId)?.nickname;
    return name === undefined ? [] : [{ team, name }];
  });
  if (rows.length === 0) return null;
  const many = rows.length > ONE_LINE_TEAMS;
  return (
    <p className={many ? 'stage-answerers many' : 'stage-answerers'}>
      {rows.map(({ team, name }) => (
        <span key={team.id} className={`stage-answerer team-${team.color}`}>
          <span className="team-dot" aria-hidden="true" />
          <strong>{team.name}</strong>
          {many ? t('stageAnswererShort', { name }) : <> — {t('stageAnswerer', { name })}</>}
        </span>
      ))}
    </p>
  );
}
