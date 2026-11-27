import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore, type JSX, type KeyboardEvent } from 'react';
import { t } from '../i18n';
import { lightThemeOn, subscribeTheme } from '../theme-mode';
import { MoonIcon, SunIcon } from '../ThemeToggle';
import { useDismiss } from '../ui/use-dismiss';
import { AppearanceControls } from './AppearanceControls';

/**
 * Кнопка «Вигляд» у меню компʼютера (80): відкриває поповер «Вигляд сайту» з темою й легким режимом.
 * aria-haspopup="dialog" (усередині — перемикачі, не пункти меню); відкриття фокусує вибрану тему,
 * Escape закриває й повертає фокус на кнопку, дотик поза поповером закриває.
 */
export function AppearanceMenu({ className }: { className?: string }): JSX.Element {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const popId = useId();
  const light = useSyncExternalStore(subscribeTheme, lightThemeOn);

  const close = useCallback(() => setOpen(false), []);
  useDismiss(root, open, close);

  useEffect(() => {
    if (open) pop.current?.querySelector<HTMLInputElement>('input[type="radio"]:checked')?.focus();
  }, [open]);

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || !open) return;
    event.preventDefault();
    setOpen(false);
    button.current?.focus();
  };

  return (
    <div className={['appearance-menu', className].filter(Boolean).join(' ')} ref={root} onKeyDown={onKey}>
      <button
        type="button"
        ref={button}
        className="appearance-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        aria-label={t('siteLooksLabel')}
        onClick={() => setOpen((was) => !was)}
      >
        <span className="appearance-icon" aria-hidden="true">
          {light ? <SunIcon /> : <MoonIcon />}
        </span>
        <span>{t('siteLooksButton')}</span>
      </button>
      {open && (
        <div className="appearance-pop" id={popId} role="dialog" aria-label={t('siteLooksTitle')} ref={pop}>
          <p className="appearance-title">{t('siteLooksTitle')}</p>
          <AppearanceControls />
        </div>
      )}
    </div>
  );
}
