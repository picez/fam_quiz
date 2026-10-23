import { LIMITS, type DuelCategory, type DuelQuestion, type Duels } from '@quiz/shared';
import { useState } from 'react';
import { countText, t } from '../i18n';
import { newDuelCategory, newDuelQuestion, newDuels } from './draft';
import { NumberField, Rows } from './QuestionEditor';

interface Props {
  duels: Duels | undefined;
  onChange: (next: Duels | undefined) => void;
}

const hasText = (duels: Duels) =>
  duels.categories.some((category) => category.title.trim() !== '' || category.questions.some((q) => q.text.trim() !== '' || q.accepted.some((s) => s.trim() !== '')));

/** Розділ «Дуелі»: вмикач, налаштування й пул запитань за категоріями. Немає `duels` — дуелі вимкнено. */
export function DuelsEditor({ duels, onChange }: Props) {
  const [picked, setPicked] = useState(0);

  const toggle = (on: boolean) => {
    if (on) {
      setPicked(0);
      onChange(newDuels());
      return;
    }
    if (duels !== undefined && hasText(duels) && !window.confirm(t('duelsOffConfirm'))) return;
    onChange(undefined);
  };

  return (
    <>
      <label className="check">
        <input type="checkbox" checked={duels !== undefined} onChange={(event) => toggle(event.target.checked)} />
        <span>{t('duelsToggle')}</span>
      </label>
      {duels !== undefined && <Pool duels={duels} picked={Math.min(picked, duels.categories.length - 1)} onPick={setPicked} onChange={onChange} />}
    </>
  );
}

function Pool({ duels, picked, onPick, onChange }: { duels: Duels; picked: number; onPick: (index: number) => void; onChange: (next: Duels) => void }) {
  const { categories } = duels;
  const category = categories[picked];
  const name = (c: DuelCategory, index: number) => (c.title.trim() === '' ? t('duelCategoryN', { index: index + 1 }) : c.title.trim());
  const setCategory = (next: DuelCategory) => onChange({ ...duels, categories: categories.map((c, i) => (i === picked ? next : c)) });
  const setQuestion = (index: number, next: DuelQuestion) =>
    setCategory({ ...category, questions: category.questions.map((q, i) => (i === index ? next : q)) });

  const addCategory = () => {
    onChange({ ...duels, categories: [...categories, newDuelCategory(duels.questionsPerDuel >= 1 ? duels.questionsPerDuel : 1)] });
    onPick(categories.length);
  };
  const removeCategory = () => {
    onChange({ ...duels, categories: categories.filter((_, i) => i !== picked) });
    onPick(Math.max(0, picked - 1));
  };

  return (
    <>
      <p className="meta">{t('duelsHint')}</p>
      <div className="pair">
        <NumberField label={t('duelsPerDuel')} value={duels.questionsPerDuel} onChange={(value) => onChange({ ...duels, questionsPerDuel: value })} />
        <NumberField label={t('duelsTime')} value={duels.timeLimit} onChange={(value) => onChange({ ...duels, timeLimit: value })} />
      </div>
      <NumberField label={t('duelsStake')} value={duels.stake} onChange={(value) => onChange({ ...duels, stake: value })} />
      <p className="meta">{t('duelsStakeHint')}</p>

      <div className="type-chips">
        {categories.map((c, index) => (
          <button
            key={c.id}
            type="button"
            className={index === picked ? 'chip is-on' : 'chip'}
            aria-pressed={index === picked}
            onClick={() => onPick(index)}
          >
            {`${name(c, index)} · ${countText('questionCount', c.questions.length, { count: c.questions.length })}`}
          </button>
        ))}
        <button type="button" className="chip" disabled={categories.length >= LIMITS.maxDuelCategories} onClick={addCategory}>
          {t('addDuelCategory')}
        </button>
      </div>

      <label className="field">
        <span>{t('duelCategoryTitle')}</span>
        <input
          value={category.title}
          maxLength={LIMITS.categoryTitle}
          onChange={(event) => setCategory({ ...category, title: event.target.value })}
        />
      </label>
      <button type="button" className="btn btn-small btn-danger duel-remove" disabled={categories.length <= 1} onClick={removeCategory}>
        {t('removeDuelCategory', { name: name(category, picked) })}
      </button>

      {category.questions.map((question, index) => (
        <div className="duel-question" key={question.id}>
          <label className="field">
            <span>{t('duelQuestionN', { index: index + 1 })}</span>
            <textarea
              rows={2}
              value={question.text}
              maxLength={LIMITS.questionText}
              onChange={(event) => setQuestion(index, { ...question, text: event.target.value })}
            />
          </label>
          {/* Написання не мають власних id, тому ключем рядка є його позиція. */}
          <Rows
            rows={question.accepted.map((text, i) => ({ id: String(i), text }))}
            min={1}
            max={LIMITS.maxAccepted}
            maxLength={LIMITS.answerText}
            label="spellingN"
            removeLabel="removeSpelling"
            addLabel="addSpelling"
            rowClass={() => 'is-correct'}
            makeRow={() => ({ id: String(question.accepted.length), text: '' })}
            onChange={(next) => setQuestion(index, { ...question, accepted: next.map((row) => row.text) })}
          />
          <button
            type="button"
            className="btn btn-small btn-danger duel-remove"
            aria-label={t('removeDuelQuestion', { index: index + 1 })}
            disabled={category.questions.length <= 1}
            onClick={() => setCategory({ ...category, questions: category.questions.filter((_, i) => i !== index) })}
          >
            {t('remove')}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-dashed"
        disabled={category.questions.length >= LIMITS.maxDuelCategoryQuestions}
        onClick={() => setCategory({ ...category, questions: [...category.questions, newDuelQuestion()] })}
      >
        {t('addDuelQuestion')}
      </button>
    </>
  );
}
