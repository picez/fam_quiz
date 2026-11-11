import { memo, useCallback, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerSpotdiff, PublicQuestion, PublicSpotdiff, SpotdiffBoardView, SpotdiffHostInfo, SpotdiffInfo } from '@quiz/shared';
import { secondsText, signed } from '../format';
import { t } from '../i18n';
import { shareOf } from '../live/spot-geometry';
import type { Send } from '../live/types';
import { useSpotdiff, type SpotMiss } from '../live/useSpotdiff';
import { jigsawTablePageSize } from './JigsawView';
import { puzzleGrid, puzzlePageSize, usePage } from './PuzzleView';

/** Рух пальця понад стільки CSS px — не тап (прокрутка чи жест). */
export const SPOT_TAP_PX = 8;
/** Півдовжина рисочки хрестика промаху, у ширинах картинки. */
const CROSS = 0.025;

export interface SpotRing {
  x: number;
  y: number;
  r: number;
  /** '1'…'9' — колір учасника команди; null — акцентний (соло). */
  tone: string | null;
  /** Номер чи підпис біля кола (пульт); телефон без нього. */
  label?: string;
  /** Не знайдене (розкриття): пунктир. */
  missed?: boolean;
}

/** Картинка не перемальовується від тапів: лише її адреса, підпис і (стала) реакція на помилку завантаження. */
const Picture = memo(function Picture({ src, alt, onError }: { src: string; alt: string; onError: (src: string) => void }) {
  return <img src={src} alt={alt} draggable={false} onError={() => onError(src)} />;
});

/** Кола й хрестики поверх картинки: viewBox у ширинах, тож кола лишаються колами за будь-якого співвідношення. Без змін кіл чи хрестиків — без перемальовування. */
const Overlay = memo(function Overlay({ aspect, circles, misses }: { aspect: number; circles: readonly SpotRing[]; misses: readonly SpotMiss[] }) {
  if (circles.length === 0 && misses.length === 0) return null;
  return (
    <svg className="spot-overlay" viewBox={`0 0 1 ${1 / aspect}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {circles.map((c, i) => (
        <g key={i} className={`spot-ring${c.tone === null ? ' is-solo' : ` by-${c.tone}`}${c.missed ? ' is-missed' : ''}`}>
          <circle cx={c.x} cy={c.y / aspect} r={c.r} vectorEffect="non-scaling-stroke" />
          {c.label !== undefined && (
            <text x={c.x} y={c.y / aspect} textAnchor="middle" dominantBaseline="central" fontSize={Math.max(0.03, Math.min(0.06, c.r))}>
              {c.label}
            </text>
          )}
        </g>
      ))}
      {misses.map((m) => {
        const cy = m.y / aspect;
        return (
          <g key={m.id} className="spot-miss">
            <line x1={m.x - CROSS} y1={cy - CROSS} x2={m.x + CROSS} y2={cy + CROSS} vectorEffect="non-scaling-stroke" />
            <line x1={m.x - CROSS} y1={cy + CROSS} x2={m.x + CROSS} y2={cy - CROSS} vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
});

const NO_MISSES: readonly SpotMiss[] = [];

export interface SpotdiffPicturesProps {
  spotdiff: PublicSpotdiff;
  circles: readonly SpotRing[];
  /** Тап по будь-якій картинці: частки її власного прямокутника й ширина на екрані. Без нього — лише для перегляду. */
  onTap?: (x: number, y: number, width: number) => void;
  frozen?: boolean;
  misses?: readonly SpotMiss[];
}

/**
 * Дві картинки «Знайди відмінності» (29d) в однакових рамках aspect (object-fit: fill), з колами на обох. Телефон: горизонтальні
 * картинки нижче 640 px — одна над одною, від 640 px — поруч; вертикальні (aspect < 1) — завжди поруч. Сцена й пульт беруть той
 * самий компонент без onTap. Картинка, що не завантажилась, не приймає тапів і показує підпис про помилку.
 */
export function SpotdiffPictures({ spotdiff, circles, onTap, frozen = false, misses = NO_MISSES }: SpotdiffPicturesProps) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  // Адреси, що не завантажились: за адресою, тож нова картинка починає з чистого.
  const [broken, setBroken] = useState<ReadonlySet<string>>(() => new Set());
  const onError = useCallback((src: string) => setBroken((now) => (now.has(src) ? now : new Set(now).add(src))), []);
  const tappable = onTap !== undefined && !frozen;

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tappable || event.currentTarget.dataset.broken === 'true') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    start.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const onUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (!tappable || s === null || s.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - s.x, event.clientY - s.y) > SPOT_TAP_PX) return;
    // Прямокутник саме тієї картинки, по якій тапнули, — як її бачить палець.
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const { x, y } = shareOf(rect, event.clientX, event.clientY);
    onTap(x, y, rect.width);
  };

  const frame = (src: string, alt: string, which: 'original' | 'changed') => {
    const failed = broken.has(src);
    return (
      <div
        className={`spot-pic${tappable && !failed ? ' is-tap' : ''}${frozen ? ' spot-frozen' : ''}${failed ? ' is-broken' : ''}`}
        data-pic={which}
        data-broken={failed ? 'true' : undefined}
        dir="ltr"
        style={{ '--ar': spotdiff.aspect, aspectRatio: String(spotdiff.aspect) } as CSSProperties}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => {
          start.current = null;
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        <Picture src={src} alt={alt} onError={onError} />
        <Overlay aspect={spotdiff.aspect} circles={circles} misses={misses} />
        {failed && (
          <span className="spot-broken-note" role="alert">
            {t('spotdiffImageError')}
          </span>
        )}
        {frozen && !failed && (
          <span className="spot-frozen-note" aria-hidden="true">
            {t('spotdiffFrozen')}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className={spotdiff.aspect < 1 ? 'spot-pictures is-tall' : 'spot-pictures'} style={{ '--ar': spotdiff.aspect } as CSSProperties}>
      {frame(spotdiff.original, t('spotdiffOriginal'), 'original')}
      {frame(spotdiff.changed, t('spotdiffChanged'), 'changed')}
    </div>
  );
}

const ringsOf = (found: PlayerSpotdiff['found']): SpotRing[] => found.map((f) => ({ x: f.x, y: f.y, r: f.r, tone: f.tone }));

export interface SpotdiffPlayProps {
  info: PlayerSpotdiff;
  question: PublicQuestion;
  /** Номер запитання в раунді (view.questionIndex) — його чекає сервер у подіях. */
  questionIndex: number;
  paused: boolean;
  timeUp: boolean;
  send: Send;
  /** Запитання закрив сервер: лише картинки з власними знахідками, рядок стану — у батька. */
  closed?: boolean;
}

/** «Знайди відмінності» (29d) на телефоні: рядок «Знайдено x з N», дві картинки, тапи по будь-якій. */
export function SpotdiffPlay(props: SpotdiffPlayProps) {
  const spotdiff = props.question.spotdiff;
  if (spotdiff === undefined) return null;
  // Інший пошук під тим самим номером (зріз не несе id запитання) — інша картинка: хрестики й заморозка з нуля.
  return <SpotdiffBoard key={`${props.questionIndex}:${spotdiff.changed}`} {...props} spotdiff={spotdiff} />;
}

function SpotdiffBoard({ info, spotdiff, questionIndex, paused, timeUp, send, closed = false }: SpotdiffPlayProps & { spotdiff: PublicSpotdiff }) {
  const model = useSpotdiff(info, questionIndex, send);
  const interactive = !closed && !paused && !timeUp && info.canTap && !info.done;
  const frozen = !closed && model.frozen;
  // Закрите запитання: заголовок (у батька) уже каже «усе знайдено за …» чи «час вийшов», тож рядок стану порожній.
  const status = closed
    ? ''
    : info.done
      ? t('spotdiffDoneIn', { time: secondsText(info.timeMs ?? 0) })
      : timeUp
        ? t('spotdiffTimeUp')
        : model.offline
          ? t('spotdiffOffline')
          : frozen
            ? t('spotdiffFrozen')
            : '';
  // Кожен зріз приносить новий масив found; кільця міняються лише з seq дошки (нова знахідка), тож Overlay не перемальовується даремно.
  const foundNow = useRef(model.found);
  foundNow.current = model.found;
  const rings = useMemo(() => ringsOf(foundNow.current), [info.seq, model.found.length]);
  return (
    <div className="spot-play">
      <p className="meta spot-progress">{t('spotdiffFound', { found: info.found.length, total: info.total })}</p>
      <SpotdiffPictures spotdiff={spotdiff} circles={rings} onTap={interactive ? model.tap : undefined} frozen={frozen} misses={closed ? NO_MISSES : model.misses} />
      <p className="puzzle-status" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}

/** Розкриття на телефоні: усі кола на обох картинках; власні знахідки — суцільні, решта — пунктиром. */
export function SpotdiffReveal({ mine, question }: { mine: PlayerSpotdiff | undefined; question: PublicQuestion }) {
  const spotdiff = question.spotdiff;
  if (spotdiff === undefined) return null;
  const own = new Map((mine?.found ?? []).map((f) => [f.index, f.tone]));
  const circles: SpotRing[] = (spotdiff.spots ?? []).map((s, i) => ({ x: s.x, y: s.y, r: s.r, tone: own.get(i) ?? null, missed: !own.has(i) }));
  return (
    <div className="spot-play spot-reveal">
      <p className="meta spot-progress">
        {mine === undefined
          ? t('spotdiffFound', { found: 0, total: spotdiff.total })
          : mine.done && mine.timeMs !== null
            ? `${t('spotdiffFound', { found: mine.found.length, total: mine.total })} · ${t('jigsawSeconds', { time: secondsText(mine.timeMs) })}`
            : t('spotdiffFound', { found: mine.found.length, total: mine.total })}
      </p>
      <SpotdiffPictures spotdiff={spotdiff} circles={circles} />
    </div>
  );
}

type BoardRow = SpotdiffBoardView & { spots?: number[] };

/**
 * Картки «нік · x з N» усіх гравців (команд) на сцені й пульті (29d): на сцені — рівні сторінки по черзі (puzzleGrid, puzzlePageSize,
 * usePage, як у пазлі), на пульті — уся сітка, а в картці ще й номери знайдених кіл. Місць тут немає, лише кількість.
 */
export function SpotdiffBoards({ boards, reveal = false, host = false }: { boards: readonly BoardRow[]; reveal?: boolean; host?: boolean }) {
  const size = puzzlePageSize(boards.length, reveal);
  const page = usePage(boards.length, size, !host);
  const shown = host ? boards : boards.slice(page * size, page * size + size);
  const grid = puzzleGrid(shown.length, false);
  return (
    <div className={host ? 'spotdiff-boards-fit is-host' : grid.dense ? 'spotdiff-boards-fit is-dense' : 'spotdiff-boards-fit'}>
      <ul className="spotdiff-boards" style={host ? undefined : ({ '--cols': grid.cols, '--rows': grid.rows } as CSSProperties)}>
        {shown.map((board) => (
          <li key={board.playerId} className={board.done ? 'spotdiff-card is-done' : 'spotdiff-card'} data-player={board.playerId}>
            <span className="spotdiff-card-name" dir="auto" title={board.nickname}>
              {board.nickname}
            </span>
            <span className="spotdiff-card-count">
              {t('spotdiffCardCount', { found: board.found, total: board.total })}
              {board.done && board.timeMs !== null ? ` ✓ ${t('jigsawSeconds', { time: secondsText(board.timeMs) })}` : ''}
            </span>
            {host && board.spots !== undefined && board.spots.length > 0 && <span className="spotdiff-card-spots">{board.spots.map((n) => n + 1).join(', ')}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Таблиця розкриття: «місце · нік · знайдено · бали» в порядку сервера; рівні результати ділять місце, хто не знайшов нічого — «—»
 * і без балів. Сторінки й шрифт — як у JigsawTable.
 */
export function SpotdiffTable({ boards, host = false }: { boards: readonly SpotdiffBoardView[]; host?: boolean }) {
  const places = boards.map((board, i) => {
    let at = i;
    while (at > 0 && boards[at - 1].found === board.found && boards[at - 1].timeMs === board.timeMs && boards[at - 1].done === board.done) at -= 1;
    return at + 1;
  });
  const size = jigsawTablePageSize(boards.length);
  const page = usePage(boards.length, size, !host);
  const from = host ? 0 : page * size;
  const shown = host ? boards : boards.slice(from, from + size);
  return (
    <table className={host ? 'jigsaw-table spotdiff-table is-host' : 'jigsaw-table spotdiff-table'} aria-label={t('spotdiffTableLabel')} style={host ? undefined : ({ '--rows': shown.length } as CSSProperties)}>
      <thead>
        <tr>
          <th scope="col">{t('jigsawTablePlace')}</th>
          <th scope="col">{t('jigsawTableWho')}</th>
          <th scope="col">{t('spotdiffTableFound')}</th>
          <th scope="col">{t('jigsawTablePoints')}</th>
        </tr>
      </thead>
      <tbody>
        {shown.map((board, i) => (
          <tr key={board.playerId} className={board.done ? 'is-done' : 'is-undone'}>
            {/* Нічого не знайшов — без місця й без балів, як незавершені в JigsawTable. */}
            <td className="rank">{board.found === 0 ? '—' : places[from + i]}</td>
            <td className="name" dir="auto">
              {board.nickname}
            </td>
            <td className="jigsaw-table-time">
              {/* Стовпець і так зветься «Знайдено»: у комірці лише «x з N», щоб таблиця була вужчою за картинки. */}
              {t('spotdiffCardCount', { found: board.found, total: board.total })}
              {board.done && board.timeMs !== null ? ` · ${t('jigsawSeconds', { time: secondsText(board.timeMs) })}` : ''}
            </td>
            <td className="score">{board.found === 0 ? '' : signed(board.points ?? 0)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * «Знайди відмінності» на сцені й пульті (29d). Зверху дві картинки: до розкриття без кіл (глядачі теж шукають), на розкритті з усіма
 * колами; пульт бачить кола з номерами завжди й під картинками, скільки дошок знайшло кожне. Далі — картки (до розкриття) чи таблиця.
 */
export function SpotdiffStage({ info, spotdiff, reveal, host = false }: { info: SpotdiffInfo | SpotdiffHostInfo; spotdiff: PublicSpotdiff; reveal: boolean; host?: boolean }) {
  const hostInfo = host && 'spots' in info ? info : null;
  const finds = (i: number) => (hostInfo === null ? 0 : hostInfo.boards.filter((board) => board.spots.includes(i)).length);
  const circles: SpotRing[] =
    hostInfo !== null
      ? hostInfo.spots.map((s, i) => ({ x: s.x, y: s.y, r: s.r, tone: null, label: String(i + 1), missed: reveal && finds(i) === 0 }))
      : reveal
        ? (spotdiff.spots ?? []).map((s) => ({ x: s.x, y: s.y, r: s.r, tone: null }))
        : [];
  return (
    <>
      <div className="spotdiff-stage-pics">
        <SpotdiffPictures spotdiff={spotdiff} circles={circles} />
        {hostInfo !== null && (
          <ul className="spotdiff-legend">
            {hostInfo.spots.map((_, i) => (
              <li key={i} data-spot={i}>
                <b>{i + 1}</b> {t('spotdiffSpotFoundBy', { count: finds(i) })}
              </li>
            ))}
          </ul>
        )}
      </div>
      {reveal ? (
        <div className="jigsaw-stage-table">
          <SpotdiffTable boards={info.boards} host={host} />
        </div>
      ) : (
        <SpotdiffBoards boards={info.boards} host={host} />
      )}
    </>
  );
}
