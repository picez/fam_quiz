import { LIMITS, questDefaultOrder, questKey, type BuffKind, type QuestRound } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { t } from '../i18n';
import { withQuestCode } from './draft';

interface Props {
  round: QuestRound;
  /** Дозволені у вікторині бафи (бонусом може стати будь-який, крім «Прихованого нападу»). */
  buffs: readonly BuffKind[];
  /** Це останній раунд вікторини: баф-бонус уже ніде використати. */
  lastRound: boolean;
  onChange: (next: QuestRound) => void;
}

const toNumber = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

/** Налаштування «Квесту з кодом» (29g): глобальне запитання, код, порядок відкриття, спроби, бонус. */
export function QuestSettings({ round, buffs, lastRound, onChange }: Props) {
  const chars = Array.from(round.code);
  const pickable: BuffKind[] = buffs.filter((kind) => kind !== 'stealth');
  const { bonus } = round;
  const rankOf = (position: number) => round.order.indexOf(position) + 1;
  // Номер у порядку міняється місцями з тим, хто його мав: перестановка лишається коректною.
  const setRank = (position: number, rank: number) => {
    const current = round.order.indexOf(position);
    const next = [...round.order];
    const other = next[rank - 1];
    if (other === undefined || current === -1) return;
    next[current] = other;
    next[rank - 1] = position;
    onChange({ ...round, order: next });
  };
  const setCode = (raw: string) => onChange(withQuestCode(round, Array.from(questKey(raw)).slice(0, LIMITS.maxQuestCode).join('')));
  const need = Math.max(chars.length, LIMITS.minQuestCode);

  return (
    <fieldset className="quest-settings">
      <label className="field">
        <span>{t('questPromptLabel')}</span>
        <textarea
          rows={3}
          className="quest-prompt"
          maxLength={LIMITS.questionText}
          placeholder={t('questPromptPlaceholder')}
          value={round.prompt}
          onChange={(event) => onChange({ ...round, prompt: event.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('questCodeLabel')}</span>
        <input className="quest-code" dir="ltr" inputMode="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={round.code} onChange={(event) => setCode(event.target.value)} />
      </label>
      <p className="meta">{t('questCodeHint')}</p>
      <p className="meta quest-count">{t('questCodeCount', { n: chars.length, min: LIMITS.minQuestCode, max: LIMITS.maxQuestCode })}</p>
      {chars.length > 0 && (
        <div className="quest-order" role="group" aria-label={t('questOrderLabel')}>
          <p className="meta">{t('questOrderLabel')}</p>
          <ol className="quest-order-cells">
            {chars.map((char, position) => (
              <li key={position} className="quest-order-cell">
                <span className="quest-order-char" dir="ltr">
                  {char}
                </span>
                <select aria-label={t('questOrderPosition', { n: position + 1 })} value={rankOf(position)} onChange={(event) => setRank(position, Number(event.target.value))}>
                  {chars.map((_, rank) => (
                    <option key={rank} value={rank + 1}>
                      {rank + 1}
                    </option>
                  ))}
                </select>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn-small" onClick={() => onChange({ ...round, order: questDefaultOrder(chars.length) })}>
            {t('questOrderReset')}
          </button>
        </div>
      )}
      {round.questions.length < need && <p className="meta quest-short">{t('questShortHint', { length: need })}</p>}
      <label className="field">
        <span>{t('questTriesLabel')}</span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={LIMITS.maxQuestTries}
          value={Number.isNaN(round.tries) ? '' : round.tries}
          onChange={(event) => onChange({ ...round, tries: toNumber(event.target.value) })}
        />
      </label>
      <label className="field">
        <span>{t('questBonusLabel')}</span>
        <select
          value={bonus.kind}
          onChange={(event) =>
            onChange({
              ...round,
              bonus: event.target.value === 'buff' && pickable.length > 0 ? { kind: 'buff', buff: pickable[0]!, first: null } : { kind: 'points', points: LIMITS.defaultQuestBonus },
            })
          }
        >
          <option value="points">{t('questBonusPoints')}</option>
          <option value="buff" disabled={pickable.length === 0}>
            {t('questBonusBuff')}
          </option>
        </select>
      </label>
      {pickable.length === 0 && <p className="meta quest-buff-none">{t('questBuffNone')}</p>}
      {bonus.kind === 'points' && (
        <label className="field">
          <span>{t('questBonusPointsLabel')}</span>
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={LIMITS.maxPoints}
            value={Number.isNaN(bonus.points) ? '' : bonus.points}
            onChange={(event) => onChange({ ...round, bonus: { kind: 'points', points: toNumber(event.target.value) } })}
          />
        </label>
      )}
      {bonus.kind === 'buff' && (
        <>
          <label className="field">
            <span>{t('questBonusBuffLabel')}</span>
            <select value={bonus.buff} onChange={(event) => onChange({ ...round, bonus: { ...bonus, buff: event.target.value as BuffKind } })}>
              {/* Бонус, що вже не дозволений, лишається в списку, щоб вибір не зник мовчки: перевірка попросить виправити. */}
              {(pickable.includes(bonus.buff) ? pickable : [bonus.buff, ...pickable]).map((kind) => (
                <option key={kind} value={kind}>
                  {buffName(kind)}
                </option>
              ))}
            </select>
          </label>
          <div className="quest-first">
            <label className="check">
              <input type="checkbox" checked={bonus.first !== null} onChange={(event) => onChange({ ...round, bonus: { ...bonus, first: event.target.checked ? 1 : null } })} />
              <span>{t('questBonusFirst')}</span>
            </label>
            {bonus.first !== null && (
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={LIMITS.maxPlayers}
                aria-label={t('questBonusFirstCount')}
                value={Number.isNaN(bonus.first) ? '' : bonus.first}
                onChange={(event) => onChange({ ...round, bonus: { ...bonus, first: toNumber(event.target.value) } })}
              />
            )}
          </div>
          {lastRound && <p className="meta quest-buff-last">{t('questBuffLast')}</p>}
        </>
      )}
    </fieldset>
  );
}
