import { useId, useState } from 'react';
import { betsMinimums, LADDER_PICKS, LADDER_PRESETS, LIFELINES, LIMITS, SURVIVAL_TYPES, ladderPresetSafe, boardCells, cellAnswerMode, roundBrief, rulesOf, type BlitzRoundRules, type Round, type RoundRules } from '@quiz/shared';
import { ROUND_NAMES } from '../guide-text';
import { HelpButton } from '../help/HelpButton';
import { t } from '../i18n';
import { RoundBriefing } from '../screens/RoundBriefing';
import { applyRoundTime, withDefaultMode } from './draft';
import { SparesEditor } from './SparesEditor';

interface Props {
  round: Round;
  /** Номер раунду (з одиниці) для підказки в полі назви. */
  index: number;
  /** Запитань у всій вікторині разом з питаннями на виживання (ліміт 200). */
  total?: number;
  onChange: (next: Round) => void;
  /** Керований стан розгортання (щоб редактор міг відкрити налаштування з помилкою). */
  open?: boolean;
  onToggle?: (open: boolean) => void;
}

/** З якої довжини лічильник опису жовтіє (11a). */
export const ROUND_DESCRIPTION_WARN = 500;

const range = (from: number, to: number, step = 1) => Array.from({ length: (to - from) / step + 1 }, (_, i) => from + i * step);
/** Порожнє поле дає NaN: перевірка перед збереженням попросить виправити. */
const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));
/** Крок серії бліцу за замовчуванням, коли її вмикають. */
const DEFAULT_SERIES_STEP = 250;
const WINDOWS = [5, 10, 15, 20, 30, 45, 60, 90, 120];
const ATTEMPTS = [1, 2, 3];
const toWindow = (value: string): number | null => (value === 'off' ? null : Number(value));
const toAttempts = (value: string): 1 | 2 | 3 | null => (value === '3' ? 3 : value === '2' ? 2 : value === '1' ? 1 : null);
const toMultiplier = (value: string): RoundRules['multiplier'] => (value === '3' ? 3 : value === '2' ? 2 : 1);

/**
 * Налаштування одного раунду: назва, опис для гравців, перемішування варіантів і правила підрахунку (штраф, серії, множник);
 * класичному додатково бали за швидкість і «частково», бліцу — вікно відповіді, спроби й спосіб перевірки, полю — спосіб відповіді й перевірки та «частково». В кінці — попередній перегляд заставки з поясненням правил. Згорнуті, доки їх не відкриють.
 */
export function RoundSettings({ round, index, total = 0, onChange, open, onToggle }: Props) {
  const countId = useId();
  const fieldId = useId();
  const descriptionLength = (round.description ?? '').length;
  const [seconds, setSeconds] = useState<number>(LIMITS.defaultTime);
  const secondsValid = Number.isInteger(seconds) && seconds >= LIMITS.minTime && seconds <= LIMITS.maxTime;
  const rules = rulesOf(round);
  const { streak } = rules;
  // У бліці часткових балів немає, тому «частково» змінює лише класичний раунд і поле.
  const setRules = (patch: Partial<Omit<RoundRules, 'partial'>>) => {
    // У фіналі, «Ва-банк» і «Мільйонері» правил немає: їхніх елементів керування там не показано.
    if (round.type === 'final' || round.type === 'bets' || round.type === 'auction' || round.type === 'wipeout' || round.type === 'ladder') return;
    onChange(round.type === 'blitz' ? { ...round, rules: { ...round.rules, ...patch } } : { ...round, rules: { ...round.rules, ...patch } });
  };
  /** Правила бліцу з серіями; плюсова серія замінює стару «Серії», мінусова тримає штраф увімкненим. */
  const setBlitzRules = (patch: Partial<Omit<BlitzRoundRules, 'partial'>>) => {
    if (round.type === 'blitz') onChange({ ...round, rules: { ...round.rules, ...patch } });
  };
  const seriesPlus = round.type === 'blitz' ? (round.rules.streakPlus ?? null) : null;
  const seriesMinus = round.type === 'blitz' ? (round.rules.streakMinus ?? null) : null;
  const setPartial = (partial: number | null) => {
    if (round.type === 'classic' || round.type === 'board' || round.type === 'survival') onChange({ ...round, rules: { ...round.rules, partial } });
  };

  return (
    <details className="rules round-settings" open={open} onToggle={onToggle === undefined ? undefined : (event) => onToggle(event.currentTarget.open)}>
      <summary>{t('roundSettings')}</summary>
      <p className="meta with-help">
        <span>{t(ROUND_NAMES[round.type])}</span>
        <HelpButton id={`round.${round.type}`} />
      </p>
      <label className="field">
        <span>{t(round.type === 'final' ? 'finalTheme' : 'roundTitleLabel')}</span>
        <input
          value={round.title}
          maxLength={LIMITS.roundTitle}
          placeholder={round.type === 'final' ? t('finalThemePlaceholder') : t('roundTitlePlaceholder', { index })}
          onChange={(event) => onChange({ ...round, title: event.target.value })}
        />
      </label>
      <div className="field">
        <span className="with-help">
          <label htmlFor={fieldId}>{t('roundDescriptionLabel')}</label>
          <HelpButton id="setting.description" />
        </span>
        <textarea
          id={fieldId}
          rows={4}
          className="round-description"
          maxLength={LIMITS.roundDescription}
          aria-describedby={countId}
          placeholder={t('roundDescriptionPlaceholder')}
          value={round.description ?? ''}
          onChange={(event) => onChange({ ...round, description: event.target.value })}
        />
        <span id={countId} className={descriptionLength > ROUND_DESCRIPTION_WARN ? 'meta field-count is-near' : 'meta field-count'}>
          {t('roundDescriptionCount', { count: descriptionLength, max: LIMITS.roundDescription })}
        </span>
      </div>
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
      {(round.type === 'classic' || round.type === 'survival') && (
        <div className="with-help">
          <label className="check">
            <input type="checkbox" checked={round.speedBonus} onChange={(event) => onChange({ ...round, speedBonus: event.target.checked })} />
            <span>{t('speedBonus')}</span>
          </label>
          <HelpButton id="setting.speedBonus" />
        </div>
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
        <>
          <label className="field">
            <span>{t('finalCheck')}</span>
            <select value={round.check} onChange={(event) => onChange({ ...round, check: event.target.value === 'manual' ? 'manual' : 'auto' })}>
              <option value="auto">{t('blitzCheckAuto')}</option>
              <option value="manual">{t('blitzCheckManual')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('finalWagerMode')}</span>
            <select value={round.wagerMode} onChange={(event) => onChange({ ...round, wagerMode: event.target.value === 'bank' ? 'bank' : 'classic' })}>
              <option value="classic">{t('wagerModeClassic')}</option>
              <option value="bank">{t('wagerModeBank')}</option>
            </select>
          </label>
          <p className="meta">{t(round.wagerMode === 'bank' ? 'wagerModeBankHint' : 'wagerModeClassicHint')}</p>
        </>
      )}
      {round.type === 'bets' && (
        <>
          <label className="field">
            <span>{t('finalCheck')}</span>
            <select value={round.check} onChange={(event) => onChange({ ...round, check: event.target.value === 'manual' ? 'manual' : 'auto' })}>
              <option value="auto">{t('blitzCheckAuto')}</option>
              <option value="manual">{t('blitzCheckManual')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('betStartLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITS.maxBet}
              value={Number.isNaN(round.betStart) ? '' : round.betStart}
              onChange={(event) => onChange({ ...round, betStart: toNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t('betStepLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={LIMITS.maxBet}
              value={Number.isNaN(round.betStep) ? '' : round.betStep}
              onChange={(event) => onChange({ ...round, betStep: toNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t('betMaxLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITS.maxBet}
              placeholder={t('betMaxPlaceholder')}
              value={round.betMax === null || Number.isNaN(round.betMax) ? '' : round.betMax}
              onChange={(event) => onChange({ ...round, betMax: event.target.value.trim() === '' ? null : Number(event.target.value) })}
            />
          </label>
          {Number.isInteger(round.betStart) && Number.isInteger(round.betStep) && (
            <p className="meta bets-minimums">{t('betsMinimumsNote', { list: betsMinimums(round, round.questions.length).join(', ') })}</p>
          )}
          <p className="meta">{t('betsSettingsNote')}</p>
        </>
      )}
      {round.type === 'auction' && (
        <>
          <label className="field">
            <span>{t('finalCheck')}</span>
            <select value={round.check} onChange={(event) => onChange({ ...round, check: event.target.value === 'manual' ? 'manual' : 'auto' })}>
              <option value="auto">{t('blitzCheckAuto')}</option>
              <option value="manual">{t('blitzCheckManual')}</option>
            </select>
          </label>
          <label className="field">
            <span>{t('auctionModeLabel')}</span>
            <select value={round.bidMode} onChange={(event) => onChange({ ...round, bidMode: event.target.value === 'free' ? 'free' : 'step' })}>
              <option value="step">{t('auctionModeStep')}</option>
              <option value="free">{t('auctionModeFree')}</option>
            </select>
          </label>
          {round.bidMode === 'step' && (
            <label className="field">
              <span>{t('auctionStepLabel')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={LIMITS.maxBet}
                value={Number.isNaN(round.bidStep) ? '' : round.bidStep}
                onChange={(event) => onChange({ ...round, bidStep: toNumber(event.target.value) })}
              />
            </label>
          )}
          <label className="field">
            <span>{t('auctionLossLabel')}</span>
            <select value={round.loss} onChange={(event) => onChange({ ...round, loss: event.target.value === 'bid_price' ? 'bid_price' : 'bid' })}>
              <option value="bid">{t('auctionLossBid')}</option>
              <option value="bid_price">{t('auctionLossBidPrice')}</option>
            </select>
          </label>
          <p className="meta">{t('auctionSettingsNote')}</p>
        </>
      )}
      {round.type === 'blitz' && (
        <>
          <label className="field">
            <span>{t('blitzCheck')}</span>
            <select
              value={round.check}
              onChange={(event) =>
                onChange(event.target.value === 'manual' ? { ...round, check: 'manual' } : { ...round, check: 'auto', answerWindow: null, attempts: 1 })
              }
            >
              <option value="auto">{t('blitzCheckAuto')}</option>
              <option value="manual">{t('blitzCheckManual')}</option>
            </select>
          </label>
          {round.check === 'manual' && (
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
            </>
          )}
        </>
      )}
      {round.type === 'wipeout' && (
        <p className="meta with-help">
          <span>{t('wipeoutSettingsNote')}</span>
          <HelpButton id="round.wipeout" />
        </p>
      )}
      {round.type === 'ladder' && (
        <>
          <p className="meta">{t('ladderSettingsNote')}</p>
          <fieldset className="survival-settings ladder-settings">
            <legend className="with-help">
              <span>{t('ladderLabel')}</span>
              <HelpButton id="round.ladder" />
            </legend>
            <div role="radiogroup" aria-label={t('ladderPickTitle')}>
              <p className="meta">{t('ladderPickTitle')}</p>
              {LADDER_PICKS.map((pick) => (
                <label className="check" key={pick}>
                  <input type="radio" name={`ladder-pick-${round.id}`} checked={round.pick === pick} onChange={() => onChange({ ...round, pick })} />
                  <span>{t(`ladderPick_${pick}`)}</span>
                </label>
              ))}
            </div>
            <div role="group" aria-label={t('ladderLifelinesTitle')}>
              <p className="meta">{t('ladderLifelinesTitle')}</p>
              {LIFELINES.map((kind) => (
                <label className="check" key={kind}>
                  <input
                    type="checkbox"
                    checked={round.lifelines.includes(kind)}
                    onChange={(event) =>
                      onChange({ ...round, lifelines: LIFELINES.filter((k) => (k === kind ? event.target.checked : round.lifelines.includes(k))) })
                    }
                  />
                  <span>{t(`ladderLifeline_${kind}`)}</span>
                </label>
              ))}
            </div>
            <label className="check">
              <input type="checkbox" checked={round.timer} onChange={(event) => onChange({ ...round, timer: event.target.checked })} />
              <span>{t('ladderTimer')}</span>
            </label>
            <p className="meta">{t('ladderTimerNote')}</p>
            <p className="meta">{t('ladderLevelsTitle')}</p>
            <ol className="ladder-levels">
              {round.levels
                .map((level, step) => ({ level, step }))
                .reverse()
                .map(({ level, step }) => {
                  const top = step === round.levels.length - 1;
                  return (
                    <li className="ladder-level-row" key={step}>
                      <span className="ladder-level-n">{step + 1}</span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={LIMITS.maxLadderLevel}
                        step={50}
                        aria-label={t('ladderLevel', { n: step + 1 })}
                        value={Number.isNaN(level) ? '' : level}
                        onChange={(event) => onChange({ ...round, levels: round.levels.map((l, i) => (i === step ? toNumber(event.target.value) : l)) })}
                      />
                      <label className="check">
                        <input
                          type="checkbox"
                          aria-label={`${t('ladderSafeMark')} ${step + 1}`}
                          disabled={top}
                          checked={round.safe.includes(step)}
                          onChange={(event) =>
                            onChange({ ...round, safe: event.target.checked ? [...round.safe, step].sort((a, b) => a - b) : round.safe.filter((s) => s !== step) })
                          }
                        />
                        <span>{t('ladderSafeMark')}</span>
                      </label>
                    </li>
                  );
                })}
            </ol>
            {LADDER_PRESETS[round.levels.length] !== undefined && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => {
                  const levels = [...LADDER_PRESETS[round.levels.length]];
                  onChange({ ...round, levels, safe: ladderPresetSafe(levels) });
                }}
              >
                {t('ladderUsePreset')}
              </button>
            )}
          </fieldset>
        </>
      )}
      {round.type === 'survival' && (
        <fieldset className="survival-settings">
          <legend className="with-help">
            <span>{t('survivalLabel')}</span>
            <HelpButton id="round.survival" />
          </legend>
          <div role="radiogroup" aria-label={t('survivalTrialKind')}>
            <label className="check">
              <input type="radio" name={`survival-trial-${round.id}`} checked={round.trial === 'question'} onChange={() => onChange({ ...round, trial: 'question' })} />
              <span>{t('survivalTrialQuestionOpt')}</span>
            </label>
            <label className="check">
              <input type="radio" name={`survival-trial-${round.id}`} checked={round.trial === 'luck'} onChange={() => onChange({ ...round, trial: 'luck' })} />
              <span>{t('survivalTrialLuckOpt')}</span>
            </label>
          </div>
          <label className="field">
            <span>{t('survivalSurvivors')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={LIMITS.maxSurvivors}
              value={Number.isNaN(round.survivors) ? '' : round.survivors}
              onChange={(event) => onChange({ ...round, survivors: toNumber(event.target.value) })}
            />
          </label>
          <label className="field">
            <span>{t('survivalBonusLabel')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={LIMITS.maxPoints}
              step={50}
              value={Number.isNaN(round.bonus) ? '' : round.bonus}
              onChange={(event) => onChange({ ...round, bonus: toNumber(event.target.value) })}
            />
          </label>
          <p className="meta">{t('survivalTrialsTitle')}</p>
          {round.trial === 'luck' && <p className="meta">{t('survivalTrialsLuckNote')}</p>}
          <SparesEditor
            key={round.id}
            spares={round.trials.length === 0 ? undefined : round.trials}
            onChange={(next) => onChange({ ...round, trials: next ?? [] })}
            types={SURVIVAL_TYPES}
            showTime
            max={Math.min(LIMITS.maxSurvivalTrials, LIMITS.maxQuizQuestions - (total - round.trials.length))}
            hint={t('survivalTrialsHint')}
            chipLabel={(i) => t('trialN', { index: i + 1 })}
            addLabel={t('addTrial')}
            removeLabel={t('removeTrial')}
          />
        </fieldset>
      )}
      {round.type !== 'final' && round.type !== 'bets' && round.type !== 'auction' && round.type !== 'wipeout' && round.type !== 'ladder' && (
        <>
      <div className="with-help">
        <label className="check">
          <input
            type="checkbox"
            checked={rules.penalty === 'minus' || seriesMinus !== null}
            disabled={seriesMinus !== null}
            onChange={(event) => setRules({ penalty: event.target.checked ? 'minus' : 'none' })}
          />
          <span>{t('ruleMinus')}</span>
        </label>
        <HelpButton id="setting.penalty" />
      </div>
      {seriesMinus !== null && <p className="meta">{t('ruleSeriesMinusPenalty')}</p>}

      {round.type === 'blitz' && (
        <>
          <div className="with-help">
            <label className="check">
              <input
                type="checkbox"
                checked={seriesPlus !== null}
                onChange={(event) =>
                  setBlitzRules(event.target.checked ? { streakPlus: { step: DEFAULT_SERIES_STEP }, streak: null } : { streakPlus: null })
                }
              />
              <span>{t('ruleSeriesPlus')}</span>
            </label>
            <HelpButton id="setting.blitzSeries" />
          </div>
          {seriesPlus !== null && (
            <div className="round-streak" role="group" aria-label={t('ruleSeriesPlus')}>
              <label className="field">
                <span>{t('ruleSeriesStep')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LIMITS.maxPoints}
                  value={Number.isNaN(seriesPlus.step) ? '' : seriesPlus.step}
                  onChange={(event) => setBlitzRules({ streakPlus: { step: toNumber(event.target.value) } })}
                />
              </label>
            </div>
          )}
          <div className="with-help">
            <label className="check">
              <input
                type="checkbox"
                checked={seriesMinus !== null}
                onChange={(event) =>
                  setBlitzRules(event.target.checked ? { streakMinus: { step: DEFAULT_SERIES_STEP }, penalty: 'minus' } : { streakMinus: null })
                }
              />
              <span>{t('ruleSeriesMinus')}</span>
            </label>
          </div>
          {seriesMinus !== null && (
            <div className="round-streak" role="group" aria-label={t('ruleSeriesMinus')}>
              <label className="field">
                <span>{t('ruleSeriesStep')}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={LIMITS.maxPoints}
                  value={Number.isNaN(seriesMinus.step) ? '' : seriesMinus.step}
                  onChange={(event) => setBlitzRules({ streakMinus: { step: toNumber(event.target.value) } })}
                />
              </label>
            </div>
          )}
        </>
      )}

      {round.type !== 'blitz' && (
        <>
        <div className="with-help">
          <label className="check">
            <input
              type="checkbox"
              checked={rules.partial !== null}
              onChange={(event) => setPartial(event.target.checked ? 50 : null)}
            />
            <span>{t('rulePartial')}</span>
          </label>
          <HelpButton id="setting.partial" />
        </div>
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

      {(seriesPlus === null || streak !== null) && (
      <>
      <div className="with-help">
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
        <HelpButton id="setting.streak" />
      </div>
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
      </>
      )}

      <div className="with-help">
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
        <HelpButton id="setting.multiplier" />
      </div>
        </>
      )}
      <div className="round-brief-preview">
        <p className="meta">{t('roundBriefPreview')}</p>
        <RoundBriefing brief={roundBrief(round)} description={round.description ?? ''} />
      </div>
    </details>
  );
}
