import type { ReactNode } from 'react';

interface EditorCardProps {
  /** data-card: за ним картку знаходять тести й перехід до проблеми. */
  card: string;
  title: string;
  /** Заголовок з позначкою обов'язковості (зірочка — лише CSS). */
  required?: boolean;
  /** Короткий підсумок після заголовка. */
  summary?: string | null;
  /** Помилка картки: червона рамка й текст під заголовком. */
  error?: string | null;
  /** Сіре нагадування: зберегти можна. */
  note?: string | null;
  /** Згортана картка (details); без нього — звичайна section. */
  fold?: { open: boolean; onToggle: (open: boolean) => void };
  className?: string;
  id?: string;
  children: ReactNode;
}

/** Картка редактора (74): рамка з заголовком, необов'язковими підсумком, помилкою й нагадуванням. */
export function EditorCard({ card, title, required = false, summary, error, note, fold, className, id, children }: EditorCardProps) {
  const classes = ['editor-card', className, error ? 'has-error' : null].filter(Boolean).join(' ');
  const titleClass = required ? 'editor-card-title is-required' : 'editor-card-title';
  const extra = (
    <>
      {error ? <p className="error card-error">{error}</p> : null}
      {note ? <p className="meta card-note">{note}</p> : null}
    </>
  );
  if (fold !== undefined) {
    return (
      <details className={classes} data-card={card} id={id} open={fold.open} onToggle={(event) => fold.onToggle(event.currentTarget.open)}>
        <summary className="editor-card-head">
          <span className={titleClass}>{title}</span>
          {summary ? <span className="editor-card-summary">{summary}</span> : null}
        </summary>
        {extra}
        {children}
      </details>
    );
  }
  return (
    <section className={classes} data-card={card} id={id}>
      <div className="editor-card-head">
        <h3 className={titleClass}>{title}</h3>
        {summary ? <span className="editor-card-summary">{summary}</span> : null}
      </div>
      {extra}
      {children}
    </section>
  );
}
