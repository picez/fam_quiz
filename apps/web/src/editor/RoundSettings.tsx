import { useState } from 'react';
import { LIMITS, boardCells, cellAnswerMode, roundBrief, rulesOf, type Round, type RoundRules } from '@quiz/shared';
import { t } from '../i18n';
import { RoundBriefing } from '../screens/RoundBriefing';
import { applyRoundTime, withDefaultMode } from './draft';

interface Props {
  round: Round;
  /** Номер раунду (з одиниці) для підказки в полі назви. */
  index: number;
  onChange: (next: Round) => void;
}

const range = (from: number, to: number, step = 1) => Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step);
/** Порожнє поле дає NaN: перевірка перед збереженням попросить виправити. */
const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
const WINDOWS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const ATTEMPTS = [1, 2, 3];
const toWindow = (value: string): number | null => (value === 'off' ? null : Number(value));
const toAttempts = (value: string): 1 | 2 | 3 | null => (value === '3' ? 3 : value === '2' ? 2 : value === '1' ? 1 : null);
const toMultiplier = (value: string): RoundRules['multiplier'] => (value === '3' ? 3 : value === '2' ? 2 : 1);

/**
 * Налаштування одного раунду: назва, опис для гравців, перемішування варіантів і правила підрахунку (штраф, серії, множник);
 * класичному додатково бали за швидкість і «частково», бліцу — вікно відповіді, спроби й спосіб перевірки, полю — спосіб відповіді й перевірки та «частково». В кінці — попередній перегляд заставки з поясненням правил. Згорнуті, доки їх не відкриють.
 */
export function RoundSettings({ round, index, onChange }: Props) {
  const [seconds, setSeconds] = useState<number>(LIMITS.defaultTime);
  const secondsValid = Number.isInteger(seconds) && seconds >= LIMITS.minTime && seconds <= LIMITS.maxTime;
  const rules = rulesOf(round);
  const { streak } = rules;
  // У бліці часткових балів немає, тому «частково» змінює лише класичний раунд і поле.
  const setRules = (patch: Partial<Omit<RoundRules, 'partial'>>) => {
    // У фіналі правил немає: їхніх елементів керування там не показано.
    if (round.type === 'final') return;
    onChange(round.type === 'blitz' ? { ...round, rules: { ...round.rules, ...patch } } : { ...round, rules: { ...round.rules, ...patch } });
  };
  const setPartial = (partial: number | null) => {
    if (round.type === 'classic' || round.type === 'board') onChange({ ...round, rules: { ...round.rules, partial } });
  };

  return (
    <details className="rules round-settings">
      <summary>{t('roundSettings')}</summary>
      <label className="field">
        <span>{t(round.type === 'final' ? 'finalTheme' : 'roundTitleLabel')}</span>
        <input
          value={round.title}
          maxLength={LIMITS.roundTitle}
          placeholder={round.type === 'final' ? t('finalThemePlaceholder') : t('roundTitlePlaceholder', { index })}
          onChange={(event) => onChange({ ...round, title: event.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('roundDescriptionLabel')}</span>
        <textarea
          rows={2}
          maxLength={LIMITS.roundDescription}
          placeholder={t('roundDescriptionPlaceholder')}
          value={round.description ?? ''}
          onChange={(event) => onChange({ ...round, description: event.target.value })}
        />
      </label>
      {round.type !== 'final' && (
      <div className="same-time">
        <span>{t('sameTimeTitle')}</span>
        <label className="field">
          <span>{t('sameTimeSeconds')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={LIMITS.minTime}
            max={LIMITS.maxTime}
            value={Number.isNaN(seconds) ? '' : seconds}
            onChange={(event) => setSeconds(toNumber(event.target.value))}
          />
        </label>
        <button type="button" className="btn btn-small" disabled={!secondsValid} onClick={() => onChange(applyRoundTime(round, seconds))}>
          {t('sameTimeApply')}
        </button>
      </div>
      )}
      {round.type === 'classic' && (
        <label className="check">
          <input type="checkbox" checked={round.speedBonus} onChange={(event) => onChange({ ...round, speedBonus: event.target.checked })} />
          <span>{t('speedBonus')}</span>
        </label>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={round.shuffleOptions}
          onChange={(event) => onChange({ ...round, shuffleOptions: event.target.checked })}
        />
        <span>{t('shuffleOptions')}</span>
      </label>
      {round.type === 'board' && (
        <>
          <label className="field">
            <span>{t('boardAnswerMode')}</span>
            <select value={round.answerMode} onChange={(event) => onChange(withDefaultMode(round, event.target.value === 'voice' ? 'voice' : 'phone'))}>
              <option value="phone">{t('boardAnswerPhone')}</option>
              <option value="voice">{t('boardAnswerVoice')}</option>
            </select>
          </label>
          {boardCells(round).some((c) => cellAnswerMode(round, c.cell) === 'phone') && (
            <label className="field">
              <span>{t('boardCheck')}</span>
              <select value={round.check} onChange={(event) => onChange({ ...round, check: event.target.value === 'manual' ? 'manual' : 'auto' })}>
                <option value="auto">{t('blitzCheckAuto')}</option>
                <option value="manual">{t('blitzCheckManual')}</option>
              </select>
            </label>
          )}
        </>
      )}
      {round.type === 'final' && (
        <label className="field">
          <span>{t('finalCheck')}</span>
          <select value={round.check} onChange={(event) => onChange({ ...round, check: event.target.value === 'manual' ? 'manual' : 'auto' })}>
            <option value="auto">{t('blitzCheckAuto')}</option>
            <option value="manual">{t('blitzCheckManual')}</option>
          </select>
        </label>
      )}
      {round.type === 'blitz' && (
        <>
          <label className="field">
            <span>{t('blitzAnswerWindow')}</span>
            <select value={round.answerWindow ?? 'off'} onChange={(event) => onChange({ ...round, answerWindow: toWindow(event.target.value) })}>
              <option value="off">{t('blitzWindowOff')}</option>
              {WINDOWS.map((value) => (
                <option key={value} value={value}>
                  {t('blitzWindowSeconds', { count: value })}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t('blitzAttempts')}</span>
            <select value={round.attempts ?? 'unlimited'} onChange={(event) => onChange({ ...round, attempts: toAttempts(event.target.value) })}>
              {ATTEMPTS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
              <option value="unlimited">{t('blitzAttemptsUnlimited')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('blitzCheck')}</span>
            <select value={round.check} onChange={(event) => onChange({ ...round, check: event.target.value === 'manual' ? 'manual' : 'auto' })}>
              <option value="auto">{t('blitzCheckAuto')}</option>
              <option value="manual">{t('blitzCheckManual')}</option>
            </select>
          </label>
        </>
      )}
      {round.type !== 'final' && (
        <>
      <label className="check">
        <input
          type="checkbox"
          checked={rules.penalty === 'minus'}
          onChange={(event) => setRules({ penalty: event.target.checked ? 'minus' : 'none' })}
        />
        <span>{t('ruleMinus')}</span>
      </label>

      {round.type !== 'blitz' && (
        <>
        <label className="check">
          <input
            type="checkbox"
            checked={rules.partial !== null}
            onChange={(event) => setPartial(event.target.checked ? 50 : null)}
          />
          <span>{t('rulePartial')}</span>
        </label>
        {rules.partial !== null && (
          <label className="field">
            <span>{t('rulePartialShare')}</span>
            <select value={rules.partial} onChange={(event) => setPartial(Number(event.target.value))}>
              {range(10, 90, 10).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        )}
        </>
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
        </>
      )}
      <div className="round-brief-preview">
        <p className="meta">{t('roundBriefPreview')}</p>
        <RoundBriefing brief={roundBrief(round)} description={round.description ?? ''} />
      </div>
    </details>
  );
}
