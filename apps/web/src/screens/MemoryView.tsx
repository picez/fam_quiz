import type { CSSProperties } from 'react';
import type { MemoryCellView, PlayerMemory, PublicMemory, PublicQuestion } from '@quiz/shared';
import { secondsText } from '../format';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { memoryTextSize, useMemory } from '../live/useMemory';

export { memoryTextSize } from '../live/useMemory';

export interface MemoryGridProps {
  cols: number;
  rows: number;
  cells: readonly (MemoryCellView | 'pending' | null)[];
  /** Тап по закритій картці; без нього — лише для перегляду. */
  onFlip?: (cell: number) => void;
  disabled?: boolean;
  /** Розкриття: невідкриті картки (state 'shown') — не помилка, без червоної рамки. */
  reveal?: boolean;
}

function CardFace({ cell, n }: { cell: MemoryCellView; n: number }) {
  if (cell.imageUrl !== null) return <img className="memory-img" src={cell.imageUrl} alt={t('memoryCard', { n })} draggable={false} />;
  return (
    <span className={`memory-text memory-text-${memoryTextSize(cell.text)}`} dir="auto">
      {cell.text}
    </span>
  );
}

/**
 * Сітка «Пам'яті» (29f): cols квадратних карток у ряд, розмір — з CSS (--memory-card: за шириною поля й висотою екрана). Закрита
 * картка — сорочка без вмісту (номер лише в aria-label); 'pending' — «перевертання» без вмісту; відкрита, показана (непара — червона
 * рамка) чи знайдена (зелена, у командах колір tone, притлумлена) — вміст зі зрізу.
 */
export function MemoryGrid({ cols, rows, cells, onFlip, disabled = false, reveal = false }: MemoryGridProps) {
  return (
    <div className={reveal ? 'memory-grid is-reveal' : 'memory-grid'} style={{ '--cols': cols, '--rows': rows } as CSSProperties} dir="ltr">
      {cells.map((cell, i) => {
        const n = i + 1;
        const tappable = cell === null && onFlip !== undefined && !disabled;
        if (cell === null || cell === 'pending') {
          return (
            <button
              key={i}
              type="button"
              className={cell === null ? 'memory-card is-closed' : 'memory-card is-closed is-pending'}
              aria-label={t('memoryCardClosed', { n })}
              aria-disabled={tappable ? undefined : 'true'}
              data-cell={i}
              onClick={tappable ? () => onFlip(i) : undefined}
            />
          );
        }
        return (
          <button key={i} type="button" className={`memory-card is-${cell.state}${cell.tone === null ? '' : ` by-${cell.tone}`}`} aria-disabled="true" data-cell={i}>
            <CardFace cell={cell} n={n} />
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
  const interactive = !closed && !paused && !timeUp && model.canFlip && !info.done;
  const status = closed
    ? ''
    : info.done
      ? t('memoryDoneIn', { time: secondsText(info.timeMs ?? 0) })
      : timeUp
        ? t('memoryTimeUp')
        : model.offline
          ? t('memoryOffline')
          : '';
  return (
    <div className="memory-play">
      <p className="meta memory-progress">{t('memoryProgress', { found: info.pairs, total: info.total })}</p>
      {!closed && info.busy !== null && (
        <p className={`meta memory-busy by-${info.busy.tone}`} dir="auto">
          {t('memoryBusy', { name: info.busy.nickname })}
        </p>
      )}
      <MemoryGrid cols={memory.cols} rows={memory.rows} cells={model.cells} onFlip={closed ? undefined : model.flip} disabled={!interactive} />
      <p className="puzzle-status" role="status" aria-live="polite">
        {status}
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
