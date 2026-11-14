import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LIMITS, type GroupDetail, type GroupItem } from '@quiz/shared';
import { loadDraft, saveDraft, saveGroupDrafts } from '../editor/draft-storage';
import { t } from '../i18n';
import { GROUP_TEMPLATES, buildGroupQuiz, namePool, templateIssue, type GroupTemplate } from './templates';

/**
 * Липка панель «Вікторини з групи» (12l): шаблон чи «Змішано», хто стане «Правда чи вигадка?»,
 * «Скласти вікторину · N» — чернетка нової вікторини з одного раунду відкривається в редакторі.
 */
export function GroupQuizBar({ group, items, picked, onCancel }: { group: GroupDetail; items: readonly GroupItem[]; picked: readonly GroupItem[]; onCancel: () => void }) {
  const navigate = useNavigate();
  const selectId = useId();
  const [choice, setChoice] = useState<GroupTemplate | 'mixed'>('mixed');
  const pool = namePool(group, items);
  const fallback = choice === 'mixed' || choice === 'truth' ? 0 : picked.filter((item) => templateIssue(choice, item, pool) !== null).length;
  const tooMany = picked.length > LIMITS.maxQuestions;

  const create = () => {
    if (loadDraft(undefined) !== null && !window.confirm(t('groupQuizReplaceDraft'))) return;
    const { quiz, drafts } = buildGroupQuiz(group, picked, items, choice, Math.random, new Date().getFullYear());
    saveDraft(undefined, quiz);
    saveGroupDrafts(undefined, {
      entries: Object.fromEntries(drafts.map((draft) => [draft.questionId, { groupId: group.id, itemId: draft.itemId, notes: draft.notes }])),
      fresh: true,
    });
    navigate('/quizzes/new');
  };

  return (
    <div className="actions group-quiz-bar">
      <div className="group-quiz-bar-row">
        <label htmlFor={selectId}>{t('groupQuizTemplate')}</label>
        <select id={selectId} value={choice} onChange={(event) => setChoice(event.target.value as GroupTemplate | 'mixed')}>
          <option value="mixed">{t('groupQuizMixed')}</option>
          {GROUP_TEMPLATES.map((template) => (
            <option key={template} value={template}>
              {t(`groupTpl_${template}`)}
            </option>
          ))}
        </select>
      </div>
      {fallback > 0 && <p className="meta">{t('groupQuizFallback', { count: fallback })}</p>}
      {tooMany && <p className="error">{t('groupQuizMax', { max: LIMITS.maxQuestions })}</p>}
      <button type="button" className="btn btn-primary" disabled={picked.length === 0 || tooMany} onClick={create}>
        {t('groupQuizCreate', { count: picked.length })}
      </button>
      <button type="button" className="btn" onClick={onCancel}>
        {t('cancel')}
      </button>
    </div>
  );
}
