import type { ReactNode } from 'react';
import type { HostLive, HostView, LiveRow, Question } from '@quiz/shared';
import { answerText, num, secondsText, sliderNumber } from '../format';
import { t, type TextKey } from '../i18n';
import { HelpButton } from '../help/HelpButton';
import { BuffBadge, SpareMark } from './Buffs';

interface Props {
  view: HostView;
  live: HostLive;
  /** Бліц: розмітка черги, яку HostScreen переносить сюди без змін. */
  blitz?: ReactNode;
  /** Дуель: без заголовка й рамки панелі, усередині HostDuelPanel. */
  compact?: boolean;
}

/** Є хоч один хід: рядок з поступом, але без відповіді, теж видно. Двері не рахуються. */
function started(row: LiveRow): boolean {
  const progress = row.progress;
  if (progress === null) return false;
  switch (progress.kind) {
    case 'chain':
      return progress.solved > 0 || progress.hints > 0;
    case 'sort':
      return progress.sorted > 0 || progress.misses > 0;
    case 'wall':
      return progress.found > 0 || progress.mistakes > 0;
    case 'bluff':
      return progress.lie !== null || progress.pick !== null;
    case 'duel':
      return progress.tries.length > 0 || progress.won !== null;
    default:
      return false;
  }
}

/** Текст відповіді рядка людською мовою з деталями типу. */
export function liveAnswerText(row: LiveRow, correct: Question | null, choices: { id: string }[] | undefined): string {
  const parts: string[] = [];
  const question = row.spare ?? correct;
  const answer = row.answer;
  if (answer !== null) {
    if (answer.type === 'survey' && row.progress?.kind === 'survey') {
      const ranks = row.progress.ranks;
      parts.push(answer.values.map((value, index) => (ranks[index] != null ? t('liveSurveyRow', { value, rank: ranks[index] as number }) : t('surveyMiss', { value }))).join(', '));
    } else {
      let main = answerText(answer, question, row.spare === null ? choices : undefined);
      if (answer.type === 'slider' && question?.type === 'slider') {
        const unit = question.unit === undefined || question.unit === '' ? '' : ` ${question.unit}`;
        main += ` · ${t('liveDistance', { distance: `${sliderNumber(Math.abs(answer.value - question.correct), question.step)}${unit}` })}`;
      }
      parts.push(main);
    }
  }
  const progress = row.progress;
  if (progress !== null) {
    switch (progress.kind) {
      case 'chain':
        parts.push(progress.word === null ? t('liveChainDone', { hints: progress.hints }) : t('liveChain', { solved: progress.solved, total: progress.total, word: progress.word, hints: progress.hints }));
        break;
      case 'sort':
        parts.push(progress.card === null ? t('liveSortDone', { misses: progress.misses }) : t('liveSort', { card: progress.card, sorted: progress.sorted, total: progress.total, misses: progress.misses }));
        break;
      case 'wall': {
        parts.push(
          progress.found === progress.groups
            ? t('wallAnswerDone', { mistakes: progress.mistakes })
            : t('wallAnswerPart', { found: progress.found, groups: progress.groups, mistakes: progress.mistakes }),
        );
        if (progress.locked) parts.push(t('wallTableLocked'));
        break;
      }
      case 'bluff':
        if (progress.stage === 'lies') {
          if (progress.lie !== null) parts.push(t('liveLie', { text: progress.lie }));
        } else if (progress.pick !== null) {
          parts.push(t('livePick', { text: progress.pick }));
        }
        break;
      case 'door':
        // Які саме двері — у панелі «Вибування» (HostSurvival); тут лише, що вибрав.
        if (progress.picked !== null) parts.push(t('liveDoorPicked'));
        break;
      case 'duel':
        if (progress.tries.length > 0) parts.push(t('liveDuelTries', { list: progress.tries.join(', ') }));
        if (progress.won !== null) parts.push(t('liveDuelWon', { text: progress.won }));
        break;
      case 'survey':
        break;
    }
  }
  if (row.wager !== null) {
    if (row.wager.wager !== null) parts.push(t('liveWager', { wager: num(row.wager.wager) }));
    if (row.wager.allIn) parts.push(t('finalAllInTag'));
  }
  if (parts.length === 0) return row.awaiting ? t('answeredAloud') : '—';
  return parts.join(' · ');
}

function Row({ row, view }: { row: LiveRow; view: HostView }) {
  const choices = view.question?.choices;
  const draftShown = !row.answered && row.draft !== null;
  return (
    <li className="live-row">
      <span className="name">{row.nickname}</span>
      {!row.connected && <span className="meta live-offline">{t('liveOffline')}</span>}
      {row.actor !== null && <span className="meta live-actor">{t('liveActs', { name: row.actor })}</span>}
      {row.buff !== null && <BuffBadge kind={row.buff} />}
      {row.spare !== null && <SpareMark spare={row.spare} />}
      {draftShown ? (
        <span className="live-draft">
          <em>{answerText(row.draft, row.spare ?? view.correct, row.spare === null ? choices : undefined)}</em> <span className="tag">{t('liveDraft')}</span>
        </span>
      ) : (
        <span className="live-answer">{liveAnswerText(row, view.correct, choices)}</span>
      )}
      {row.clue !== null && <span className="meta">{t('clueAt', { n: row.clue })}</span>}
      {row.timeMs !== null && <span className="meta live-time">{t('blitzRowTime', { time: secondsText(row.timeMs) })}</span>}
      {row.verdict !== null && <span className={`tag is-${row.verdict}`}>{t(`liveVerdict_${row.verdict}` as TextKey)}</span>}
      {row.awaiting && <span className="tag is-pending">{t('liveAwaiting')}</span>}
    </li>
  );
}

/** Скільки рядків видно без прокрутки (див. .live-scroll у styles.css). */
const VISIBLE_ROWS = 8;

function Rows({ rows, view }: { rows: LiveRow[]; view: HostView }) {
  // Понад вісім рядків список прокручується: з клавіатури до нього можна дійти й гортати стрілками.
  const scrolls = rows.length > VISIBLE_ROWS;
  return (
    <div className="live-scroll" {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': t('liveRowsLabel') } : {})}>
      <ul className="live-rows">
        {rows.map((row) => (
          <Row key={row.id} row={row} view={view} />
        ))}
      </ul>
    </div>
  );
}

/** «Відповіді наживо» на пульті (11c): хто що відповів ще до розкриття. */
export function LiveAnswers({ view, live, blitz, compact = false }: Props) {
  const duel = live.kind === 'duel';
  const queue = live.kind === 'blitz' && view.blitz?.instant !== true;
  const waiting = duel || queue ? [] : live.rows.filter((row) => !row.answered);
  // Дуель: обидва дуелянти завжди, навіть без спроб.
  const shown = duel ? live.rows : live.rows.filter((row) => row.answered || started(row) || row.draft !== null);
  const queueShown = blitz !== undefined && blitz !== null;
  // Командний бліц: чернетки тих, хто ще не в черзі, — під чергою.
  const drafts = queueShown ? live.rows.filter((row) => !row.answered && row.draft !== null) : [];
  const body = (
    <>
      {!duel && (
        <p className="meta live-count">{queue ? t('blitzQueued', { count: view.blitz?.queue.length ?? 0 }) : t('answeredOf', { answered: live.answered, total: live.total })}</p>
      )}
      {waiting.length > 0 && (
        <div className="live-waiting">
          <span className="meta">{t(view.phase === 'locked' ? 'liveSilent' : 'liveWaiting')}</span>
          <ul>
            {waiting.map((row) => (
              <li key={row.id} className={row.connected ? 'live-chip' : 'live-chip is-offline'}>
                {row.nickname}
                {!row.connected && <span className="live-offline">{t('liveOffline')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {queueShown ? (
        <>
          {blitz}
          {drafts.length > 0 && <Rows rows={drafts} view={view} />}
        </>
      ) : shown.length > 0 ? (
        <Rows rows={shown} view={view} />
      ) : (
        <p className="meta">{t('noResponses')}</p>
      )}
      {live.aside !== null && (
        <details className="live-aside">
          <summary>{t(live.aside.kind === 'ghosts' ? 'liveGhosts' : 'liveHall', { answered: live.aside.answered, total: live.aside.total })}</summary>
          <Rows rows={live.aside.rows} view={view} />
        </details>
      )}
    </>
  );
  if (compact) return <div className="live-answers is-compact">{body}</div>;
  return (
    <section id="live-answers" className="panel live-answers" aria-labelledby="live-answers-title" tabIndex={-1}>
      <h2 id="live-answers-title">
        {t('liveTitle')}
        <HelpButton id="setting.live" />
      </h2>
      {body}
    </section>
  );
}
