import { useState, type FormEvent } from 'react';
import type { Answer, Choice, PublicQuestion } from '@quiz/shared';
import { choiceLabel, LETTERS } from '../format';
import { t } from '../i18n';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { CloudInput } from './CloudInput';
import { MatchInput } from './MatchView';
import { PinInput } from './PinInput';
import { SliderInput } from './SliderInput';
import { SurveyInput } from './SurveyInput';

interface Props {
  question: PublicQuestion;
  onSubmit: (answer: Answer) => void;
  /** 50/50: ці варіанти single/multi лишаються на своєму місці, приглушені й вимкнені — список не стискається. */
  removed?: string[];
  /** Напис кнопки надсилання (голосування — «Голосувати»); типово «Відповісти». */
  submitLabel?: string;
  /** Поле тексту отримує фокус одразу (типово так; аркуш голосування — ні). */
  autoFocus?: boolean;
  /** Командна гра: капітан шле чернетку при кожній зміні поля (те саме перетворення, що й надсилання); порожнє поле — null. Без пропа поведінка звичайна. */
  onDraft?: (draft: Answer | null) => void;
}

const NONE: string[] = [];

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function ChoiceButtons({
  choices,
  picked,
  removed = NONE,
  onPick,
}: {
  choices: Choice[];
  picked: string[];
  removed?: string[];
  onPick: (id: string) => void;
}) {
  return (
    <div className={choicesClass(choices)}>
      {choices.map((choice, index) => {
        const gone = removed.includes(choice.id);
        return (
          <button
            type="button"
            key={choice.id}
            className={gone ? 'choice is-removed' : picked.includes(choice.id) ? 'choice is-picked' : 'choice'}
            aria-pressed={picked.includes(choice.id)}
            aria-label={gone ? t('choiceRemoved', { choice: choiceLabel(choice, index) }) : undefined}
            disabled={gone}
            onClick={() => onPick(choice.id)}
          >
            <ChoiceFace choice={choice} letter={LETTERS[index]} />
            {gone && <span className="removed-tag">{t('removedTag')}</span>}
          </button>
        );
      })}
    </div>
  );
}

function MultiInput({ question, onSubmit, removed, submitLabel, onDraft }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  // Вибране до 50/50, а потім прибране, у відповідь не йде й не світиться вибраним.
  const keep = (list: string[]) => (removed === undefined ? list : list.filter((id) => !removed.includes(id)));
  // Порядок як у запитанні, а не як натискав гравець.
  const orderedOf = (list: string[]) => question.choices.map((choice) => choice.id).filter((id) => keep(list).includes(id));
  const toggle = (id: string) => {
    const next = picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];
    setPicked(next);
    const ids = orderedOf(next);
    onDraft?.(ids.length === 0 ? null : { type: 'multi', optionIds: ids });
  };
  const kept = keep(picked);
  const ordered = orderedOf(picked);
  return (
    <>
      <ChoiceButtons choices={question.choices} picked={kept} removed={removed} onPick={toggle} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={ordered.length === 0}
        onClick={() => onSubmit({ type: 'multi', optionIds: ordered })}
      >
        {submitLabel ?? t('submit')}
      </button>
    </>
  );
}

function TypedInput({ question, onSubmit, submitLabel, autoFocus = true, onDraft }: Props) {
  const [raw, setRaw] = useState('');
  const numeric = question.type === 'numeric';
  const number = numeric ? parseNumber(raw) : null;
  const text = raw.trim();
  const ready = numeric ? number !== null : text !== '';
  const change = (next: string) => {
    setRaw(next);
    if (onDraft === undefined) return;
    const value = next.trim();
    if (numeric) {
      const parsed = parseNumber(next);
      onDraft(parsed === null ? null : { type: 'numeric', value: parsed });
    } else onDraft(value === '' ? null : { type: question.type === 'clues' ? 'clues' : 'text', value });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (numeric && number !== null) onSubmit({ type: 'numeric', value: number });
    // «Хто я?» відповідає словами, як «текст», але з власним типом відповіді.
    else if (!numeric && text !== '') onSubmit({ type: question.type === 'clues' ? 'clues' : 'text', value: text });
  };

  return (
    <form className="typed" onSubmit={submit}>
      <label className="field">
        <span>{t('yourAnswer')}</span>
        <input
          value={raw}
          onChange={(event) => change(event.target.value)}
          inputMode={numeric ? 'decimal' : 'text'}
          placeholder={t(numeric ? 'numberPlaceholder' : 'answerPlaceholder')}
          maxLength={200}
          autoComplete="off"
          autoFocus={autoFocus}
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {submitLabel ?? t('submit')}
      </button>
    </form>
  );
}

function OrderInput({ question, onSubmit, onDraft }: Props) {
  const [items, setItems] = useState<Choice[]>(question.choices);
  const move = (index: number, step: -1 | 1) => {
    const next = [...items];
    [next[index], next[index + step]] = [next[index + step], next[index]];
    setItems(next);
    onDraft?.({ type: 'order', itemIds: next.map((item) => item.id) });
  };

  return (
    <>
      {question.orderLabels !== null && question.orderLabels.top !== '' && <p className="order-label is-top">↑ {question.orderLabels.top}</p>}
      <ol className="order">
        {items.map((item, index) => (
          <li key={item.id}>
            <span className="letter">{index + 1}</span>
            <span className="order-text">{item.text}</span>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveUp', { item: item.text })}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="btn btn-icon"
              aria-label={t('moveDown', { item: item.text })}
              disabled={index === items.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      {question.orderLabels !== null && question.orderLabels.bottom !== '' && <p className="order-label is-bottom">↓ {question.orderLabels.bottom}</p>}
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => onSubmit({ type: 'order', itemIds: items.map((item) => item.id) })}
      >
        {t('submit')}
      </button>
    </>
  );
}

/** Вибір одного варіанта з підтвердженням: капітан спершу позначає (чернетка для команди), потім «Відповісти». */
function ConfirmChoice({ question, onSubmit, removed, submitLabel, onDraft }: Props) {
  const boolean = question.type === 'boolean';
  const [picked, setPicked] = useState<string | null>(null);
  const answerOf = (id: string): Answer => (boolean ? { type: 'boolean', value: id === 'true' } : { type: 'single', optionId: id });
  const kept = picked !== null && !(removed ?? NONE).includes(picked) ? picked : null;
  const pick = (id: string) => {
    setPicked(id);
    onDraft?.(answerOf(id));
  };
  return (
    <>
      {boolean ? (
        <div className="choices">
          {['true', 'false'].map((id) => (
            <button type="button" className={kept === id ? 'choice is-picked' : 'choice'} aria-pressed={kept === id} key={id} onClick={() => pick(id)}>
              <span>{t(id === 'true' ? 'yes' : 'no')}</span>
            </button>
          ))}
        </div>
      ) : (
        <ChoiceButtons choices={question.choices} picked={kept === null ? NONE : [kept]} removed={removed} onPick={pick} />
      )}
      <button type="button" className="btn btn-primary" disabled={kept === null} onClick={() => kept !== null && onSubmit(answerOf(kept))}>
        {submitLabel ?? t('submit')}
      </button>
    </>
  );
}

export function AnswerInput({ question, onSubmit, removed, submitLabel, autoFocus, onDraft }: Props) {
  switch (question.type) {
    case 'single':
      if (onDraft !== undefined) return <ConfirmChoice question={question} onSubmit={onSubmit} removed={removed} submitLabel={submitLabel} onDraft={onDraft} />;
      return (
        <ChoiceButtons
          choices={question.choices}
          picked={[]}
          removed={removed}
          onPick={(optionId) => onSubmit({ type: 'single', optionId })}
        />
      );
    case 'boolean':
      if (onDraft !== undefined) return <ConfirmChoice question={question} onSubmit={onSubmit} submitLabel={submitLabel} onDraft={onDraft} />;
      return (
        <div className="choices">
          {[true, false].map((value) => (
            <button type="button" className="choice" key={String(value)} onClick={() => onSubmit({ type: 'boolean', value })}>
              <span>{t(value ? 'yes' : 'no')}</span>
            </button>
          ))}
        </div>
      );
    case 'multi':
      return <MultiInput question={question} onSubmit={onSubmit} removed={removed} submitLabel={submitLabel} onDraft={onDraft} />;
    case 'text':
    case 'numeric':
    case 'clues':
      return <TypedInput question={question} onSubmit={onSubmit} submitLabel={submitLabel} autoFocus={autoFocus} onDraft={onDraft} />;
    case 'order':
      return <OrderInput question={question} onSubmit={onSubmit} onDraft={onDraft} />;
    case 'match':
      return <MatchInput question={question} onSubmit={onSubmit} onDraft={onDraft} />;
    case 'pin':
      return question.pin === null ? null : <PinInput question={{ ...question, pin: question.pin }} onSubmit={onSubmit} submitLabel={submitLabel} onDraft={onDraft} />;
    case 'poll':
      return (
        <ChoiceButtons
          choices={question.choices}
          picked={[]}
          removed={removed}
          onPick={(optionId) => onSubmit({ type: 'poll', optionId })}
        />
      );
    case 'wordcloud':
      return question.cloud === null ? null : <CloudInput words={question.cloud.words} onSubmit={onSubmit} autoFocus={autoFocus} />;
    case 'wall':
      return null; // стіну веде PlayerScreen (WallInput), як сортування
    case 'bluff':
      return null; // задача 7: вигадка й вибір — не player:answer
    case 'survey':
      return question.survey === null ? null : <SurveyInput answers={question.survey.answers} onSubmit={onSubmit} submitLabel={submitLabel} autoFocus={autoFocus} onDraft={onDraft} />;
    case 'slider':
      return question.slider === null ? null : <SliderInput question={{ ...question, slider: question.slider }} onSubmit={onSubmit} submitLabel={submitLabel} onDraft={onDraft} />;
  }
}
