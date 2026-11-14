import { JIGSAW_ASPECTS, JIGSAW_MAX_PIECES, JIGSAW_MIN_PIECES, LIMITS, aspectRatio, clamp01, jigsawCrop, jigsawGrid, jigsawSides, jigsawTabs, type JigsawAspect } from '@quiz/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { t } from '../i18n';
import { piecePath } from '../live/jigsaw-shape';
import { ImageField } from './ImageField';
import type { JigsawQuestion } from './draft';

/** Крок рамки за стрілкою (частка запасу фото). */
const KEY_STEP = 0.05;
const SEED_MAX = 2 ** 32;

/** Сітка й виступи для нової кількості чи співвідношення; seed лишається, тож «Інша форма» не губиться. */
const regrid = (pieces: number, aspect: JigsawAspect, seed: number) => {
  const { rows, cols } = jigsawGrid(pieces, aspect);
  return { rows, cols, tabs: jigsawTabs(rows, cols, seed) };
};

/** Лінії розрізу поверх рамки: ті самі шматочки, що зрізає телефон (сторони з tabs, шлях з piecePath). */
function CutLines({ question }: { question: JigsawQuestion }) {
  const { rows, cols, tabs, aspect } = question;
  const width = aspectRatio(aspect) * 100;
  const cw = width / cols;
  const ch = 100 / rows;
  return (
    <svg className="jigsaw-cuts" viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      {Array.from({ length: rows * cols }, (_, k) => (
        <path key={k} d={piecePath(jigsawSides(rows, cols, tabs, k), cw, ch)} transform={`translate(${(k % cols) * cw} ${Math.floor(k / cols) * ch})`} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** Час пазла: міняється лише на допустиме число, а порожнє чи недопустиме при виході з поля повертається до чинного. */
export function TimeField({ value, onChange, min = LIMITS.minJigsawTime }: { value: number; onChange: (value: number) => void; min?: number }) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => setRaw((current) => (Number(current) === value ? current : String(value))), [value]);
  return (
    <div className="jigsaw-editor-time">
      <label className="field compact">
        <span>{t('timeLimit')}</span>
        <input
          inputMode="numeric"
          value={raw}
          maxLength={4}
          onChange={(event) => {
            setRaw(event.target.value);
            const next = Number(event.target.value);
            if (event.target.value.trim() !== '' && Number.isInteger(next) && next >= min && next <= LIMITS.maxPuzzleTime) onChange(next);
          }}
          onBlur={() => setRaw(String(value))}
        />
      </label>
      <small className="meta">{t('jigsawTimeHint', { min, max: LIMITS.maxPuzzleTime })}</small>
    </div>
  );
}

/**
 * «Пазл» в редакторі (29c): фото через загальне завантаження (ImageField), співвідношення, кількість шматочків (сітка «4×3 = 12»),
 * рамка кадру, яку тягнуть по фото, «Інша форма» (новий seed → tabs), показ готової картинки й час (від 25 с).
 */
export function JigsawEditor({ question, onChange }: { question: JigsawQuestion; onChange: (q: JigsawQuestion) => void }) {
  const { photo, aspect, focus, rows, cols, seed } = question;
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Бажана кількість — те, що показує повзунок: сітка підбирається під співвідношення й може дати трохи інше число (7 → 8).
  const [want, setWant] = useState(rows * cols);
  useEffect(() => {
    const grid = jigsawGrid(want, aspect);
    if (grid.rows !== rows || grid.cols !== cols) setWant(rows * cols);
  }, [want, rows, cols, aspect]);
  const area = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; fx: number; fy: number } | null>(null);

  const crop = natural === null ? null : jigsawCrop(natural.w, natural.h, aspect, focus);
  const slack = natural === null || crop === null ? { x: 0, y: 0 } : { x: 1 - crop.sw / natural.w, y: 1 - crop.sh / natural.h };
  const frame =
    natural === null || crop === null
      ? { left: 0, top: 0, width: 100, height: 100 }
      : { left: (crop.sx / natural.w) * 100, top: (crop.sy / natural.h) * 100, width: (crop.sw / natural.w) * 100, height: (crop.sh / natural.h) * 100 };

  const setFocus = (x: number, y: number) => onChange({ ...question, focus: { x: clamp01(x), y: clamp01(y) } });
  const onDown = (event: PointerEvent<HTMLDivElement>) => {
    drag.current = { x: event.clientX, y: event.clientY, fx: focus.x, fy: focus.y };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = drag.current;
    const rect = area.current?.getBoundingClientRect();
    if (start === null || rect === undefined) return;
    // Рамка йде разом з пальцем: повний хід фото по осі — це запас (1 − частка рамки).
    const x = slack.x > 0 && rect.width > 0 ? start.fx + (event.clientX - start.x) / (rect.width * slack.x) : focus.x;
    const y = slack.y > 0 && rect.height > 0 ? start.fy + (event.clientY - start.y) / (rect.height * slack.y) : focus.y;
    setFocus(x, y);
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-KEY_STEP, 0], ArrowRight: [KEY_STEP, 0], ArrowUp: [0, -KEY_STEP], ArrowDown: [0, KEY_STEP] };
    const move = steps[event.key];
    if (move === undefined) return;
    event.preventDefault();
    setFocus(focus.x + move[0], focus.y + move[1]);
  };
  const anotherShape = () => {
    const next = (seed + 1) % SEED_MAX;
    onChange({ ...question, seed: next, tabs: jigsawTabs(rows, cols, next) });
  };

  return (
    <div className="jigsaw-editor">
      <ImageField url={photo === '' ? null : photo} onChange={(url) => onChange({ ...question, photo: url ?? '' })} />
      {photo === '' && <p className="meta">{t('jigsawPhotoNeed')}</p>}

      <div className="jigsaw-editor-row" role="radiogroup" aria-label={t('jigsawAspectLabel')}>
        {JIGSAW_ASPECTS.map((value) => (
          <button type="button" key={value} role="radio" aria-checked={aspect === value} className={aspect === value ? 'chip is-on' : 'chip'} onClick={() => onChange({ ...question, aspect: value, ...regrid(want, value, seed) })}>
            {value}
          </button>
        ))}
      </div>

      <label className="field jigsaw-editor-pieces">
        <span>{t('jigsawPiecesLabel')}</span>
        <input
          type="range"
          min={JIGSAW_MIN_PIECES}
          max={JIGSAW_MAX_PIECES}
          value={want}
          onChange={(event) => {
            const next = Number(event.target.value);
            setWant(next);
            onChange({ ...question, ...regrid(next, aspect, seed) });
          }}
        />
        <output>{t('jigsawPieces', { cols, rows, n: rows * cols })}</output>
      </label>

      {photo !== '' && (
        <>
          <div className="jigsaw-editor-crop" ref={area} dir="ltr" style={{ aspectRatio: natural === null ? String(aspectRatio(aspect)) : `${natural.w} / ${natural.h}` }}>
            <img
              src={photo}
              alt=""
              draggable={false}
              onLoad={(event) => {
                const { naturalWidth, naturalHeight } = event.currentTarget;
                if (naturalWidth > 0 && naturalHeight > 0) setNatural({ w: naturalWidth, h: naturalHeight });
              }}
            />
            <div
              className="jigsaw-editor-frame"
              role="group"
              tabIndex={0}
              aria-label={t('jigsawCrop')}
              style={{ left: `${frame.left}%`, top: `${frame.top}%`, width: `${frame.width}%`, height: `${frame.height}%` }}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onKeyDown={onKey}
            >
              <CutLines question={question} />
            </div>
          </div>
          <p className="meta">{t('jigsawCropHint')}</p>
        </>
      )}

      <div className="jigsaw-editor-row">
        <button type="button" className="btn btn-small" onClick={anotherShape}>
          {t('jigsawNewShape')}
        </button>
        <label className="check">
          <input type="checkbox" checked={question.preview} onChange={(event) => onChange({ ...question, preview: event.target.checked })} />
          <span>{t('jigsawPreviewLabel')}</span>
        </label>
      </div>

      <TimeField value={question.timeLimit} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
      <p className="meta">{t('jigsawHelp')}</p>
    </div>
  );
}
