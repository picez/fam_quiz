import { useEffect } from 'react';

/**
 * Перепитує, перш ніж піти з незбереженою роботою за посиланням усередині сайту (76): меню, «‹ Назад», будь-який <a>.
 * BrowserRouter — не data router, тож useBlocker недоступний: ловимо клік у фазі захоплення на document і
 * скасовуємо його (preventDefault) — Link з react-router бачить defaultPrevented і нікуди не йде.
 * Не чіпаємо: нову вкладку (Ctrl/⌘/Shift/Alt, середня кнопка, target), завантаження, інші сайти, ту саму адресу.
 * Поточна адреса — з window.location (BrowserRouter тримає її в лад; редактор у тестах живе й без роутера).
 * Кнопка браузера «назад» не перепитує: чернетка редактора лежить у sessionStorage вкладки й повернеться.
 */
export function useLeaveGuard(active: boolean, message: string): void {
  useEffect(() => {
    if (!active) return;
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement)) return;
      if ((link.target !== '' && link.target !== '_self') || link.hasAttribute('download')) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname + url.search === window.location.pathname + window.location.search) return;
      if (!window.confirm(message)) event.preventDefault();
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [active, message]);
}
