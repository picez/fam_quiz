import { LIMITS, type Question } from '@quiz/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LETTERS } from '../format';
import { t, type TextKey } from '../i18n';
import { ImageField } from './ImageField';
import { VideoField } from './VideoField';
import { QUESTION_TYPES, changeType, moveItem, type QuestionType } from './draft';
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
    <label className="field compact">
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

/**
 * Рядки з текстом у вигляді, близькому до того, що побачать гравці: варіанти, елементи
 * впорядкування, допустимі написання. Enter переходить до наступного рядка або додає новий.
 */
function Rows(props: {
  rows: Row[];
  min: number;
  max: number;
  maxLength: number;
  label: TextKey;
  removeLabel: TextKey;
  addLabel: TextKey;
  rowClass?: (row: Row) => string;
  lead?: (row: Row, index: number) => ReactNode;
  tail?: (row: Row, index: number) => ReactNode;
  makeRow?: () => Row;
  onChange: (rows: Row[]) => void;
}) {
  const { rows, min, max, onChange } = props;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  /** Рядок, у який треба поставити курсор після наступного перемалювання. */
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    if (focusNext.current === null) return;
    inputs.current[focusNext.current]?.focus();
    focusNext.current = null;
  });

  const add = () => {
    focusNext.current = rows.length;
    onChange([...rows, (props.makeRow ?? newRow)()]);
  };

  const remove = (index: number) => {
    focusNext.current = Math.max(0, index - 1);
    onChange(rows.filter((_, i) => i !== index));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>, index: number) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    if (index < rows.length - 1) inputs.current[index + 1]?.focus();
    else if (rows.length < max) add();
  };

  return (
    <div className="answer-rows">
      {rows.map((row, index) => (
        <div className={`answer-row ${props.rowClass?.(row) ?? ''}`.trimEnd()} key={row.id}>
          {props.lead?.(row, index)}
          <input
            ref={(element) => {
              inputs.current[index] = element;
            }}
            aria-label={t(props.label, { index: index + 1 })}
            placeholder={t(props.label, { index: index + 1 })}
            value={row.text}
            maxLength={props.maxLength}
            enterKeyHint={index < rows.length - 1 || rows.length < max ? 'next' : 'done'}
            onKeyDown={(event) => onKeyDown(event, index)}
            onChange={(event) => onChange(rows.map((r) => (r.id === row.id ? { ...r, text: event.target.value } : r)))}
          />
          {props.tail?.(row, index)}
          <button
            type="button"
            className="row-button"
            aria-label={t(props.removeLabel, { index: index + 1 })}
            disabled={rows.length <= min}
            onClick={() => remove(index)}
          >
            ×
          </button>
        </div>
      ))}
      <button type="button" className="btn btn-dashed" disabled={rows.length >= max} onClick={add}>
        {t(props.addLabel)}
      </button>
    </div>
  );
}

/** Пари «ліворуч — праворуч»: кожен рядок має два поля, а порядок рядків — порядок лівого стовпчика. */
function PairRows(props: { pairs: { left: Row; right: Row }[]; onChange: (pairs: { left: Row; right: Row }[]) => void }) {
  const { pairs, onChange } = props;
  const set = (index: number, side: 'left' | 'right', text: string) =>
    onChange(pairs.map((pair, i) => (i === index ? { ...pair, [side]: { ...pair[side], text } } : pair)));
  const noEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.preventDefault();
  };
  return (
    <div className="answer-rows">
      {pairs.map((pair, index) => (
        <div className="answer-row match-edit-row" key={pair.left.id}>
          <span className="letter">{index + 1}</span>
          <input
            aria-label={t('pairLeftN', { index: index + 1 })}
            placeholder={t('pairLeftN', { index: index + 1 })}
            value={pair.left.text}
            maxLength={LIMITS.optionText}
            onKeyDown={noEnter}
            onChange={(event) => set(index, 'left', event.target.value)}
          />
          <input
            aria-label={t('pairRightN', { index: index + 1 })}
            placeholder={t('pairRightN', { index: index + 1 })}
            value={pair.right.text}
            maxLength={LIMITS.optionText}
            onKeyDown={noEnter}
            onChange={(event) => set(index, 'right', event.target.value)}
          />
          <button
            type="button"
            className="row-button"
            aria-label={t('removePair', { index: index + 1 })}
            disabled={pairs.length <= LIMITS.minPairs}
            onClick={() => onChange(pairs.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-dashed"
        disabled={pairs.length >= LIMITS.maxPairs}
        onClick={() => onChange([...pairs, { left: newRow(), right: newRow() }])}
      >
        {t('addPair')}
      </button>
    </div>
  );
}

/** Позначка «цей варіант правильний»: натискання вмикає або вимикає її. */
function Mark(props: { on: boolean; index: number; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={props.on ? 'mark is-on' : 'mark'}
      aria-pressed={props.on}
      aria-label={t('correctOption', { index: props.index + 1 })}
      onClick={props.onToggle}
    >
      <span aria-hidden="true">{props.on ? '✓' : '○'}</span>
      <span className="mark-text">{t(props.on ? 'markCorrect' : 'markMake')}</span>
    </button>
  );
}

const letter = (_row: Row, index: number) => <span className="letter">{LETTERS[index]}</span>;

function Body({ question, onChange }: Props) {
  switch (question.type) {
    case 'single':
      return (
        <Rows
          rows={question.options}
          min={LIMITS.minOptions}
          max={LIMITS.maxOptions}
          maxLength={LIMITS.optionText}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          rowClass={(row) => (row.id === question.correctId ? 'is-correct' : '')}
          lead={letter}
          tail={(row, index) => (
            <Mark on={row.id === question.correctId} index={index} onToggle={() => onChange({ ...question, correctId: row.id })} />
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
          maxLength={LIMITS.optionText}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          rowClass={(row) => (question.correctIds.includes(row.id) ? 'is-correct' : '')}
          lead={letter}
          tail={(row, index) => {
            const on = question.correctIds.includes(row.id);
            return (
              <Mark
                on={on}
                index={index}
                onToggle={() =>
                  onChange({
                    ...question,
                    correctIds: on ? question.correctIds.filter((id) => id !== row.id) : [...question.correctIds, row.id],
                  })
                }
              />
            );
          }}
          onChange={(options) =>
            onChange({ ...question, options, correctIds: question.correctIds.filter((id) => options.some((o) => o.id === id)) })
          }
        />
      );
    case 'boolean':
      return (
        <div className="answer-rows">
          {[true, false].map((value) => {
            const word = t(value ? 'yes' : 'no');
            const on = question.correct === value;
            return (
              <button
                type="button"
                key={String(value)}
                className={on ? 'answer-row answer-pick is-correct' : 'answer-row answer-pick'}
                aria-pressed={on}
                aria-label={`${t('correctIs')}: ${word}`}
                onClick={() => onChange({ ...question, correct: value })}
              >
                <span className="answer-word">{word}</span>
                <span className="mark-text">{t(on ? 'markCorrect' : 'markMake')}</span>
              </button>
            );
          })}
        </div>
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
            maxLength={LIMITS.answerText}
            label="spellingN"
            removeLabel="removeSpelling"
            addLabel="addSpelling"
            rowClass={() => 'is-correct'}
            makeRow={() => ({ id: String(rows.length), text: '' })}
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
    case 'match':
      return (
        <>
          <PairRows pairs={question.pairs} onChange={(pairs) => onChange({ ...question, pairs })} />
          <p className="meta">{t('matchHint')}</p>
        </>
      );
    case 'order':
      return (
        <>
          <Rows
            rows={question.items}
            min={LIMITS.minOrderItems}
            max={LIMITS.maxOrderItems}
            maxLength={LIMITS.optionText}
            label="itemN"
            removeLabel="removeItem"
            addLabel="addItem"
            lead={(_row, index) => <span className="letter">{index + 1}</span>}
            tail={(_row, index) => (
              <>
                <button
                  type="button"
                  className="row-button"
                  aria-label={t('moveItemUp', { index: index + 1 })}
                  disabled={index === 0}
                  onClick={() => onChange({ ...question, items: moveItem(question.items, index, index - 1) })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="row-button"
                  aria-label={t('moveItemDown', { index: index + 1 })}
                  disabled={index === question.items.length - 1}
                  onClick={() => onChange({ ...question, items: moveItem(question.items, index, index + 1) })}
                >
                  ↓
                </button>
              </>
            )}
            onChange={(items) => onChange({ ...question, items })}
          />
          <p className="meta">{t('orderHint')}</p>
        </>
      );
  }
}

/** Одне запитання у вигляді, близькому до того, що бачать гравці, з редагуванням на місці. */
export function QuestionEditor({ question, onChange }: Props) {
  // Зображення завантажується не миттєво: до того часу текст запитання могли змінити.
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  return (
    <div className="question-edit">
      <div className="type-chips" role="group" aria-label={t('questionType')}>
        {QUESTION_TYPES.map((type: QuestionType) => (
          <button
            type="button"
            key={type}
            className={question.type === type ? 'chip is-on' : 'chip'}
            aria-pressed={question.type === type}
            title={t(`type_${type}`)}
            onClick={() => onChange(changeType(question, type))}
          >
            {t(`typeShort_${type}`)}
          </button>
        ))}
      </div>

      <div className="stage-card">
        <ImageField url={question.imageUrl} onChange={(imageUrl) => latest.current.onChange({ ...latest.current.question, imageUrl })} />
        <VideoField
          key={question.id}
          video={question.video}
          onChange={(video) => latest.current.onChange({ ...latest.current.question, video })}
        />
        <label className="field question-field">
          <span>{t('questionText')}</span>
          <textarea
            rows={2}
            value={question.text}
            maxLength={LIMITS.questionText}
            placeholder={t('questionPlaceholder')}
            onChange={(event) => onChange({ ...question, text: event.target.value })}
          />
        </label>
        <Body question={question} onChange={onChange} />
      </div>

      <div className="pair">
        {question.video === null ? (
          <NumberField label={t('timeLimit')} value={question.timeLimit} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
        ) : (
          <p className="meta">{t('noTimerHint')}</p>
        )}
        <NumberField label={t('pointsLabel')} value={question.points} onChange={(points) => onChange({ ...question, points })} />
      </div>
    </div>
  );
}
