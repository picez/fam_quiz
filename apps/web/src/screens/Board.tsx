import type { BoardInfo } from '@quiz/shared';
import { markText } from '../format';
import { t } from '../i18n';

interface Props {
  board: BoardInfo;
  /** З обробником незіграні клітинки стають кнопками. */
  onPick?: (cellId: string) => void;
}

/** Спільне поле для пульта, телефона й сцени: стовпці — категорії, клітинки згори вниз. */
export function Board({ board, onPick }: Props) {
  return (
    <div className="board" style={{ gridTemplateColumns: `repeat(${board.categories.length}, minmax(0, 1fr))` }}>
      {board.categories.map((category) => (
        <div key={category.id} className="board-col">
          <h3 className="board-title">{category.title}</h3>
          {category.cells.map((cell) => {
            if (cell.played) return <span key={cell.id} className="board-cell is-played" aria-hidden="true" />;
            const content = (
              <>
                <span className="price">{cell.price}</span>
                {cell.mark !== null && <span className="mark">{markText(cell.mark)}</span>}
              </>
            );
            return onPick === undefined ? (
              <span key={cell.id} className="board-cell">
                {content}
              </span>
            ) : (
              <button
                key={cell.id}
                type="button"
                className="board-cell is-open"
                aria-label={t('cellAria', { category: category.title, price: cell.price })}
                onClick={() => onPick(cell.id)}
              >
                {content}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
