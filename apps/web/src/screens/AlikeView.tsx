import type { AlikeGroupView, AlikeInfo } from '@quiz/shared';
import { signed } from '../format';
import { t } from '../i18n';
import { MANY_ROWS } from './dense';

/** Правки ведучого на розкритті: editable — reveal і не автопілот. */
interface HostEdits {
  editable: boolean;
  onJoin(from: string, to: string): void;
  onSplit(playerId: string): void;
}

const wordsOf = (group: AlikeGroupView) => group.words.join(', ');
/** Пункт «Об'єднати з…»: слова й перший учасник — винесений одинак і його колишня група з тим самим словом різняться. */
const optionOf = (group: AlikeGroupView) => (group.members[0] === undefined ? wordsOf(group) : `${wordsOf(group)} · ${group.members[0].nickname}`);

/**
 * «Думай як усі» (37e): картки груп слів від більших до менших (порядок дає рушій). Найбільші — `alike-top` з «Найбільша» й «+бали»;
 * жодної найбільшої — «Усі слова різні — балів немає». mine — свій учасник (його картка виділена); host — «Об'єднати з…» на кожній
 * групі (коли є інші) і «Окремо» біля кожного імені в групі з двох і більше. Нижче — «Без відповіді».
 */
export function AlikeGroups({ info, mine, host }: { info: AlikeInfo; mine?: string; host?: HostEdits }) {
  const edits = host?.editable === true ? host : null;
  const anyTop = info.groups.some((group) => group.top);
  // Понад MANY_ROWS груп (як у «Думай інакше») сцена ущільнює картки: 24 групи вміщуються на 1280×720.
  const many = info.groups.length > MANY_ROWS;
  return (
    <section className="alike-reveal">
      <h2 className="alike-title">{t('alikeGroupsTitle')}</h2>
      {!anyTop && <p className="lead alike-nobody">{t('alikeNobody')}</p>}
      <ul className={many ? 'alike-groups is-many' : 'alike-groups'}>
        {info.groups.map((group) => {
          const own = mine !== undefined && group.members.some((member) => member.id === mine);
          const others = info.groups.filter((other) => other.key !== group.key);
          const className = `alike-group${group.top ? ' alike-top' : ''}${own ? ' is-me' : ''}`;
          return (
            <li key={group.key} className={className}>
              <div className="alike-head">
                {group.top && <span className="tag alike-top-tag">{t('alikeTop')}</span>}
                {group.points > 0 && <span className="alike-points">{signed(group.points)}</span>}
              </div>
              <p className="alike-words" dir="auto">
                {wordsOf(group)}
              </p>
              <ul className="alike-members">
                {group.members.map((member) => (
                  <li key={member.id} className={member.id === mine ? 'alike-member is-me' : 'alike-member'}>
                    <span className="name" dir="auto">
                      {member.nickname}
                    </span>
                    {edits !== null && group.members.length >= 2 && (
                      <button type="button" className="btn btn-small" onClick={() => edits.onSplit(member.id)}>
                        {t('alikeSplit')}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {edits !== null && others.length > 0 && (
                <select
                  className="alike-join"
                  aria-label={t('alikeJoin')}
                  value=""
                  onChange={(event) => {
                    if (event.target.value !== '') edits.onJoin(group.key, event.target.value);
                  }}
                >
                  <option value="">{t('alikeJoin')}</option>
                  {others.map((other) => (
                    <option key={other.key} value={other.key}>
                      {optionOf(other)}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {info.silent.length > 0 && (
        <div className="alike-silent">
          <h3 className="meta">{t('alikeSilent')}</h3>
          <ul className="alike-silent-names">
            {info.silent.map((member) => (
              <li key={member.id} className={member.id === mine ? 'is-me' : undefined} dir="auto">
                {member.nickname}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
