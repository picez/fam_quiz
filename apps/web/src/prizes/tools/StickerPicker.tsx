import {
  DECOR_SUPPORT,
  STICKERS,
  STICKER_SERIES,
  seriesLevel,
  stickerOf,
  stickerOpen,
  stickerPath,
  type StickerPlace,
  type TrophyDecor,
  type TrophyKind,
} from '@quiz/shared';
import { useId, useState, type JSX } from 'react';
import { t, type TextKey } from '../../i18n';

export interface StickerPickerProps {
  kind: TrophyKind;
  stickers: TrophyDecor['stickers'];
  level: number;
  onPick: (place: StickerPlace, id: string | null) => void;
  /** Наліпки зі збереженого оформлення цього призу: лишаються чинними й закриті (як на сервері). */
  kept?: readonly string[];
}

const lockText = (need: number): string => t('lookLocked', { level: t('levelFromLevel', { n: need }) });

const placeText = (place: StickerPlace): string => t(`studioPlace_${place.replace('-', '_')}` as TextKey);

/**
 * Наліпки на кожне місце форми: кнопка місця з поточною мініатюрою розкриває сітку
 * («Без наліпки» і всі наліпки за серіями). Закриті за рівнем — disabled з рівнем, з якого відкриються.
 */
export function StickerPicker({ kind, stickers, level, onPick, kept = [] }: StickerPickerProps): JSX.Element {
  const [open, setOpen] = useState<StickerPlace | null>(null);
  const id = useId();
  return (
    <div className="studio-stickers">
      {DECOR_SUPPORT[kind].sticker.map((place) => {
        const currentId = stickers.find((s) => s.place === place)?.id ?? null;
        const current = currentId === null ? undefined : stickerOf(currentId);
        const expanded = open === place;
        const grid = `${id}-${place}`;
        return (
          <div key={place} className="studio-sticker-place">
            <button
              type="button"
              className="btn btn-small studio-sticker-toggle"
              aria-expanded={expanded}
              aria-controls={expanded ? grid : undefined}
              onClick={() => setOpen(expanded ? null : place)}
            >
              <span className="studio-sticker-thumb">{current !== undefined && <img src={stickerPath(current)} alt={current.id} width={32} height={32} />}</span>
              {placeText(place)}
            </button>
            {expanded && (
              <div role="group" id={grid} aria-label={placeText(place)} className="studio-sticker-sheet">
                <button
                  type="button"
                  className="btn btn-small studio-sticker-none"
                  aria-pressed={currentId === null}
                  onClick={() => onPick(place, null)}
                >
                  {t('studioStickerNone')}
                </button>
                {STICKER_SERIES.map((series) => {
                  const need = seriesLevel(series);
                  return (
                    <ul key={series} className="studio-sticker-grid">
                      {STICKERS.filter((s) => s.series === series).map((sticker) => {
                        const locked = !stickerOpen(sticker.id, level) && !kept.includes(sticker.id) && sticker.id !== currentId;
                        return (
                          <li key={sticker.id}>
                            <button
                              type="button"
                              className={locked ? 'studio-sticker-cell is-locked' : 'studio-sticker-cell'}
                              aria-pressed={sticker.id === currentId}
                              disabled={locked}
                              aria-label={locked ? `${sticker.id} ${lockText(need)}` : undefined}
                              onClick={() => onPick(place, sticker.id)}
                            >
                              {locked ? (
                                // Закрита клітинка без gif: сотні закритих наліпок не вантажаться на телефон.
                                <>
                                  <span className="studio-sticker-lock" aria-hidden="true">{`🔒 ${need}`}</span>
                                  <span className="sr-only">{lockText(need)}</span>
                                </>
                              ) : (
                                <img src={stickerPath(sticker)} alt={sticker.id} loading="lazy" decoding="async" width={40} height={40} />
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
