import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { moveItem } from './draft';
import { newId } from './new-id';
import { NumberField, Rows } from './QuestionEditor';

type TimedList = Extract<Question, { type: 'timedlist' }>;
type ListItem = TimedList['items'][number];

const blankItem = (): ListItem => ({ id: newId(), text: '', accepted: [] });

/**
 * «Список на час»: схований список (кожен пункт — назва й інші написання; номер клітинки — місце пункту, тож є «Вище» і «Нижче»),
 * ціна одного пункту й необов'язковий мінус за слово не зі списку.
 */
export function TimedListEditor({ question, onChange }: { question: TimedList; onChange: (q: Question) => void }) {
  const { items, minus } = question;

  const setItems = (next: ListItem[]) => onChange({ ...question, items: next });
  const setItem = (id: string, patch: Partial<ListItem>) => setItems(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const move = (from: number, to: number) => setItems(moveItem(items, from, to));

  return (
    <>
      {items.map((item, at) => {
        const index = at + 1;
        return (
          <div className="timedlist-editor-item" role="group" aria-label={t('listItemN', { index })} key={item.id}>
            <div className="timedlist-editor-head">
              <span className="letter">{index}</span>
              <input
                aria-label={t('listItemN', { index })}
                placeholder={t('listItemN', { index })}
                value={item.text}
                maxLength={LIMITS.listItemText}
                onChange={(event) => setItem(item.id, { text: event.target.value })}
              />
              <button type="button" className="row-button" aria-label={t('listItemUp')} disabled={at === 0} onClick={() => move(at, at - 1)}>
                ↑
              </button>
              <button type="button" className="row-button" aria-label={t('listItemDown')} disabled={at === items.length - 1} onClick={() => move(at, at + 1)}>
                ↓
              </button>
              <button
                type="button"
                className="row-button"
                aria-label={t('removeListItem', { index })}
                disabled={items.length <= LIMITS.minListItems}
                onClick={() => setItems(items.filter((other) => other.id !== item.id))}
              >
                ×
              </button>
            </div>
            <div role="group" aria-label={t('listOtherSpellings', { index })}>
              <Rows
                rows={item.accepted.map((text, i) => ({ id: String(i), text }))}
                min={0}
                max={LIMITS.maxAccepted - 1}
                maxLength={LIMITS.listItemText}
                label="spellingN"
                removeLabel="removeSpelling"
                addLabel="addSpelling"
                makeRow={() => ({ id: String(item.accepted.length), text: '' })}
                onChange={(next) => setItem(item.id, { accepted: next.map((row) => row.text) })}
              />
            </div>
          </div>
        );
      })}
      <button type="button" className="btn btn-dashed" disabled={items.length >= LIMITS.maxListItems} onClick={() => setItems([...items, blankItem()])}>
        {t('addListItem')}
      </button>

      <NumberField label={t('listPrice')} value={question.points} onChange={(points) => onChange({ ...question, points })} />
      <label className="check">
        <input
          type="checkbox"
          checked={minus !== null}
          onChange={(event) => onChange({ ...question, minus: event.target.checked ? LIMITS.defaultListMinus : null })}
        />
        <span>{t('listMinusOn')}</span>
      </label>
      {minus !== null && <NumberField label={t('listMinus')} value={minus} onChange={(value) => onChange({ ...question, minus: value })} />}
      <p className="meta">{t('listHint')}</p>
    </>
  );
}
