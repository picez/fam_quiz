import { LIMITS, crosswordCells, crosswordNumbers, type CrosswordLayout, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { blankCrosswordEntry, buildCrossword, moveItem, withCrosswordLayout, type CrosswordWarning } from './draft';
import { UK_WORD_INPUT } from './QuestionEditor';

type Crossword = Extract<Question, { type: 'crossword' }>;
type Entry = Crossword['entries'][number];

/** Попередження під словами; '' — нема про що казати (порожні поля називає перевірка перед збереженням). */
function warningText(warning: CrosswordWarning | null, key: string | null): string {
  if (warning === null) return '';
  switch (warning.kind) {
    case 'empty':
      return '';
    case 'word':
      return warning.words.length === 0 ? '' : t('crosswordBadWords', { words: warning.words.join(', '), min: LIMITS.minCrosswordWord, max: LIMITS.maxCrosswordWord });
    case 'duplicate':
      return t('crosswordDuplicateWarn', { words: warning.words.join(', ') });
    case 'unplaced':
      return t('crosswordUnplaced', { words: warning.words.join(', ') });
    case 'key':
      // Ключ ще не почали вписувати — мовчимо.
      return (key ?? '').trim() === '' ? '' : t('crosswordKeyBad', { min: LIMITS.minCrosswordKey, max: LIMITS.maxCrosswordKey });
    case 'missing':
      return t('crosswordMissing', { letters: warning.letters.join(', ') });
  }
}

/** Прев'ю сітки: номери, літери (лише в редакторі), ключові клітинки з номером літери ключа; під сіткою — підказки за напрямками. */
function CrosswordPreview({ grid, keyCells, entries }: { grid: CrosswordLayout; keyCells: number[]; entries: Entry[] }) {
  const letters = crosswordCells(grid, entries);
  const numbers = crosswordNumbers(grid, entries);
  const numberAt = new Map(grid.words.map((word) => [word.row * grid.width + word.col, numbers.find((n) => n.id === word.id)?.number ?? 0]));
  const clue = (id: string) => entries.find((entry) => entry.id === id)?.clue ?? '';
  const list = (dir: 'across' | 'down') => (
    <ol className="crossword-editor-clues" aria-label={t(dir === 'across' ? 'crosswordAcross' : 'crosswordDown')}>
      {numbers
        .filter((n) => n.dir === dir)
        .map((n) => (
          <li key={n.id} value={n.number}>
            {`${clue(n.id)} (${n.length})`}
          </li>
        ))}
    </ol>
  );
  return (
    <div className="crossword-editor-preview">
      <table className="crossword-editor-grid" aria-label={t('crosswordPreview')} dir="ltr">
        <tbody>
          {Array.from({ length: grid.height }, (_, row) => (
            <tr key={row}>
              {Array.from({ length: grid.width }, (_, col) => {
                const i = row * grid.width + col;
                const letter = letters[i];
                const key = keyCells.indexOf(i);
                const number = numberAt.get(i);
                return (
                  <td key={col} data-cell={i} className={`crossword-cell${letter === null ? ' is-block' : ' is-letter'}${key >= 0 ? ' is-key' : ''}`}>
                    {number !== undefined && <span className="crossword-number">{number}</span>}
                    {key >= 0 && <span className="crossword-key-n">{key + 1}</span>}
                    {letter ?? ''}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="crossword-editor-lists">
        <div>
          <p className="meta">{t('crosswordAcross')}</p>
          {list('across')}
        </div>
        <div>
          <p className="meta">{t('crosswordDown')}</p>
          {list('down')}
        </div>
      </div>
    </div>
  );
}

/**
 * «Кросворд» у редакторі: 4–8 слів із підказками, режим «увесь кросворд» чи «ключове слово» з полем ключа.
 * Кожна зміна синхронно перескладає розкладку (той самий компонувальник, що в схемі); невдача — розкладки немає й видно чому.
 */
export function CrosswordEditor({ question, onChange }: { question: Crossword; onChange: (q: Question) => void }) {
  const { entries } = question;
  const build = buildCrossword(question);
  const set = (patch: Partial<Crossword>) => onChange(withCrosswordLayout({ ...question, ...patch }));
  const setEntries = (next: Entry[]) => set({ entries: next });
  const setEntry = (id: string, patch: Partial<Entry>) => setEntries(entries.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  return (
    <div className="crossword-editor">
      {entries.map((entry, at) => {
        const index = at + 1;
        return (
          <div className="crossword-editor-row" role="group" aria-label={t('crosswordWordN', { index })} key={entry.id}>
            <span className="letter">{index}</span>
            <input
              className="moreless-editor-input crossword-editor-answer"
              aria-label={t('crosswordAnswer')}
              placeholder={t('crosswordAnswerPlaceholder')}
              value={entry.answer}
              maxLength={LIMITS.crosswordAnswer}
              {...UK_WORD_INPUT}
              onChange={(event) => setEntry(entry.id, { answer: event.target.value })}
            />
            <input
              className="moreless-editor-input crossword-editor-clue"
              aria-label={t('crosswordClue')}
              placeholder={t('crosswordCluePlaceholder')}
              value={entry.clue}
              maxLength={LIMITS.crosswordClue}
              onChange={(event) => setEntry(entry.id, { clue: event.target.value })}
            />
            <span className="crossword-editor-tools">
              <button type="button" className="row-button" aria-label={t('crosswordWordUp', { index })} disabled={at === 0} onClick={() => setEntries(moveItem(entries, at, at - 1))}>
                ↑
              </button>
              <button type="button" className="row-button" aria-label={t('crosswordWordDown', { index })} disabled={at === entries.length - 1} onClick={() => setEntries(moveItem(entries, at, at + 1))}>
                ↓
              </button>
              <button
                type="button"
                className="row-button"
                aria-label={t('removeCrosswordWord', { index })}
                disabled={entries.length <= LIMITS.minCrosswordWords}
                onClick={() => setEntries(entries.filter((other) => other.id !== entry.id))}
              >
                ×
              </button>
            </span>
          </div>
        );
      })}
      <button type="button" className="btn btn-dashed" disabled={entries.length >= LIMITS.maxCrosswordWords} onClick={() => setEntries([...entries, blankCrosswordEntry()])}>
        {t('addCrosswordWord')}
      </button>
      <div className="crossword-editor-mode" role="radiogroup" aria-label={t('crosswordModeLabel')}>
        <p className="meta">{t('crosswordModeLabel')}</p>
        <label className="check">
          <input type="radio" name={`crossword-mode-${question.id}`} checked={question.mode === 'full'} onChange={() => set({ mode: 'full', key: null })} />
          <span>{t('crosswordModeFull')}</span>
        </label>
        <label className="check">
          <input type="radio" name={`crossword-mode-${question.id}`} checked={question.mode === 'key'} onChange={() => set({ mode: 'key', key: question.key ?? '' })} />
          <span>{t('crosswordModeKey')}</span>
        </label>
      </div>
      {question.mode === 'key' && (
        <>
          <label className="field">
            <span>{t('crosswordKeyLabel')}</span>
            <input value={question.key ?? ''} placeholder={t('crosswordKeyPlaceholder')} maxLength={LIMITS.crosswordAnswer} {...UK_WORD_INPUT} onChange={(event) => set({ key: event.target.value })} />
          </label>
          <p className="meta">{t('crosswordKeyNote')}</p>
        </>
      )}
      {/* Місце для попередження є завжди: читач екрана чує зміну. */}
      <p className="meta powers-warn crossword-editor-warning" role="status">
        {warningText(build.warning, question.key)}
      </p>
      {build.grid !== null && <CrosswordPreview grid={build.grid} keyCells={build.layout?.keyCells ?? []} entries={entries} />}
      <p className="meta">{t('crosswordHelp')}</p>
    </div>
  );
}
