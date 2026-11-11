import { useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { PublicQuestion } from '@quiz/shared';
import { DRAWING_COLORS, DRAWING_ERASER, DRAWING_WIDTHS, LIMITS, applyDrawOp, type DrawOp, type DrawingInfo, type PlayerDrawing, type Stroke } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { DrawingModel } from '../live/drawing';
import { DRAW_FLUSH_MS, createPen, type Pen } from '../live/pen';
import type { Send } from '../live/types';
import { DrawingCanvas } from './DrawingCanvas';

/** Заголовок запитання «Малюнок»: рушій не віддає тексту вгадувачам і сцені, тож замість порожнього рядка — нейтральна підказка. */
export function drawingTitle(question: PublicQuestion, drawerName: string | null): string {
  if (question.type !== 'drawing' || question.text !== '') return question.text;
  return drawerName === null ? t('drawingGuessTitleAnon') : t('drawingGuessTitle', { name: drawerName });
}

/** Скільки висить «Ні» після хибної спроби, мс. */
export const DRAWING_MISS_MS = 1500;

const WIDTH_KEYS = ['drawingWidth_0', 'drawingWidth_1', 'drawingWidth_2'] as const;
const NO_STROKES: Stroke[] = [];

/** Однакові малюнки (той самий вміст): тоді полотно не перемальовується. */
function sameStrokes(a: readonly Stroke[], b: readonly Stroke[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((s, i) => {
    const o = b[i]!;
    return s === o || (s.c === o.c && s.w === o.w && s.p.length === o.p.length && s.p.every((v, j) => v === o.p[j]));
  });
}

/** Операція в черзі на відправку; для begin — номер штриха, щоб до нього доливати more. */
interface Outgoing {
  op: DrawOp;
  index: number;
}

/** Зливає голову черги: begin/more того самого штриха з наступними more, доки пакет не досяг drawBatch. */
function takeBatch(queue: Outgoing[]): DrawOp | null {
  const head = queue.shift();
  if (head === undefined) return null;
  if (head.op.op !== 'begin' && head.op.op !== 'more') return head.op;
  const limit = LIMITS.drawBatch * 2;
  let p = [...head.op.p];
  while (queue[0] !== undefined && queue[0].op.op === 'more' && queue[0].index === head.index && p.length + queue[0].op.p.length <= limit) {
    p = p.concat(queue[0].op.p);
    queue.shift();
  }
  return { ...head.op, p };
}

/** Значки інструментів (назва — в aria-label кнопки): гумка, «Крок назад», «Очистити». «Крок назад» дзеркалиться в rtl. */
function ToolIcon({ kind }: { kind: 'eraser' | 'undo' | 'clear' }) {
  return (
    <svg className={`drawing-icon is-${kind}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {kind === 'eraser' && (
        <>
          <path d="M8.5 20.5 3.6 15.6a2 2 0 0 1 0-2.8l8.8-8.8a2 2 0 0 1 2.8 0l5 5a2 2 0 0 1 0 2.8l-8.7 8.7" />
          <path d="M8.5 20.5H21M7.5 9.5l7 7" />
        </>
      )}
      {kind === 'undo' && (
        <>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </>
      )}
      {kind === 'clear' && (
        <>
          <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
          <path d="M10 10v7M14 10v7" />
        </>
      )}
    </svg>
  );
}

/**
 * Художник (28c): слово великим, полотно на всю ширину (touch-action: none, pointer-події з setPointerCapture);
 * два ряди інструментів: 8 кольорів; гумка, 3 товщини, «Крок назад», «Очистити» (значками з назвою в aria-label).
 *
 * Локальна модель: власні операції застосовуються одразу; пакет іде кожні DRAW_FLUSH_MS, у польоті — щонайбільше один
 * (begin першої точки — одразу при дотику). Модель сервера (useGame застосовує до неї й власні операції) береться,
 * лише коли художник нічого не робить (перо підняте, черга порожня, ack усіх пакетів прийшов) і коли вона наздогнала
 * власні операції: rev моделі ≥ rev, від якого почали, + кількість ok-ack. Сервер розсилає подію раніше за ack, але useGame
 * лише планує рендер, тож ack буває раніше за нову модель — тоді полотно чекає, а не відкочується на кадр.
 * Будь-яка відмова ack → черга й перо скидаються, requestSync; полотно знову стає серверним, щойно модель наздожене.
 * «Крок назад» і «Очистити» порожнього малюнка не йдуть: сервер відповів би ok без rev, і лічильник розійшовся б.
 */
export function DrawingPad({ info, model, paused, timeUp, send, requestSync }: { info: PlayerDrawing; model: DrawingModel | null; paused: boolean; timeUp: boolean; send: Send; requestSync: () => void }) {
  const [strokes, setStrokes] = useState<Stroke[]>(() => model?.strokes ?? NO_STROKES);
  const [color, setColor] = useState(0);
  const [penWidth, setPenWidth] = useState(1);
  const [eraserWidth, setEraserWidth] = useState(DRAWING_WIDTHS.length - 1);
  const [status, setStatus] = useState('');
  const [idle, setIdle] = useState(true);
  const local = useRef(strokes);
  const queue = useRef<Outgoing[]>([]);
  const inFlight = useRef(false);
  const pointer = useRef<number | null>(null);
  const pen = useRef<Pen | null>(null);
  const modelNow = useRef(model);
  modelNow.current = model;
  /** Rev, який модель сервера має наздогнати: rev узятої моделі + ok-ack операцій після неї. */
  const expected = useRef(model?.rev ?? 0);
  const off = paused || timeUp || !info.canDraw;
  const offNow = useRef(off);
  offNow.current = off;
  const eraser = color === DRAWING_ERASER;
  const width = eraser ? eraserWidth : penWidth;

  const show = (next: Stroke[]) => {
    local.current = next;
    setStrokes(next);
  };

  const isIdle = () => pointer.current === null && queue.current.length === 0 && !inFlight.current;

  /** Нічого свого не в дорозі: полотно — як у сервера. */
  const follow = useCallback(() => {
    const server = modelNow.current;
    if (server === null || server.stale || pointer.current !== null || queue.current.length > 0 || inFlight.current) return;
    if (server.rev < expected.current) return;
    expected.current = server.rev;
    if (!sameStrokes(local.current, server.strokes)) {
      local.current = server.strokes;
      setStrokes(server.strokes);
    }
  }, []);

  const markIdle = () => {
    const now = isIdle();
    setIdle(now);
    if (now) follow();
  };

  const refuse = (error: string) => {
    queue.current = [];
    pointer.current = null;
    pen.current = null;
    setStatus(error === 'drawing_full' ? t('drawingFull') : '');
    requestSync();
  };

  const pump = () => {
    if (inFlight.current) return;
    const op = takeBatch(queue.current);
    if (op === null) {
      markIdle();
      return;
    }
    inFlight.current = true;
    setIdle(false);
    void send('player:draw', op).then(
      (result) => {
        inFlight.current = false;
        if (result.ok) {
          expected.current += 1;
          markIdle();
          return;
        }
        refuse(result.error);
        markIdle();
      },
      () => {
        inFlight.current = false;
        refuse('err_unknown');
        markIdle();
      },
    );
  };

  /** Усе, що набралося в пері, — у локальну модель і в чергу. */
  const drain = () => {
    const current = pen.current;
    if (current === null) return;
    let next = local.current;
    for (const op of current.flush()) {
      const index = op.op === 'begin' ? next.length : op.op === 'more' ? op.index : -1;
      next = applyDrawOp(next, op);
      queue.current.push({ op, index });
    }
    if (next !== local.current) show(next);
  };

  // Пакет — кожні DRAW_FLUSH_MS, лише коли попередній уже дійшов.
  useEffect(() => {
    const id = setInterval(() => {
      if (queue.current.length > 0) pump();
    }, DRAW_FLUSH_MS);
    return () => clearInterval(id);
    // pump читає все з ref-ів.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Пауза чи кінець часу посеред штриха: перо піднімається, недовідправлене відкидається (сервер усе одно відмовив би).
  useEffect(() => {
    if (!off) return;
    pointer.current = null;
    pen.current = null;
    queue.current = [];
    markIdle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [off]);

  // Нова модель сервера (sync, повернення, розсилка): береться, якщо нічого свого не в дорозі.
  useEffect(() => {
    follow();
  }, [model, follow]);

  const at = (event: ReactPointerEvent<HTMLElement> | PointerEvent, box: DOMRect) => {
    const x = box.width > 0 ? (event.clientX - box.left) / box.width : 0;
    const y = box.height > 0 ? (event.clientY - box.top) / box.height : 0;
    return { x, y };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (offNow.current || pointer.current !== null || event.button > 0) return;
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Старі браузери без захоплення: штрих обірветься на краю, і все.
    }
    pointer.current = event.pointerId;
    setStatus('');
    setIdle(false);
    pen.current = createPen(() => local.current.length);
    const { x, y } = at(event, box);
    pen.current.down(x, y, color, width);
    drain();
    pump();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId || pen.current === null) return;
    const box = event.currentTarget.getBoundingClientRect();
    const native = event.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const all = native.getCoalescedEvents?.() ?? [];
    for (const one of all.length > 0 ? all : [event]) {
      const { x, y } = at(one, box);
      pen.current.move(x, y);
    }
    drain();
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pointer.current !== event.pointerId) return;
    pen.current?.up();
    drain();
    pen.current = null;
    pointer.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Захоплення вже немає.
    }
    markIdle();
  };

  const command = (op: DrawOp) => {
    if (offNow.current || pointer.current !== null || local.current.length === 0) return;
    show(applyDrawOp(local.current, op));
    queue.current.push({ op, index: -1 });
    setStatus('');
    pump();
  };

  return (
    <section className={off ? 'drawing-pad is-off' : 'drawing-pad'} aria-label={t('drawingYouDraw')} aria-disabled={off}>
      <div className="drawing-word">
        <span className="meta">{t('drawingYourWord')}</span>
        <strong dir="auto">{info.word}</strong>
      </div>
      <div className="drawing-frame">
        <div
          className="drawing-surface"
          style={{ touchAction: 'none' }}
          data-idle={idle}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(event) => event.preventDefault()}
        >
          <DrawingCanvas strokes={strokes} label={t('drawingCanvasLabel')} />
        </div>
      </div>
      <div className="drawing-tools">
        <div className="drawing-colors" role="group">
          {DRAWING_COLORS.map((value, i) => (
            <button
              key={value}
              type="button"
              className="drawing-color"
              style={{ background: value }}
              aria-label={t('drawingColor', { n: i + 1 })}
              aria-pressed={color === i}
              disabled={off}
              onClick={() => setColor(i)}
            />
          ))}
        </div>
        <div className="drawing-widths" role="group">
          <button type="button" className="drawing-tool drawing-eraser" aria-label={t('drawingEraser')} title={t('drawingEraser')} aria-pressed={eraser} disabled={off} onClick={() => setColor(DRAWING_ERASER)}>
            <ToolIcon kind="eraser" />
          </button>
          {DRAWING_WIDTHS.map((value, i) => (
            <button
              key={value}
              type="button"
              className="drawing-width"
              aria-label={t(WIDTH_KEYS[i]!)}
              title={t(WIDTH_KEYS[i]!)}
              aria-pressed={width === i}
              disabled={off}
              onClick={() => (eraser ? setEraserWidth(i) : setPenWidth(i))}
            >
              <span className="drawing-dot" style={{ width: `${4 + i * 6}px`, height: `${4 + i * 6}px` }} />
            </button>
          ))}
          <button type="button" className="drawing-tool" aria-label={t('drawingUndo')} title={t('drawingUndo')} disabled={off} onClick={() => command({ op: 'undo' })}>
            <ToolIcon kind="undo" />
          </button>
          <button type="button" className="drawing-tool" aria-label={t('drawingClear')} title={t('drawingClear')} disabled={off} onClick={() => command({ op: 'clear' })}>
            <ToolIcon kind="clear" />
          </button>
        </div>
      </div>
      <p className="drawing-status" role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}

/**
 * Вгадувач (28c): поле й «Вгадати». ok → «Вгадано!», поля більше немає; drawing_miss → м'яке «Ні» на DRAWING_MISS_MS,
 * поле порожнє й лишається у фокусі (клавіатура не ховається); too_soon — тихо, текст лишається. Поле не вимикається,
 * поки йде запит (інакше на телефоні зникла б клавіатура), — повторні натискання просто не йдуть.
 */
export function DrawingGuess({ info, paused, timeUp, send }: { info: PlayerDrawing; paused: boolean; timeUp: boolean; send: Send }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);
  const [status, setStatus] = useState('');
  const [miss, setMiss] = useState(false);
  const value = useRef('');
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const missTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (missTimer.current !== null) clearTimeout(missTimer.current);
    },
    [],
  );

  const guessed = done || info.guessed;
  const off = paused || timeUp || !info.canGuess;

  const change = (next: string) => {
    value.current = next;
    setText(next);
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    const sent = value.current.trim();
    if (off || busy.current || sent === '') return;
    busy.current = true;
    try {
      const result = await send('player:draw-guess', { text: sent });
      if (result.ok || result.error === 'already_answered') {
        setDone(true);
        setStatus('');
        setMiss(false);
        return;
      }
      if (result.error === 'drawing_miss') {
        if (value.current.trim() === sent) change('');
        setStatus(t('drawingMiss'));
        setMiss(true);
        if (missTimer.current !== null) clearTimeout(missTimer.current);
        missTimer.current = setTimeout(() => {
          setStatus('');
          setMiss(false);
        }, DRAWING_MISS_MS);
      } else if (result.error !== 'too_soon') {
        setStatus(errorText(result.error));
      }
    } catch {
      setStatus(t('err_unknown'));
    } finally {
      busy.current = false;
      // Фокус — назад у поле, якщо гравець сам нікуди не пішов.
      const active = document.activeElement;
      if (input.current !== null && (active === null || active === document.body || active === input.current)) input.current.focus();
    }
  };

  if (guessed) {
    return (
      <section className="drawing-guess is-done" role="status">
        <h2>{t('drawingGuessed')}</h2>
      </section>
    );
  }

  return (
    <section className="drawing-guess">
      <form className="drawing-guess-form" onSubmit={(event) => void submit(event)}>
        <input
          ref={input}
          className={miss ? 'is-miss' : undefined}
          type="text"
          dir="auto"
          inputMode="text"
          maxLength={LIMITS.drawGuess}
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder={t('drawingGuessPlaceholder')}
          aria-label={t('drawingGuessPlaceholder')}
          value={text}
          disabled={off}
          onChange={(event) => change(event.target.value)}
        />
        <button type="submit" className="btn primary" disabled={off} onPointerDown={(event) => event.preventDefault()}>
          {t('drawingGuessButton')}
        </button>
      </form>
      <p className={miss ? 'drawing-guess-status is-miss' : 'drawing-guess-status'} aria-live="polite">
        {status}
      </p>
    </section>
  );
}

/** Товариш художника (28c): лише хто малює; слова й поля немає. */
export function DrawingTeamWatch({ name }: { name: string }) {
  return <p className="lead drawing-team-watch">{t('drawingTeamWatch', { name })}</p>;
}

/** Хто малює й скільки вгадали — без імен (до відкриття їх бачить лише пульт). */
export function DrawingBoard({ info }: { info: DrawingInfo }) {
  return (
    <div className="drawing-board">
      {info.drawerName !== null && (
        <p className="drawing-drawer" dir="auto">
          {t('drawingDrawer', { name: info.drawerName })}
        </p>
      )}
      <p className="drawing-count">{t('drawingCount', { guessed: info.guessed, could: info.could })}</p>
    </div>
  );
}

/** Хто вгадав: імена з балами в порядку вгадування; me — підсвітити власну сторону. */
export function DrawingGuessers({ guessers, me, points = true }: { guessers: NonNullable<DrawingInfo['guessers']>; me?: string; points?: boolean }) {
  if (guessers.length === 0) return <p className="meta drawing-nobody">{t('drawingNobody')}</p>;
  return (
    <ol className="rows drawing-guessers">
      {guessers.map((row) => (
        <li key={row.id} className={me !== undefined && me === row.id ? 'is-mine' : undefined}>
          <span className="name" dir="auto">
            {row.nickname}
          </span>
          {points && (
            <span className="score" dir="ltr">
              {signed(row.points)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/**
 * Відкриття (28c): слово над малюнком; художник із його часткою — першим рядком того самого вигляду, що й рядки тих,
 * хто вгадав (з балами). Полотно — в обгортці .drawing-fit: на сцені вона бере всю решту висоти.
 */
export function DrawingReveal({ info, strokes, me, className }: { info: DrawingInfo; strokes: Stroke[]; me?: string; className?: string }) {
  return (
    <section className={className === undefined ? 'drawing-reveal' : `drawing-reveal ${className}`}>
      {info.word !== null && (
        <h2 className="drawing-word-was" dir="auto">
          {t('drawingWordWas', { word: info.word })}
        </h2>
      )}
      <div className="drawing-fit">
        <div className="drawing-frame">
          <DrawingCanvas strokes={strokes} label={t('drawingCanvasLabel')} />
        </div>
      </div>
      <div className="drawing-reveal-rows">
        {info.drawerName !== null && (
          <ul className="rows drawing-artist-row">
            <li className={me !== undefined && me === info.side ? 'drawing-artist is-mine' : 'drawing-artist'}>
              <span className="name" dir="auto">
                {t('drawingArtist', { name: info.drawerName })}
              </span>
              {info.drawerPoints !== null && (
                <span className="score" dir="ltr">
                  {signed(info.drawerPoints)}
                </span>
              )}
            </li>
          </ul>
        )}
        <DrawingGuessers guessers={info.guessers ?? []} me={me} />
      </div>
    </section>
  );
}

/** Штрихи моделі, якщо вона саме цього запитання; інакше порожньо (модель попереднього ще не замінилась). */
export function strokesOf(model: DrawingModel | null, questionIndex: number): Stroke[] {
  return model !== null && model.questionIndex === questionIndex ? model.strokes : NO_STROKES;
}

/** Живий малюнок для всіх, крім художника: полотно в рамці. */
export function DrawingLive({ strokes, className }: { strokes: Stroke[]; className?: string }) {
  return (
    <div className={className === undefined ? 'drawing-frame' : `drawing-frame ${className}`}>
      <DrawingCanvas strokes={strokes} label={t('drawingCanvasLabel')} />
    </div>
  );
}

/**
 * Телефон на відкритому «Малюнку»: художникові — DrawingPad; товаришеві художника — полотно й «Малює … з вашої команди»;
 * вгадувачеві — хто малює, полотно й поле. Без власного боку (глядач) — лише полотно й лічильник.
 */
export function DrawingPhone({
  mine,
  info,
  model,
  questionIndex,
  paused,
  timeUp,
  send,
  requestSync,
}: {
  mine: PlayerDrawing | undefined;
  info: DrawingInfo | undefined;
  model: DrawingModel | null;
  questionIndex: number;
  paused: boolean;
  timeUp: boolean;
  send: Send;
  requestSync: () => void;
}) {
  const strokes = strokesOf(model, questionIndex);
  if (mine?.role === 'drawer') return <DrawingPad key={questionIndex} info={mine} model={model !== null && model.questionIndex === questionIndex ? model : null} paused={paused} timeUp={timeUp} send={send} requestSync={requestSync} />;
  return (
    <section className="drawing-watch">
      {mine?.role === 'teammate' ? <DrawingTeamWatch name={info?.drawerName ?? ''} /> : info !== undefined && <DrawingBoard info={info} />}
      <DrawingLive strokes={strokes} />
      {mine?.role === 'guesser' && <DrawingGuess key={questionIndex} info={mine} paused={paused} timeUp={timeUp} send={send} />}
    </section>
  );
}

/** Після закриття, до відкриття: малюнок, лічильник і своє «Вгадано!». */
export function DrawingClosed({ mine, info, strokes }: { mine: PlayerDrawing | undefined; info: DrawingInfo | undefined; strokes: Stroke[] }) {
  return (
    <section className="sent drawing-closed">
      {mine?.guessed === true && <h2>{t('drawingGuessed')}</h2>}
      <DrawingLive strokes={strokes} />
      {info !== undefined && <DrawingBoard info={info} />}
      <p className="lead">{t('waitReveal')}</p>
    </section>
  );
}
