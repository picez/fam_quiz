import type { LadderInfo, PublicQuestion } from '@quiz/shared';
import { BUFF_ICONS } from '../buff-meta';
import { t, type TextKey } from '../i18n';
import { VoteResults } from './Buffs';

/** Значки підказок драбини для сцени й пульта: ввімкнені в раунді, використані перекреслені, узята тут — підсвічена. */
export function LadderLifelineBadges({ info }: { info: LadderInfo }) {
  if (info.lifelines.length === 0) return null;
  return (
    <ul className="ladder-badges" aria-label={t('ladderLifelinesLabel')}>
      {info.lifelines.map(({ kind, state }) => (
        <li key={kind} className={`ladder-badge is-${state}`}>
          <span aria-hidden="true">{BUFF_ICONS[kind]}</span> {t(`ladderLifeline_${kind}` as TextKey)}
          {state === 'used' && <span className="sr-only"> {t('ladderLifelineUsed')}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Голосування залу: до закриття — скільки проголосували, після — підсумок усім. */
export function LadderAudience({ info, question, offsetMs }: { info: LadderInfo; question: PublicQuestion; offsetMs: number }) {
  const audience = info.audience;
  if (audience === null) return null;
  if (audience.state === 'closed' && audience.tally !== null) {
    // Варіанти, прибрані 50/50, у підсумку залу не показуємо.
    const shown = info.fifty === null ? question : { ...question, choices: question.choices.filter((choice) => !info.fifty?.includes(choice.id)) };
    return (
      <div className="ladder-audience">
        <VoteResults
          votes={{ endsAt: null, remainingMs: null, closed: true, cast: audience.tally.cast, counts: audience.tally.counts, guesses: [] }}
          question={shown}
          offsetMs={offsetMs}
        />
      </div>
    );
  }
  return <p className="meta ladder-audience">{t('ladderHallVoting', { voted: audience.voted, total: audience.total })}</p>;
}
