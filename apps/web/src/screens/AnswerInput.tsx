import { useState, type FormEvent } from 'react';
import type { Answer, Choice, PublicQuestion } from '@quiz/shared';
import { choiceLabel, LETTERS } from '../format';
import { t } from '../i18n';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { MatchInput } from './MatchView';
import { SliderInput } from './SliderInput';

interface Props {
  question: PublicQuestion;
  onSubmit: (answer: Answer) => void;
  /** 50/50: ці варіанти single/multi лишаються на своєму місці, приглушені й вимкнені — список не стискається. */
  removed?: string[];
  /** Напис кнопки надсилання (голосування — «Голосувати»); типово «Відповісти». */
  submitLabel?: string;
  /** Поле тексту отримує фокус одразу (типово так; аркуш голосування — ні). */
  autoFocus?: boolean;
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

function MultiInput({ question, onSubmit, removed, submitLabel }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  // Вибране до 50/50, а потім прибране, у відповідь не йде й не світиться вибраним.
  const kept = removed === undefined ? picked : picked.filter((id) => !removed.includes(id));
  // Порядок як у запитанні, а не як натискав гравець.
  const ordered = question.choices.map((choice) => choice.id).filter((id) => kept.includes(id));
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

function TypedInput({ question, onSubmit, submitLabel, autoFocus = true }: Props) {
  const [raw, setRaw] = useState('');
  const numeric = question.type === 'numeric';
  const number = numeric ? parseNumber(raw) : null;
  const text = raw.trim();
  const ready = numeric ? number !== null : text !== '';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (numeric && number !== null) onSubmit({ type: 'numeric', value: number });
    else if (!numeric && text !== '') onSubmit({ type: 'text', value: text });
  };

  return (
    <form className="typed" onSubmit={submit}>
      <label className="field">
        <span>{t('yourAnswer')}</span>
        <input
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
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

function OrderInput({ question, onSubmit }: Props) {
  const [items, setItems] = useState<Choice[]>(question.choices);
  const move = (index: number, step: -1 | 1) =>
    setItems((now) => {
      const next = [...now];
      [next[index], next[index + step]] = [next[index + step], next[index]];
      return next;
    });

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

export function AnswerInput({ question, onSubmit, removed, submitLabel, autoFocus }: Props) {
  switch (question.type) {
    case 'single':
      return (
        <ChoiceButtons
          choices={question.choices}
          picked={[]}
          removed={removed}
          onPick={(optionId) => onSubmit({ type: 'single', optionId })}
        />
      );
    case 'boolean':
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
      return <MultiInput question={question} onSubmit={onSubmit} removed={removed} submitLabel={submitLabel} />;
    case 'text':
    case 'numeric':
      return <TypedInput question={question} onSubmit={onSubmit} submitLabel={submitLabel} autoFocus={autoFocus} />;
    case 'order':
      return <OrderInput question={question} onSubmit={onSubmit} />;
    case 'match':
      return <MatchInput question={question} onSubmit={onSubmit} />;
    case 'slider':
      return question.slider === null ? null : <SliderInput question={{ ...question, slider: question.slider }} onSubmit={onSubmit} submitLabel={submitLabel} />;
  }
}
