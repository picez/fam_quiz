import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BUFF_ICONS } from '../buff-meta';
import { DEBUFF_ICONS } from '../debuff-meta';
import { ROUND_ICONS, TYPE_ICONS } from '../guide-text';
import { HelpBody } from '../help/HelpButton';
import { HELP_TOPICS, helpAnchor, helpEntry, helpTopic, searchHelp, type HelpId } from '../help/host-help';
import { t } from '../i18n';

/** Значок запису: раундам, типам запитань, бафам і дебафам; клітинкам і налаштуванням — без значка. */
function icon(id: HelpId): string | undefined {
  const key = id.slice(id.indexOf('.') + 1);
  const icons: Record<string, Record<string, string> | undefined> = {
    rounds: ROUND_ICONS,
    questions: TYPE_ICONS,
    buffs: BUFF_ICONS,
    debuffs: DEBUFF_ICONS,
  };
  return icons[helpTopic(id)]?.[key];
}

export function HostHelp() {
  const { hash } = useLocation();
  const [query, setQuery] = useState('');
  const [target, setTarget] = useState<HelpId | null>(null);
  const found = searchHelp(query);

  useEffect(() => {
    const anchor = hash.slice(1);
    if (anchor === '') return;
    const id = searchHelp('').find((candidate) => helpAnchor(candidate) === anchor);
    if (id === undefined) return;
    setTarget(id);
    document.getElementById(anchor)?.scrollIntoView({ block: 'start' });
  }, [hash]);

  return (
    <main className="app wide host-help">
      <h1 className="brand">{t('helpTitle')}</h1>
      <p className="lead">{t('helpLead')}</p>
      <label className="field help-search">
        <span>{t('helpSearch')}</span>
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {found.length === 0 && <p className="meta">{t('helpNothing')}</p>}
      {HELP_TOPICS.map((topic) => {
        const ids = found.filter((id) => helpTopic(id) === topic);
        if (ids.length === 0) return null;
        return (
          <section key={topic} aria-labelledby={`help-topic-${topic}`}>
            <h2 id={`help-topic-${topic}`}>{t(`helpTopic_${topic}`)}</h2>
            {ids.map((id) => {
              const mark = icon(id);
              return (
                <article key={id} id={helpAnchor(id)} className={id === target ? 'panel help-entry is-target' : 'panel help-entry'} aria-labelledby={`${helpAnchor(id)}-title`}>
                  <h3 id={`${helpAnchor(id)}-title`}>
                    {mark !== undefined && <span aria-hidden="true">{mark} </span>}
                    {helpEntry(id).title}
                  </h3>
                  <HelpBody entry={helpEntry(id)} level={4} />
                </article>
              );
            })}
          </section>
        );
      })}
    </main>
  );
}
