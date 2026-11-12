import { LIMITS, MEMORY_GRIDS, MEMORY_TEXT_MAX, memoryGridSize, type MemoryCard, type MemoryGrid, type Question } from '@quiz/shared';
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { QuestionImage } from '../screens/QuestionImage';
import { ACCEPT, useImageUpload } from './ImageField';
import { TimeField } from './JigsawEditor';
import { blankMemoryCard, randomSudokuSeed, type MemoryQuestion } from './draft';

type Side = 'a' | 'b';
type Mode = 'text' | 'image';

/** Одна половина пари: перемикач «Текст / Картинка» і саме поле чи завантаження. Режим «Картинка» без файла — ще порожня картка. */
function Half({
  label,
  placeholder,
  card,
  mode,
  onMode,
  onCard,
}: {
  label: string;
  placeholder: string;
  card: MemoryCard;
  mode: Mode;
  onMode: (mode: Mode) => void;
  onCard: (card: MemoryCard) => void;
}) {
  // Завантаження триває довше за кадр: адреса лягає на актуальне запитання через onCard батька.
  const upload = useImageUpload((url) => onCard(url === null ? blankMemoryCard() : { text: '', imageUrl: url }));
  return (
    <div className="memory-half">
      <div className="memory-half-mode" role="group" aria-label={placeholder}>
        <button type="button" className={mode === 'text' ? 'btn btn-small is-active' : 'btn btn-small'} aria-pressed={mode === 'text'} onClick={() => onMode('text')}>
          {t('memoryHalfText')}
        </button>
        <button type="button" className={mode === 'image' ? 'btn btn-small is-active' : 'btn btn-small'} aria-pressed={mode === 'image'} onClick={() => onMode('image')}>
          {t('memoryHalfImage')}
        </button>
      </div>
      {mode === 'text' ? (
        <input
          className="memory-half-text"
          value={card.text}
          maxLength={MEMORY_TEXT_MAX}
          placeholder={placeholder}
          aria-label={`${label}: ${placeholder}`}
          onChange={(event) => onCard({ text: event.target.value })}
        />
      ) : (
        <div className="memory-half-image">
          {card.imageUrl !== undefined && <QuestionImage url={card.imageUrl} alt={`${label}: ${placeholder}`} />}
          <label className={upload.busy ? 'btn btn-small file-pick is-busy' : 'btn btn-small file-pick'}>
            <span>{t(upload.busy ? 'uploading' : card.imageUrl === undefined ? 'addImage' : 'replaceImage')}</span>
            <input type="file" accept={ACCEPT} aria-label={`${label}: ${placeholder} · ${t('memoryHalfImage')}`} disabled={upload.busy} onChange={upload.pick} />
          </label>
          {card.imageUrl !== undefined && (
            <button type="button" className="btn btn-small" onClick={() => onCard(blankMemoryCard())}>
              {t('removeImage')}
            </button>
          )}
          {upload.error !== null && (
            <p className="error" role="alert">
              {upload.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * «Пам'ять» в редакторі (29f): три сітки (3×4, 4×4, 4×5), пари «питання — відповідь» з половинами-текстом або -картинкою,
 * «Перемішати» ставить новий seed розкладу. Зміна сітки дописує порожні пари чи відкидає зайві з кінця.
 */
export function MemoryEditor({ question, onChange }: { question: MemoryQuestion; onChange: (q: Question) => void }) {
  const latest = useRef({ question, onChange });
  latest.current = { question, onChange };
  // Режим «Картинка» без файла нічим не відрізняється від порожнього тексту, тож пам'ятаємо вибір окремо.
  const [picked, setPicked] = useState<Record<string, Mode>>({});

  const put = (patch: Partial<MemoryQuestion>) => latest.current.onChange({ ...latest.current.question, ...patch });
  const setCard = (index: number, side: Side, card: MemoryCard) => {
    const { pairs } = latest.current.question;
    put({ pairs: pairs.map((pair, i) => (i === index ? { ...pair, [side]: card } : pair)) });
  };
  const setGrid = (grid: MemoryGrid) => {
    const want = memoryGridSize(grid).pairs;
    const { pairs } = latest.current.question;
    put({ grid, pairs: Array.from({ length: want }, (_, i) => pairs[i] ?? { a: blankMemoryCard(), b: blankMemoryCard() }) });
  };
  const modeOf = (index: number, side: Side, card: MemoryCard): Mode => (card.imageUrl !== undefined ? 'image' : (picked[`${index}${side}`] ?? 'text'));
  const switchMode = (index: number, side: Side, mode: Mode) => {
    setPicked((now) => ({ ...now, [`${index}${side}`]: mode }));
    const card = latest.current.question.pairs[index]![side];
    // Текст і картинка не живуть разом: перемикання лишає порожню картку, а не стару половину.
    if (mode === 'text' ? card.imageUrl !== undefined : card.text !== '') setCard(index, side, blankMemoryCard());
  };
  const [shuffled, setShuffled] = useState(false);

  return (
    <div className="memory-editor">
      <div className="memory-grids" role="group" aria-label={t('memoryGridLabel')}>
        {MEMORY_GRIDS.map((grid) => {
          const { cols, rows, pairs } = memoryGridSize(grid);
          return (
            <button key={grid} type="button" className={question.grid === grid ? 'btn btn-small is-active' : 'btn btn-small'} aria-pressed={question.grid === grid} onClick={() => setGrid(grid)}>
              {t('memoryGrid', { cols, rows, pairs })}
            </button>
          );
        })}
      </div>

      {question.pairs.map((pair, index) => (
        <fieldset key={index} className="memory-pair">
          <legend>{t('memoryPairLabel', { n: index + 1 })}</legend>
          {(['a', 'b'] as const).map((side) => (
            <Half
              key={side}
              label={t('memoryPairLabel', { n: index + 1 })}
              placeholder={t(side === 'a' ? 'memoryTextPlaceholderA' : 'memoryTextPlaceholderB')}
              card={pair[side]}
              mode={modeOf(index, side, pair[side])}
              onMode={(mode) => switchMode(index, side, mode)}
              onCard={(card) => setCard(index, side, card)}
            />
          ))}
        </fieldset>
      ))}

      <div className="memory-editor-row">
        <button
          type="button"
          className="btn btn-small"
          onClick={() => {
            put({ seed: randomSudokuSeed() });
            setShuffled(true);
          }}
        >
          {t('memoryShuffle')}
        </button>
        {shuffled && (
          <span className="meta" role="status">
            {t('memoryShuffled')}
          </span>
        )}
      </div>

      <TimeField value={question.timeLimit} min={LIMITS.minMemoryTime} onChange={(timeLimit) => onChange({ ...question, timeLimit })} />
    </div>
  );
}
