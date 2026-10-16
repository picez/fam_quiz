import { LIMITS, type ClassicRound, type RoundRules } from '@quiz/shared';
import { t } from '../i18n';

interface Props {
  round: ClassicRound;
  /** Номер раунду (з одиниці) для підказки в полі назви. */
  index: number;
  onChange: (next: ClassicRound) => void;
}

const range = (from: number, to: number, step = 1) => Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step);
/** Порожнє поле дає NaN: перевірка перед збереженням попросить виправити. */
const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
const toMultiplier = (value: string): RoundRules['multiplier'] => (value === '3' ? 3 : value === '2' ? 2 : 1);

/**
 * Налаштування одного класичного раунду: назва, бали за швидкість, перемішування варіантів
 * і правила підрахунку (штраф, «частково», серії, множник). Згорнуті, доки їх не відкриють.
 */
export function RoundSettings({ round, index, onChange }: Props) {
  const { rules } = round;
  const { streak } = rules;
  const setRules = (patch: Partial<RoundRules>) => onChange({ ...round, rules: { ...rules, ...patch } });

  return (
    <details className="rules round-settings">
      <summary>{t('roundSettings')}</summary>
      <label className="field">
        <span>{t('roundTitleLabel')}</span>
        <input
          value={round.title}
          maxLength={LIMITS.roundTitle}
          placeholder={t('roundTitlePlaceholder', { index })}
          onChange={(event) => onChange({ ...round, title: event.target.value })}
        />
      </label>
      <label className="check">
        <input type="checkbox" checked={round.speedBonus} onChange={(event) => onChange({ ...round, speedBonus: event.target.checked })} />
        <span>{t('speedBonus')}</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={round.shuffleOptions}
          onChange={(event) => onChange({ ...round, shuffleOptions: event.target.checked })}
        />
        <span>{t('shuffleOptions')}</span>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={rules.penalty === 'minus'}
          onChange={(event) => setRules({ penalty: event.target.checked ? 'minus' : 'none' })}
        />
        <span>{t('ruleMinus')}</span>
      </label>

      <label className="check">
        <input
          type="checkbox"
          checked={rules.partial !== null}
          onChange={(event) => setRules({ partial: event.target.checked ? 50 : null })}
        />
        <span>{t('rulePartial')}</span>
      </label>
      {rules.partial !== null && (
        <label className="field">
          <span>{t('rulePartialShare')}</span>
          <select value={rules.partial} onChange={(event) => setRules({ partial: Number(event.target.value) })}>
            {range(10, 90, 10).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      )}

      <label className="check">
        <input
          type="checkbox"
          checked={streak !== null}
          onChange={(event) =>
            setRules({ streak: event.target.checked ? { length: 3, bonus: { kind: 'percent', value: 20 } } : null })
          }
        />
        <span>{t('ruleStreak')}</span>
      </label>
      {streak !== null && (
        <div className="round-streak">
          <label className="field">
            <span>{t('ruleStreakLength')}</span>
            <select value={streak.length} onChange={(event) => setRules({ streak: { ...streak, length: Number(event.target.value) } })}>
              {range(2, 10).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('ruleStreakKind')}</span>
            <select
              value={streak.bonus.kind}
              onChange={(event) =>
                setRules({
                  streak: {
                    ...streak,
                    bonus: event.target.value === 'fixed' ? { kind: 'fixed', value: 200 } : { kind: 'percent', value: 20 },
                  },
                })
              }
            >
              <option value="percent">{t('ruleStreakPercent')}</option>
              <option value="fixed">{t('ruleStreakFixed')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('ruleStreakBonus')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={streak.bonus.kind === 'percent' ? 200 : LIMITS.maxPoints}
              value={Number.isNaN(streak.bonus.value) ? '' : streak.bonus.value}
              onChange={(event) =>
                setRules({ streak: { ...streak, bonus: { kind: streak.bonus.kind, value: toNumber(event.target.value) } } })
              }
            />
          </label>
        </div>
      )}

      <label className="field">
        <span>{t('ruleMultiplier')}</span>
        <select value={rules.multiplier} onChange={(event) => setRules({ multiplier: toMultiplier(event.target.value) })}>
          {[1, 2, 3].map((value) => (
            <option key={value} value={value}>
              {`×${value}`}
            </option>
          ))}
        </select>
      </label>
    </details>
  );
}
