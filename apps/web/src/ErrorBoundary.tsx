import { Component, type ReactNode } from 'react';
import { t } from './i18n';

interface State {
  error: Error | null;
}

/** Ловить помилку будь-якої сторінки, щоб людина бачила пояснення, а не порожній екран. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    return (
      <main className="app narrow">
        <div className="panel" role="alert">
          <h2>{t('crashTitle')}</h2>
          <p>{t('crashHint')}</p>
          <p className="meta">{error.message}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          {t('reloadPage')}
        </button>
        <a className="quiet-link" href="/">
          {t('backHome')}
        </a>
      </main>
    );
  }
}
