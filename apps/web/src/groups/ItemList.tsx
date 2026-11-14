import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { GROUP_ITEM_KINDS, GROUP_LIMITS, answerKey, filterGroupItems, type GroupDetail, type GroupItem, type GroupItemKind } from '@quiz/shared';
import { getGroupItems } from '../api';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';
import { aboutName, ItemCard } from './ItemCard';
import { GroupQuizBar } from './GroupQuizBar';

/** Вкладка «Записи» (12k): «Додати запис», пошук, чипи виду, «Про кого» і картки. Фільтрує filterGroupItems. */
export function ItemList({ group }: { group: GroupDetail }) {
  const [items, setItems] = useState<GroupItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<GroupItemKind | null>(null);
  const [about, setAbout] = useState('');
  const [unused, setUnused] = useState(false);
  /** Режим «Вікторини з групи» (12l): позначені записи. */
  const [picking, setPicking] = useState<Set<string> | null>(null);

  useEffect(() => {
    let current = true;
    void getGroupItems(group.id).then((result) => {
      if (!current) return;
      if (result.ok) setItems(result.data);
      else setError(errorText(result.error));
    });
    return () => {
      current = false;
    };
  }, [group.id]);

  const options = useMemo(() => {
    const found = new Map<string, string>();
    for (const member of group.members) found.set(member.id, nickText(member.nickname));
    for (const item of items ?? []) {
      for (const entry of item.about) {
        const key = entry.kind === 'member' ? entry.userId : answerKey(entry.name);
        if (!found.has(key)) found.set(key, aboutName(entry));
      }
    }
    return [...found];
  }, [group.members, items]);

  if (error !== null) {
    return (
      <p className="error" role="alert">
        {error}
      </p>
    );
  }
  if (items === null) return <p className="meta">{t('loading')}</p>;

  const full = items.length >= GROUP_LIMITS.itemsMax;
  const shown = filterGroupItems(items, { query, kind, about: about === '' ? null : about, unused });
  const toggle = (id: string) =>
    setPicking((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const chip = (on: boolean) => (on ? 'chip is-on' : 'chip');

  return (
    <section className="group-items">
      <div className="group-items-add">
        {full ? (
          <>
            <button type="button" className="btn btn-primary" disabled>
              {t('itemsAdd')}
            </button>
            <p className="meta">{t('err_group_items_full')}</p>
          </>
        ) : (
          <Link className="btn btn-primary" to={`/profile/groups/${encodeURIComponent(group.id)}/new`}>
            {t('itemsAdd')}
          </Link>
        )}
        {items.length > 0 && picking === null && (
          <button type="button" className="btn" onClick={() => setPicking(new Set())}>
            {t('groupQuizButton')}
          </button>
        )}
      </div>
      {picking !== null && <p className="meta">{t('groupQuizHint')}</p>}
      {items.length === 0 ? (
        <p className="meta group-items-empty">{t('itemsEmpty')}</p>
      ) : (
        <>
          <div className="group-items-filters">
            <input type="search" value={query} placeholder={t('itemsSearch')} aria-label={t('itemsSearch')} onChange={(event) => setQuery(event.target.value)} />
            <div className="group-kind-chips">
              <button type="button" aria-pressed={unused} className={chip(unused)} onClick={() => setUnused((on) => !on)}>
                {t('groupPickerUnused')}
              </button>
              <span className="group-kind-radios" role="radiogroup" aria-label={t('itemKindsLabel')}>
                <button type="button" role="radio" aria-checked={kind === null} className={chip(kind === null)} onClick={() => setKind(null)}>
                  {t('itemsFilterAll')}
                </button>
                {GROUP_ITEM_KINDS.map((each) => (
                  <button key={each} type="button" role="radio" aria-checked={kind === each} className={chip(kind === each)} onClick={() => setKind(each)}>
                    {t(`itemKind_${each}`)}
                  </button>
                ))}
              </span>
            </div>
            <select value={about} aria-label={t('itemsFilterAbout')} onChange={(event) => setAbout(event.target.value)}>
              <option value="">{t('itemsFilterAnyone')}</option>
              {options.map(([value, name]) => (
                <option key={value} value={value}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          {shown.length === 0 ? (
            <p className="meta">{t('itemsNothingFound')}</p>
          ) : (
            <div className="group-item-list">
              {shown.map((item) => (
                <ItemCard
                  key={item.id}
                  groupId={group.id}
                  item={item}
                  onDeleted={(id) => setItems((all) => (all ?? []).filter((each) => each.id !== id))}
                  {...(picking === null ? {} : { pick: { checked: picking.has(item.id), onToggle: () => toggle(item.id) } })}
                />
              ))}
            </div>
          )}
        </>
      )}
      {picking !== null && (
        <GroupQuizBar group={group} items={items} picked={items.filter((each) => picking.has(each.id))} onCancel={() => setPicking(null)} />
      )}
    </section>
  );
}
