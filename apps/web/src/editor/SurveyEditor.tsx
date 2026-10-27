import { LIMITS, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { newId } from './new-id';
import { NumberField, Rows } from './QuestionEditor';

type Survey = Extract<Question, { type: 'survey' }>;
type SurveyRow = Survey['rows'][number];

const blankRow = (): SurveyRow => ({ id: newId(), text: '', popularity: 0, accepted: [] });
const blankRows = (count: number) => Array.from({ length: count }, blankRow);
const hasContent = (row: SurveyRow) => row.text.trim() !== '' || row.accepted.some((s) => s.trim() !== '') || row.popularity > 0;

/**
 * «100 до 1»: дошка ведучого (рядки з популярністю й написаннями, разом не більше 100, а з «кілька відповідей» — будь-скільки) або дошка з відповідей на «хмару слів» вище
 * (тоді рядки — лише запасні, на випадок порожньої хмари), і скільки відповідей вводить гравець.
 */
export function SurveyEditor({
  question,
  onChange,
  clouds,
  allowCloud,
}: {
  question: Survey;
  onChange: (q: Question) => void;
  /** Хмари раніше в класиці; [] на полі або коли хмар немає. */
  clouds: { n: number; id: string; text: string }[];
  /** На полі джерела «з хмари» немає. */
  allowCloud: boolean;
}) {
  const { rows, cloudId } = question;
  const fromCloud = cloudId !== undefined;
  const cloudsOffered = allowCloud && clouds.length > 0;
  const spare = fromCloud && rows.length > 0;
  const showRows = !fromCloud || spare;
  const total = rows.reduce((sum, row) => sum + (Number.isFinite(row.popularity) ? row.popularity : 0), 0);
  const multiple = question.multiple === true;
  const over = !multiple && total > LIMITS.surveyTotal;

  const setRows = (next: SurveyRow[]) => onChange({ ...question, rows: next });
  const setRow = (id: string, patch: Partial<SurveyRow>) => setRows(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));

  const useHostBoard = () => {
    if (!fromCloud) return;
    const { cloudId: _cloud, ...rest } = question;
    onChange({ ...rest, rows: rows.length === 0 ? blankRows(5) : rows });
  };
  const useCloud = () => {
    if (fromCloud || !cloudsOffered) return;
    // Написане стає запасними рядками; порожня чернетка — без запасних.
    onChange({ ...question, cloudId: clouds[clouds.length - 1].id, rows: rows.some(hasContent) ? rows : [] });
  };
  const toggleSpare = (on: boolean) => {
    if (on) {
      setRows(blankRows(LIMITS.minSurveyRows));
      return;
    }
    if (rows.some(hasContent) && !window.confirm(t('surveySpareDropConfirm'))) return;
    setRows([]);
  };

  // Знятий прапорець прибирає поле зовсім: запитання таке саме, як до появи опції.
  const setMultiple = (on: boolean) => {
    const { multiple: _multiple, ...rest } = question;
    onChange(on ? { ...rest, multiple: true } : rest);
  };

  const known = fromCloud && clouds.some((cloud) => cloud.id === cloudId);

  return (
    <>
      <div className="reveal-modes" role="group" aria-label={t('surveySourceLabel')}>
        <button type="button" className={fromCloud ? 'chip' : 'chip is-on'} aria-pressed={!fromCloud} onClick={useHostBoard}>
          {t('surveySourceHost')}
        </button>
        <button
          type="button"
          className={fromCloud ? 'chip is-on' : 'chip'}
          aria-pressed={fromCloud}
          disabled={!fromCloud && !cloudsOffered}
          onClick={useCloud}
        >
          {t('surveySourceCloud')}
        </button>
      </div>
      {!fromCloud && !cloudsOffered && allowCloud && <p className="meta">{t('surveyNoClouds')}</p>}
      {fromCloud && (
        <>
          <label className="field compact">
            <span>{t('surveyCloudSelect')}</span>
            <select value={known ? cloudId : ''} onChange={(event) => onChange({ ...question, cloudId: event.target.value })}>
              {!known && (
                <option value="" disabled>
                  —
                </option>
              )}
              {clouds.map((cloud) => (
                <option key={cloud.id} value={cloud.id}>
                  {t('surveyCloudOption', { n: cloud.n, text: cloud.text.trim() === '' ? '…' : cloud.text.trim() })}
                </option>
              ))}
            </select>
          </label>
          <p className="meta">{t('surveyCloudHint')}</p>
          <label className="check">
            <input type="checkbox" checked={spare} onChange={(event) => toggleSpare(event.target.checked)} />
            <span>{t('surveySpare')}</span>
          </label>
          {!spare && <p className="meta">{t('surveySkipHint')}</p>}
        </>
      )}

      {showRows && (
        <>
          {rows.map((row, index) => {
            const n = index + 1;
            return (
              <div className="survey-row-edit" role="group" aria-label={t('surveyRowCard', { n })} key={row.id}>
                <label className="field compact">
                  <span>{t('surveyRowText', { n })}</span>
                  <input value={row.text} maxLength={LIMITS.surveyRowText} onChange={(event) => setRow(row.id, { text: event.target.value })} />
                </label>
                <div className="survey-row-meta">
                  <NumberField
                    label={t('surveyPopularity')}
                    value={row.popularity === 0 ? Number.NaN : row.popularity}
                    onChange={(popularity) => setRow(row.id, { popularity: Number.isNaN(popularity) ? 0 : popularity })}
                  />
                  <button
                    type="button"
                    className="btn btn-small"
                    aria-label={t('surveyRemoveRowN', { n })}
                    disabled={rows.length <= LIMITS.minSurveyRows}
                    onClick={() => setRows(rows.filter((other) => other.id !== row.id))}
                  >
                    {t('surveyRemoveRow')}
                  </button>
                </div>
                <div role="group" aria-label={t('surveyOtherSpellings', { n })}>
                  <Rows
                    rows={row.accepted.map((text, at) => ({ id: String(at), text }))}
                    min={0}
                    max={LIMITS.maxAccepted - 1}
                    maxLength={LIMITS.answerText}
                    label="spellingN"
                    removeLabel="removeSpelling"
                    addLabel="addSpelling"
                    makeRow={() => ({ id: String(row.accepted.length), text: '' })}
                    onChange={(next) => setRow(row.id, { accepted: next.map((item) => item.text) })}
                  />
                </div>
              </div>
            );
          })}
          <button type="button" className="btn btn-dashed" disabled={rows.length >= LIMITS.maxSurveyRows} onClick={() => setRows([...rows, blankRow()])}>
            {t('surveyAddRow')}
          </button>
          <label className="check">
            <input type="checkbox" checked={multiple} onChange={(event) => setMultiple(event.target.checked)} />
            <span>{t('surveyMultiple')}</span>
          </label>
          <p className={over ? 'meta survey-total is-over' : 'meta survey-total'}>
            {t(multiple ? 'surveyTotalMultiple' : 'surveyTotal', { total })}
            {over && <> {t('surveyTotalOver')}</>}
          </p>
        </>
      )}

      <NumberField label={t('surveyAnswersField')} value={question.answers} onChange={(answers) => onChange({ ...question, answers })} />
      <p className="meta">{t('surveyPointsHint')}</p>
    </>
  );
}
