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

/** Скільки рядків підписів дозволено під скупченням позначок; решта лишається без імені (ім'я є в aria-label). */
const MAX_LABEL_ROWS = 3;
/** Скільки підписів узагалі: сотня імен на мапі нечитабельна. */
const MAX_LABELS = 12;
/** Біля цього краю (частка ширини) підпис притискається до краю, щоб не виходити за мапу. */
const EDGE = 0.12;

/**
 * Рядок підпису кожної позначки (null — без підпису): розвід по вертикалі від ближчих попередніх.
 * Підсвічена (найближча) йде першою, тож завжди має ім'я; далі — не більше MAX_LABELS підписів і MAX_LABEL_ROWS рядків.
 */
function labelRows(marks: PinBoardMark[], aspect: number, highlight: string | undefined): (number | null)[] {
  const { width, height } = pinLayerSize(aspect);
  const order = marks.map((_, index) => index).sort((a, b) => Number(marks[b].playerId === highlight) - Number(marks[a].playerId === highlight) || a - b);
  const rows: (number | null)[] = marks.map(() => null);
  const labelled: PinBoardMark[] = [];
  for (const index of order) {
    const mark = marks[index];
    const near = labelled.filter((other) => Math.hypot((other.x - mark.x) * width, (other.y - mark.y) * height) / 10 < LABEL_NEAR).length;
    if (near >= MAX_LABEL_ROWS || labelled.length >= MAX_LABELS) continue;
    rows[index] = near;
    labelled.push(mark);
  }
  return rows;
}

/** Основа точки з шаром SVG: кола (за наявності radii), правильна точка, позначки. Пропорція — aspect; позначки сталого розміру. */
export function PinBoard({ pin, imageUrl, marks = NONE, target, radii, highlight, children }: Props) {
  const { width, height } = pinLayerSize(pin.aspect);
  const url = pinBaseUrl(pin, imageUrl);
  const rows = labelRows(marks, pin.aspect, highlight);
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
          style={{ ...pinSpot(mark), '--label-row': rows[index] ?? 0 } as CSSProperties}
        >
          {rows[index] !== null && (
            <span className={['pin-label', mark.x < EDGE ? 'is-left' : mark.x > 1 - EDGE ? 'is-right' : '', mark.y > 1 - EDGE ? 'is-up' : ''].filter(Boolean).join(' ')} aria-hidden="true">
              {mark.nickname}
            </span>
          )}
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
