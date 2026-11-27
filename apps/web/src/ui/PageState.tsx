import type { JSX, ReactNode } from 'react';
import { t } from '../i18n';

/**
 * Спільні стани сторінки (76). Завантаження: list — скелет списку (стрічка, вікторини, історія, бібліотека),
 * інакше простий рядок; читач екрана чує «Завантажуємо…» в обох випадках.
 */
export function Loading({ list = false }: { list?: boolean }): JSX.Element {
  if (!list) {
    return (
      <p className="meta" role="status">
        {t('loading')}
      </p>
    );
  }
  return (
    <>
      <p className="sr-only" role="status">
        {t('loading')}
      </p>
      <ul className="skeleton-list" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <li className="skeleton-row" key={index}>
            <span className="skeleton-line is-title" />
            <span className="skeleton-line" />
            <span className="skeleton-line is-short" />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Помилка завантаження: текст і «Спробувати ще раз» (без onRetry — лише текст). */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }): JSX.Element {
  return (
    <div className="load-error">
      <p className="error" role="alert">
        {message}
      </p>
      {onRetry !== undefined && (
        <button type="button" className="btn" onClick={onRetry}>
          {t('retryLoad')}
        </button>
      )}
    </div>
  );
}

/** Порожній список: що тут буде — і дія, з якої почати (children). */
export function EmptyState({ text, children }: { text: string; children?: ReactNode }): JSX.Element {
  return (
    <div className="empty-state">
      <p className="lead">{text}</p>
      {children !== undefined && <div className="toolbar">{children}</div>}
    </div>
  );
}
