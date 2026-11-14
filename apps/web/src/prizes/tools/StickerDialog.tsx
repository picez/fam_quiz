import {
  stickerOpen,
  stickerPath,
  type StickerExtra,
  type StickerPlace,
  type TrophyDecor,
  type TrophyKind,
} from '@quiz/shared';
import { useEffect, useId, useLayoutEffect, useRef, useState, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../../i18n';
import { stickerPlaceChoices } from '../../trophy/decor-places';
import { LockedPackLine, packName, packViews } from '../../screens/StickerPacks';
import { occupantText, placeText } from './StickerPicker';

/** Змінювана наліпка: її місце в даних, id і де вона фактично лежить (null — не вміщується). */
export interface StickerEditing {
  place: StickerPlace;
  id: string;
  at: StickerPlace | null;
}

export interface StickerDialogProps {
  kind: TrophyKind;
  decor: TrophyDecor;
  level: number;
  kept: readonly string[];
  /** Набори за досягнення й рівень успадкування власника (34). */
  access?: StickerExtra;
  /** null — нова наліпка. */
  editing: StickerEditing | null;
  onDone: (place: StickerPlace, id: string) => void;
  onClose: () => void;
}

/**
 * Вікно наліпки: сітка за наборами (34; закрита частина набору — одним рядком «відкриється з рівня N») і вибір місця, де зайняті вимкнені
 * з поясненням. Змінювана наліпка не займає ні свого місця, ні того, куди переїхала.
 */
export function StickerDialog({ kind, decor, level, kept, access = {}, editing, onDone, onClose }: StickerDialogProps): JSX.Element {
  const choices = stickerPlaceChoices(kind, decor, editing?.place ?? null);
  const free = (p: StickerPlace | null) => p !== null && choices.some((c) => c.place === p && c.takenBy === null);
  const [id, setId] = useState<string | null>(editing?.id ?? null);
  const [place, setPlace] = useState<StickerPlace | null>(() => {
    if (editing !== null && free(editing.at)) return editing.at;
    return choices.find((c) => c.takenBy === null)?.place ?? null;
  });
  // Місце не чіпали — змінювана наліпка лишається на своєму місці в даних (не на запасному, куди переїхала),
  // тож повернеться туди, щойно воно звільниться.
  const [placeTouched, setPlaceTouched] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const uid = useId();
  const title = `${uid}-title`;
  const pick = `${uid}-pick`;
  const ready = id !== null && free(place);
  const hint = `${uid}-hint`;
  const anyFree = choices.some((c) => c.takenBy === null);
  // Чому «Готово» вимкнене: спершу наліпка, потім вільне місце (а його може й не бути).
  const why = ready ? null : id === null ? t('studioStickerNeedPick') : anyFree ? t('studioStickerNeedPlace') : t('studioStickerNoRoom');

  useLayoutEffect(() => {
    dialog.current?.focus();
  }, []);

  // Escape і Tab слухаємо на документі, як у CropDialog: дотик по заголовку не вимикає ні те, ні те.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const keys = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
        return;
      }
      if (event.key !== 'Tab' || dialog.current === null) return;
      // З групи радіо в обхід Tab лише обране (чи перше ввімкнене, якщо нічого не обрано), як у браузері.
      const radios = Array.from(dialog.current.querySelectorAll<HTMLInputElement>('input[type="radio"]:not(:disabled)'));
      const radio = radios.find((r) => r.checked) ?? radios[0];
      const focusable = Array.from(dialog.current.querySelectorAll<HTMLElement>('button, input')).filter(
        (el) =>
          !el.hasAttribute('disabled') &&
          (!(el instanceof HTMLInputElement) || el.type !== 'radio' || el === radio || el === document.activeElement),
      );
      if (focusable.length === 0) return;
      const index = focusable.indexOf(document.activeElement as HTMLElement);
      const next = event.shiftKey ? (index <= 0 ? focusable.length - 1 : index - 1) : index === focusable.length - 1 ? 0 : index + 1;
      event.preventDefault();
      focusable[next]!.focus();
    };
    document.addEventListener('keydown', keys);
    return () => document.removeEventListener('keydown', keys);
  }, []);

  return createPortal(
    <div className="crop-backdrop">
      <div ref={dialog} className="sticker-dialog" role="dialog" aria-modal="true" aria-labelledby={title} tabIndex={-1}>
        <h2 id={title} className="crop-title">
          {t(editing === null ? 'studioStickerTitleAdd' : 'studioStickerTitleEdit')}
        </h2>
        <section role="group" aria-labelledby={pick} className="sticker-dialog-section">
          <h3 id={pick} className="studio-group-title">
            {t('studioStickerPick')}
          </h3>
          {/* Сітка прокручується сама: місце й «Готово» завжди видно знизу вікна. */}
          <div className="sticker-dialog-grids">
            {packViews((sticker) => stickerOpen(sticker.id, level, access) || kept.includes(sticker.id) || sticker.id === editing?.id).map((view) => {
              const headId = `${uid}-pack-${view.pack}`;
              return (
                <section key={view.pack} role="group" aria-labelledby={headId} className="sticker-pack">
                  {view.open.length > 0 && <h4 id={headId}>{packName(view.pack)}</h4>}
                  {view.open.length > 0 && (
                    <ul className="studio-sticker-grid">
                      {view.open.map((sticker) => (
                        <li key={sticker.id}>
                          <button type="button" className="studio-sticker-cell" aria-pressed={sticker.id === id} onClick={() => setId(sticker.id)}>
                            <img src={stickerPath(sticker)} alt={sticker.id} loading="lazy" decoding="async" width={40} height={40} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Закрита частина набору (34) — один рядок замість сітки замків: сотні закритих наліпок не вантажаться на телефон. */}
                  {view.locked.length > 0 && <LockedPackLine view={view} id={view.open.length === 0 ? headId : undefined} />}
                </section>
              );
            })}
          </div>
        </section>
        <div className="sticker-dialog-footer">
          <fieldset className="studio-choice sticker-dialog-places">
            <legend>{t('studioStickerWhere')}</legend>
            <div className="sticker-dialog-place-list">
              {choices.map(({ place: p, takenBy }) => {
                const note = `${uid}-${p}`;
                return (
                  <label key={p} className={takenBy === null ? undefined : 'is-taken'}>
                    <input
                      type="radio"
                      name={`${uid}-place`}
                      checked={place === p}
                      disabled={takenBy !== null}
                      aria-describedby={takenBy === null ? undefined : note}
                      onChange={() => {
                        setPlace(p);
                        setPlaceTouched(true);
                      }}
                    />
                    <span className="sticker-dialog-place">{placeText(p)}</span>
                    {takenBy !== null && (
                      <span id={note} className="sticker-dialog-taken">
                        {t('studioTakenBy', { what: occupantText(takenBy) })}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
          {why !== null && (
            <p id={hint} className="sticker-dialog-hint">
              {why}
            </p>
          )}
          <div className="toolbar crop-actions">
            <button type="button" className="btn btn-small" onClick={onClose}>
              {t('studioStickerCancel')}
            </button>
            <button
              type="button"
              className="btn btn-small btn-primary"
              disabled={!ready}
              aria-describedby={why === null ? undefined : hint}
              onClick={() => {
                if (id === null || place === null) return;
                onDone(editing !== null && !placeTouched ? editing.place : place, id);
              }}
            >
              {t('studioStickerDone')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
