import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { t } from '../i18n';
import { useDismiss } from './use-dismiss';

export interface ComboOption<V extends string> {
  value: V;
  /** Доступне ім'я рядка й кнопки. */
  label: string;
  /** Другий рядок; aria-describedby. */
  description?: string;
  /** aria-hidden. */
  icon?: string;
  /** Теж шукаються (напр. typeShort_*). */
  keywords?: readonly string[];
  /** id групи з groups. */
  group?: string;
  /** Видимий значок праворуч (⚠, «2 не готові»). */
  badge?: string;
  /** Дописується до aria-label через «, » (напр. «є помилка»). */
  note?: string;
  /** Короткий ключ для тестів і e2e: data-name на рядку. */
  dataName?: string;
}

export interface ComboboxProps<V extends string> {
  /** «Тип запитання», «Раунд». */
  label: string;
  value: V;
  options: readonly ComboOption<V>[];
  groups?: readonly { id: string; label: string }[];
  onChange: (value: V) => void;
  className?: string;
}

/** Без регістру й з єдиним видом апострофа. */
const normalize = (text: string) => text.normalize('NFC').toLowerCase().replace(/[’ʼ]/g, "'");

const nameOf = (option: ComboOption<string>) => (option.note ? `${option.label}, ${option.note}` : option.label);

/**
 * Пошукова випадна вибірка зі згрупованим списком (без бібліотеки). Спливна частина лежить у тому
 * самому корені, що й кнопка: на телефоні — нижній аркуш, від 600 px — список під кнопкою (CSS).
 */
export function Combobox<V extends string>({ label, value, options, groups, onChange, className }: ComboboxProps<V>) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  const selected = options.find((option) => option.value === value);

  // Усі опції у порядку груп (опції без групи — після груп); active індексує саме цей порядок.
  const ordered = useMemo(() => {
    const order = (groups ?? []).map((group) => group.id);
    const rank = (option: ComboOption<V>) => {
      const index = option.group ? order.indexOf(option.group) : -1;
      return index < 0 ? order.length : index;
    };
    return options
      .map((option, index) => ({ option, index }))
      .sort((a, b) => rank(a.option) - rank(b.option) || a.index - b.index)
      .map((entry) => entry.option);
  }, [options, groups]);

  const visible = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return ordered;
    return ordered.filter((option) =>
      [option.label, option.description ?? '', ...(option.keywords ?? [])].some((text) => normalize(text).includes(needle)),
    );
  }, [ordered, query]);

  const closeAndFocus = useCallback(() => {
    setOpen(false);
    triggerRef.current?.focus();
  }, []);
  const closeOnly = useCallback(() => setOpen(false), []);
  useDismiss(rootRef, open, closeOnly);

  const optionId = (index: number) => `${uid}-o${index}`;
  const coarse = typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

  const openList = () => {
    const at = ordered.findIndex((option) => option.value === value);
    setQuery('');
    setActive(Math.max(0, at));
    setOpen(true);
  };

  // Фокус у пошук (на дотику — у сам список, щоб не виринала клавіатура).
  useEffect(() => {
    if (!open) return;
    (coarse ? listRef.current : searchRef.current)?.focus();
  }, [open, coarse]);

  // Від 600 px список під кнопкою може вилізти за кінцевий край екрана (кнопка біля краю, ширина від 20rem):
  // тоді він зсувається назад, але не далі за початковий край. Нижній аркуш телефона не чіпаємо.
  useLayoutEffect(() => {
    const popup = popupRef.current;
    if (!open || popup === null) return;
    const place = () => {
      popup.style.insetInlineStart = '';
      if (!window.matchMedia?.('(min-width: 600px)').matches) return;
      const edge = 8;
      const width = document.documentElement.clientWidth;
      const rect = popup.getBoundingClientRect();
      const rtl = getComputedStyle(popup).direction === 'rtl';
      const over = rtl ? edge - rect.left : rect.right - (width - edge);
      const room = rtl ? width - edge - rect.right : rect.left - edge;
      const shift = Math.max(0, Math.min(over, room));
      if (shift > 0) popup.style.insetInlineStart = `${-shift}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  // Активний рядок видно в списку.
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, active, visible]);

  const pick = (option: ComboOption<V>) => {
    if (option.value !== value) onChange(option.value);
    closeAndFocus();
  };

  const onPopupKey = (event: KeyboardEvent) => {
    const last = visible.length - 1;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((i) => Math.max(0, Math.min(last, i + 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(0, last));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = visible[active];
      if (option) pick(option);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      // Лише це вікно: охоплювальний діалог не має закритися разом із ним.
      event.stopPropagation();
      closeAndFocus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    } else if (event.currentTarget === listRef.current && event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // На дотику фокус у списку (без екранної клавіатури), але набір літери — це пошук: літера йде в поле пошуку.
      event.preventDefault();
      setQuery((text) => text + event.key);
      setActive(0);
      searchRef.current?.focus();
    }
  };

  const onTriggerKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openList();
    }
  };

  const renderOption = (option: ComboOption<V>) => {
    const index = visible.indexOf(option);
    const isActive = index === active;
    const descId = option.description ? `${optionId(index)}-d` : undefined;
    return (
      <div
        key={option.value}
        id={optionId(index)}
        role="option"
        data-value={option.value}
        data-name={option.dataName}
        aria-selected={option.value === value}
        aria-label={nameOf(option)}
        aria-describedby={descId}
        className={`combo-option${isActive ? ' is-active' : ''}${option.value === value ? ' is-selected' : ''}`}
        onPointerMove={() => !isActive && setActive(index)}
        onClick={() => pick(option)}
      >
        {option.icon && (
          <span className="combo-icon" aria-hidden="true">
            {option.icon}
          </span>
        )}
        <span className="combo-text">
          <span className="combo-name" aria-hidden="true">
            {option.label}
          </span>
          {option.description && (
            <span className="combo-desc" id={descId}>
              {option.description}
            </span>
          )}
        </span>
        {option.badge && <span className="combo-badge">{option.badge}</span>}
      </div>
    );
  };

  const ungrouped = visible.filter((option) => !option.group || !(groups ?? []).some((group) => group.id === option.group));

  return (
    <div className={`combo${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        ref={triggerRef}
        className="combo-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${label}: ${selected ? nameOf(selected) : value}`}
        onClick={() => (open ? closeOnly() : openList())}
        onKeyDown={onTriggerKey}
      >
        {selected?.icon && (
          <span className="combo-icon" aria-hidden="true">
            {selected.icon}
          </span>
        )}
        <span className="combo-name">{selected ? selected.label : value}</span>
        {selected?.badge && <span className="combo-badge">{selected.badge}</span>}
        <span className="combo-caret" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="combo-popup" ref={popupRef}>
          <input
            ref={searchRef}
            className="combo-search"
            type="text"
            role="combobox"
            aria-label={t('comboSearch')}
            aria-controls={`${uid}-list`}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={visible.length ? optionId(Math.min(active, visible.length - 1)) : undefined}
            placeholder={t('comboSearch')}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onPopupKey}
          />
          <div id={`${uid}-list`} ref={listRef} role="listbox" aria-label={label} tabIndex={-1} aria-activedescendant={coarse && visible.length ? optionId(Math.min(active, visible.length - 1)) : undefined} className="combo-list" onKeyDown={onPopupKey}>
            {visible.length === 0 && <p className="combo-empty">{t('comboEmpty')}</p>}
            {(groups ?? []).map((group) => {
              const items = visible.filter((option) => option.group === group.id);
              if (!items.length) return null;
              return (
                <div key={group.id} role="group" aria-labelledby={`${uid}-g-${group.id}`} className="combo-group">
                  <div className="combo-group-title" id={`${uid}-g-${group.id}`}>
                    {group.label}
                  </div>
                  {items.map(renderOption)}
                </div>
              );
            })}
            {ungrouped.map(renderOption)}
          </div>
        </div>
      )}
    </div>
  );
}
