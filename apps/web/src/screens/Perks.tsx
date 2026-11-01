import { useEffect, useRef, useState } from 'react';
import type { ActivePerk, PerksView } from '@quiz/shared';
import { t, type TextKey } from '../i18n';

/** Скільки стоїть «Оберіг погасив дебаф», мс. */
export const WARD_SPENT_MS = 4000;

/**
 * Ряд бонусів рівня (15a) під рядом бафів 12h: кнопки, підказка, оберіг.
 * Висота сталa: підказка з'являється в зарезервованому місці, а не зсуває поля відповіді.
 */
export function Perks({ perks, ward, onUse }: { perks: PerksView | null; ward: 'ready' | 'spent' | undefined; onUse: (kind: ActivePerk) => void }) {
  const prev = useRef(ward);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    const before = prev.current;
    prev.current = ward;
    if (before === 'ready' && ward === 'spent') {
      setFlash(true);
      const timer = setTimeout(() => setFlash(false), WARD_SPENT_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ward]);

  if (perks === null && ward === undefined) return null;
  const hasHint = perks?.items.some((item) => item.kind === 'hint') ?? false;
  return (
    <div className="perk-bar">
      <div className="perk-row">
        {perks?.items.map(({ kind, block }) => (
          <button
            key={kind}
            type="button"
            className="btn btn-small perk-btn"
            disabled={block !== null}
            title={block !== null ? t(`perkBlock_${block}` as TextKey) : undefined}
            onClick={() => onUse(kind)}
          >
            {kind === 'time' ? t('perkTime', { s: perks.timeMs / 1000 }) : t('perkHint')}
          </button>
        ))}
        {ward === 'ready' && <span className="perk-chip">{t('perkWard')}</span>}
        {flash && ward === 'spent' && (
          <span className="perk-chip is-spent" role="status">
            {t('perkWardSpent')}
          </span>
        )}
      </div>
      {hasHint && (
        <p className="perk-hint" aria-live="polite">
          {perks?.hint != null ? `💡 ${perks.hint}` : ''}
        </p>
      )}
    </div>
  );
}
