import { LIMITS, SPOT_DEFAULT_R, SPOT_MAX_COUNT, SPOT_MAX_R, SPOT_MIN_R, aspectsMatch, type Question, type SpotCircle } from '@quiz/shared';
import { useEffect, useRef, useState, type ChangeEvent, type PointerEvent } from 'react';
import { t } from '../i18n';
import { shareOf } from '../live/spot-geometry';
import { QuestionImage } from '../screens/QuestionImage';
import { ACCEPT, measureAspect, useImageUpload } from './ImageField';
import { TimeField } from './JigsawEditor';
import type { SpotdiffQuestion } from './draft';

const clampR = (r: number) => Math.min(SPOT_MAX_R, Math.max(SPOT_MIN_R, r));

/** Відстань у ширинах картинки (висота ділиться на співвідношення сторін). */
const DRAG_THRESHOLD_PX = 6;
const dist = (aspect: number, x: number, y: number, s: { x: number; y: number }) => Math.hypot(x - s.x, (y - s.y) / aspect);

/** Кола поверх картинки: viewBox у ширинах, тож кола лишаються колами при будь-якому співвідношенні. */
function Circles({ spots, aspect, selected }: { spots: readonly SpotCircle[]; aspect: number; selected: number | null }) {
  return (
    <svg className="spotdiff-circles" viewBox={`0 0 1 ${1 / aspect}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {spots.map((s, i) => (
        <g key={i} className={i === selected ? 'is-selected' : undefined}>
          <circle cx={s.x} cy={s.y / aspect} r={s.r} vectorEffect="non-scaling-stroke" />
          <text x={s.x} y={s.y / aspect} textAnchor="middle" dominantBaseline="central" fontSize={Math.max(0.03, Math.min(0.06, s.r))}>
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Одне завантаження з підписом: окреме поле, щоб «Оригінал» і «Зі змінами» не плуталися. */
function UploadSlot({ label, url, busy, error, onPick, onClear }: { label: string; url: string; busy: boolean; error: string | null; onPick: (event: ChangeEvent<HTMLInputElement>) => void; onClear: () => void }) {
  return (
    <div className="spotdiff-slot image-field">
      <strong>{label}</strong>
      <QuestionImage url={url === '' ? null : url} alt={label} />
      <div className="toolbar">
        <label className={busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
          <span>{t(busy ? 'uploading' : url === '' ? 'addImage' : 'replaceImage')}</span>
          <input type="file" accept={ACCEPT} aria-label={label} disabled={busy} onChange={onPick} />
        </label>
        {url !== '' && (
          <button type="button" className="btn btn-small" onClick={onClear}>
            {t('removeImage')}
          </button>
        )}
      </div>
      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * «Знайди відмінності» в редакторі (29d): два завантаження (оригінал і зі змінами; співвідношення береться з першої, друга має збігатися),
 * кола на другій картинці: дотик ставить коло, перетягування міняє радіус, короткий дотик на колі виділяє його; до десяти кіл.
 */
export function SpotdiffEditor({ question, onChange }: { question: SpotdiffQuestion; onChange: (q: Question) => void }) {
  const { original, changed, aspect, spots } = question;
  // Завантаження й вимірювання тривають довше за кадр: результат лягає на актуальне запитання.
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [problem, setProblem] = useState<{ slot: 'original' | 'changed'; text: string } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ index: number; px: number; py: number; moved: boolean } | null>(null);
  // Номер останнього вибору файла: запізніла відповідь вимірювання нічого не міняє.
  const request = useRef({ original: 0, changed: 0 });

  const put = (patch: Partial<SpotdiffQuestion>) => latest.current.onChange({ ...latest.current.question, ...patch });

  const accept = (slot: 'original' | 'changed') => (url: string | null) => {
    if (url === null) return;
    request.current[slot] += 1;
    const mine = request.current[slot];
    void measureAspect(url).then((next) => {
      if (!mounted.current || mine !== request.current[slot]) return;
      if (next === null) return setProblem({ slot, text: t('pinImageFailed') });
      if (next < LIMITS.pinMinAspect || next > LIMITS.pinMaxAspect) return setProblem({ slot, text: t('pinAspectBad') });
      const current = latest.current.question;
      if (slot === 'original') {
        setProblem(null);
        // Інше співвідношення робить стару пару й кола недійсними.
        const same = current.changed !== '' && aspectsMatch(current.aspect, next);
        if (!same) setSelected(null);
        put(same ? { original: url, aspect: next } : { original: url, aspect: next, changed: '', spots: [] });
        return;
      }
      if (current.original === '') return setProblem({ slot, text: t('spotdiffNeedOriginal') });
      if (!aspectsMatch(current.aspect, next)) return setProblem({ slot, text: t('spotdiffAspectMismatch') });
      setProblem(null);
      put({ changed: url });
    });
  };
  const first = useImageUpload(accept('original'));
  const second = useImageUpload(accept('changed'));

  const circles = (list: SpotCircle[]) => put({ spots: list });
  const begin = (event: PointerEvent<HTMLDivElement>) => {
    const rect = area.current?.getBoundingClientRect();
    if (rect === undefined) return;
    const { x, y } = shareOf(rect, event.clientX, event.clientY);
    const current = latest.current.question;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    // Дотик у колі (найближчий центр серед тих, що накривають точку) — це це коло; інакше нове.
    let hit = -1;
    let best = Infinity;
    current.spots.forEach((s, i) => {
      const d = dist(current.aspect, x, y, s);
      if (d <= s.r && d < best) {
        best = d;
        hit = i;
      }
    });
    if (hit >= 0) {
      setSelected(hit);
      setFull(false);
      drag.current = { index: hit, px: event.clientX, py: event.clientY, moved: false };
      return;
    }
    if (current.spots.length >= SPOT_MAX_COUNT) {
      setFull(true);
      return;
    }
    setFull(false);
    circles([...current.spots, { x, y, r: SPOT_DEFAULT_R }]);
    setSelected(current.spots.length);
    drag.current = { index: current.spots.length, px: event.clientX, py: event.clientY, moved: false };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    const rect = area.current?.getBoundingClientRect();
    if (state === null || rect === undefined) return;
    const { x, y } = shareOf(rect, event.clientX, event.clientY);
    const current = latest.current.question;
    const spot = current.spots[state.index];
    if (spot === undefined) return;
    // Дрейф пальця в межах порогу — все ще тап: радіус не міняється, поки рух не вийде за поріг.
    if (!state.moved) {
      if (Math.hypot(event.clientX - state.px, event.clientY - state.py) <= DRAG_THRESHOLD_PX) return;
      state.moved = true;
    }
    const r = clampR(dist(current.aspect, x, y, spot));
    circles(current.spots.map((s, i) => (i === state.index ? { ...s, r } : s)));
  };
  const end = () => {
    drag.current = null;
  };
  const remove = () => {
    if (selected === null) return;
    circles(spots.filter((_, i) => i !== selected));
    setSelected(null);
    setFull(false);
  };

  const ready = original !== '' && changed !== '';
  return (
    <div className="spotdiff-editor">
      <div className="spotdiff-uploads">
        <UploadSlot
          label={t('spotdiffOriginal')}
          url={original}
          busy={first.busy}
          error={problem?.slot === 'original' ? problem.text : first.error}
          onPick={first.pick}
          onClear={() => {
            first.clearError();
            setProblem(null);
            setSelected(null);
            put({ original: '', changed: '', spots: [] });
          }}
        />
        <UploadSlot
          label={t('spotdiffChanged')}
          url={changed}
          busy={second.busy}
          error={problem?.slot === 'changed' ? problem.text : second.error}
          onPick={second.pick}
          onClear={() => {
            second.clearError();
            setProblem(null);
            setSelected(null);
            put({ changed: '', spots: [] });
          }}
        />
      </div>

      {ready && (
        <>
          <div className="spotdiff-marks">
            <div className="spotdiff-frame is-mirror" dir="ltr" style={{ aspectRatio: String(aspect) }}>
              <img src={original} alt="" draggable={false} />
              <Circles spots={spots} aspect={aspect} selected={selected} />
            </div>
            <div
              className="spotdiff-frame is-draw"
              ref={area}
              dir="ltr"
              role="group"
              aria-label={t('spotdiffMarkHint')}
              style={{ aspectRatio: String(aspect) }}
              onPointerDown={begin}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
            >
              <img src={changed} alt="" draggable={false} />
              <Circles spots={spots} aspect={aspect} selected={selected} />
            </div>
          </div>
          <p className="meta">{t('spotdiffMarkHint')}</p>
          <div className="spotdiff-editor-row">
            <output>{t('spotdiffCount', { count: spots.length, max: SPOT_MAX_COUNT })}</output>
            <button type="button" className="btn btn-small" disabled={selected === null} onClick={remove}>
              {t('spotdiffRemove')}
            </button>
          </div>
          {full && (
            <p className="error" role="alert">
              {t('spotdiffMax', { max: SPOT_MAX_COUNT })}
            </p>
          )}
        </>
      )}

      <TimeField value={question.timeLimit} min={LIMITS.minSpotdiffTime} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
    </div>
  );
}
