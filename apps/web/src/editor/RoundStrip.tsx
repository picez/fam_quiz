import { useId, useState } from 'react';
import { LIMITS, ROUND_TYPES, type Round } from '@quiz/shared';
import { roundLabel } from '../format';
import { HelpButton } from '../help/HelpButton';
import { ROUND_NAMES } from '../guide-text';
import { countText, t } from '../i18n';
import { boardReadiness } from './draft';

interface Props {
  rounds: Round[];
  selected: number;
  onSelect: (index: number) => void;
  onAdd: (type: Round['type']) => void;
  onRename: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

/**
 * Смуга раундів над редактором. З одним раундом це лише кнопка «+ Раунд»;
 * з кількома — вкладки з назвами та кнопки перейменування, переміщення й видалення вибраного.
 */
export function RoundStrip({ rounds, selected, onSelect, onAdd, onRename, onMove, onRemove }: Props) {
  const several = rounds.length > 1;
  const baseId = useId();
  const [choosing, setChoosing] = useState(false);
  const add = (type: Round['type']) => {
    setChoosing(false);
    onAdd(type);
  };
  const nameOf = (round: Round, index: number) => roundLabel(round.title, index, round.type);

  return (
    <div className="round-strip" role="group" aria-label={t('roundsLabel')}>
      {several && (
        <div className="round-tabs">
          {rounds.map((round, index) => {
            const notReady = round.type === 'board' ? boardReadiness(round).notReady : 0;
            const badgeId = `${baseId}-${index}`;
            return (
              <button
                key={round.id}
                type="button"
                className={index === selected ? 'btn btn-small round-tab is-on' : 'btn btn-small round-tab'}
                aria-current={index === selected}
                aria-label={notReady > 0 ? nameOf(round, index) : undefined}
                aria-describedby={notReady > 0 ? badgeId : undefined}
                onClick={() => onSelect(index)}
              >
                <span className="round-tab-name">{nameOf(round, index)}</span>
                {notReady > 0 && (
                  <span id={badgeId} className="round-tab-badge">
                    {countText('boardNotReady', notReady, { count: notReady })}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      <div className="toolbar">
        <button type="button" className="btn btn-small" disabled={rounds.length >= LIMITS.maxRounds} onClick={() => setChoosing(!choosing)}>
          {t('addRound')}
        </button>
        {choosing && rounds.length < LIMITS.maxRounds && (
          <>
            {ROUND_TYPES.map((type) => (
              <span className="with-help" key={type}>
                <button type="button" className="btn btn-small" onClick={() => add(type)}>
                  {t(ROUND_NAMES[type])}
                </button>
                <HelpButton id={`round.${type}`} />
              </span>
            ))}
          </>
        )}
        {several && (
          <>
            <button type="button" className="btn btn-small" onClick={() => onRename(selected)}>
              {t('renameRound')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              aria-label={t('moveRoundUp', { index: selected + 1 })}
              disabled={selected === 0}
              onClick={() => onMove(selected, selected - 1)}
            >
              {t('moveUpShort')}
            </button>
            <button
              type="button"
              className="btn btn-small"
              aria-label={t('moveRoundDown', { index: selected + 1 })}
              disabled={selected === rounds.length - 1}
              onClick={() => onMove(selected, selected + 1)}
            >
              {t('moveDownShort')}
            </button>
            <button type="button" className="btn btn-small btn-danger" onClick={() => onRemove(selected)}>
              {t('removeRound')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
