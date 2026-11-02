import { useEffect, useRef, useState } from 'react';
import type { ActivePerk, PerksView } from '@quiz/shared';
import { t, type TextKey } from '../i18n';

/** Скільки стоїть «Оберіг погасив дебаф», мс. */
export const WARD_SPENT_MS = 4000;

/**
 * Ряд бонусів рівня (15a) під рядом бафів 12h: кнопки, підказка, оберіг.
 * Висота сталa: підказка з'являється в зарезервованому місці, а не зсуває поля відповіді.
 * holdSpace (у запитанні): мить «Оберіг погасив дебаф» минає, а чип лишається невидимим і тримає своє місце до кінця
 * запитання — інакше ряд, що переносився на другий рядок, стискається й поля відповіді підскакують.
 */
export function Perks({ perks, ward, onUse, holdSpace = false }: { perks: PerksView | null; ward: 'ready' | 'spent' | undefined; onUse: (kind: ActivePerk) => void; holdSpace?: boolean }) {
  const prev = useRef(ward);
  const [moment, setMoment] = useState<'none' | 'flash' | 'after'>('none');
  useEffect(() => {
    const before = prev.current;
    prev.current = ward;
    if (before === 'ready' && ward === 'spent') {
      setMoment('flash');
      const timer = setTimeout(() => setMoment('after'), WARD_SPENT_MS);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [ward]);
  const flash = moment === 'flash';
  const held = moment === 'after' && holdSpace;

  // Без кнопок лишається тільки чип оберегу: готовий, мить «погасив» або місце, яке тримає запитання. Інакше — нічого, без порожньої смуги.
  if (perks === null && ward !== 'ready' && !(ward === 'spent' && (flash || held))) return null;
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
        {held && ward === 'spent' && (
          <span className="perk-chip is-spent is-gone" aria-hidden="true">
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
