import { DECOR_LIMITS, stickerOf, stickerPath, type StickerPlace, type TrophyDecor, type TrophyKind } from '@quiz/shared';
import { useEffect, useId, useRef, useState, type JSX } from 'react';
import { t, type TextKey } from '../../i18n';
import { layoutDecor, stickerPlaceChoices, type Occupant, type PlacedSticker } from '../../trophy/decor-places';
import { StickerDialog, type StickerEditing } from './StickerDialog';

export interface StickerPickerProps {
  kind: TrophyKind;
  decor: TrophyDecor;
  level: number;
  /** from — власне місце змінюваної наліпки, якщо вона переїжджає на place. */
  onPick: (place: StickerPlace, id: string | null, from?: StickerPlace) => void;
  /** Наліпки зі збереженого оформлення цього призу: лишаються чинними й закриті (як на сервері). */
  kept?: readonly string[];
}

export const placeText = (place: StickerPlace | 'base-back'): string => t(`studioPlace_${place.replace('-', '_')}` as TextKey);

/** Хто займає місце — словами для «Зайнято: …» і приміток про переїзд. */
export function occupantText(occupant: Occupant): string {
  switch (occupant.type) {
    case 'photos':
      return t(`studioPhotoPlace_${occupant.place}` as TextKey);
    case 'inscription':
      return t(`studioText_${occupant.place}` as TextKey);
    case 'sticker':
      return t('studioTaken_sticker');
  }
}

/** Примітка рядка: переїхала — куди й чому, не вміщується — чому; на своєму місці — нічого. */
function moveNote(sticker: PlacedSticker): string | null {
  if (sticker.at === sticker.place) return null;
  const what = sticker.blockedBy === null ? '' : occupantText(sticker.blockedBy);
  const from = placeText(sticker.place);
  return sticker.at === null ? t('studioNoPlace', { from, what }) : t('studioMovedTo', { from, what, to: placeText(sticker.at) });
}

/**
 * Наліпки трофея: список доданих (де фактично лежить, примітка переїзду, «Змінити», «Прибрати») і «+ Додати наліпку»,
 * що відкриває вікно з сіткою наліпок і вибором вільного місця.
 */
export function StickerPicker({ kind, decor, level, onPick, kept = [] }: StickerPickerProps): JSX.Element {
  const [dialog, setDialog] = useState<{ editing: StickerEditing | null } | null>(null);
  const add = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const why = useId();
  const placed = layoutDecor(kind, decor).stickers;
  const full = decor.stickers.length >= DECOR_LIMITS.stickers;
  const noRoom = !full && stickerPlaceChoices(kind, decor, null).every((c) => c.takenBy !== null);
  const reason = full ? t('studioStickerMax', { n: DECOR_LIMITS.stickers }) : noRoom ? t('studioStickerNoRoom') : null;

  // Після закриття вікна фокус — на кнопку, що його відкрила; її рядок міг зникнути — тоді на «+ Додати наліпку».
  const wasOpen = useRef(false);
  useEffect(() => {
    if (dialog !== null) {
      wasOpen.current = true;
      return;
    }
    if (!wasOpen.current) return;
    wasOpen.current = false;
    const target = opener.current?.isConnected && !opener.current.hasAttribute('disabled') ? opener.current : add.current;
    target?.focus();
  }, [dialog]);

  const open = (element: HTMLElement, editing: StickerEditing | null) => {
    opener.current = element;
    setDialog({ editing });
  };

  return (
    <div className="studio-stickers">
      {placed.length > 0 && (
        <ul className="studio-sticker-list">
          {placed.map((sticker) => {
            const known = stickerOf(sticker.id);
            const note = moveNote(sticker);
            return (
              <li key={sticker.place} className="studio-sticker-row">
                <span className="studio-sticker-thumb">
                  {known !== undefined && <img src={stickerPath(known)} alt={known.id} width={32} height={32} />}
                </span>
                <span className="studio-sticker-where">
                  <span>{placeText(sticker.at ?? sticker.place)}</span>
                  {note !== null && <span className="meta">{note}</span>}
                </span>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={(event) => open(event.currentTarget, { place: sticker.place, id: sticker.id, at: sticker.at })}
                >
                  {t('studioStickerChange')}
                </button>
                <button type="button" className="btn btn-small" onClick={() => onPick(sticker.place, null)}>
                  {t('studioStickerRemove')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button
        ref={add}
        type="button"
        className="btn btn-small studio-sticker-add"
        disabled={reason !== null}
        aria-describedby={reason === null ? undefined : why}
        onClick={(event) => open(event.currentTarget, null)}
      >
        {t('studioStickerAdd')}
      </button>
      {reason !== null && (
        <p id={why} className="meta studio-sticker-why">
          {reason}
        </p>
      )}
      {dialog !== null && (
        <StickerDialog
          kind={kind}
          decor={decor}
          level={level}
          kept={kept}
          editing={dialog.editing}
          onClose={() => setDialog(null)}
          onDone={(place, id) => {
            const from = dialog.editing?.place;
            onPick(place, id, from !== undefined && from !== place ? from : undefined);
            setDialog(null);
          }}
        />
      )}
    </div>
  );
}
