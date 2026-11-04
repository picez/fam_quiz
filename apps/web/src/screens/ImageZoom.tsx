import { useEffect, useRef, type JSX } from 'react';
import { createPortal } from 'react-dom';
import { t } from '../i18n';

/**
 * Картинка на весь екран (портал у body, модальний): чорне тло, картинка вписана в екран, × угорі.
 * Закривається ×, Escape, дотиком будь-де; фокус — на ×, Tab лишається на ньому, після закриття
 * повертається туди, де був. Поки відкрито, сторінка не гортається, а #root — inert. Звичайне зведення
 * пальців у браузері збільшує її ще (viewport не забороняє масштаб).
 */
export function ImageZoom({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }): JSX.Element {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const latest = useRef(onClose);
  latest.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const root = document.getElementById('root');
    const inerted = root !== null && !root.hasAttribute('inert');
    if (inerted) root.setAttribute('inert', '');
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') latest.current();
      if (event.key === 'Tab') {
        event.preventDefault();
        closeRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (inerted) root.removeAttribute('inert');
      if (opener !== null && opener.isConnected) opener.focus();
    };
  }, []);

  return createPortal(
    <div className="image-zoom" role="dialog" aria-modal="true" aria-label={alt || t('imageZoomOpen')} onClick={onClose}>
      <button ref={closeRef} type="button" className="image-zoom-close" aria-label={t('imageZoomClose')} onClick={onClose}>
        ×
      </button>
      <img className="image-zoom-img" src={url} alt={alt} />
    </div>,
    document.body,
  );
}
