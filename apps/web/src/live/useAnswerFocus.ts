import { useEffect, useRef, type RefObject } from 'react';
import { reducedMotion } from '../motion';

function isField(node: Element | null): boolean {
  if (node === null) return false;
  const tag = node.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || node.getAttribute('contenteditable') === 'true';
}

/**
 * Курсор у полі відповіді (45b): один раз за монтування, щойно поле доступне (не disabled саме й не під
 * fieldset[disabled] — заставка, пауза). Не краде фокус в іншого поля, де гравець уже друкує. Без залежностей:
 * бере кожен рендер, тож «спробує далі», доки поле недоступне.
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
    el.focus({ preventScroll: true });
    el.scrollIntoView?.({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
    done.current = true;
  });
}
