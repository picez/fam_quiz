import type { CSSProperties } from 'react';
import type { MemoryBoardView, MemoryCard, MemoryCellView, MemoryInfo, PlayerMemory, PublicMemory, PublicQuestion } from '@quiz/shared';
import { secondsText, signed } from '../format';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { memoryTextSize, useMemory } from '../live/useMemory';
import { jigsawTablePageSize } from './JigsawView';
import { puzzleGrid, puzzlePageSize, usePage } from './PuzzleView';

export { memoryTextSize } from '../live/useMemory';

export interface MemoryGridProps {
  cols: number;
  rows: number;
  cells: readonly (MemoryCellView | 'pending' | null)[];
  /** Тап по закритій картці; без нього — лише для перегляду. */
  onFlip?: (cell: number) => void;
  /** Вимкнено (чужий хід, пауза, час сплив, усе знайдено): закриті картки притлумлені й aria-disabled. */
  disabled?: boolean;
  /** Тимчасово чекаємо (картка летить, показана непара): тапи не йдуть, але без притлумлення й без aria-disabled. */
  waiting?: boolean;
  /** Розкриття: невідкриті картки (state 'shown') — не помилка, без червоної рамки. */
  reveal?: boolean;
}

const STATE_LABEL = { open: 'memoryCardOpen', shown: 'memoryCardMiss', matched: 'memoryCardMatched' } as const;

/** Підпис відкритої картки для читача екрана: номер, стан і вміст (для картинки — слово «Картинка»). */
function cardLabel(cell: MemoryCellView, n: number, reveal: boolean): string {
  const card = cell.imageUrl !== null ? t('memoryHalfImage') : cell.text;
  // На розкритті невідкриті (shown) — не непара, а просто показана картка.
  return t(reveal && cell.state === 'shown' ? 'memoryCardOpen' : STATE_LABEL[cell.state], { n, card });
}

function CardFace({ cell }: { cell: MemoryCellView }) {
  if (cell.imageUrl !== null) return <img className="memory-img" src={cell.imageUrl} alt="" draggable={false} />;
  return (
    <span className={`memory-text memory-text-${memoryTextSize(cell.text)}`} dir="auto" aria-hidden="true">
      {cell.text}
    </span>
  );
}

/**
 * Сітка «Пам'яті» (29f): cols квадратних карток у ряд, розмір — з CSS (--memory-card: за шириною поля й висотою екрана). Закрита
 * картка — сорочка без вмісту (номер лише в aria-label); 'pending' — «перевертання» без вмісту; відкрита, показана (непара — червона
 * рамка) чи знайдена (зелена, у командах колір tone, притлумлена) — вміст зі зрізу.
 */
export function MemoryGrid({ cols, rows, cells, onFlip, disabled = false, waiting = false, reveal = false }: MemoryGridProps) {
  return (
    <div className={reveal ? 'memory-grid is-reveal' : 'memory-grid'} style={{ '--cols': cols, '--rows': rows } as CSSProperties} dir="ltr">
      {cells.map((cell, i) => {
        const n = i + 1;
        const off = disabled || onFlip === undefined;
        const tappable = cell === null && !off && !waiting;
        if (cell === null || cell === 'pending') {
          return (
            <button
              key={i}
              type="button"
              className={cell === null ? 'memory-card is-closed' : 'memory-card is-closed is-pending'}
              aria-label={t('memoryCardClosed', { n })}
              aria-disabled={off ? 'true' : undefined}
              data-cell={i}
              onClick={tappable ? () => onFlip(i) : undefined}
            />
          );
        }
        return (
          <button key={i} type="button" className={`memory-card is-${cell.state}${cell.tone === null ? '' : ` by-${cell.tone}`}`} aria-disabled="true" aria-label={cardLabel(cell, n, reveal)} data-cell={i}>
            <CardFace cell={cell} />
          </button>
        );
      })}
    </div>
  );
}

export interface MemoryPlayProps {
  info: PlayerMemory;
  question: PublicQuestion;
  /** Номер запитання в раунді (view.questionIndex) — його чекає сервер у подіях. */
  questionIndex: number;
  paused: boolean;
  timeUp: boolean;
  send: Send;
  /** Запитання закрив сервер: лише сітка з власними картками, рядок стану — у батька. */
  closed?: boolean;
}

/** «Пам'ять» (29f) на телефоні: рядок «Знайдено x з N пар», у командах — хто ходить, сітка карток. */
export function MemoryPlay(props: MemoryPlayProps) {
  const memory = props.question.memory;
  if (memory === undefined) return null;
  // Інша «Пам'ять» під тим самим номером — інша сітка: «перевертання» й локальні таймери з нуля.
  return <MemoryBoard key={`${props.questionIndex}:${memory.id}`} {...props} memory={memory} />;
}

function MemoryBoard({ info, memory, questionIndex, paused, timeUp, send, closed = false }: MemoryPlayProps & { memory: PublicMemory }) {
  const model = useMemory(info, questionIndex, send);
  // Вимкнено — надовго (чужий хід, пауза, час, усе знайдено); чекаємо — мить (картка летить, непара показана): без притлумлення.
  const off = closed || paused || timeUp || info.done || info.busy !== null;
  const busyText = info.busy === null ? '' : t('memoryBusy', { name: info.busy.nickname });
  const status = closed
    ? ''
    : info.done
      ? t('memoryDoneIn', { time: secondsText(info.timeMs ?? 0) })
      : timeUp
        ? t('memoryTimeUp')
        : model.offline
          ? t('memoryOffline')
          : '';
  // Чужий хід оголошує рядок стану (видимий рядок над сіткою — лише для очей).
  const spoken = status === '' && !closed ? busyText : '';
  return (
    <div className="memory-play">
      <p className="meta memory-progress">{t('memoryProgress', { found: info.pairs, total: info.total })}</p>
      {!closed && info.busy !== null && (
        <p className={`meta memory-busy by-${info.busy.tone}`} dir="auto" aria-hidden="true">
          {busyText}
        </p>
      )}
      <MemoryGrid cols={memory.cols} rows={memory.rows} cells={model.cells} onFlip={closed ? undefined : model.flip} disabled={off} waiting={!model.canFlip} />
      <p className="puzzle-status" role="status" aria-live="polite">
        {status}
        {spoken !== '' && <span className="sr-only">{spoken}</span>}
      </p>
    </div>
  );
}

/** Розкриття на телефоні: уся власна сітка з усіма картками (знайдені — зелені, решта — нейтральні). */
export function MemoryReveal({ mine, question }: { mine: PlayerMemory | undefined; question: PublicQuestion }) {
  const memory = question.memory;
  if (memory === undefined) return null;
  const progress = t('memoryProgress', { found: mine?.pairs ?? 0, total: mine?.total ?? memory.total });
  return (
    <div className="memory-play memory-reveal">
      <p className="meta memory-progress">{mine !== undefined && mine.done && mine.timeMs !== null ? `${progress} · ${t('jigsawSeconds', { time: secondsText(mine.timeMs) })}` : progress}</p>
      {mine !== undefined && <MemoryGrid cols={memory.cols} rows={memory.rows} cells={mine.cells} reveal />}
    </div>
  );
}

/**
 * Мініатюри «нік · x з N» усіх гравців (команд) на сцені й пульті (29f): cols × rows квадратиків, з яких світяться перші 2 · pairs
 * у порядку читання. Це лише кількість: справжніх місць знайдених пар тут немає й бути не може (розклад однаковий для всіх).
 * Сцена — рівні сторінки по черзі (puzzleGrid, puzzlePageSize, usePage), пульт — уся сітка й ще «ходи».
 */
export function MemoryBoards({ boards, cols, rows, reveal = false, host = false }: { boards: readonly MemoryBoardView[]; cols: number; rows: number; reveal?: boolean; host?: boolean }) {
  const size = puzzlePageSize(boards.length, reveal);
  const page = usePage(boards.length, size, !host);
  const shown = host ? boards : boards.slice(page * size, page * size + size);
  const grid = puzzleGrid(shown.length, false);
  return (
    <div className={host ? 'memory-boards-fit is-host' : grid.dense ? 'memory-boards-fit is-dense' : 'memory-boards-fit'}>
      <ul className="memory-boards" style={host ? undefined : ({ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties)}>
        {shown.map((board) => (
          <li key={board.playerId} className={board.done ? 'memory-board is-done' : 'memory-board'} data-player={board.playerId}>
            <span className="memory-board-name" dir="auto" title={board.nickname}>
              {board.nickname}
            </span>
            <span className="memory-board-count">
              {t('memoryCardCount', { found: board.pairs, total: board.total })}
              {board.done && board.timeMs !== null ? ` ✓ ${t('jigsawSeconds', { time: secondsText(board.timeMs) })}` : ''}
            </span>
            {host && <span className="memory-board-moves">{t('memoryMovesCount', { moves: board.moves })}</span>}
            <span className="memory-mini" style={{ '--mini-cols': cols, '--mini-rows': rows } as CSSProperties} aria-hidden="true">
              {Array.from({ length: cols * rows }, (_, i) => (
                <i key={i} className={i < 2 * board.pairs ? 'memory-mini-cell is-lit' : 'memory-mini-cell'} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PairHalf({ card }: { card: MemoryCard }) {
  if (card.imageUrl !== undefined) return <img className="memory-reveal-img" src={card.imageUrl} alt={t('memoryHalfImage')} draggable={false} />;
  return (
    <span className="memory-reveal-text" dir="auto">
      {card.text}
    </span>
  );
}

/** Розкриття: усі пари списком «a ↔ b» (кожна половина — текст чи картинка). */
export function MemoryPairs({ pairs }: { pairs: readonly { a: MemoryCard; b: MemoryCard }[] }) {
  return (
    <section className="memory-pairs-box" aria-label={t('memoryRevealPairs')}>
      <ul className="memory-reveal-pairs">
        {pairs.map((pair, i) => (
          <li key={i} className="memory-reveal-pair">
            <PairHalf card={pair.a} />
            <span className="memory-reveal-arrow" aria-hidden="true">
              ↔
            </span>
            <PairHalf card={pair.b} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Таблиця розкриття: «місце · нік · час · бали» (на пульті ще «ходи») в порядку сервера. Місце — лише в тих, хто знайшов усе (однаковий
 * час — однакове місце); решта — «—», у стовпці часу в них «x з N», балів 0 (як у JigsawTable). Сторінки й шрифт — як у JigsawTable.
 */
export function MemoryTable({ boards, host = false }: { boards: readonly MemoryBoardView[]; host?: boolean }) {
  const places = boards.map((board, i) => {
    let at = i;
    while (at > 0 && boards[at - 1].done && boards[at - 1].timeMs === board.timeMs) at -= 1;
    return at + 1;
  });
  const size = jigsawTablePageSize(boards.length);
  const page = usePage(boards.length, size, !host);
  const from = host ? 0 : page * size;
  const shown = host ? boards : boards.slice(from, from + size);
  return (
    <table className={host ? 'jigsaw-table memory-table is-host' : 'jigsaw-table memory-table'} aria-label={t('memoryTableLabel')} style={host ? undefined : ({ '--rows': shown.length } as CSSProperties)}>
      <thead>
        <tr>
          <th scope="col">{t('jigsawTablePlace')}</th>
          <th scope="col">{t('jigsawTableWho')}</th>
          <th scope="col">{t('jigsawTableTime')}</th>
          {host && <th scope="col">{t('memoryTableMoves')}</th>}
          <th scope="col">{t('jigsawTablePoints')}</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((board, i) => (
          <tr key={board.playerId} className={board.done ? 'is-done' : 'is-undone'}>
            <td className="rank">{board.done ? places[from + i] : '—'}</td>
            <td className="name" dir="auto">
              {board.nickname}
            </td>
            <td className="jigsaw-table-time">{board.done && board.timeMs !== null ? t('jigsawSeconds', { time: secondsText(board.timeMs) }) : t('memoryCardCount', { found: board.pairs, total: board.total })}</td>
            {host && <td className="memory-table-moves">{board.moves}</td>}
            <td className="score">{signed(board.points ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Пам'ять» на сцені й пульті (29f). До розкриття — мініатюри з кількістю пар; на розкритті — усі пари списком і таблиця часу.
 * Пари беруться лише з publicMemory.pairs (на reveal), ніколи з ключа ведучого.
 */
export function MemoryStage({ info, memory, reveal, host = false }: { info: MemoryInfo; memory: PublicMemory; reveal: boolean; host?: boolean }) {
  if (!reveal) return <MemoryBoards boards={info.boards} cols={memory.cols} rows={memory.rows} host={host} />;
  return (
    <>
      {memory.pairs !== null && <MemoryPairs pairs={memory.pairs} />}
      <div className="jigsaw-stage-table">
        <MemoryTable boards={info.boards} host={host} />
      </div>
    </>
  );
}
