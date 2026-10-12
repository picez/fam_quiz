import { LIMITS, type Question } from '@quiz/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { t, type TextKey } from '../i18n';
import { QUESTION_TYPES, changeType, type QuestionType } from './draft';
import { newId } from './new-id';

interface Props {
  question: Question;
  onChange: (next: Question) => void;
}

interface Row {
  id: string;
  text: string;
}

const newRow = (): Row => ({ id: newId(), text: '' });
const asNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw.trim().replace(',', '.')));
const shown = (value: number) => (Number.isFinite(value) ? String(value) : '');
const sameNumber = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/**
 * Поле для числа. Показує саме те, що набрано ("-", "2,", "30x"), і віддає назовні число
 * або NaN: якби поле перемальовувалося з числа, проміжні стани набору зникали б.
 */
function NumberField(props: { label: string; value: number; decimal?: boolean; onChange: (value: number) => void }) {
  const [raw, setRaw] = useState(() => shown(props.value));

  // Значення змінили ззовні (наприклад, відновили чернетку): показати його.
  useEffect(() => {
    setRaw((current) => (sameNumber(asNumber(current), props.value) ? current : shown(props.value)));
  }, [props.value]);

  return (
    <label className="field">
      <span>{props.label}</span>
      <input
        inputMode={props.decimal ? 'text' : 'numeric'}
        value={raw}
        maxLength={24}
        onChange={(event) => {
          setRaw(event.target.value);
          props.onChange(asNumber(event.target.value));
        }}
      />
    </label>
  );
}

/** Список рядків із текстом: варіанти, елементи впорядкування. */
function Rows(props: {
  rows: Row[];
  min: number;
  max: number;
  label: TextKey;
  removeLabel: TextKey;
  addLabel: TextKey;
  mark?: (row: Row, index: number) => ReactNode;
  onChange: (rows: Row[]) => void;
}) {
  const { rows, min, max, onChange } = props;
  return (
    <div className="rows-edit">
      {rows.map((row, index) => (
        <div className="row-edit" key={row.id}>
          {props.mark?.(row, index)}
          <input
            aria-label={t(props.label, { index: index + 1 })}
            placeholder={t(props.label, { index: index + 1 })}
            value={row.text}
            maxLength={LIMITS.optionText}
            onChange={(event) => onChange(rows.map((r) => (r.id === row.id ? { ...r, text: event.target.value } : r)))}
          />
          <button
            type="button"
            className="btn btn-icon"
            aria-label={t(props.removeLabel, { index: index + 1 })}
            disabled={rows.length <= min}
            onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-small" disabled={rows.length >= max} onClick={() => onChange([...rows, newRow()])}>
        {t(props.addLabel)}
      </button>
    </div>
  );
}

function Body({ question, onChange }: Props) {
  switch (question.type) {
    case 'single':
      return (
        <Rows
          rows={question.options}
          min={LIMITS.minOptions}
          max={LIMITS.maxOptions}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          mark={(row, index) => (
            <input
              type="radio"
              name={`correct-${question.id}`}
              aria-label={t('correctOption', { index: index + 1 })}
              checked={question.correctId === row.id}
              onChange={() => onChange({ ...question, correctId: row.id })}
            />
          )}
          onChange={(options) =>
            onChange({
              ...question,
              options,
              // Якщо позначений варіант прибрали, правильним стає перший.
              correctId: options.some((o) => o.id === question.correctId) ? question.correctId : options[0].id,
            })
          }
        />
      );
    case 'multi':
      return (
        <Rows
          rows={question.options}
          min={LIMITS.minOptions}
          max={LIMITS.maxOptions}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          mark={(row, index) => (
            <input
              type="checkbox"
              aria-label={t('correctOption', { index: index + 1 })}
              checked={question.correctIds.includes(row.id)}
              onChange={(event) =>
                onChange({
                  ...question,
                  correctIds: event.target.checked
                    ? [...question.correctIds, row.id]
                    : question.correctIds.filter((id) => id !== row.id),
                })
              }
            />
          )}
          onChange={(options) =>
            onChange({ ...question, options, correctIds: question.correctIds.filter((id) => options.some((o) => o.id === id)) })
          }
        />
      );
    case 'boolean':
      return (
        <fieldset className="choice-line">
          <legend>{t('correctIs')}</legend>
          {[true, false].map((value) => (
            <label key={String(value)}>
              <input
                type="radio"
                name={`correct-${question.id}`}
                checked={question.correct === value}
                onChange={() => onChange({ ...question, correct: value })}
              />
              {t(value ? 'yes' : 'no')}
            </label>
          ))}
        </fieldset>
      );
    case 'text': {
      // Написання не мають власних id, тому ключем рядка є його позиція.
      const rows = question.accepted.map((text, index) => ({ id: String(index), text }));
      return (
        <>
          <Rows
            rows={rows}
            min={1}
            max={LIMITS.maxAccepted}
            label="spellingN"
            removeLabel="removeSpelling"
            addLabel="addSpelling"
            onChange={(next) => onChange({ ...question, accepted: next.map((row) => row.text) })}
          />
          <p className="meta">{t('spellingHint')}</p>
        </>
      );
    }
    case 'numeric':
      return (
        <>
          <div className="pair">
            <NumberField
              label={t('correctNumber')}
              value={question.correct}
              decimal
              onChange={(correct) => onChange({ ...question, correct })}
            />
            <NumberField
              label={t('tolerance')}
              value={question.tolerance}
              decimal
              onChange={(tolerance) => onChange({ ...question, tolerance })}
            />
          </div>
          <p className="meta">{t('toleranceHint')}</p>
        </>
      );
    case 'order':
      return (
        <>
          <p className="meta">{t('orderHint')}</p>
          <Rows
            rows={question.items}
            min={LIMITS.minOrderItems}
            max={LIMITS.maxOrderItems}
            label="itemN"
            removeLabel="removeItem"
            addLabel="addItem"
            mark={(_row, index) => <span className="letter">{index + 1}</span>}
            onChange={(items) => onChange({ ...question, items })}
          />
        </>
      );
  }
}

export function QuestionEditor({ question, onChange }: Props) {
  return (
    <div className="question-edit">
      <label className="field">
        <span>{t('questionText')}</span>
        <textarea
          rows={2}
          value={question.text}
          maxLength={LIMITS.questionText}
          onChange={(event) => onChange({ ...question, text: event.target.value })}
        />
      </label>
      <div className="pair">
        <label className="field">
          <span>{t('questionType')}</span>
          <select value={question.type} onChange={(event) => onChange(changeType(question, event.target.value as QuestionType))}>
            {QUESTION_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`type_${type}`)}
              </option>
            ))}
          </select>
        </label>
        <NumberField label={t('timeLimit')} value={question.timeLimit} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
        <NumberField label={t('pointsLabel')} value={question.points} onChange={(points) => onChange({ ...question, points })} />
      </div>
      <Body question={question} onChange={onChange} />
    </div>
  );
}
