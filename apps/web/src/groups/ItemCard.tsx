import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GroupItem } from '@quiz/shared';
import { deleteGroupItem } from '../api';
import { errorText, t } from '../i18n';
import { namesText } from '../locales/grammar';
import { nickText } from '../nick';
import { QuestionImage } from '../screens/QuestionImage';

/** Ім'я позиції «про кого»: учасник — нік (порожній — «Гравець»), вільне ім'я — як записане. */
export function aboutName(entry: GroupItem['about'][number]): string {
  return entry.kind === 'member' ? nickText(entry.name === '' ? null : entry.name) : entry.name;
}

/** «Використано у «A» і «B»» (12l): поточні назви вікторин, порожня — «без тексту». */
export function usedText(uses: GroupItem['uses']): string {
  return t('groupItemUsed', { titles: namesText(uses.map((use) => `«${use.title.trim() === '' ? t('untitled') : use.title}»`)) });
}

/**
 * Картка запису групи (12k): вид, текст, «про кого», відповідь, рік, фото, автор, позначка сюрпризу; «Змінити» і «Видалити».
 * 12l: «Використано у «…»»; pick — режим «Вікторини з групи»: чекбокс замість «Змінити» / «Видалити».
 */
export function ItemCard({
  groupId,
  item,
  onDeleted,
  pick,
}: {
  groupId: string;
  item: GroupItem;
  onDeleted: (id: string) => void;
  pick?: { checked: boolean; onToggle: () => void };
}) {
  const [error, setError] = useState<string | null>(null);
  const surpriseFor = item.about.filter((entry) => entry.kind === 'member').map(aboutName);
  const remove = async () => {
    if (!window.confirm(t('itemDeleteConfirm'))) return;
    const result = await deleteGroupItem(groupId, item.id);
    if (result.ok) onDeleted(item.id);
    else setError(errorText(result.error));
  };
  return (
    <article className={pick?.checked ? 'group-item is-picked' : 'group-item'}>
      {pick !== undefined && (
        <label className="group-item-pick">
          <input type="checkbox" checked={pick.checked} onChange={pick.onToggle} />
          <span>{t('groupQuizPick')}</span>
        </label>
      )}
      <div className="group-item-head">
        <span className="group-item-kind">{t(`itemKind_${item.kind}`)}</span>
        {item.year !== null && <span className="meta">{item.year}</span>}
      </div>
      <p className="group-item-text">{item.text}</p>
      {item.about.length > 0 && (
        <ul className="group-item-about">
          {item.about.map((entry, index) => (
            <li key={index} className="chip">
              {aboutName(entry)}
              {entry.kind === 'member' && entry.former && <span className="meta"> · {t('groupFormerMember')}</span>}
            </li>
          ))}
        </ul>
      )}
      {item.answer !== null && <p className="group-item-answer">{t('itemAnswerShown', { answer: item.answer })}</p>}
      {item.photo !== null && (
        <div className="group-item-photo">
          <QuestionImage url={item.photo} alt={item.text.slice(0, 60)} />
        </div>
      )}
      {item.uses.length > 0 && <p className="group-item-used">{usedText(item.uses)}</p>}
      {item.surprise && surpriseFor.length > 0 && <p className="group-item-surprise">{t('itemSurpriseFor', { names: surpriseFor.join(', ') })}</p>}
      <div className="group-item-foot">
        <span className="meta">{t('itemBy', { name: item.author === null ? t('groupFormerMember') : nickText(item.author.nickname) })}</span>
        <span className="group-item-actions">
          {pick === undefined && item.mine && (
            <Link className="btn btn-small" to={`/profile/groups/${encodeURIComponent(groupId)}/items/${encodeURIComponent(item.id)}`}>
              {t('itemEdit')}
            </Link>
          )}
          {pick === undefined && item.canDelete && (
            <button type="button" className="btn btn-small" onClick={() => void remove()}>
              {t('itemDelete')}
            </button>
          )}
        </span>
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
