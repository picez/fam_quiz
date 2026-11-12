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
