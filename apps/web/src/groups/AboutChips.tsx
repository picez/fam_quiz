import { useId, useState } from 'react';
import { GROUP_LIMITS, answerKey, type GroupMember } from '@quiz/shared';
import { t } from '../i18n';
import { nickText } from '../nick';

/** Позиція «про кого» у формі: учасник (ім'я — для показу) чи вільне ім'я. */
export type AboutPick = { kind: 'member'; userId: string; name: string; former?: boolean } | { kind: 'name'; name: string };

/**
 * «Про кого (до 5)» (12k): чипи учасників (aria-pressed) в один рядок зі своєю прокруткою, вибрані вільні імена — чипи з «×»,
 * поле імені й «Додати ім'я» (Enter теж додає). На п'ятому поле неактивне.
 */
export function AboutChips({ members, value, onChange }: { members: GroupMember[]; value: AboutPick[]; onChange: (next: AboutPick[]) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const full = value.length >= GROUP_LIMITS.aboutMax;
  const picked = (userId: string) => value.some((entry) => entry.kind === 'member' && entry.userId === userId);
  // Ті, хто вже вийшов, але лишились у записі: показуємо їх як вибрані, щоб можна було прибрати.
  const formers = value.filter((entry): entry is Extract<AboutPick, { kind: 'member' }> => entry.kind === 'member' && !members.some((m) => m.id === entry.userId));

  const toggle = (member: GroupMember) => {
    if (picked(member.id)) onChange(value.filter((entry) => !(entry.kind === 'member' && entry.userId === member.id)));
    else if (!full) onChange([...value, { kind: 'member', userId: member.id, name: nickText(member.nickname) }]);
  };
  const add = () => {
    const clean = name.replace(/\s+/g, ' ').trim().slice(0, GROUP_LIMITS.aboutNameMax);
    if (clean === '' || full) return;
    if (!value.some((entry) => entry.kind === 'name' && answerKey(entry.name) === answerKey(clean))) onChange([...value, { kind: 'name', name: clean }]);
    setName('');
  };

  return (
    <fieldset className="about-chips">
      <legend>{t('itemAboutLabel')}</legend>
      <div className="about-members">
        {members.map((member) => (
          <button
            key={member.id}
            type="button"
            className={picked(member.id) ? 'chip is-on' : 'chip'}
            aria-pressed={picked(member.id)}
            disabled={full && !picked(member.id)}
            onClick={() => toggle(member)}
          >
            {nickText(member.nickname)}
          </button>
        ))}
        {formers.map((entry) => (
          <button
            key={entry.userId}
            type="button"
            className="chip is-on"
            aria-pressed
            onClick={() => onChange(value.filter((each) => !(each.kind === 'member' && each.userId === entry.userId)))}
          >
            {entry.name} · {t('groupFormerMember')}
          </button>
        ))}
      </div>
      {value.some((entry) => entry.kind === 'name') && (
        <ul className="about-names">
          {value.map((entry, index) =>
            entry.kind === 'name' ? (
              <li key={index} className="chip is-on">
                {entry.name}
                <button type="button" className="about-remove" aria-label={t('itemAboutRemove', { name: entry.name })} onClick={() => onChange(value.filter((_, i) => i !== index))}>
                  ×
                </button>
              </li>
            ) : null,
          )}
        </ul>
      )}
      <div className="about-add">
        <input
          id={`${id}-name`}
          value={name}
          maxLength={GROUP_LIMITS.aboutNameMax}
          placeholder={t('itemAboutNamePlaceholder')}
          aria-label={t('itemAboutNamePlaceholder')}
          disabled={full}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <button type="button" className="btn btn-small" disabled={full || name.trim() === ''} onClick={add}>
          {t('itemAboutAdd')}
        </button>
      </div>
      {full && <p className="meta">{t('itemAboutFull')}</p>}
    </fieldset>
  );
}
