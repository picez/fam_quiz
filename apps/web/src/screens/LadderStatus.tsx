import type { LadderInfo, PublicQuestion } from '@quiz/shared';
import { BUFF_ICONS } from '../buff-meta';
import { num } from '../format';
import { t, type TextKey } from '../i18n';
import { VoteResults } from './Buffs';

/** Значки підказок драбини для сцени й пульта: ввімкнені в раунді, використані перекреслені, узята тут — підсвічена, недоступна без ведучого (11g) — притлумлена. */
export function LadderLifelineBadges({ info }: { info: LadderInfo }) {
  if (info.lifelines.length === 0) return null;
  return (
    <ul className="ladder-badges" aria-label={t('ladderLifelinesLabel')}>
      {info.lifelines.map(({ kind, state }) => (
        <li key={kind} className={`ladder-badge is-${state}`}>
          <span aria-hidden="true">{BUFF_ICONS[kind]}</span> {t(`ladderLifeline_${kind}` as TextKey)}
          {state === 'used' && <span className="sr-only"> {t('ladderLifelineUsed')}</span>}
          {state === 'off' && <span className="sr-only"> {t('ladderLifelineOff')}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Запитання без варіантів, прибраних 50/50, — для підсумку залу. */
export function withoutRemoved(info: LadderInfo, question: PublicQuestion): PublicQuestion {
  return info.fifty === null ? question : { ...question, choices: question.choices.filter((choice) => !info.fifty?.includes(choice.id)) };
}

/** Рядок підсумку драбини; учасник вийшов — окремий рядок без імені. */
export function ladderOutcomeText(info: LadderInfo): string {
  if (info.outcome === null) return '';
  if (info.contestant === null) return t('ladderOutcomeGone');
  return t(`ladderOutcome_${info.outcome.kind}` as TextKey, { name: info.contestant.nickname, points: num(info.outcome.points) });
}

/** Голосування залу: до закриття — скільки проголосували, після — підсумок усім. */
export function LadderAudience({ info, question, offsetMs }: { info: LadderInfo; question: PublicQuestion; offsetMs: number }) {
  const audience = info.audience;
  if (audience === null) return null;
  if (audience.state === 'closed' && audience.tally !== null) {
    // Варіанти, прибрані 50/50, у підсумку залу не показуємо.
    const shown = withoutRemoved(info, question);
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
