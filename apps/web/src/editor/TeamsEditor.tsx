import { DEFAULT_TEAM_NAMES, LIMITS, defaultTeams, type TeamsSettings } from '@quiz/shared';
import { t } from '../i18n';
import { HelpButton } from '../help/HelpButton';
import { helpEntry, type HelpId } from '../help/host-help';

/** «ⓘ» запису «team.play»; поки довідка не має такого запису, кнопки немає (а не падіння). */
function PlayHelp() {
  const id = 'team.play' as HelpId;
  try {
    helpEntry(id);
  } catch {
    return null;
  }
  return <HelpButton id={id} />;
}

/**
 * «Командна гра»: перемикач з «ⓘ» (team.play); увімкнено — кількість 2–6 (кнопки − / +) і поле назви кожної команди з кольоровою позначкою;
 * вмикання — defaultTeams(2); зменшення відкидає останні назви, збільшення додає типові назви наступних позицій; вимикання прибирає поле.
 */
export function TeamsEditor({ teams, onChange }: { teams: TeamsSettings | undefined; onChange: (teams: TeamsSettings | undefined) => void }) {
  const resize = (count: number) => {
    if (!teams || count < LIMITS.minTeams || count > LIMITS.maxTeams) return;
    const names = teams.names.slice(0, count);
    for (let i = names.length; i < count; i++) names.push(DEFAULT_TEAM_NAMES[i]!);
    onChange({ count, names });
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
        <PlayHelp />
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
        </>
      )}
      <p className="meta">{t('teamsHint')}</p>
    </div>
  );
}
