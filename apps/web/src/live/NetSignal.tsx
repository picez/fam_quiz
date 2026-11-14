import { t } from '../i18n';
import type { Quality } from './net-quality';
import type { Status } from './useGame';

/**
 * Плашка «📶 Слабкий зв'язок» (32) на телефоні гравця й на пульті: з'єднання живе, але пінги повільні.
 * На сцені її немає (це телевізор), іншим пристроям вона не транслюється.
 */
export function NetSignal({ status, quality }: { status: Status; quality: Quality }) {
  if (status !== 'live' || quality !== 'weak') return null;
  return (
    <p className="net-weak" role="status" aria-live="polite" title={t('netWeakHint')}>
      <span aria-hidden="true">📶</span>
      <span className="net-weak-text">{t('netWeak')}</span>
      <span className="sr-only">{t('netWeakHint')}</span>
    </p>
  );
}
