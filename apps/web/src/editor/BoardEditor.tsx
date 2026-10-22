import { ANSWER_MODES, CELL_KINDS, CELL_PENALTIES, LIMITS, cellAnswerMode, type AnswerMode, type BoardCategory, type BoardCell, type BoardRound, type CellKind, type CellMark, type CellPenalty } from '@quiz/shared';
import { useEffect, useId, useState } from 'react';
import { t } from '../i18n';
import { moveItem, newBoardCategory, newBoardQuestion, questionTypesFor } from './draft';
import { QuestionEditor } from './QuestionEditor';

interface Props {
  round: BoardRound;
  onChange: (next: BoardRound) => void;
  /** Клітинка, яку треба відкрити (наприклад, перша з проблемою); нове значення переносить на неї вибір. */
  focus?: { category: number; index: number } | null;
  /** Чи є місце для нових запитань у всій вікторині (ліміт діє на всі раунди разом). */
  roomForMore?: boolean;
  /** Чи вміститься в вікторині нова категорія з трьома запитаннями. */
  roomForCategory?: boolean;
}

const markText = (mark: CellMark) => (mark === 'x2' ? t('boardMarkX2') : mark === 'x3' ? t('boardMarkX3') : '');
const pick = <T extends string>(values: readonly T[], value: string, fallback: T): T => values.find((v) => v === value) ?? fallback;
const toMark = (value: string): CellMark => (value === 'x2' ? 'x2' : value === 'x3' ? 'x3' : 'none');

/**
 * Редактор поля: стовпці-категорії з клітинками, під ними кнопка нового запитання,
 * а під стовпцем вибраної клітинки ще й «Прибрати запитання» (вимкнена на мінімумі, з підказкою);
 * вибрана клітинка відкривається внизу з позначкою й звичайним редактором запитання.
 */
export function BoardEditor({ round, onChange, focus = null, roomForMore = true, roomForCategory = true }: Props) {
  const { categories } = round;
  const [picked, setPicked] = useState({ category: 0, index: 0 });
  useEffect(() => {
    if (focus !== null) setPicked(focus);
  }, [focus]);

  const category = Math.min(picked.category, categories.length - 1);
  const { cells } = categories[category];
  const index = Math.min(picked.index, cells.length - 1);
  const current = cells[index];
  const hintId = useId();
  const atMin = cells.length <= LIMITS.minCategoryQuestions;
  const room = roomForMore && categories.reduce((sum, c) => sum + c.cells.length, 0) < LIMITS.maxQuestions;

  const setCategories = (next: BoardCategory[]) => onChange({ ...round, categories: next });
  const setCategory = (at: number, patch: Partial<BoardCategory>) =>
    setCategories(categories.map((c, i) => (i === at ? { ...c, ...patch } : c)));
  const setCells = (at: number, next: BoardCell[]) => setCategory(at, { cells: next });
  const setCell = (patch: Partial<BoardCell>) =>
    setCells(category, cells.map((cell, i) => (i === index ? { ...cell, ...patch } : cell)));

  const addCategory = () => {
    setCategories([...categories, newBoardCategory(round.answerMode)]);
    setPicked({ category: categories.length, index: 0 });
  };

  const removeCategory = (at: number) => {
    const target = categories[at];
    const hasText = target.title.trim() !== '' || target.cells.some((cell) => cell.question.text.trim() !== '');
    if (hasText && !window.confirm(t('boardRemoveCategoryConfirm'))) return;
    setCategories(categories.filter((_, i) => i !== at));
    setPicked({ category: Math.max(0, at === categories.length - 1 ? at - 1 : at), index: 0 });
  };

  const addCell = (at: number) => {
    const column = categories[at].cells;
    setCells(at, [...column, { mark: 'none', kind: 'normal', answerMode: round.answerMode, penalty: 'none', question: newBoardQuestion(column[column.length - 1]?.question) }]);
    setPicked({ category: at, index: column.length });
  };

  const removeCell = () => {
    if (current.question.text.trim() !== '' && !window.confirm(t('boardRemoveCellConfirm'))) return;
    setCells(category, cells.filter((_, i) => i !== index));
    setPicked({ category, index: Math.max(0, index === cells.length - 1 ? index - 1 : index) });
  };

  const moveCell = (to: number) => {
    setCells(category, moveItem(cells, index, to));
    setPicked({ category, index: to });
  };

  return (
    <div className="board-editor">
      <div className="board-frame" role="group" aria-label={t('boardLabel')}>
        <div className="board-columns">
          {categories.map((column, columnIndex) => (
            <div className="board-column" key={column.id}>
              <input
                className="board-edit-title"
                aria-label={t('boardCategoryTitle', { index: columnIndex + 1 })}
                placeholder={t('boardCategoryPlaceholder', { index: columnIndex + 1 })}
                value={column.title}
                maxLength={LIMITS.categoryTitle}
                onChange={(event) => setCategory(columnIndex, { title: event.target.value })}
              />
              {categories.length > LIMITS.minCategories && (
                <button type="button" className="btn btn-small btn-danger" onClick={() => removeCategory(columnIndex)}>
                  {t('boardRemoveCategory')}
                </button>
              )}
              {column.cells.map((cell, cellIndex) => {
                const on = columnIndex === category && cellIndex === index;
                const points = Number.isNaN(cell.question.points) ? t('boardPointsBlank') : String(cell.question.points);
                const mark = markText(cell.mark);
                return (
                  <button
                    key={cell.question.id}
                    type="button"
                    className={on ? 'board-edit-cell is-on' : 'board-edit-cell'}
                    aria-current={on}
                    aria-label={t('boardCellLabel', {
                      category: columnIndex + 1,
                      index: cellIndex + 1,
                      points,
                      mark: (mark === '' ? '' : ` ${mark}`) + (cell.kind === 'blitz' ? t('boardCellBlitzSuffix') : ''),
                    })}
                    onClick={() => setPicked({ category: columnIndex, index: cellIndex })}
                  >
                    <span>{points}</span>
                    {mark !== '' && <span className="board-mark">{mark}</span>}
                    {cell.kind === 'blitz' && <span className="board-edit-badge">{t('boardKindBlitz')}</span>}
                  </button>
                );
              })}
              {column.cells.length < LIMITS.maxCategoryQuestions && (
                <button type="button" className="btn btn-small btn-dashed" disabled={!room} onClick={() => addCell(columnIndex)}>
                  {t('boardAddCell')}
                </button>
              )}
              {columnIndex === category && (
                <>
                  <button
                    type="button"
                    className="btn btn-small btn-danger"
                    disabled={atMin}
                    aria-describedby={atMin ? hintId : undefined}
                    onClick={removeCell}
                  >
                    {t('boardRemoveCell')}
                  </button>
                  {atMin && (
                    <p id={hintId} className="meta board-edit-hint">
                      {t('boardCellMinHint', { min: LIMITS.minCategoryQuestions })}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}
          {categories.length < LIMITS.maxCategories && (
            <button type="button" className="btn btn-dashed board-add-category" disabled={!roomForCategory} onClick={addCategory}>
              {t('boardAddCategory')}
            </button>
          )}
        </div>
      </div>

      <section className="panel board-panel" aria-label={t('boardCellPanel', { index: index + 1, category: category + 1 })}>
        <label className="field">
          <span>{t('boardMark')}</span>
          <select value={current.mark} onChange={(event) => setCell({ mark: toMark(event.target.value) })}>
            <option value="none">{t('boardMarkNone')}</option>
            <option value="x2">{t('boardMarkX2')}</option>
            <option value="x3">{t('boardMarkX3')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('boardKind')}</span>
          <select value={current.kind} onChange={(event) => setCell({ kind: pick<CellKind>(CELL_KINDS, event.target.value, 'normal') })}>
            <option value="normal">{t('boardKindNormal')}</option>
            <option value="blitz">{t('boardKindBlitz')}</option>
          </select>
        </label>
        <label className="field">
          <span>{t('boardCellMode')}</span>
          <select
            value={cellAnswerMode(round, current)}
            onChange={(event) => setCell({ answerMode: pick<AnswerMode>(ANSWER_MODES, event.target.value, 'phone') })}
          >
            <option value="phone">{t('boardAnswerPhone')}</option>
            <option value="voice">{t('boardAnswerVoice')}</option>
          </select>
        </label>
        {current.kind === 'blitz' && (
          <label className="field">
            <span>{t('boardCellPenalty')}</span>
            <select value={current.penalty} onChange={(event) => setCell({ penalty: pick<CellPenalty>(CELL_PENALTIES, event.target.value, 'none') })}>
              <option value="none">{t('boardPenaltyNone')}</option>
              <option value="all">{t('boardPenaltyAll')}</option>
            </select>
          </label>
        )}
        <QuestionEditor key={current.question.id} question={current.question} types={questionTypesFor('board')} onChange={(question) => setCell({ question })} />
        <div className="toolbar">
          <button type="button" className="btn btn-small" aria-label={t('boardCellUp')} disabled={index === 0} onClick={() => moveCell(index - 1)}>
            {t('moveUpShort')}
          </button>
          <button
            type="button"
            className="btn btn-small"
            aria-label={t('boardCellDown')}
            disabled={index === cells.length - 1}
            onClick={() => moveCell(index + 1)}
          >
            {t('moveDownShort')}
          </button>
        </div>
      </section>
    </div>
  );
}
