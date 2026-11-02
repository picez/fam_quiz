import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { QUICK_EMOJI, REACTION_GAP_MS, STICKERS, seriesLevel, stickerOf, stickerOpen, stickerPath, type ReactionItem, type Sticker } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useFavoriteStickers } from '../live/useFavoriteStickers';

/** Стікер у сітці: кнопка-картинка (вибір) і мала ☆ / ★ (улюблений). */
function StickerCell({ sticker, favorite, locked, onPick, onToggle }: { sticker: Sticker; favorite: boolean; locked: boolean; onPick: (item: ReactionItem) => void; onToggle: (id: string) => void }) {
  return (
    <li className="reaction-cell">
      <button
        type="button"
        className="reaction-pick"
        disabled={locked}
        aria-label={locked ? t('stickerLocked', { level: seriesLevel(sticker.series) }) : t('reactionSticker', { name: sticker.id })}
        onClick={locked ? undefined : () => onPick({ kind: 'sticker', value: sticker.id })}
      >
        <img src={stickerPath(sticker)} alt="" loading="lazy" decoding="async" width={48} height={48} />
        {locked && (
          <span className="reaction-lock" aria-hidden="true">
            🔒
          </span>
        )}
      </button>
      <button
        type="button"
        className="reaction-star"
        aria-pressed={favorite}
        aria-label={t(favorite ? 'reactionFavoriteRemove' : 'reactionFavoriteAdd', { name: sticker.id })}
        onClick={() => onToggle(sticker.id)}
      >
        {favorite ? '★' : '☆'}
      </button>
    </li>
  );
}

/** Нижній аркуш у порталі (як PeekSheet): Escape і «Закрити» закривають; вибір шле подію й закриває аркуш. */
export function ReactionSheet({ favorites, level, onToggle, onPick, onClose }: { favorites: string[]; level: number | null; onToggle: (id: string) => void; onPick: (item: ReactionItem) => void; onClose: () => void }) {
  const favoritesId = useId();
  const allId = useId();
  const firstRef = useRef<HTMLButtonElement | null>(null);
  // Свіжий onClose для слухача Escape без його перевстановлення.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    firstRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, []);
  const liked = new Set(favorites);
  const favoriteStickers = favorites.map(stickerOf).filter((sticker): sticker is Sticker => sticker !== undefined);
  return createPortal(
    <section className="reaction-sheet" role="dialog" aria-label={t('reactionSheetTitle')}>
      <div className="reaction-sheet-head">
        <h2>{t('reactionSheetTitle')}</h2>
        <button type="button" className="btn btn-small" onClick={onClose}>
          {t('reactionClose')}
        </button>
      </div>
      <div className="reaction-emoji">
        {QUICK_EMOJI.map((emoji, index) => (
          <button type="button" key={emoji} ref={index === 0 ? firstRef : undefined} className="reaction-emoji-btn" onClick={() => onPick({ kind: 'emoji', value: emoji })}>
            {emoji}
          </button>
        ))}
      </div>
      <div role="group" aria-labelledby={favoritesId}>
        <h3 id={favoritesId}>{t('reactionFavorites')}</h3>
        {favoriteStickers.length === 0 ? (
          <p className="meta">{t('reactionFavoritesEmpty')}</p>
        ) : (
          <ul className="reaction-grid">
            {favoriteStickers.map((sticker) => (
              <StickerCell key={sticker.id} sticker={sticker} favorite locked={!stickerOpen(sticker.id, level)} onPick={onPick} onToggle={onToggle} />
            ))}
          </ul>
        )}
      </div>
      <div role="group" aria-labelledby={allId}>
        <h3 id={allId}>{t('reactionAll')}</h3>
        <ul className="reaction-grid is-all">
          {STICKERS.map((sticker) => (
            <StickerCell key={sticker.id} sticker={sticker} favorite={liked.has(sticker.id)} locked={!stickerOpen(sticker.id, level)} onPick={onPick} onToggle={onToggle} />
          ))}
        </ul>
      </div>
    </section>,
    document.body,
  );
}

/** Значок і підпис з t('reactionButton') («😀 Реакція»): на тісній шапці 375 px підпис ховається, лишається 😀. */
function buttonParts(): [icon: string, label: string] {
  const text = t('reactionButton');
  const space = text.indexOf(' ');
  return space < 0 ? [text, ''] : [text.slice(0, space), text.slice(space)];
}

/**
 * Кнопка в шапці; ховається, коли shown false. Тримає useFavoriteStickers і паузу REACTION_GAP_MS після ok чи too_soon.
 * Помилок (wrong_phase, offline) не показує: реакція для гри не важлива. Аркуш (а з ним і сітка стікерів) змонтований, лише поки відкритий.
 */
export function ReactionButton({ shown, level, event, send }: { shown: boolean; level: number | null; event: 'player:react' | 'host:react'; send: Send }) {
  const { favorites, load, toggle } = useFavoriteStickers();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resting, setResting] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const restTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (restTimer.current !== null) clearTimeout(restTimer.current);
    },
    [],
  );
  // Фаза пішла (запитання): аркуш закривається й сам не відкриється, коли кнопка повернеться.
  useEffect(() => {
    if (!shown) setOpen(false);
  }, [shown]);
  if (!shown) return null;
  const [icon, label] = buttonParts();
  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };
  const pick = async (item: ReactionItem) => {
    close();
    setBusy(true);
    const result = await send(event, item);
    setBusy(false);
    if (result.ok || result.error === 'too_soon') {
      setResting(true);
      if (restTimer.current !== null) clearTimeout(restTimer.current);
      restTimer.current = setTimeout(() => {
        restTimer.current = null;
        setResting(false);
      }, REACTION_GAP_MS);
    }
  };
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className="table-button reaction-button"
        aria-label={t('reactionButton')}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={busy || resting}
        onClick={() => {
          load();
          setOpen(true);
        }}
      >
        <span aria-hidden="true">{icon}</span>
        {label !== '' && (
          <span className="reaction-button-label" aria-hidden="true">
            {label}
          </span>
        )}
      </button>
      {open && <ReactionSheet favorites={favorites} level={level} onToggle={toggle} onPick={(item) => void pick(item)} onClose={close} />}
    </>
  );
}
