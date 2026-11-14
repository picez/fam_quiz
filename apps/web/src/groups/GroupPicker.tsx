import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  GROUP_ITEM_KINDS,
  answerKey,
  filterGroupItems,
  type GroupCard,
  type GroupDetail,
  type GroupItem,
  type GroupItemKind,
  type Question,
  type QuestionType,
  type Rng,
} from '@quiz/shared';
import { getGroup, getGroupItems, getGroups } from '../api';
import { HelpButton } from '../help/HelpButton';
import { countText, errorText, t } from '../i18n';
import { aboutName, usedText } from './ItemCard';
import {
  GROUP_TEMPLATES,
  draftFrom,
  fictionOf,
  namePool,
  placeIssue,
  templateIssue,
  type GroupDraft,
  type GroupTemplate,
} from './templates';

export interface PickerTarget {
  /** questionTypesFor раунду; для поля — questionTypesFor('board'). */
  types: readonly QuestionType[];
  /** Так/ні в цьому раунді чи полі — для «У раунді: «так» — N, «ні» — M» і типового вибору. */
  booleans: { yes: number; no: number };
}

interface Opened {
  group: GroupDetail;
  items: GroupItem[];
}

const squeeze = (text: string) => text.replace(/\s+/g, ' ').trim();

/** Чернетка в «Як вийде»: текст і відповідь коротко. */
function Preview({ question }: { question: Question }) {
  const answer = (() => {
    switch (question.type) {
      case 'single':
        return (
          <ol className="group-preview-options">
            {question.options.map((option) => (
              <li key={option.id} className={option.id === question.correctId ? 'is-correct' : undefined}>
                {option.text}
                {option.id === question.correctId ? ' ✓' : ''}
              </li>
            ))}
          </ol>
        );
      case 'boolean':
        return <p className="meta">{t(question.correct ? 'yes' : 'no')} ✓</p>;
      case 'slider':
        return (
          <p className="meta">
            {question.min} – {question.max} · {question.correct} ✓
          </p>
        );
      case 'clues':
        return (
          <>
            <ol className="group-preview-options">
              {question.clues.map((clue, index) => (
                <li key={index}>{clue === '' ? '…' : clue}</li>
              ))}
            </ol>
            <p className="meta">{question.accepted[0]} ✓</p>
          </>
        );
      case 'text':
        return <p className="meta">{question.accepted[0]} ✓</p>;
      case 'bluff':
        return (
          <p className="meta">
            {question.accepted[0]} ✓ · {question.lies.map((lie) => (lie === '' ? '…' : lie)).join(' · ')}
          </p>
        );
      default:
        return null;
    }
  })();
  return (
    <>
      <p className="group-preview-text">{question.text}</p>
      {answer}
    </>
  );
}

/** Компактний запис у списку панелі: текст у 3 рядки, «про кого», «використано у «…»». */
function PickerItem({ item, onPick }: { item: GroupItem; onPick: () => void }) {
  return (
    <button type="button" className="group-picker-item" onClick={onPick}>
      <span className="group-picker-item-text">{item.text}</span>
      {item.about.length > 0 && <span className="meta">{item.about.map(aboutName).join(', ')}</span>}
      <span className="meta">
        {t(`itemKind_${item.kind}`)}
        {item.year !== null ? ` · ${item.year}` : ''}
      </span>
      {item.uses.length > 0 && <span className="group-item-used">{usedText(item.uses)}</span>}
    </button>
  );
}

/**
 * Панель «Запитання з групи» (12l): група → запис → шаблон → «Вставити запитання».
 * Сюрпризів про автора немає вже з сервера; на телефоні — на весь екран.
 */
export function GroupPicker({
  target,
  onPick,
  onClose,
  rng = Math.random,
  year = new Date().getFullYear(),
}: {
  target: PickerTarget;
  onPick: (draft: GroupDraft, source: { groupId: string; itemId: string }) => void;
  onClose: () => void;
  rng?: Rng;
  year?: number;
}) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const [groups, setGroups] = useState<GroupCard[] | null>(null);
  const [opened, setOpened] = useState<Opened | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<GroupItem | null>(null);
  const [template, setTemplate] = useState<GroupTemplate | null>(null);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<GroupItemKind | null>(null);
  const [unused, setUnused] = useState(false);
  const [truth, setTruth] = useState<'true' | 'false'>('true');
  const [fiction, setFiction] = useState('');

  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    heading.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const openGroup = async (id: string) => {
    setLoading(true);
    setError(null);
    const [found, list] = await Promise.all([getGroup(id), getGroupItems(id)]);
    setLoading(false);
    if (!found.ok) return setError(errorText(found.error));
    if (!list.ok) return setError(errorText(list.error));
    const { ok: _ok, ...group } = found;
    setOpened({ group: group as GroupDetail, items: list.data });
  };

  useEffect(() => {
    let current = true;
    void getGroups().then((result) => {
      if (!current) return;
      if (!result.ok) {
        setLoading(false);
        return setError(errorText(result.error));
      }
      setGroups(result.groups);
      if (result.groups.length === 1) void openGroup(result.groups[0]!.id);
      else setLoading(false);
    });
    return () => {
      current = false;
    };
  }, []);

  const pool = useMemo(() => (opened === null ? [] : namePool(opened.group, opened.items)), [opened]);
  // Пропозиція вигадки — раз на запис, щоб поле не стрибало від кожного рендеру.
  const suggestion = useMemo(() => (item === null || opened === null ? null : fictionOf(item, pool, opened.items, rng)), [item, opened, pool, rng]);
  const sameAsRecord = item !== null && answerKey(fiction) === answerKey(squeeze(item.text));

  const chooseTemplate = (next: GroupTemplate) => {
    setTemplate(next);
    if (next !== 'truth' || item === null) return;
    const { yes, no } = target.booleans;
    setTruth(yes < no ? 'true' : no < yes ? 'false' : suggestion !== null ? 'false' : 'true');
    setFiction(suggestion?.text ?? squeeze(item.text));
  };

  const draft = useMemo(() => {
    if (item === null || template === null || opened === null) return null;
    if (placeIssue(template, target.types) !== null || templateIssue(template, item, pool) !== null) return null;
    if (template === 'truth' && truth === 'false' && sameAsRecord) return null;
    return draftFrom(template, item, {
      pool,
      items: opened.items,
      rng,
      year,
      ...(template === 'truth' ? { truth: truth === 'true' ? { correct: true as const } : { correct: false as const, text: fiction } } : {}),
    });
  }, [item, template, opened, target.types, pool, truth, fiction, sameAsRecord, rng, year]);

  const back = () => {
    setError(null);
    if (item !== null) {
      setItem(null);
      setTemplate(null);
      return;
    }
    setOpened(null);
  };
  const canGoBack = item !== null || (opened !== null && (groups?.length ?? 0) > 1) || (error !== null && (groups?.length ?? 0) > 1);
  const chip = (on: boolean) => (on ? 'chip is-on' : 'chip');

  const body = () => {
    if (loading) return <p className="meta">{t('loading')}</p>;
    if (error !== null) {
      return (
        <p className="error" role="alert">
          {error}
        </p>
      );
    }
    if (opened === null) {
      if (groups === null) return null;
      if (groups.length === 0) {
        return (
          <>
            <p className="meta">{t('groupPickerNoGroups')}</p>
            <Link className="btn" to="/profile/groups">
              {t('groupPickerOpenGroups')}
            </Link>
          </>
        );
      }
      return (
        <>
          <h3 className="group-picker-step">{t('groupPickerGroups')}</h3>
          <div className="group-picker-list">
            {groups.map((group) => (
              <button key={group.id} type="button" className="group-picker-item" onClick={() => void openGroup(group.id)}>
                <span className="group-picker-item-text">
                  <span aria-hidden="true">{group.emoji}</span> {group.name}
                </span>
                <span className="meta">{countText('groupItems', group.items)}</span>
              </button>
            ))}
          </div>
        </>
      );
    }
    if (item === null) {
      const shown = filterGroupItems(opened.items, { query, kind, about: null, unused });
      return (
        <>
          <h3 className="group-picker-step">{t('groupPickerItems')}</h3>
          {opened.items.length === 0 ? (
            <p className="meta">{t('groupPickerNoItems')}</p>
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
              </div>
              {shown.length === 0 ? (
                <p className="meta">{t('itemsNothingFound')}</p>
              ) : (
                <div className="group-picker-list">
                  {shown.map((each) => (
                    <PickerItem
                      key={each.id}
                      item={each}
                      onPick={() => {
                        setItem(each);
                        setTemplate(null);
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      );
    }
    return (
      <>
        <p className="group-picker-record">{item.text}</p>
        <h3 className="group-picker-step">{t('groupPickerTemplates')}</h3>
        <div className="group-template-list">
          {GROUP_TEMPLATES.map((each) => {
            const issue = placeIssue(each, target.types) ?? templateIssue(each, item, pool);
            const reasonId = `${titleId}-${each}`;
            return (
              <button
                key={each}
                type="button"
                className={template === each ? 'group-template is-on' : 'group-template'}
                aria-pressed={template === each}
                disabled={issue !== null}
                aria-describedby={issue === null ? undefined : reasonId}
                onClick={() => chooseTemplate(each)}
              >
                <strong>{t(`groupTpl_${each}`)}</strong>
                <span className="meta">{t(`groupTplWhat_${each}`)}</span>
                {issue !== null && (
                  <span id={reasonId} className="group-template-why">
                    {t(issue.key, issue.vars)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {template === 'truth' && (
          <div className="group-truth">
            <p className="meta">{t('groupTruthBalance', target.booleans)}</p>
            <div className="group-kind-chips" role="radiogroup" aria-label={t('groupTpl_truth')}>
              {(['true', 'false'] as const).map((each) => (
                <button key={each} type="button" role="radio" aria-checked={truth === each} className={chip(truth === each)} onClick={() => setTruth(each)}>
                  {t(each === 'true' ? 'groupTruthTrue' : 'groupTruthFalse')}
                </button>
              ))}
            </div>
            {truth === 'false' && (
              <div className="field">
                <label htmlFor={`${titleId}-fiction`}>{t('groupTruthEdit')}</label>
                <textarea id={`${titleId}-fiction`} rows={3} value={fiction} onChange={(event) => setFiction(event.target.value)} />
                {sameAsRecord ? (
                  <span id={`${titleId}-same`} className="error">
                    {t('groupTruthSame')}
                  </span>
                ) : suggestion !== null && fiction === suggestion.text ? (
                  <span className="meta">{t('groupTruthSwapped', { from: suggestion.from, to: suggestion.to })}</span>
                ) : (
                  <span className="meta">{t('groupTruthHint')}</span>
                )}
              </div>
            )}
          </div>
        )}
        {draft !== null && (
          <section className="group-preview" aria-labelledby={`${titleId}-preview`}>
            <h3 id={`${titleId}-preview`} className="group-picker-step">
              {t('groupPickerPreview')}
            </h3>
            <Preview question={draft.question} />
          </section>
        )}
      </>
    );
  };

  return (
    <div className="group-picker-backdrop">
      <div className="group-picker" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="group-picker-head">
          {canGoBack && (
            <button type="button" className="btn btn-small" onClick={back}>
              ‹ {t('groupPickerBack')}
            </button>
          )}
          <h2 id={titleId} ref={heading} tabIndex={-1}>
            {t('groupPickerTitle')}
          </h2>
          <HelpButton id="setting.groups" />
          <button type="button" className="btn btn-small group-picker-close" aria-label={t('groupPickerClose')} onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="group-picker-body">{body()}</div>
        {item !== null && template !== null && opened !== null && (
          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={draft === null}
              aria-describedby={template === 'truth' && truth === 'false' && sameAsRecord ? `${titleId}-same` : undefined}
              onClick={() => {
                if (draft === null) return;
                onPick(draft, { groupId: opened.group.id, itemId: item.id });
                onClose();
              }}
            >
              {t('groupPickerInsert')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
