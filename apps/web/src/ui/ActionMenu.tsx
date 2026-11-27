import { useCallback, useEffect, useId, useRef, useState, type JSX, type KeyboardEvent } from 'react';
import { useDismiss } from './use-dismiss';

export interface ActionItem {
  label: string;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/**
 * Кнопка «⋯» з меню решти дій (77): aria-haspopup="menu", ↑/↓/Home/End між пунктами,
 * Escape і клік поза меню закривають (Escape повертає фокус на «⋯»), вибір пункту закриває меню.
 */
export function ActionMenu({ label, items, disabled = false }: { label: string; items: ActionItem[]; disabled?: boolean }): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();
  /** Який пункт узяти у фокус після відкриття: перший чи останній. */
  const startAt = useRef<'first' | 'last'>('first');

  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);

  const enabled = () => [...(menu.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)') ?? [])];

  useEffect(() => {
    if (!open) return;
    const list = enabled();
    (startAt.current === 'last' ? list[list.length - 1] : list[0])?.focus();
  }, [open]);

  const show = (at: 'first' | 'last') => {
    startAt.current = at;
    setOpen(true);
  };

  const onButtonKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      show(event.key === 'ArrowUp' ? 'last' : 'first');
    }
  };

  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = enabled();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    if (event.key === 'ArrowDown') next = list[(at + 1) % list.length];
    else if (event.key === 'ArrowUp') next = list[(at - 1 + list.length) % list.length];
    else if (event.key === 'Home') next = list[0];
    else if (event.key === 'End') next = list[list.length - 1];
    else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      button.current?.focus();
      return;
    } else if (event.key === 'Tab') {
      setOpen(false);
      return;
    } else return;
    event.preventDefault();
    next?.focus();
  };

  const pick = (item: ActionItem) => () => {
    setOpen(false);
    button.current?.focus();
    item.onSelect();
  };

  return (
    <div className="action-menu-root" ref={root}>
      <button
        type="button"
        ref={button}
        className="btn action-menu-button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show('first'))}
        onKeyDown={onButtonKey}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className="action-menu" id={menuId} role="menu" aria-label={label} ref={menu} onKeyDown={onMenuKey}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              tabIndex={-1}
              className={item.danger === true ? 'btn btn-danger' : 'btn'}
              disabled={item.disabled === true}
              onClick={pick(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
