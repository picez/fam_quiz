import type { JSX, ReactNode } from 'react';
import { num } from '../../format';

/**
 * 69: розділ картки гравця, що згортається (нативні details/summary): заголовок h2 і лічильник у summary.
 * `open` — лише початковий стан: перечитування картки після дії розділ не перемонтовує, і відкрите лишається відкритим.
 */
export function CardFold({ title, count, hint, open = false, className, children }: { title: string; count?: number; hint?: string | null; open?: boolean; className?: string; children: ReactNode }): JSX.Element {
  return (
    <section className={className === undefined ? 'panel admin-card-section' : `panel admin-card-section ${className}`}>
      <details className="admin-fold" open={open}>
        <summary>
          <h2 className="admin-fold-title">{title}</h2>
          {count !== undefined && <span className="admin-fold-count">{num(count)}</span>}
          {hint !== undefined && hint !== null && <span className="meta">{hint}</span>}
        </summary>
        <div className="admin-fold-body">{children}</div>
      </details>
    </section>
  );
}
