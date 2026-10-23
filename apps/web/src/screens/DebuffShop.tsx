import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { DebuffKind, PlayerShop } from '@quiz/shared';
import { DEBUFF_ICONS, debuffName } from '../debuff-meta';
import { num } from '../format';
import { t, type TextKey } from '../i18n';
import type { Send } from '../live/types';
import { useGuardedSend } from '../live/useGuardedSend';

/**
 * Кнопка «😈» у шапці телефона (ім'я «Дебафи») і аркуш покупки: крок 1 — дебаф (іконка, назва, опис з debuffGuide_*, ціна;
 * дорожчий за рахунок вимкнений з «Не вистачає балів»), крок 2 — суперник (busy вимкнений з «Уже має дебаф»), «Купити за {price}».
 * block ≠ null — список видно, кнопки вимкнені, над ними причина. Аркуш — як «Таблиця»: портал, role="dialog", Escape і дотик повз картку закривають, фокус повертається на кнопку.
 */
export function DebuffShop({ shop, score, send, onError }: { shop: PlayerShop; score: number; send: Send; onError: (text: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DebuffKind | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const { busy, run } = useGuardedSend(send, onError);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);

  const close = () => {
    setOpen(false);
    setKind(null);
    setTargetId(null);
  };

  // Фокус: при відкритті й зміні кроку — на перший доступний пункт аркуша; після закриття — назад на кнопку.
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const first = focusable(cardRef.current)[0];
      first?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open, kind]);
  // Escape закриває, поки аркуш відкрито, — навіть коли фокус уже вийшов з нього.
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  // Tab і Shift+Tab ходять колом по доступних кнопках аркуша.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = focusable(cardRef.current);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (event.shiftKey && (here === first || !cardRef.current?.contains(here))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (here === last || !cardRef.current?.contains(here))) {
      event.preventDefault();
      first.focus();
    }
  };
  // Дотик повз картку закриває; усередині картки — ні.
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) close();
  };

  const item = kind === null ? undefined : shop.items.find((i) => i.kind === kind);
  const target = shop.targets.find((p) => p.playerId === targetId);
  const canBuy = item !== undefined && target !== undefined && !target.busy && shop.block === null && item.price <= score && !busy;
  const buy = () => {
    if (!canBuy) return;
    void run('player:debuff', { targetId: target.playerId, kind: item.kind }).then((ok) => {
      if (ok) close();
    });
  };

  return (
    <>
      <button ref={triggerRef} type="button" className="table-button shop-button" aria-label={t('shopOpen')} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        😈
      </button>
      {open &&
        createPortal(
          <div className="table-sheet" role="dialog" aria-modal="true" aria-label={t('shopTitle')} tabIndex={-1} onClick={onBackdrop} onKeyDown={onKeyDown}>
            <div ref={cardRef} className="table-card shop-card">
              <h2>{t('shopTitle')}</h2>
              {shop.block !== null && <p className="shop-block">{t(`shopBlock_${shop.block}` as TextKey)}</p>}
              {item === undefined ? (
                <div className="shop-items">
                  {shop.items.map(({ kind: k, price }) => {
                    const short = price > score;
                    return (
                      <button key={k} type="button" className="shop-item" disabled={shop.block !== null || short} onClick={() => setKind(k)}>
                        <span className="shop-item-name">
                          <span aria-hidden="true">{DEBUFF_ICONS[k]}</span> {debuffName(k)}
                        </span>
                        <span className="shop-item-desc">{t(`debuffGuide_${k}` as TextKey)}</span>
                        <span className="shop-item-price">{num(price)}</span>
                        {short && <span className="shop-item-note">{t('shopShort')}</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <>
                  <p className="shop-chosen">
                    <span aria-hidden="true">{DEBUFF_ICONS[item.kind]}</span> {debuffName(item.kind)} · {num(item.price)}
                  </p>
                  <h3>{t('shopPick')}</h3>
                  <div className="shop-targets">
                    {shop.targets.map((p) => (
                      <button
                        key={p.playerId}
                        type="button"
                        className="shop-target"
                        aria-pressed={p.playerId === targetId}
                        disabled={p.busy || shop.block !== null}
                        onClick={() => setTargetId(p.playerId)}
                      >
                        <span className="shop-target-name">{p.nickname}</span>
                        {p.busy && <span className="shop-item-note">{t('shopBusy')}</span>}
                      </button>
                    ))}
                  </div>
                  <p className="meta">{t('shopNote')}</p>
                  <button type="button" className="btn btn-primary shop-buy" disabled={!canBuy} onClick={buy}>
                    {t('shopBuy', { price: num(item.price) })}
                  </button>
                  <button
                    type="button"
                    className="btn btn-small btn-quiet"
                    onClick={() => {
                      setKind(null);
                      setTargetId(null);
                    }}
                  >
                    {t('shopBack')}
                  </button>
                </>
              )}
              <button type="button" className="btn btn-small" onClick={close}>
                {t('buffHelpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Доступні для фокуса кнопки аркуша, у порядку документа. */
function focusable(root: HTMLElement | null): HTMLElement[] {
  return [...(root?.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])') ?? [])];
}
