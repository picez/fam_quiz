import { LIMITS, type CluePace, type Question, type RevealMode } from '@quiz/shared';
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { LETTERS, sliderValueText } from '../format';
import { HelpButton } from '../help/HelpButton';
import { countText, t, type TextKey } from '../i18n';
import { AudioField } from './AudioField';
import { BetsCutField } from './BetsCutField';
import { ImageField } from './ImageField';
import { OptionImage } from './OptionImage';
import { PinEditor } from './PinEditor';
import { VideoField } from './VideoField';
import { BluffEditor } from './BluffEditor';
import { SpyEditor } from './SpyEditor';
import { SurveyEditor } from './SurveyEditor';
import { LetterWordsEditor } from './LetterWordsEditor';
import { MoreLessEditor } from './MoreLessEditor';
import { CrosswordEditor } from './CrosswordEditor';
import { JigsawEditor } from './JigsawEditor';
import { SpotdiffEditor } from './SpotdiffEditor';
import { MelodyEditor } from './MelodyEditor';
import { VideoclipEditor } from './VideoclipEditor';
import { MemoryEditor } from './MemoryEditor';
import { SudokuEditor } from './SudokuEditor';
import { ThinkWordsEditor } from './ThinkWordsEditor';
import { TimedListEditor } from './TimedListEditor';
import { WallEditor } from './WallEditor';
import { WordLadderEditor } from './WordLadderEditor';
import { WordleEditor } from './WordleEditor';
import { GroupDraftNotes } from './group-drafts';
import { changeType, moveItem, type QuestionType } from './draft';
import { newId } from './new-id';
import { NumberInput } from '../ui/NumberInput';
import { Combobox, type ComboOption } from '../ui/Combobox';
import { typeIcon } from '../guide-text';
import { TYPE_GROUPS, groupedTypes } from './type-groups';
import { EditorCard } from './EditorCard';
import { MEDIA_NATIVE, REMINDER_MIN_TIME, hasMedia, hintShown, isVote, mediaFields, mediaSummary, noTimerHintShown, pointsFieldShown, timeFieldShown, type LayoutFlags, type QuestionCard } from './question-layout';

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
  /** «Хмари слів» раніше в класиці — джерела дошки «100 до 1»; на полі й в інших місцях немає. */
  clouds?: { n: number; id: string; text: string }[];
  /** Чи можна збирати дошку «100 до 1» з хмари (лише класика). */
  allowCloud?: boolean;
  /** Рівно стільки варіантів у «одному варіанті» (кнопок додати й прибрати немає); типово кількість вільна. */
  fixedOptions?: number;
  /** Раунд «Ставки»: під текстом вибір, скільки слів видно під час ставок. */
  betsCut?: boolean | 'auction';
  /** Проблема цього запитання і картка, де її показати (74); 'type' — під вибором типу. */
  issue?: { card: QuestionCard; text: string } | null;
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
 * Поле для числа. Показує саме те, що набрано ("-", "2."; букви й знаки NumberInput не впускає), і віддає назовні число
 * або NaN: якби поле перемальовувалося з числа, проміжні стани набору зникали б.
 */
export function NumberField(props: { label: string; value: number; decimal?: boolean; negative?: boolean; placeholder?: string; invalidHint?: string; onChange: (value: number, raw: string) => void }) {
  const [raw, setRaw] = useState(() => shown(props.value));

  // Значення змінили ззовні (наприклад, відновили чернетку): показати його.
  useEffect(() => {
    setRaw((current) => (sameNumber(asNumber(current), props.value) ? current : shown(props.value)));
  }, [props.value]);

  return (
    <label className="field compact">
      <span>{props.label}</span>
      <NumberInput
        decimal={props.decimal}
        negative={props.negative}
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

/** Поле для українського слова: без автовеликої літери, автозаміни й перевірки правопису. */
export const UK_WORD_INPUT = { lang: 'uk', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false } as const;

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
  /** Додатковий клас контейнера (option-rows: варіанти відповіді у дві колонки від 1600 px). */
  className?: string;
  lead?: (row: Row, index: number) => ReactNode;
  tail?: (row: Row, index: number) => ReactNode;
  makeRow?: () => Row;
  /** Кількість рядків незмінна: кнопок додати й прибрати немає. */
  fixed?: boolean;
  /** Українські слова (драбина): без автовеликої літери, автозаміни й перевірки правопису. */
  ukWords?: boolean;
  onChange: (rows: Row[]) => void;
}) {
  const { rows, min, max, onChange } = props;
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  /** Рядок, у який треба поставити курсор після наступного перемалювання. */
  const focusNext = useRef<number | null>(null);

  // useLayoutEffect: курсор переходить у новий рядок до наступного натискання, навіть коли React відкладає звичайні ефекти.
  useLayoutEffect(() => {
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
    <div className={props.className === undefined ? 'answer-rows' : `answer-rows ${props.className}`}>
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
            {...(props.ukWords === true ? UK_WORD_INPUT : {})}
            enterKeyHint={index < rows.length - 1 || rows.length < max ? 'next' : 'done'}
            onKeyDown={(event) => onKeyDown(event, index)}
            onChange={(event) => onChange(rows.map((r) => (r.id === row.id ? { ...r, text: event.target.value } : r)))}
          />
          {props.tail?.(row, index)}
          {props.fixed !== true && (
            <button
              type="button"
              className="row-button"
              aria-label={t(props.removeLabel, { index: index + 1 })}
              disabled={rows.length <= min}
              onClick={() => remove(index)}
            >
              ×
            </button>
          )}
        </div>
      ))}
      {props.fixed !== true && (
        <button type="button" className="btn btn-dashed" disabled={rows.length >= max} onClick={add}>
          {t(props.addLabel)}
        </button>
      )}
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
  // Інтервал, якого ще не вписано або який поза межами, час не піднімає: про нього скаже перевірка.
  if (!Number.isFinite(timeLimit) || !Number.isInteger(interval) || interval < LIMITS.minClueSeconds || interval > LIMITS.maxClueSeconds) return timeLimit;
  const need = Math.min(LIMITS.maxTime, (count - 1) * interval + LIMITS.clueTailSeconds);
  return Math.max(timeLimit, need);
}

function Body({ question, onChange, showPoints, cluesByHost, clouds, allowCloud, fixedOptions }: Pick<Props, 'question' | 'onChange' | 'fixedOptions'> & { showPoints: boolean; cluesByHost: boolean; clouds: { n: number; id: string; text: string }[]; allowCloud: boolean }) {
  switch (question.type) {
    case 'single':
      return (
        <Rows
          rows={question.options}
          min={fixedOptions ?? LIMITS.minOptions}
          max={fixedOptions ?? LIMITS.maxOptions}
          fixed={fixedOptions !== undefined && question.options.length === fixedOptions}
          maxLength={LIMITS.optionText}
          label="optionN"
          removeLabel="removeOption"
          addLabel="addOption"
          rowClass={(row) => (row.id === question.correctId ? 'is-correct' : '')}
          className="option-rows"
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
          className="option-rows"
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
              negative
              onChange={(correct) => onChange({ ...question, correct })}
            />
            {question.noOvershoot !== true && (
              <NumberField
                label={t('tolerance')}
                value={question.tolerance}
                decimal
                onChange={(tolerance) => onChange({ ...question, tolerance })}
              />
            )}
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={question.noOvershoot === true}
              onChange={(event) => {
                const { noOvershoot: _off, ...rest } = question;
                onChange(event.target.checked ? { ...rest, noOvershoot: true } : rest);
              }}
            />
            <span>{t('overshootLabel')}</span>
          </label>
          <p className="meta">{t(question.noOvershoot === true ? 'overshootHint' : 'toleranceHint')}</p>
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
    case 'wordladder':
      return <WordLadderEditor question={question} onChange={onChange} />;
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
            <NumberField label={t('sliderMin')} value={min} decimal negative onChange={(value) => set({ min: value })} />
            <NumberField label={t('sliderMax')} value={max} decimal negative onChange={(value) => set({ max: value })} />
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
            <NumberField label={t('sliderCorrect')} value={correct} decimal negative onChange={(value) => set({ correct: value })} />
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
      const self = question.cluePace === 'self';
      // На усній клітинці інтервалу не видно й він нічого не робить: беремо найменший, щоб часу треба було мінімум.
      // У власному темпі інтервал схований і час за ним не піднімається.
      const setClues = (clues: string[]) => {
        const used = cluesByHost ? LIMITS.minClueSeconds : interval;
        onChange({ ...question, clues, interval: used, timeLimit: self ? question.timeLimit : raisedTime(question.timeLimit, clues.length, used) });
      };
      // «Кожен сам» пишеться ключем cluePace: 'self'; «за таймером» прибирає ключ, як у старих запитань.
      const setPace = (pace: CluePace) => {
        if (pace === 'self') {
          const validInterval = Number.isInteger(interval) && interval >= LIMITS.minClueSeconds && interval <= LIMITS.maxClueSeconds;
          onChange({
            ...question,
            cluePace: 'self',
            interval: validInterval ? interval : LIMITS.defaultClueSeconds,
            timeLimit: Number.isFinite(question.timeLimit) ? Math.min(LIMITS.maxTime, Math.max(question.timeLimit, LIMITS.selfCluesMinTime)) : question.timeLimit,
          });
          return;
        }
        const { cluePace: _pace, ...rest } = question;
        onChange({ ...rest, timeLimit: raisedTime(rest.timeLimit, rest.clues.length, cluesByHost ? LIMITS.minClueSeconds : rest.interval) });
      };
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
          <fieldset className="clue-pace">
            <legend className="meta">{t('cluePaceLabel')}</legend>
            <label className="check">
              <input type="radio" name={`clue-pace-${question.id}`} checked={!self} onChange={() => setPace('timer')} />
              <span>{t('cluePaceTimer')}</span>
            </label>
            <label className="check">
              <input type="radio" name={`clue-pace-${question.id}`} checked={self} onChange={() => setPace('self')} />
              <span>{t('cluePaceSelf')}</span>
            </label>
          </fieldset>
          {cluesByHost ? (
            <p className="meta">{self ? t('cluesSelfVoiceNote', { min: LIMITS.selfCluesMinTime }) : t('cluesVoiceHint')}</p>
          ) : self ? (
            <p className="meta">{t('cluesSelfHint', { min: LIMITS.selfCluesMinTime })}</p>
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
    case 'wall':
      return <WallEditor question={question} onChange={onChange} />;
    case 'poll':
      return (
        <>
          <Rows
            rows={question.options}
            min={LIMITS.minOptions}
            max={LIMITS.maxOptions}
            maxLength={LIMITS.optionText}
            label="optionN"
            removeLabel="removeOption"
            addLabel="addOption"
            lead={letter}
            tail={(row, index) => (
              <OptionImage
                url={row.imageUrl}
                index={index + 1}
                onChange={(url) => onChange({ ...question, options: withImage(question.options, row.id, url) })}
              />
            )}
            onChange={(options) => onChange({ ...question, options })}
          />
          <p className="meta">{t('pollHint')}</p>
        </>
      );
    case 'bluff':
      return <BluffEditor question={question} onChange={onChange} />;
    case 'survey':
      return <SurveyEditor question={question} onChange={onChange} clouds={clouds} allowCloud={allowCloud} />;
    case 'timedlist':
      return <TimedListEditor question={question} onChange={onChange} />;
    case 'letterwords':
      return <LetterWordsEditor question={question} onChange={onChange} />;
    case 'moreless':
      return <MoreLessEditor question={question} onChange={onChange} />;
    case 'drawing': {
      // Як у тексті: ключ рядка — позиція. Довжина — як поле вгадування на телефоні.
      const rows = question.accepted.map((text, index) => ({ id: String(index), text }));
      return (
        <>
          <Rows
            rows={rows}
            min={1}
            max={LIMITS.maxAccepted}
            maxLength={LIMITS.drawGuess}
            label="spellingN"
            removeLabel="removeSpelling"
            addLabel="addSpelling"
            rowClass={() => 'is-correct'}
            makeRow={() => ({ id: String(rows.length), text: '' })}
            onChange={(next) => onChange({ ...question, accepted: next.map((row) => row.text) })}
          />
          <p className="meta">{t('drawingWordHint')}</p>
          <p className="meta">{t('drawingHelp')}</p>
        </>
      );
    }
    case 'sudoku':
      return <SudokuEditor question={question} onChange={onChange} />;
    case 'crossword':
      return <CrosswordEditor question={question} onChange={onChange} />;
    case 'jigsaw':
      return <JigsawEditor question={question} onChange={onChange} />;
    case 'spotdiff':
      return <SpotdiffEditor question={question} onChange={onChange} />;
    case 'memory':
      return <MemoryEditor question={question} onChange={onChange} />;
    case 'melody':
      return <MelodyEditor question={question} onChange={onChange} />;
    case 'videoclip':
      return <VideoclipEditor question={question} onChange={onChange} />;
    case 'wordle':
      return <WordleEditor question={question} onChange={onChange} />;
    case 'spy':
      return <SpyEditor question={question} onChange={onChange} />;
    case 'thinkalike':
      return <p className="meta">{t('alikeEditorHint')}</p>;
    case 'think':
      return <ThinkWordsEditor words={question.words} onChange={(words) => onChange({ ...question, words })} />;
    case 'wordcloud':
      return (
        <>
          <NumberField label={t('cloudWordsField')} value={question.words} onChange={(words) => onChange({ ...question, words })} />
          <p className="meta">{t('cloudHint')}</p>
        </>
      );
  }
}

/** Режим картинки, що проявляється; undefined («Звичайна») прибирає ключ. */
function setReveal(question: Question, onChange: (next: Question) => void, mode: RevealMode | undefined) {
  const { reveal: _old, ...rest } = question;
  onChange((mode === undefined ? rest : { ...rest, reveal: mode }) as Question);
}

/** Одне запитання у вигляді, близькому до того, що бачать гравці, з редагуванням на місці. */
export function QuestionEditor({ question, onChange, types, showPoints = true, showHint = true, showTime = true, showVideo = true, showAudio = true, showReveal = false, cluesByHost = false, clouds = [], allowCloud = false, fixedOptions, betsCut = false, issue = null }: Props) {
  // Зображення завантажується не миттєво: до того часу текст запитання могли змінити.
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  const flags: LayoutFlags = { showPoints, showHint, showTime, showVideo, showAudio, showReveal };
  const fields = mediaFields(question, flags);
  // Картка «Медіа» згорнута, поки медіа немає; щойно воно з'явилося — розгортається. Нове запитання — заново від його медіа.
  const media = hasMedia(question);
  const [fold, setFold] = useState(() => ({ id: question.id, media, open: media }));
  if (fold.id !== question.id || fold.media !== media) {
    setFold({ id: question.id, media, open: fold.id !== question.id ? media : media || fold.open });
  }
  // Комбобокс типу: опції за групами; тип, якого немає серед дозволених, лишається видимим у кінці своєї групи.
  const grouped = groupedTypes(types);
  const typeGroups = grouped.map((group) => ({ id: group.id, label: t(`typeGroup_${group.id}`) }));
  const typeOptions: ComboOption<QuestionType>[] = grouped.flatMap((group) =>
    group.types.map((type) => ({ value: type, label: t(`type_${type}`), description: t(`typeDesc_${type}`), icon: typeIcon(type), keywords: [t(`typeShort_${type}`)], group: group.id })),
  );
  if (!types.includes(question.type)) {
    const home = TYPE_GROUPS.find((group) => group.types.includes(question.type))?.id;
    typeOptions.push({ value: question.type, label: t(`type_${question.type}`), description: t(`typeDesc_${question.type}`), icon: typeIcon(question.type), keywords: [t(`typeShort_${question.type}`)], group: home });
  }
  const errorOf = (card: QuestionCard) => (issue !== null && issue.card === card ? issue.text : null);

  // Поля медіа — у тому самому порядку, що й раніше: картинка, проявлення, відео, аудіо.
  const mediaNodes = (
    <>
      {/* Основою точки керує PinEditor: мапа чи власна картинка. */}
      {fields.image && (
        <ImageField
          url={question.imageUrl}
          onChange={(imageUrl) => {
            // Режим проявлення живе лише разом із картинкою.
            const { reveal: _reveal, ...rest } = latest.current.question;
            latest.current.onChange((imageUrl === null ? { ...rest, imageUrl } : { ...latest.current.question, imageUrl }) as Question);
          }}
        />
      )}
      {fields.reveal && (
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
      {fields.video && (
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
      {fields.audio && (
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
            const noVideo = rest.type === 'jigsaw' || rest.type === 'spotdiff' || rest.type === 'memory' || rest.type === 'chain' || rest.type === 'wordladder' || rest.type === 'wordle' || rest.type === 'sort' || rest.type === 'clues' || rest.type === 'pin' || rest.type === 'wall' || rest.type === 'bluff' || rest.type === 'spy' || rest.type === 'timedlist' || rest.type === 'letterwords' || rest.type === 'moreless' || rest.type === 'drawing' || rest.type === 'melody' || rest.type === 'videoclip';
            latest.current.onChange((noVideo ? rest : { ...rest, video }) as Question);
          }}
        />
      )}
    </>
  );
  const anyMedia = fields.image || fields.reveal || fields.video || fields.audio;
  // У медійних типів (мелодія, кліп, точка…) медіа — суть: їхні поля стоять на початку «Відповідей».
  const native = MEDIA_NATIVE.has(question.type);

  // 61: у «Вгадай слово» лише слово — тексту запитання немає.
  const textField = question.type !== 'wordle';
  const hint = hintShown(question, flags);
  const timeField = timeFieldShown(question, flags);
  const noTimer = noTimerHintShown(question, flags);
  const points = pointsFieldShown(question, flags);
  const vote = isVote(question);
  const timeNote = timeField && question.timeLimit < REMINDER_MIN_TIME ? t('reminderTimerInline', { min: REMINDER_MIN_TIME }) : null;

  return (
    <div className="question-edit">
      <GroupDraftNotes questionId={question.id} />
      <div className="with-help">
        <Combobox label={t('questionType')} value={question.type} options={typeOptions} groups={typeGroups} onChange={(type) => onChange(changeType(question, type))} />
        <HelpButton id={`question.${question.type}`} />
      </div>
      {errorOf('type') !== null && <p className="error card-error">{errorOf('type')}</p>}

      {(textField || betsCut !== false || hint) && (
        <EditorCard card="question" title={t('cardQuestion')} required={textField} error={errorOf('question')}>
          {textField && (
            <label className="field question-field">
              <span>{t('questionText')}</span>
              <textarea
                rows={2}
                value={question.text}
                maxLength={LIMITS.questionText}
                placeholder={t('questionPlaceholder')}
                aria-required="true"
                onChange={(event) => onChange({ ...question, text: event.target.value })}
              />
            </label>
          )}
          {betsCut && <BetsCutField text={question.text} cut={question.betsCut} phase={betsCut === 'auction' ? 'auction' : 'bets'} onChange={(cut) => onChange({ ...question, betsCut: cut })} />}
          {/* Підказка — для бафів; у «Більше чи менше», «Малюнку» й головоломках бафів немає. */}
          {hint && (
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
        </EditorCard>
      )}

      {!native && anyMedia && (
        <EditorCard
          card="media"
          title={t('cardMedia')}
          summary={mediaSummary(question) ?? t('cardMediaAdd')}
          error={errorOf('media')}
          fold={{ open: fold.open, onToggle: (open) => setFold((current) => (current.open === open ? current : { ...current, open })) }}
        >
          {mediaNodes}
        </EditorCard>
      )}

      <EditorCard card="answers" title={t('cardAnswers')} required={question.type !== 'thinkalike'} error={errorOf('answers')}>
        {native && mediaNodes}
        <Body question={question} onChange={onChange} showPoints={showPoints} cluesByHost={cluesByHost} clouds={clouds} allowCloud={allowCloud} fixedOptions={fixedOptions} />
        {/* Пояснення — у кожного типу: після розкриття його бачить на телефоні той, хто помилився чи не відповів. */}
        <label className="field explanation-field">
          <span>{t('explanationLabel')}</span>
          <textarea
            rows={2}
            value={question.explanation ?? ''}
            maxLength={LIMITS.explanationText}
            placeholder={t('explanationPlaceholder')}
            onChange={(event) => {
              const { explanation: _old, ...rest } = question;
              // Порожнє значення прибирає ключ, як у підказки.
              onChange((event.target.value === '' ? rest : { ...rest, explanation: event.target.value }) as Question);
            }}
          />
        </label>
      </EditorCard>

      {(timeField || noTimer || points || vote) && (
        <EditorCard card="time" title={t('cardTime')} error={errorOf('time')} note={timeNote}>
          {(timeField || noTimer || points) && (
            <div className="pair">
              {timeField ? (
                <NumberField label={t(question.type === 'bluff' ? 'bluffLieTime' : 'timeLimit')} value={question.timeLimit} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
              ) : noTimer ? (
                <p className="meta">{t('noTimerHint')}</p>
              ) : null}
              {points && <NumberField key={question.type} label={t('pointsLabel')} value={question.points} onChange={(value) => onChange({ ...question, points: value })} />}
            </div>
          )}
          {vote && <p className="meta">{t('noPointsNote')}</p>}
        </EditorCard>
      )}
    </div>
  );
}
