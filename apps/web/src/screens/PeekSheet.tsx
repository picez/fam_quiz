import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { BlitzPlayer } from '@quiz/shared';
import { t } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';

/**
 * Нижній аркуш «Чию відповідь підглянути?» (12h) — position: fixed, як VoteSheet: кнопка на кожного з peekable і «Скасувати».
 * Дотик імені шле player:buff { kind: 'peek', targetId } і закриває аркуш; помилка — onError. Порожній peekable — нічого.
 * Портал у body: аркуш поза зоною запитання, тож дебафи його не перевертають і не липнуть.
 */
export function PeekSheet({ peekable, send, onError, onClose }: { peekable: BlitzPlayer[]; send: Send; onError: (text: string | null) => void; onClose: () => void }) {
  const { busy, run } = useGuardedSend(send, onError);
  const firstRef = useRef<HTMLButtonElement | null>(null);
  const empty = peekable.length === 0;
  // Свіжий onClose для слухача Escape без його перевстановлення.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (empty) return;
    firstRef.current?.focus();
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [empty]);
  if (empty) return null;
  const pick = async (targetId: string) => {
    await run('player:buff', { kind: 'peek', targetId });
    onClose();
  };
  return createPortal(
    <section className="peek-sheet" role="dialog" aria-label={t('peekSheetTitle')}>
      <h2>{t('peekSheetTitle')}</h2>
      <div className="peek-options">
        {peekable.map((player, index) => (
          <button
            type="button"
            key={player.playerId}
            ref={index === 0 ? firstRef : undefined}
            className="btn peek-option"
            disabled={busy}
            onClick={() => void pick(player.playerId)}
          >
            {player.nickname}
          </button>
        ))}
      </div>
      <button type="button" className="btn" onClick={onClose}>
        {t('peekCancel')}
      </button>
    </section>,
    document.body,
  );
}
