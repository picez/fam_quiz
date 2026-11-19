import { useEffect, useRef, type RefObject } from 'react';

function isField(node: Element | null): boolean {
  if (node === null) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.getAttribute('contenteditable') === 'true';
}

/** Відкритий аркуш (діалог), у якому поля немає: фокус лишається там, де він є. */
function sheetOpen(el: Element, active: Element | null): boolean {
  const activeDialog = active?.closest('[role="dialog"]') ?? null;
  if (activeDialog !== null && !activeDialog.contains(el)) return true;
  const modal = document.querySelector('[role="dialog"][aria-modal="true"]');
  return modal !== null && !modal.contains(el);
}

/**
 * Курсор у полі відповіді (45b): один раз за монтування, щойно поле доступне (не disabled саме й не під
 * fieldset[disabled] — заставка, пауза). Не краде фокус в іншого поля, де гравець уже друкує, і з відкритого
 * аркуша (таблиця, збільшене фото): тоді пробує знову на наступному рендері, коли аркуш закриють. Без залежностей:
 * бере кожен рендер, тож «спробує далі», доки поле недоступне. preventScroll і без прокрутки: довге запитання
 * лишається на екрані з початку; клавіатуру відкритого поля Android прокручує сам.
 */
export function useAnswerFocus(ref: RefObject<HTMLInputElement | HTMLTextAreaElement | null>, allowed = true): void {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !allowed) return;
    const el = ref.current;
    if (el === null) return;
    if (el.disabled || el.closest('fieldset[disabled]') !== null) return;
    const active = document.activeElement;
    if (active !== el && isField(active)) {
      done.current = true;
      return;
    }
    if (sheetOpen(el, active)) return;
    el.focus({ preventScroll: true });
    done.current = true;
  });
}
