import { useEffect, useRef, useState, type JSX, type ReactNode } from 'react';
import { t } from '../../i18n';

export interface PickItem {
  id: string;
  name: string;
  meta?: ReactNode;
}

/** 69: список з прапорцями — «Вибрати всі» і одна дія над вибраними замість кнопки біля кожного рядка. */
export function PickList({ title, items, action, danger = false, busy, onRun }: { title: string; items: PickItem[]; action: string; danger?: boolean; busy: boolean; onRun: (picked: PickItem[]) => Promise<boolean> }): JSX.Element {
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const allRef = useRef<HTMLInputElement>(null);
  // Видимий вибір — перетин з наявними: після перечитування зниклі випадають самі.
  const chosen = items.filter((item) => picked.has(item.id));
  const all = items.length > 0 && chosen.length === items.length;

  useEffect(() => {
    if (allRef.current !== null) allRef.current.indeterminate = chosen.length > 0 && !all;
  }, [chosen.length, all]);

  const toggle = (id: string) =>
    setPicked((now) => {
      const next = new Set(now);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const run = async () => {
    if (await onRun(chosen)) setPicked(new Set());
  };

  return (
    <fieldset className="admin-pick">
      <legend className="sr-only">{t('adminPickLegend', { title })}</legend>
      <label className="field field-check admin-pick-all">
        <input ref={allRef} type="checkbox" checked={all} onChange={() => setPicked(all ? new Set() : new Set(items.map((item) => item.id)))} />
        {t('adminPickAll')}
      </label>
      <ul className="admin-pick-rows">
        {items.map((item) => (
          <li key={item.id} className="admin-pick-row">
            <label className="field field-check">
              <input type="checkbox" checked={picked.has(item.id)} onChange={() => toggle(item.id)} />
              <span dir="auto">{item.name}</span>
            </label>
            {item.meta !== undefined && item.meta !== null && <span className="meta">{item.meta}</span>}
          </li>
        ))}
      </ul>
      <button type="button" className={danger ? 'btn btn-danger' : 'btn'} disabled={busy || chosen.length === 0} onClick={() => void run()}>
        {action}
      </button>
    </fieldset>
  );
}
