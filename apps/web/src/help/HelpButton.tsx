import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { t, type TextKey } from '../i18n';
import { helpAnchor, helpEntry, type HelpId } from './host-help';
import type { HelpEntry } from './types';

const OPEN_EVENT = 'quiz-help-open';

/** Розділи запису: «Що це», «Як іде в грі», «Бали», «Порада», [«Обмеження»]; level — рівень заголовків розділів. */
export function HelpBody({ entry, level = 3 }: { entry: HelpEntry; level?: 3 | 4 }) {
  const Heading = `h${level}` as 'h3' | 'h4';
  const lists: [TextKey, string[]][] = [
    ['helpHow', entry.how],
    ['helpPoints', entry.points],
    ['helpTip', entry.tip],
  ];
  if (entry.limits !== undefined) lists.push(['helpLimits', entry.limits]);
  return (
    <>
      <Heading>{t('helpWhat')}</Heading>
      <p>{entry.what}</p>
      {lists.map(([key, items]) => (
        <section key={key}>
          <Heading>{t(key)}</Heading>
          <ul>
            {items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/**
 * Кнопка «ⓘ» і немодальне вікно довідки (портал у body). Нічого не надсилає й не змінює —
 * працює на паузі, під час гри й у редакторі без позначки «змінено».
 */
export function HelpButton({ id, className }: { id: HelpId; className?: string }) {
  const entry = helpEntry(id);
  const [open, setOpen] = useState(false);
  const token = useId();
  const headingId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (open) headingRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    const onPointerDown = (event: Event) => {
      const target = event.target as Node | null;
      if (target !== null && (popRef.current?.contains(target) || buttonRef.current?.contains(target))) return;
      setOpen(false);
    };
    const onOther = (event: Event) => {
      if ((event as CustomEvent).detail !== token) setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener(OPEN_EVENT, onOther);
    return () => {
      document.removeEventListener('keydown', onEscape);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener(OPEN_EVENT, onOther);
    };
  }, [open, token]);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: token }));
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={className === undefined ? 'help-button' : `help-button ${className}`}
        aria-label={t('helpOpen', { title: entry.title })}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          toggle();
        }}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>
      {open &&
        createPortal(
          <div ref={popRef} className="help-pop" role="dialog" aria-modal="false" aria-labelledby={headingId}>
            <h2 id={headingId} ref={headingRef} tabIndex={-1}>
              {entry.title}
            </h2>
            <HelpBody entry={entry} />
            <div className="help-pop-actions">
              <a href={`/help#${helpAnchor(id)}`} target="_blank" rel="noreferrer">
                {t('helpAll')}
              </a>
              <button type="button" className="btn btn-small" onClick={close}>
                {t('helpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
