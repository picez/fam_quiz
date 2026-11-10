import { applyDrawOp, type DrawingEvent, type GameView, type Stroke } from '@quiz/shared';

/** Малюнок (28c) на клієнті: знімок сервера плюс операції, що прийшли після нього. */
export interface DrawingModel {
  questionIndex: number;
  /** Скільки операцій сервера застосовано; порівнюється з view.drawing.rev. */
  rev: number;
  strokes: Stroke[];
  /** Прийшла операція через пропуск: малюнок розійшовся з сервером, потрібен sync. */
  stale: boolean;
}

/** Порожній малюнок запитання: rev 0 — ще жодної операції, sync не потрібен. */
export function emptyDrawing(questionIndex: number): DrawingModel {
  return { questionIndex, rev: 0, strokes: [], stale: false };
}

/**
 * Застосовує подію: sync — завжди замінює; ops — лише свого запитання й rev === model.rev + 1 (менший — пропуск, більший — stale).
 * Без моделі перша операція (rev 1) лягає на порожній малюнок; будь-яка інша дає stale.
 */
export function reduceDrawing(model: DrawingModel | null, event: DrawingEvent): DrawingModel {
  if (event.kind === 'sync') return { questionIndex: event.questionIndex, rev: event.rev, strokes: event.strokes, stale: false };
  const base = model ?? emptyDrawing(event.questionIndex);
  if (base.questionIndex !== event.questionIndex) return base;
  if (event.rev <= base.rev) return base;
  if (event.rev > base.rev + 1 || base.stale) return base.stale ? base : { ...base, stale: true };
  return { questionIndex: base.questionIndex, rev: event.rev, strokes: applyDrawOp(base.strokes, event.op), stale: false };
}

/** Зріз випередив модель (view.drawing.rev > model.rev), модель stale чи нове запитання — треба sync. Не «Малюнок» — ні. */
export function needsSync(model: DrawingModel | null, view: GameView): boolean {
  const info = view.drawing;
  if (info === undefined) return false;
  if (model === null || model.questionIndex !== view.questionIndex) return true;
  return model.stale || info.rev > model.rev;
}
