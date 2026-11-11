import { memo, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import type { PlayerSpotdiff, PublicQuestion, PublicSpotdiff } from '@quiz/shared';
import { secondsText } from '../format';
import { t } from '../i18n';
import { shareOf } from '../live/spot-geometry';
import type { Send } from '../live/types';
import { useSpotdiff, type SpotMiss } from '../live/useSpotdiff';

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

/** Картинка не перемальовується від тапів: лише її адреса й підпис. */
const Picture = memo(function Picture({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} draggable={false} />;
});

/** Кола й хрестики поверх картинки: viewBox у ширинах, тож кола лишаються колами за будь-якого співвідношення. */
function Overlay({ aspect, circles, misses }: { aspect: number; circles: readonly SpotRing[]; misses: readonly SpotMiss[] }) {
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
}

export interface SpotdiffPicturesProps {
  spotdiff: PublicSpotdiff;
  circles: readonly SpotRing[];
  /** Тап по будь-якій картинці: частки її власного прямокутника й ширина на екрані. Без нього — лише для перегляду. */
  onTap?: (x: number, y: number, width: number) => void;
  frozen?: boolean;
  misses?: readonly SpotMiss[];
}

/**
 * Дві картинки «Знайди відмінності» (29d) в однакових рамках aspect (object-fit: fill), з колами на обох. Телефон: нижче 640 px —
 * одна над одною, від 640 px — поруч. Сцена й пульт беруть той самий компонент без onTap.
 */
export function SpotdiffPictures({ spotdiff, circles, onTap, frozen = false, misses = [] }: SpotdiffPicturesProps) {
  const start = useRef<{ id: number; x: number; y: number } | null>(null);
  const tappable = onTap !== undefined && !frozen;

  const onDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!tappable) return;
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

  const frame = (src: string, alt: string, which: 'original' | 'changed') => (
    <div
      className={`spot-pic${tappable ? ' is-tap' : ''}${frozen ? ' spot-frozen' : ''}`}
      data-pic={which}
      dir="ltr"
      style={{ '--ar': spotdiff.aspect, aspectRatio: String(spotdiff.aspect) } as CSSProperties}
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerCancel={() => {
        start.current = null;
      }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <Picture src={src} alt={alt} />
      <Overlay aspect={spotdiff.aspect} circles={circles} misses={misses} />
      {frozen && <span className="spot-frozen-note">{t('spotdiffFrozen')}</span>}
    </div>
  );

  return (
    <div className="spot-pictures">
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
  const status = info.done
    ? `${t('spotdiffAllFound')} · ${t('jigsawSeconds', { time: secondsText(info.timeMs ?? 0) })}`
    : closed
      ? ''
      : timeUp
        ? t('spotdiffTimeUp')
        : model.offline
          ? t('spotdiffOffline')
          : '';
  return (
    <div className="spot-play">
      <p className="meta spot-progress">{t('spotdiffFound', { found: info.found.length, total: info.total })}</p>
      <SpotdiffPictures spotdiff={spotdiff} circles={ringsOf(model.found)} onTap={interactive ? model.tap : undefined} frozen={!closed && model.frozen} misses={closed ? [] : model.misses} />
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
