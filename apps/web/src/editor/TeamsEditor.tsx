import { ANSWERER_MODES, DEFAULT_TEAM_NAMES, LIMITS, defaultTeams, type AnswererMode, type TeamsSettings } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { HelpButton } from '../help/HelpButton';

/**
 * «Командна гра»: перемикач з «ⓘ» (team.play); увімкнено — кількість 2–6 (кнопки − / +) і поле назви кожної команди з кольоровою позначкою;
 * вмикання — defaultTeams(2); зменшення відкидає останні назви, збільшення додає типові назви наступних позицій; вимикання прибирає поле.
 * «Хто відповідає» (12g) з «ⓘ» (team.answerer): «капітан» прибирає поле answerer, тож старі вікторини лишаються як були.
 */
export function TeamsEditor({ teams, onChange }: { teams: TeamsSettings | undefined; onChange: (teams: TeamsSettings | undefined) => void }) {
  const resize = (count: number) => {
    if (!teams || count < LIMITS.minTeams || count > LIMITS.maxTeams) return;
    const names = teams.names.slice(0, count);
    for (let i = names.length; i < count; i++) names.push(DEFAULT_TEAM_NAMES[i]!);
    onChange({ ...teams, count, names });
  };
  const setAnswerer = (answerer: AnswererMode) => {
    if (!teams) return;
    onChange(answerer === 'captain' ? withoutAnswerer(teams) : { ...teams, answerer });
  };
  const rename = (index: number, name: string) => {
    if (!teams) return;
    onChange({ ...teams, names: teams.names.map((old, i) => (i === index ? name : old)) });
  };
  return (
    <div className="teams-editor">
      <div className="with-help">
        <label className="field field-check">
          <input type="checkbox" checked={teams !== undefined} onChange={(event) => onChange(event.target.checked ? defaultTeams(2) : undefined)} />
          <span>{t('teamsToggle')}</span>
        </label>
        <HelpButton id="team.play" />
      </div>
      {teams && (
        <>
          <div className="teams-count">
            <button type="button" className="btn btn-small" aria-label={t('teamsLess')} disabled={teams.count <= LIMITS.minTeams} onClick={() => resize(teams.count - 1)}>
              −
            </button>
            <span>{t('teamsCount', { count: teams.count })}</span>
            <button type="button" className="btn btn-small" aria-label={t('teamsMore')} disabled={teams.count >= LIMITS.maxTeams} onClick={() => resize(teams.count + 1)}>
              +
            </button>
          </div>
          <div className="teams-names">
            {teams.names.map((name, index) => (
              <label key={index} className={`field team-name team-${index}`}>
                <span className="team-dot" aria-hidden="true" />
                <input
                  type="text"
                  aria-label={t('teamsName', { index: index + 1 })}
                  value={name}
                  maxLength={LIMITS.teamName}
                  onChange={(event) => rename(index, event.target.value)}
                />
              </label>
            ))}
          </div>
          <div className="with-help">
            <label className="field">
              <span>{t('teamsAnswererLabel')}</span>
              <select aria-label={t('teamsAnswererLabel')} value={teams.answerer ?? 'captain'} onChange={(event) => setAnswerer(event.target.value as AnswererMode)}>
                {ANSWERER_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {t(`teamsAnswerer_${mode}` as TextKey)}
                  </option>
                ))}
              </select>
            </label>
            <HelpButton id="team.answerer" />
          </div>
        </>
      )}
      <p className="meta">{t('teamsHint')}</p>
    </div>
  );
}

function withoutAnswerer(teams: TeamsSettings): TeamsSettings {
  const { answerer: _answerer, ...rest } = teams;
  return rest;
}
