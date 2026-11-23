import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { LIMITS, ROUND_TYPES, type Round } from '@quiz/shared';
import { roundLabel } from '../format';
import { HelpButton } from '../help/HelpButton';
import { ROUND_ICONS, ROUND_NAMES } from '../guide-text';
import { countText, t } from '../i18n';
import { Combobox, type ComboOption } from '../ui/Combobox';
import { useDismiss } from '../ui/use-dismiss';
import { boardReadiness } from './draft';

interface Props {
  rounds: Round[];
  selected: number;
  onSelect: (index: number) => void;
  onAdd: (type: Round['type']) => void;
  onRename: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
  /** Раунди з видимими помилками: у списку в них примітка «є помилка». */
  flagged?: ReadonlySet<number>;
}

/**
 * Смуга раундів над редактором. З одним раундом це лише кнопка «+ Раунд»;
 * з кількома — комбобокс раунду та меню «⋯» з перейменуванням, переміщенням і видаленням вибраного.
 */
export function RoundStrip({ rounds, selected, onSelect, onAdd, onRename, onMove, onRemove, flagged }: Props) {
  const several = rounds.length > 1;
  const [choosing, setChoosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  /** Закриває меню; якщо фокус був усередині меню (Esc), повертає його на «⋯». */
  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    if (document.activeElement?.closest('[role="menu"]') && menuRef.current?.contains(document.activeElement)) menuButtonRef.current?.focus();
  }, []);
  useDismiss(menuRef, menuOpen, closeMenu);
  // Меню відкрилося: фокус на перший доступний пункт.
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')?.focus();
  }, [menuOpen]);
  // Після видалення раунду «⋯» зникає разом із фокусом: переносимо його на «+ Раунд».
  const hadMenu = useRef(several);
  useEffect(() => {
    if (hadMenu.current && !several && (document.activeElement === document.body || document.activeElement === null)) addButtonRef.current?.focus();
    hadMenu.current = several;
  }, [several]);
  const add = (type: Round['type']) => {
    setChoosing(false);
    onAdd(type);
  };

  const options: ComboOption<string>[] = rounds.map((round, index) => {
    const notReady = round.type === 'board' ? boardReadiness(round).notReady : 0;
    const name = roundLabel(round.title, index, round.type);
    // Без назви ім'я вже називає тип (напр. «Фінал»): не повторювати його в дужках. «Раунд N» тип не називає — лишаємо.
    const typeShown = round.title.trim() !== '' || name === t('roundN', { index: index + 1 });
    return {
      value: round.id,
      label: `${index + 1} · ${name}${typeShown ? ` (${t(ROUND_NAMES[round.type])})` : ''}`,
      icon: ROUND_ICONS[round.type],
      ...(notReady > 0 ? { badge: countText('boardNotReady', notReady, { count: notReady }) } : {}),
      ...(flagged?.has(index) ? { note: t('markError') } : {}),
      // Назва без номера й типу: за нею тести та e2e вибирають раунд.
      dataName: name,
    };
  });

  /** ↑/↓ між пунктами меню. */
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not(:disabled)')];
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % items.length : (at - 1 + items.length) % items.length;
    items[next]?.focus();
  };
  const act = (action: () => void) => () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus();
    action();
  };

  return (
    <div className="round-strip round-bar" role="group" aria-label={t('roundsLabel')}>
      {several && (
        <Combobox
          className="round-pick"
          label={t('roundPick')}
          value={rounds[selected]?.id ?? ''}
          options={options}
          onChange={(id) => {
            const index = rounds.findIndex((round) => round.id === id);
            if (index >= 0) onSelect(index);
          }}
        />
      )}
      <div className="toolbar">
        <button type="button" ref={addButtonRef} className="btn btn-small" disabled={rounds.length >= LIMITS.maxRounds} onClick={() => setChoosing(!choosing)}>
          {t('addRound')}
        </button>
        {choosing && rounds.length < LIMITS.maxRounds && (
          <>
            {ROUND_TYPES.map((type) => (
              <span className="with-help" key={type}>
                <button type="button" className="btn btn-small" onClick={() => add(type)}>
                  {t(ROUND_NAMES[type])}
                </button>
                <HelpButton id={`round.${type}`} />
              </span>
            ))}
          </>
        )}
        {several && (
          <div className="round-menu-root" ref={menuRef}>
            <button
              type="button"
              ref={menuButtonRef}
              className="btn btn-small round-menu-button"
              aria-label={t('roundMenu')}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuOpen ? menuId : undefined}
              onClick={() => setMenuOpen(!menuOpen)}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowDown') return;
                event.preventDefault();
                setMenuOpen(true);
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="round-menu" id={menuId} role="menu" aria-label={t('roundMenu')} onKeyDown={onMenuKey}>
                <button type="button" role="menuitem" className="btn btn-small" onClick={act(() => onRename(selected))}>
                  {t('renameRound')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn btn-small"
                  aria-label={t('moveRoundUp', { index: selected + 1 })}
                  disabled={selected === 0}
                  onClick={act(() => onMove(selected, selected - 1))}
                >
                  {t('moveUpShort')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn btn-small"
                  aria-label={t('moveRoundDown', { index: selected + 1 })}
                  disabled={selected === rounds.length - 1}
                  onClick={act(() => onMove(selected, selected + 1))}
                >
                  {t('moveDownShort')}
                </button>
                <button type="button" role="menuitem" className="btn btn-small btn-danger" onClick={act(() => onRemove(selected))}>
                  {t('removeRound')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
