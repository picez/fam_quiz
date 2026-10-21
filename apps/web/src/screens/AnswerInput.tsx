import { useState, type FormEvent } from 'react';
import type { Answer, Choice, PublicQuestion } from '@quiz/shared';
import { LETTERS } from '../format';
import { t } from '../i18n';
import { MatchInput } from './MatchView';

interface Props {
  question: PublicQuestion;
  onSubmit: (answer: Answer) => void;
}

function parseNumber(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.').replace(/\s/g, '');
  if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function ChoiceButtons({ choices, picked, onPick }: { choices: Choice[]; picked: string[]; onPick: (id: string) => void }) {
  return (
    <div className="choices">
      {choices.map((choice, index) => (
        <button
          type="button"
          key={choice.id}
          className={picked.includes(choice.id) ? 'choice is-picked' : 'choice'}
          aria-pressed={picked.includes(choice.id)}
          onClick={() => onPick(choice.id)}
        >
          <span className="letter">{LETTERS[index]}</span>
          <span>{choice.text}</span>
        </button>
      ))}
    </div>
  );
}

function MultiInput({ question, onSubmit }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (id: string) => setPicked((now) => (now.includes(id) ? now.filter((x) => x !== id) : [...now, id]));
  // Порядок як у запитанні, а не як натискав гравець.
  const ordered = question.choices.map((choice) => choice.id).filter((id) => picked.includes(id));
  return (
    <>
      <ChoiceButtons choices={question.choices} picked={picked} onPick={toggle} />
      <button
        type="button"
        className="btn btn-primary"
        disabled={ordered.length === 0}
        onClick={() => onSubmit({ type: 'multi', optionIds: ordered })}
      >
        {t('submit')}
      </button>
    </>
  );
}

function TypedInput({ question, onSubmit }: Props) {
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
          autoFocus
        />
      </label>
      <button type="submit" className="btn btn-primary" disabled={!ready}>
        {t('submit')}
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

export function AnswerInput({ question, onSubmit }: Props) {
  switch (question.type) {
    case 'single':
      return (
        <ChoiceButtons
          choices={question.choices}
          picked={[]}
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
      return <MultiInput question={question} onSubmit={onSubmit} />;
    case 'text':
    case 'numeric':
      return <TypedInput question={question} onSubmit={onSubmit} />;
    case 'order':
      return <OrderInput question={question} onSubmit={onSubmit} />;
    case 'match':
      return <MatchInput question={question} onSubmit={onSubmit} />;
  }
}
