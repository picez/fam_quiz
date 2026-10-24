import type { CSSProperties, ReactNode } from 'react';
import type { PublicPin } from '@quiz/shared';
import { t } from '../i18n';
import { pinBaseUrl } from '../pin-maps';

export interface PinBoardMark {
  playerId: string;
  nickname: string;
  x: number;
  y: number;
}

interface Props {
  pin: PublicPin;
  imageUrl: string | null;
  marks?: PinBoardMark[];
  target?: { x: number; y: number };
  radii?: { full: number; zero: number };
  /** Підсвітити найближчого (сцена) або себе (телефон). */
  highlight?: string;
  /** Додатковий шар (живий pin у PinFrame). */
  children?: ReactNode;
}

/** Дві позначки ближчі за це (у % довшої сторони) — підпис нижньої зсувається на рядок. */
const LABEL_NEAR = 4;

const NONE: PinBoardMark[] = [];

/** Розмір шару SVG: довша сторона = 1000. */
export function pinLayerSize(aspect: number): { width: number; height: number } {
  return aspect >= 1 ? { width: 1000, height: 1000 / aspect } : { width: 1000 * aspect, height: 1000 };
}

/** Місце позначки на основі: left/top у відсотках. */
export function pinSpot(point: { x: number; y: number }): CSSProperties {
  return { left: `${point.x * 100}%`, top: `${point.y * 100}%` };
}

/** Рядок підпису кожної позначки: скільки попередніх стоять ближче за LABEL_NEAR — простий розвід по вертикалі. */
function labelRows(marks: PinBoardMark[], aspect: number): number[] {
  const { width, height } = pinLayerSize(aspect);
  return marks.map((mark, index) =>
    marks.slice(0, index).filter((other) => Math.hypot((other.x - mark.x) * width, (other.y - mark.y) * height) / 10 < LABEL_NEAR).length,
  );
}

/** Основа точки з шаром SVG: кола (за наявності radii), правильна точка, позначки. Пропорція — aspect; позначки сталого розміру. */
export function PinBoard({ pin, imageUrl, marks = NONE, target, radii, highlight, children }: Props) {
  const { width, height } = pinLayerSize(pin.aspect);
  const url = pinBaseUrl(pin, imageUrl);
  const rows = labelRows(marks, pin.aspect);
  return (
    <div className="pin-board" style={{ aspectRatio: String(pin.aspect), '--pin-aspect': pin.aspect } as CSSProperties}>
      {url !== null && <img className="pin-base" src={url} alt={t('pinMapAlt')} draggable={false} />}
      <svg className="pin-layer" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        {target !== undefined && radii !== undefined && (
          <>
            <circle className="pin-circle-zero" cx={target.x * width} cy={target.y * height} r={(radii.zero / 100) * 1000} />
            <circle className="pin-circle-full" cx={target.x * width} cy={target.y * height} r={(radii.full / 100) * 1000} />
          </>
        )}
      </svg>
      {marks.map((mark, index) => (
        <span
          key={mark.playerId}
          className={mark.playerId === highlight ? 'pin-mark is-best' : 'pin-mark'}
          role="img"
          aria-label={mark.nickname}
          style={{ ...pinSpot(mark), '--label-row': rows[index] } as CSSProperties}
        >
          <span className="pin-label" aria-hidden="true">
            {mark.nickname}
          </span>
        </span>
      ))}
      {target !== undefined && (
        <span className="pin-target" role="img" aria-label={t('pinTarget')} style={pinSpot(target)}>
          ★
        </span>
      )}
      {children}
    </div>
  );
}
