import { LIMITS, REVEAL_TYPES, type Question, type RevealMode } from '@quiz/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LETTERS, sliderValueText } from '../format';
import { HelpButton } from '../help/HelpButton';
import { countText, t, type TextKey } from '../i18n';
import { AudioField } from './AudioField';
import { ImageField } from './ImageField';
import { OptionImage } from './OptionImage';
import { PinEditor } from './PinEditor';
import { VideoField } from './VideoField';
import { changeType, moveItem, type QuestionType } from './draft';
import { newId } from './new-id';

interface Props {
  question: Question;
  onChange: (next: Question) => void;
  /** Поле «Бали»; у фіналі бали ні на що не впливають, тому там його немає. */
  showPoints?: boolean;
  /** Поле «Підказка» (типово є); у запасних запитань його немає. */
  showHint?: boolean;
  /** Поле «Час» (типово є); у запасних час береться з основного запитання. */
  showTime?: boolean;
  /** Поле відео (типово є); запасні запитання без відео. */
  showVideo?: boolean;
  /** Аудіо до запитання (типово є); запасні запитання без аудіо. */
  showAudio?: boolean;
  /** Вибір режиму картинки, що проявляється (типово немає); лише класика й звичайна клітинка поля з телефона. */
  showReveal?: boolean;
  /** «Хто я?» на усній клітинці: підказки відкриває ведучий, тож інтервалу немає. */
  cluesByHost?: boolean;
  /** Типи запитань, доступні в цьому раунді. */
  types: readonly QuestionType[];
}

interface Row {
  id: string;
  text: string;
  /** Лише варіанти single/multi. */
  imageUrl?: string;
}

const newRow = (): Row => ({ id: newId(), text: '' });
const asNumber = (raw: string) => (raw.trim() === '' ? Number.NaN : Number(raw.trim().replace(',', '.')));
const shown = (value: number) => (Number.isFinite(value) ? String(value) : '');
const sameNumber = (a: number, b: number) => a === b || (Number.isNaN(a) && Number.isNaN(b));

/**
 * Поле для числа. Показує саме те, що набрано ("-", "2,", "30x"), і віддає назовні число
 * або NaN: якби поле перемальовувалося з числа, проміжні стани набору зникали б.
 */
export function NumberField(props: { label: string; value: number; decimal?: boolean; placeholder?: string; invalidHint?: string; onChange: (value: number, raw: string) => void }) {
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
        placeholder={props.placeholder}
        maxLength={24}
        onChange={(event) => {
          setRaw(event.target.value);
          props.onChange(asNumber(event.target.value), event.target.value);
        }}
      />
      {props.invalidHint !== undefined && raw.trim() !== '' && Number.isNaN(asNumber(raw)) && <small className="error">{props.invalidHint}</small>}
    </label>
  );
}

/**
 * Рядки з текстом у вигляді, близькому до того, що побачать гравці: варіанти, елементи
 * впорядкування, допустимі написання. Enter переходить до наступного рядка або додає новий.
 */
export function Rows(props: {
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

/** Рядки з новою картинкою рядка id; undefined прибирає ключ, щоб варіант без картинки лишався як раніше. */
function withImage<T extends Row>(rows: T[], id: string, url: string | undefined): T[] {
  return rows.map((row) => {
    if (row.id !== id) return row;
    const { imageUrl: _old, ...rest } = row;
    return (url === undefined ? rest : { ...rest, imageUrl: url }) as T;
  });
}

/** Категорії, слова з вибором категорії, бали за слово, підвисання. */
function SortBody({
  question,
  onChange,
  showPoints,
}: {
  question: Extract<Question, { type: 'sort' }>;
  onChange: (next: Question) => void;
  showPoints: boolean;
}) {
  const { categories, words } = question;
  const categoryName = (row: Row, index: number) => (row.text.trim() === '' ? t('sortCategoryN', { index: index + 1 }) : row.text);
  const total = question.points * words.length;
  return (
    <>
      <Rows
        rows={categories}
        min={LIMITS.minSortCategories}
        max={LIMITS.maxSortCategories}
        maxLength={LIMITS.sortCategory}
        label="sortCategoryN"
        removeLabel="removeSortCategory"
        addLabel="addSortCategory"
        lead={(_row, index) => <span className="letter">{index + 1}</span>}
        onChange={(next) =>
          // Слова прибраної категорії переходять до першої з тих, що лишилися.
          onChange({
            ...question,
            categories: next,
            words: words.map((word) => (next.some((c) => c.id === word.categoryId) ? word : { ...word, categoryId: next[0].id })),
          })
        }
      />
      <Rows
        rows={words}
        min={LIMITS.minSortWords}
        max={LIMITS.maxSortWords}
        maxLength={LIMITS.sortWord}
        label="sortWordN"
        removeLabel="removeSortWord"
        addLabel="addSortWord"
        rowClass={() => 'sort-edit-row'}
        tail={(row, index) => (
          <label className="field compact sort-word-category">
            <select
              aria-label={t('sortWordCategory', { index: index + 1 })}
              value={words.find((word) => word.id === row.id)?.categoryId ?? categories[0].id}
              onChange={(event) =>
                onChange({ ...question, words: words.map((word) => (word.id === row.id ? { ...word, categoryId: event.target.value } : word)) })
              }
            >
              {categories.map((category, at) => (
                <option key={category.id} value={category.id}>
                  {categoryName(category, at)}
                </option>
              ))}
            </select>
          </label>
        )}
        onChange={(next) =>
          onChange({
            ...question,
            words: next.map((row) => {
              const old = words.find((word) => word.id === row.id);
              return { id: row.id, text: row.text, categoryId: old?.categoryId ?? categories[0].id };
            }),
          })
        }
      />
      {/* У фіналі бали — ставки: ціни за слово й суми немає. */}
      <div className="pair">
        {showPoints && <NumberField label={t('sortPointsLabel')} value={question.points} onChange={(points) => onChange({ ...question, points })} />}
        <NumberField label={t('lockSecondsLabel')} value={question.lockSeconds} onChange={(lockSeconds) => onChange({ ...question, lockSeconds })} />
      </div>
      {showPoints && Number.isFinite(total) && <p className="meta">{countText('sortTotal', total, { total })}</p>}
      <p className="meta">{t('sortHint')}</p>
    </>
  );
}

/** Час, якого досить, щоб остання підказка відкрилася за LIMITS.clueTailSeconds до кінця; не вище максимуму. */
function raisedTime(timeLimit: number, count: number, interval: number): number {
  if (!Number.isFinite(timeLimit) || !Number.isFinite(interval)) return timeLimit;
  const need = Math.min(LIMITS.maxTime, (count - 1) * interval + LIMITS.clueTailSeconds);
  return Math.max(timeLimit, need);
}

function Body({ question, onChange, showPoints, cluesByHost }: Pick<Props, 'question' | 'onChange'> & { showPoints: boolean; cluesByHost: boolean }) {
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
            <>
              <OptionImage
                url={row.imageUrl}
                index={index + 1}
                onChange={(url) => onChange({ ...question, options: withImage(question.options, row.id, url) })}
              />
              <Mark on={row.id === question.correctId} index={index} onToggle={() => onChange({ ...question, correctId: row.id })} />
            </>
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
              <>
                <OptionImage
                  url={row.imageUrl}
                  index={index + 1}
                  onChange={(url) => onChange({ ...question, options: withImage(question.options, row.id, url) })}
                />
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
              </>
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
    case 'chain': {
      // Слова не мають власних id, тому ключем рядка є його позиція.
      const rows = question.words.map((text, index) => ({ id: String(index), text }));
      return (
        <>
          <Rows
            rows={rows}
            min={LIMITS.minChainWords}
            max={LIMITS.maxChainWords}
            maxLength={LIMITS.chainWord}
            label="chainWordN"
            removeLabel="removeChainWord"
            addLabel="addChainWord"
            lead={(_row, index) => <span className="letter">{index + 1}</span>}
            makeRow={() => ({ id: String(rows.length), text: '' })}
            onChange={(next) => onChange({ ...question, words: next.map((row) => row.text) })}
          />
          <NumberField
            label={t('hintSecondsLabel')}
            value={question.hintSeconds}
            onChange={(hintSeconds) => onChange({ ...question, hintSeconds })}
          />
          <p className="meta">{t('chainHint')}</p>
        </>
      );
    }
    case 'order':
      return (
        <>
          <label className="field">
            <span>{t('orderTopLabel')}</span>
            <input
              maxLength={LIMITS.orderLabel}
              placeholder={t('orderTopPlaceholder')}
              value={question.topLabel ?? ''}
              onChange={(event) => onChange({ ...question, topLabel: event.target.value })}
            />
          </label>
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
          <label className="field">
            <span>{t('orderBottomLabel')}</span>
            <input
              maxLength={LIMITS.orderLabel}
              placeholder={t('orderBottomPlaceholder')}
              value={question.bottomLabel ?? ''}
              onChange={(event) => onChange({ ...question, bottomLabel: event.target.value })}
            />
          </label>
          <p className="meta">{t('orderHint')}</p>
        </>
      );
    case 'sort':
      return <SortBody question={question} onChange={onChange} showPoints={showPoints} />;
    case 'slider': {
      const { min, max, step, correct } = question;
      const set = (patch: Partial<typeof question>) => onChange({ ...question, ...patch });
      const preview = [min, max, step, correct].every(Number.isFinite) && min < max && step > 0;
      return (
        <>
          <div className="pair">
            <NumberField label={t('sliderMin')} value={min} decimal onChange={(value) => set({ min: value })} />
            <NumberField label={t('sliderMax')} value={max} decimal onChange={(value) => set({ max: value })} />
          </div>
          <div className="pair">
            <NumberField label={t('sliderStep')} value={step} decimal onChange={(value) => set({ step: value })} />
            <label className="field compact">
              <span>{t('sliderUnit')}</span>
              <input
                value={question.unit ?? ''}
                maxLength={LIMITS.sliderUnit}
                placeholder={t('sliderUnitPlaceholder')}
                onChange={(event) => {
                  const { unit: _old, ...rest } = question;
                  onChange((event.target.value === '' ? rest : { ...rest, unit: event.target.value }) as Question);
                }}
              />
            </label>
          </div>
          <div className="pair">
            <NumberField label={t('sliderCorrect')} value={correct} decimal onChange={(value) => set({ correct: value })} />
            <NumberField label={t('sliderTolerance')} value={question.tolerance} decimal onChange={(value) => set({ tolerance: value })} />
          </div>
          <NumberField
            label={t('sliderZero')}
            value={question.zeroBeyond ?? Number.NaN}
            decimal
            placeholder={t('sliderZeroPlaceholder')}
            invalidHint={t('sliderZeroInvalid')}
            onChange={(value, raw) => {
              const { zeroBeyond: _old, ...rest } = question;
              // Порожнє поле прибирає межу: лишаються лише повні бали або нуль. Сміття лишає NaN: збереження його зупинить.
              onChange((raw.trim() === '' ? rest : { ...rest, zeroBeyond: value }) as Question);
            }}
          />
          {preview && (
            <div className="slider-preview">
              <input
                type="range"
                disabled
                aria-label={t('sliderLabel')}
                min={min}
                max={max}
                step={step}
                value={Math.min(max, Math.max(min, correct))}
                readOnly
              />
              <output>{sliderValueText(correct, { step, unit: question.unit ?? '' })}</output>
            </div>
          )}
          <p className="meta">{t('sliderHint')}</p>
        </>
      );
    }
    case 'clues': {
      // Підказки й написання не мають власних id, тому ключем рядка є його позиція.
      const rows = question.clues.map((text, index) => ({ id: String(index), text }));
      const spellings = question.accepted.map((text, index) => ({ id: String(index), text }));
      const { interval } = question;
      const setClues = (clues: string[]) => onChange({ ...question, clues, timeLimit: raisedTime(question.timeLimit, clues.length, interval) });
      const showAt = Number.isFinite(interval) && Number.isFinite(question.timeLimit);
      return (
        <>
          <p className="meta">{t('cluesOrderHint')}</p>
          <Rows
            rows={rows}
            min={LIMITS.minClues}
            max={LIMITS.maxClues}
            maxLength={LIMITS.clueText}
            label="clueRowN"
            removeLabel="removeClue"
            addLabel="addClue"
            lead={(_row, index) => <span className="letter">{index + 1}</span>}
            tail={(_row, index) => (
              <>
                <button
                  type="button"
                  className="row-button"
                  aria-label={t('moveItemUp', { index: index + 1 })}
                  disabled={index === 0}
                  onClick={() => setClues(moveItem(question.clues, index, index - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="row-button"
                  aria-label={t('moveItemDown', { index: index + 1 })}
                  disabled={index === question.clues.length - 1}
                  onClick={() => setClues(moveItem(question.clues, index, index + 1))}
                >
                  ↓
                </button>
              </>
            )}
            makeRow={() => ({ id: String(rows.length), text: '' })}
            onChange={(next) => setClues(next.map((row) => row.text))}
          />
          <Rows
            rows={spellings}
            min={1}
            max={LIMITS.maxAccepted}
            maxLength={LIMITS.answerText}
            label="spellingN"
            removeLabel="removeSpelling"
            addLabel="addSpelling"
            rowClass={() => 'is-correct'}
            makeRow={() => ({ id: String(spellings.length), text: '' })}
            onChange={(next) => onChange({ ...question, accepted: next.map((row) => row.text) })}
          />
          <p className="meta">{t('spellingHint')}</p>
          {cluesByHost ? (
            <p className="meta">{t('cluesVoiceHint')}</p>
          ) : (
            <>
              <NumberField
                label={t('cluesInterval')}
                value={interval}
                onChange={(value) => onChange({ ...question, interval: value, timeLimit: raisedTime(question.timeLimit, question.clues.length, value) })}
              />
              {showAt && <p className="meta">{t('cluesTimeHint', { at: (question.clues.length - 1) * interval, time: question.timeLimit })}</p>}
            </>
          )}
        </>
      );
    }
    case 'pin':
      return <PinEditor question={question} onChange={onChange} />;
  }
}

/** Чи час у межах: поки ні, поле часу видно й для запитання з відео, щоб автор міг його виправити. */
function timeInLimits(timeLimit: number): boolean {
  return Number.isInteger(timeLimit) && timeLimit >= LIMITS.minTime && timeLimit <= LIMITS.maxTime;
}

/** Режим картинки, що проявляється; undefined («Звичайна») прибирає ключ. */
function setReveal(question: Question, onChange: (next: Question) => void, mode: RevealMode | undefined) {
  const { reveal: _old, ...rest } = question;
  onChange((mode === undefined ? rest : { ...rest, reveal: mode }) as Question);
}

/** Одне запитання у вигляді, близькому до того, що бачать гравці, з редагуванням на місці. */
export function QuestionEditor({ question, onChange, types, showPoints = true, showHint = true, showTime = true, showVideo = true, showAudio = true, showReveal = false, cluesByHost = false }: Props) {
  // Зображення завантажується не миттєво: до того часу текст запитання могли змінити.
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  return (
    <div className="question-edit">
      <div className="with-help">
        <div className="type-chips" role="group" aria-label={t('questionType')}>
          {types.map((type: QuestionType) => (
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
        <HelpButton id={`question.${question.type}`} />
      </div>

      <div className="stage-card">
        {/* Основою точки керує PinEditor: мапа чи власна картинка. */}
        {question.type !== 'pin' && (
          <ImageField
            url={question.imageUrl}
            onChange={(imageUrl) => {
              // Режим проявлення живе лише разом із картинкою.
              const { reveal: _reveal, ...rest } = latest.current.question;
              latest.current.onChange((imageUrl === null ? { ...rest, imageUrl } : { ...latest.current.question, imageUrl }) as Question);
            }}
          />
        )}
        {showReveal && question.imageUrl !== null && question.video === null && (REVEAL_TYPES as readonly string[]).includes(question.type) && (
          <div className="with-help">
            <div className="reveal-modes" role="group" aria-label={t('revealLabel')}>
              {([undefined, 'pixels', 'blur'] as const).map((mode) => (
                <button
                  type="button"
                  key={mode ?? 'none'}
                  className={question.reveal === mode ? 'chip is-on' : 'chip'}
                  aria-pressed={question.reveal === mode}
                  onClick={() => setReveal(question, onChange, mode)}
                >
                  {t(mode === undefined ? 'revealNone' : mode === 'pixels' ? 'revealPixels' : 'revealBlur')}
                </button>
              ))}
            </div>
            <HelpButton id="setting.reveal" />
          </div>
        )}
        {showVideo && question.audio === undefined && question.type !== 'chain' && question.type !== 'sort' && question.type !== 'clues' && question.type !== 'pin' && (
          <VideoField
            key={question.id}
            video={question.video}
            onChange={(video) => {
              // Картинка, що проявляється, не живе разом із відео.
              const { reveal: _reveal, ...rest } = latest.current.question;
              latest.current.onChange((video === null ? { ...latest.current.question, video } : { ...rest, video }) as Question);
            }}
            onAudioOnly={
              showAudio
                ? (video) =>
                    latest.current.onChange({
                      ...latest.current.question,
                      video: null,
                      audio: { source: 'youtube', id: video.id, start: video.start, duration: LIMITS.defaultAudioSeconds },
                    })
                : undefined
            }
          />
        )}
        {showAudio && question.video === null && (
          <AudioField
            audio={question.audio}
            timeLimit={question.timeLimit}
            onChange={(audio) => {
              // Відео могли додати, поки файл вантажився: тоді аудіо відкидається.
              if (latest.current.question.video !== null) return false;
              const { audio: _old, ...rest } = latest.current.question;
              latest.current.onChange((audio === undefined ? rest : { ...rest, audio }) as Question);
            }}
            onToVideo={(video) => {
              const { audio: _old, reveal: _reveal, ...rest } = latest.current.question;
              // У ланцюжку, сортуванні, «Хто я?» і точці відео немає: звук просто зникає.
              const noVideo = rest.type === 'chain' || rest.type === 'sort' || rest.type === 'clues' || rest.type === 'pin';
              latest.current.onChange((noVideo ? rest : { ...rest, video }) as Question);
            }}
          />
        )}
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
        {showHint && (
          <label className="field hint-field">
            <span>{t('hintLabel')}</span>
            <textarea
              rows={2}
              value={question.hint ?? ''}
              maxLength={LIMITS.hintText}
              placeholder={t('hintPlaceholder')}
              onChange={(event) => {
                const { hint: _old, ...rest } = question;
                // Порожнє значення прибирає ключ, щоб запитання без підказки лишалося як раніше.
                onChange((event.target.value === '' ? rest : { ...rest, hint: event.target.value }) as Question);
              }}
            />
          </label>
        )}
        <Body question={question} onChange={onChange} showPoints={showPoints} cluesByHost={cluesByHost} />
      </div>

      {(showTime || (showPoints && question.type !== 'sort')) && (
        <div className="pair">
          {!showTime ? null : question.video === null || !timeInLimits(question.timeLimit) ? (
            <NumberField label={t('timeLimit')} value={question.timeLimit} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
          ) : (
            <p className="meta">{t('noTimerHint')}</p>
          )}
          {showPoints && question.type !== 'sort' && <NumberField label={t('pointsLabel')} value={question.points} onChange={(points) => onChange({ ...question, points })} />}
        </div>
      )}
    </div>
  );
}
