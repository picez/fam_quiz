import type { CSSProperties } from 'react';
import type { BoardCellView, BoardInfo } from '@quiz/shared';
import { markText } from '../format';
import { t } from '../i18n';

interface Props {
  board: BoardInfo;
  /** З обробником незіграні клітинки стають кнопками. */
  onPick?: (cellId: string) => void;
  /** Кнопки вимкнені (наприклад, на паузі). */
  disabled?: boolean;
}

export type CellLook = 'normal' | 'blitz' | 'voice';

/** Колір клітинки: бліц, інакше уголос, інакше звичайна. */
export function cellLook(cell: Pick<BoardCellView, 'kind' | 'answerMode'>): CellLook {
  return cell.kind === 'blitz' ? 'blitz' : cell.answerMode === 'voice' ? 'voice' : 'normal';
}

/**
 * Спільне поле для пульта, телефона й сцени: стовпці — категорії, клітинки згори вниз.
 * Незіграні клітинки пофарбовані за видом (cellLook). На вузькому екрані поле прокручується
 * всередині .gb-scroll, а не сторінка; назви категорій переносяться на кілька рядків.
 */
export function Board({ board, onPick, disabled = false }: Props) {
  // Стовпці беруть рядки сітки через subgrid: найдовша назва задає висоту рядка назв для всіх.
  const rows = Math.max(1, ...board.categories.map((category) => category.cells.length));
  return (
    <div className="gb-scroll">
      <div
        className="gb"
        style={{
          '--rows': rows,
          '--cols': board.categories.length,
          gridTemplateColumns: `repeat(${board.categories.length}, minmax(var(--gb-col-min), 1fr))`,
          gridTemplateRows: `auto repeat(${rows}, var(--gb-cell-h))`,
        } as CSSProperties}
      >
        {board.categories.map((category) => (
          <div key={category.id} className="gb-col" style={{ gridRow: `span ${rows + 1}` }}>
            <h3 className="gb-title">{category.title}</h3>
            {category.cells.map((cell) => {
              if (cell.played) return <span key={cell.id} className="gb-cell is-played" aria-hidden="true" />;
              const look = cellLook(cell);
              const content = (
                <>
                  <span className="price">{cell.price}</span>
                  {cell.kind === 'blitz' && <span className="gb-kind">{t('cellBlitz')}</span>}
                  {cell.mark !== 'none' && <span className="gb-mark">{markText(cell.mark)}</span>}
                  {cell.penalty === 'all' && <span className="gb-penalty">{t('cellPenaltyBadge')}</span>}
                  {cell.kind === 'blitz' && cell.answerMode === 'voice' && <span className="gb-voice">{t('cellVoiceBadge')}</span>}
                </>
              );
              return onPick === undefined ? (
                <span key={cell.id} className={`gb-cell is-${look}`}>
                  {content}
                </span>
              ) : (
                <button
                  key={cell.id}
                  type="button"
                  className={`gb-cell is-${look} is-open`}
                  aria-label={t('cellAria', { category: category.title, price: cell.price })}
                  disabled={disabled}
                  onClick={() => onPick(cell.id)}
                >
                  {content}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Легенда «колір → вид» лише з тих видів і позначок, що є на полі (зокрема серед зіграних клітинок). */
export function BoardLegend({ board }: { board: BoardInfo }) {
  const cells = board.categories.flatMap((category) => category.cells);
  const looks = new Set(cells.map(cellLook));
  const has = (test: (cell: BoardCellView) => boolean) => cells.some(test);
  const swatches: Array<{ look: CellLook; text: string }> = [];
  if (looks.has('normal')) swatches.push({ look: 'normal', text: t('legendNormal') });
  if (looks.has('blitz')) swatches.push({ look: 'blitz', text: t('legendBlitz') });
  if (looks.has('voice')) swatches.push({ look: 'voice', text: t('legendVoice') });
  const notes: string[] = [];
  if (has((cell) => cell.kind === 'blitz' && cell.answerMode === 'voice')) notes.push(t('legendBlitzVoice'));
  if (has((cell) => cell.mark === 'x2')) notes.push(t('legendX2'));
  if (has((cell) => cell.mark === 'x3')) notes.push(t('legendX3'));
  if (has((cell) => cell.penalty === 'all')) notes.push(t('legendPenaltyAll'));
  return (
    <ul className="gb-legend" aria-label={t('legendTitle')}>
      {swatches.map(({ look, text }) => (
        <li key={look}>
          <span className={`gb-swatch is-${look}`} aria-hidden="true" />
          {text}
        </li>
      ))}
      {notes.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

/** Рядки правил відкритої бліц-клітинки: хто вибрав, як відповідають і ставка штрафу. */
export function BlitzCellNotes({ board }: { board: BoardInfo }) {
  const cell = board.cell;
  if (cell === null || cell.kind !== 'blitz') return null;
  return (
    <>
      {board.turn !== null && <p className="meta">{t('cellChosenBy', { name: board.turn.nickname })}</p>}
      <p className="meta">{t('cellBlitzRule')}</p>
      {cell.penalty === 'all' && <p className="meta">{t('cellPenaltyAll')}</p>}
    </>
  );
}
