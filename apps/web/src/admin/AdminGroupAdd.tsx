import { useState, type JSX } from 'react';
import { GROUP_ITEM_KINDS, GROUP_LIMITS, type AdminGroupMember, type AdminGroupRow, type GroupItemKind } from '@quiz/shared';
import type { ApiData } from '../api';
import { itemInput, yearOk } from '../groups/ItemForm';
import { t, type TextKey } from '../i18n';
import { nickText } from '../nick';
import { addGroupItem, addGroupMember } from './admin-api';
import { PeoplePicker, type PickedPerson } from './PeoplePicker';

/** Дія картки групи (AdminGroup): підтвердження → запит → помилка в report; true — успіх. */
export type GroupAct = (confirmText: string | null, run: () => Promise<ApiData<unknown>>, report: (message: string | null) => void) => Promise<boolean>;

interface SectionProps {
  group: AdminGroupRow;
  busy: boolean;
  act: GroupAct;
  reload: () => void;
}

/** Рядки під формою: успіх (role=status) і помилка (role=alert) — свої в кожного розділу, поруч із кнопкою. */
function Lines({ done, error }: { done: string; error: string | null }): JSX.Element {
  return (
    <>
      <p className="meta admin-action-line" role="status">
        {done}
      </p>
      <p className="error admin-action-line" role="alert">
        {error ?? ''}
      </p>
    </>
  );
}

/**
 * 72: «Додати учасника» — пошук людини, підтвердження, людина одразу в групі. Сповіщення — у «Вхідних» завжди,
 * пуш — якщо в людини є підписка (рядок стану каже, що саме сталося).
 */
export function AddMemberSection({ group, busy, act, reload }: SectionProps): JSX.Element {
  const [picked, setPicked] = useState<PickedPerson[]>([]);
  // Після успіху пошук починається наново: новий key скидає набране в PeoplePicker.
  const [round, setRound] = useState(0);
  const [done, setDone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const person = picked[0];

  const add = async () => {
    if (person === undefined) return;
    const name = nickText(person.nickname);
    let pushed = false;
    setDone('');
    const ok = await act(
      t('adminGroupAddConfirm', { name, group: group.name }),
      async () => {
        const result = await addGroupMember(group.id, person.id);
        if (result.ok) pushed = result.data.pushed;
        return result;
      },
      setError,
    );
    if (!ok) return;
    setDone(`${t('adminGroupAdded', { name })} ${pushed ? t('adminGroupAddedPushed') : t('adminGroupAddedNoPush')}`);
    setPicked([]);
    setRound((n) => n + 1);
    reload();
  };

  return (
    <section className="panel admin-card-section admin-group-add">
      <h2>{t('adminGroupAddTitle')}</h2>
      {group.hidden !== null ? (
        <p className="meta">{t('err_group_hidden')}</p>
      ) : group.members >= GROUP_LIMITS.membersMax ? (
        <p className="meta">{t('adminGroupFull', { max: GROUP_LIMITS.membersMax })}</p>
      ) : (
        <>
          <p className="meta">{t('adminGroupAddLead', { members: GROUP_LIMITS.membersMax, groups: GROUP_LIMITS.groupsPerUser })}</p>
          <PeoplePicker key={round} id="admin-group-add" value={picked} onChange={setPicked} max={1} />
          <button type="button" className="btn" disabled={busy || person === undefined} onClick={() => void add()}>
            {t('adminGroupAddButton')}
          </button>
        </>
      )}
      <Lines done={done} error={error} />
    </section>
  );
}

/**
 * 72: «Новий запис» від Квіз-бота — вид, текст, «про кого» з теперішніх незаблокованих учасників (до 5), відповідь і рік.
 * Без фото й без сюрпризу; тіло — те саме itemInput, що й у формі гравця.
 */
export function AddItemSection({ group, members, busy, act, reload }: SectionProps & { members: AdminGroupMember[] }): JSX.Element {
  const [kind, setKind] = useState<GroupItemKind>('fact');
  const [text, setText] = useState('');
  const [about, setAbout] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [year, setYear] = useState('');
  const [done, setDone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const people = members.filter((member) => !member.banned);
  const aboutFull = about.length >= GROUP_LIMITS.aboutMax;
  const ready = text.trim() !== '' && yearOk(year);

  const toggle = (userId: string, on: boolean) => setAbout((now) => (on ? [...now, userId] : now.filter((id) => id !== userId)));
  const add = async () => {
    setDone('');
    const picks = people.filter((member) => about.includes(member.id)).map((member) => ({ kind: 'member' as const, userId: member.id, name: member.nickname ?? '' }));
    const body = itemInput({ kind, text, about: picks, answer, year, photo: null, surprise: false });
    if (!(await act(null, () => addGroupItem(group.id, body), setError))) return;
    setDone(t('adminGroupItemAdded'));
    setText('');
    setAbout([]);
    setAnswer('');
    setYear('');
    reload();
  };

  if (group.hidden !== null || group.items >= GROUP_LIMITS.itemsMax) {
    return (
      <div className="admin-group-new-item">
        <h3>{t('adminGroupItemAddTitle')}</h3>
        <p className="meta">{group.hidden !== null ? t('err_group_hidden') : t('adminGroupItemsFull', { max: GROUP_LIMITS.itemsMax })}</p>
      </div>
    );
  }
  return (
    <div className="admin-group-new-item">
      <h3>{t('adminGroupItemAddTitle')}</h3>
      <p className="meta">{t('adminGroupItemAddLead')}</p>
      <fieldset className="field">
        <legend>{t('itemKindsLabel')}</legend>
        {GROUP_ITEM_KINDS.map((value) => (
          <label key={value} className="field field-check" htmlFor={`admin-group-item-kind-${value}`}>
            <input id={`admin-group-item-kind-${value}`} type="radio" name="admin-group-item-kind" checked={kind === value} onChange={() => setKind(value)} />
            <span>{t(`itemKind_${value}` as TextKey)}</span>
          </label>
        ))}
      </fieldset>
      <label className="field" htmlFor="admin-group-item-text">
        <span>{t('itemTextLabel')}</span>
        <textarea id="admin-group-item-text" value={text} rows={3} maxLength={GROUP_LIMITS.textMax} dir="auto" aria-describedby="admin-group-item-count" onChange={(event) => setText(event.target.value)} />
      </label>
      <p id="admin-group-item-count" className="meta">
        {t('groupCounter', { used: text.length, max: GROUP_LIMITS.textMax })}
      </p>
      {people.length > 0 && (
        <fieldset className="field">
          <legend>{t('adminGroupItemAbout', { max: GROUP_LIMITS.aboutMax })}</legend>
          {people.map((member) => {
            const on = about.includes(member.id);
            return (
              <label key={member.id} className="field field-check" htmlFor={`admin-group-item-about-${member.id}`}>
                <input id={`admin-group-item-about-${member.id}`} type="checkbox" checked={on} disabled={!on && aboutFull} onChange={(event) => toggle(member.id, event.target.checked)} />
                <span dir="auto">{nickText(member.nickname)}</span>
              </label>
            );
          })}
        </fieldset>
      )}
      <label className="field" htmlFor="admin-group-item-answer">
        <span>{t('itemAnswerLabel')}</span>
        <input id="admin-group-item-answer" type="text" value={answer} maxLength={GROUP_LIMITS.answerMax} dir="auto" onChange={(event) => setAnswer(event.target.value)} />
      </label>
      <label className="field" htmlFor="admin-group-item-year">
        <span>{t('itemYearLabel')}</span>
        <input id="admin-group-item-year" type="text" inputMode="numeric" value={year} maxLength={4} onChange={(event) => setYear(event.target.value)} />
      </label>
      <button type="button" className="btn" disabled={busy || !ready} onClick={() => void add()}>
        {t('adminGroupItemAddButton')}
      </button>
      <Lines done={done} error={error} />
    </div>
  );
}
