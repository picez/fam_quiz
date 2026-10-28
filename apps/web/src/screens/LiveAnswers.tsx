import { useEffect, useState, type ReactNode } from 'react';
import type { HostLive, HostView, LiveDraft, LiveRow, Question, SortTilt } from '@quiz/shared';
import { answerText, num, secondsText, sliderNumber } from '../format';
import { t, type TextKey } from '../i18n';
import { HelpButton } from '../help/HelpButton';
import { draftMeta, draftText } from '../live-drafts';
import { BuffBadge, SpareMark } from './Buffs';
import { PinBoard } from './PinBoard';

interface Props {
  view: HostView;
  live: HostLive;
  /** Бліц: розмітка черги, яку HostScreen переносить сюди без змін. */
  blitz?: ReactNode;
  /** Дуель: без заголовка й рамки панелі, усередині HostDuelPanel. */
  compact?: boolean;
  /** Нахил картки сортування за тим, хто сортує (11d). */
  tilts?: Record<string, SortTilt>;
  /** Живі вибори за id рядка (12b); {} — немає. */
  drafts?: Record<string, LiveDraft>;
  /** «Наживо» вимкнено (12b): лише заголовок, «Відповіли N з M» і черга бліцу. */
  collapsed?: boolean;
  /** Поправка годинника для «думає N с». */
  offsetMs?: number;
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
    case 'clues':
      // «Хто я?» у власному темпі (12c): рядок видно завжди — «підказка 1/5» біля кожного.
      return true;
    default:
      return false;
  }
}

/** Текст відповіді рядка людською мовою з деталями типу. */
export function liveAnswerText(row: LiveRow, correct: Question | null, choices: { id: string }[] | undefined, toward: string | null = null): string {
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
        if (progress.card !== null && toward !== null) parts[parts.length - 1] += ` · ${t('liveSortToward', { name: toward })}`;
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
      case 'clues':
        // З відповіддю номер підказки показує clueAt.
        if (!row.answered) parts.push(t('liveClues', { opened: progress.opened, total: progress.total }));
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

/** Куди тягнуть картку зараз: текст категорії, якщо нахил діє (той самий хід і слово, не пауза, сильний). */
function towardOf(row: LiveRow, view: HostView, tilts: Record<string, SortTilt>): string | null {
  const progress = row.progress;
  const tilt = tilts[row.id];
  if (progress === null || progress.kind !== 'sort' || tilt === undefined) return null;
  if (view.paused || tilt.toward === null || tilt.amount < 0.2) return null;
  if (tilt.wordId !== progress.cardId || tilt.seq !== progress.seq) return null;
  const category = view.question?.sort?.categories.find((item) => item.id === tilt.toward);
  return category?.text ?? null;
}

/** Чи тягне той, хто сортує, картку цього ходу (будь-який нахил, і «в центр» теж): рядок не блимає, поки палець рухається й відпускає. */
function tilting(row: LiveRow, tilts: Record<string, SortTilt>): boolean {
  const progress = row.progress;
  const tilt = tilts[row.id];
  return progress !== null && progress.kind === 'sort' && tilt !== undefined && tilt.seq === progress.seq;
}

/** Живий вибір рядка (12b): лише поки рядок не подав відповіді. */
function draftOf(row: LiveRow, drafts: Record<string, LiveDraft>): LiveDraft | undefined {
  return row.answered ? undefined : drafts[row.id];
}

/** Курсивний живий вибір із позначкою «ще не надіслав», лічильником змін, часом роздумів і (точка) міні-мапою. */
function DraftLine({ row, view, draft, now }: { row: LiveRow; view: HostView; draft: LiveDraft; now: number }) {
  const question = row.spare === null ? view.question : null;
  // Основа міні-мапи: показане запитання, а для запасного — його власна мапа чи картинка.
  const board =
    row.spare?.type === 'pin'
      ? { pin: { map: row.spare.map, aspect: row.spare.aspect }, imageUrl: row.spare.imageUrl }
      : question?.pin != null
        ? { pin: question.pin, imageUrl: question.imageUrl }
        : null;
  return (
    <>
      <span className="live-draft">
        <em>{draftText(draft.draft, row.spare ?? view.correct, question, row.actor !== null)}</em> <span className="tag">{t(row.actor !== null ? 'liveNotSentTeam' : 'liveNotSent')}</span>
      </span>
      {draftMeta(draft, now, row.actor !== null).map((text, i) => (
        <span key={i} className={i === 0 && draft.changes >= 1 ? 'meta live-changes' : 'meta live-thinking'}>
          {text}
        </span>
      ))}
      {draft.draft.type === 'pin' && board !== null && (
        <div className="live-pin">
          <PinBoard pin={board.pin} imageUrl={board.imageUrl} marks={[{ playerId: row.id, nickname: row.nickname, x: draft.draft.x, y: draft.draft.y }]} highlight={row.id} />
        </div>
      )}
    </>
  );
}

interface RowContext {
  view: HostView;
  tilts: Record<string, SortTilt>;
  drafts: Record<string, LiveDraft>;
  now: number;
}

function Row({ row, view, tilts, drafts, now }: { row: LiveRow } & RowContext) {
  const choices = view.question?.choices;
  const draft = draftOf(row, drafts);
  return (
    <li className="live-row">
      <span className="name">{row.nickname}</span>
      {!row.connected && <span className="meta live-offline">{t('liveOffline')}</span>}
      {row.actor !== null && <span className="meta live-actor">{t('liveActs', { name: row.actor })}</span>}
      {row.buff !== null && <BuffBadge kind={row.buff} />}
      {row.spare !== null && <SpareMark spare={row.spare} />}
      {/* Поступ (ланцюжок, стіна) лишається поруч із чернеткою; без поступу чернетка стоїть замість «—». */}
      {(draft === undefined || started(row)) && <span className="live-answer">{liveAnswerText(row, view.correct, choices, towardOf(row, view, tilts))}</span>}
      {draft !== undefined && <DraftLine row={row} view={view} draft={draft} now={now} />}
      {row.clue !== null && <span className="meta">{t('clueAt', { n: row.clue })}</span>}
      {row.timeMs !== null && <span className="meta live-time">{t('blitzRowTime', { time: secondsText(row.timeMs) })}</span>}
      {row.verdict !== null && <span className={`tag is-${row.verdict}`}>{t(`liveVerdict_${row.verdict}` as TextKey)}</span>}
      {row.awaiting && <span className="tag is-pending">{t('liveAwaiting')}</span>}
    </li>
  );
}

/** Скільки рядків видно без прокрутки (див. .live-scroll у styles.css). */
const VISIBLE_ROWS = 8;

function Rows({ rows, ...context }: { rows: LiveRow[] } & RowContext) {
  // Понад вісім рядків список прокручується: з клавіатури до нього можна дійти й гортати стрілками.
  const scrolls = rows.length > VISIBLE_ROWS;
  return (
    <div className="live-scroll" {...(scrolls ? { tabIndex: 0, role: 'region', 'aria-label': t('liveRowsLabel') } : {})}>
      <ul className="live-rows">
        {rows.map((row) => (
          <Row key={row.id} row={row} {...context} />
        ))}
      </ul>
    </div>
  );
}

/** «Відповіді наживо» на пульті (11c): хто що відповів ще до розкриття. */
const NO_TILTS: Record<string, SortTilt> = {};
const NO_DRAFTS: Record<string, LiveDraft> = {};

/** Час сервера для «думає N с»: раз на секунду, лише поки є видима чернетка. */
function useServerNow(ticking: boolean, offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now() + offsetMs);
    const id = setInterval(() => setNow(Date.now() + offsetMs), 1000);
    return () => clearInterval(id);
  }, [ticking, offsetMs]);
  return now;
}

export function LiveAnswers({ view, live, blitz, compact = false, tilts = NO_TILTS, drafts = NO_DRAFTS, collapsed = false, offsetMs = 0 }: Props) {
  const duel = live.kind === 'duel';
  const queue = live.kind === 'blitz' && view.blitz?.instant !== true;
  // Власний темп «Хто я?» (12c): кожен рядок стоїть у списку з «підказка N/M», тож «Чекаємо» порожнє.
  const waiting = duel || queue ? [] : live.rows.filter((row) => !row.answered && row.progress?.kind !== 'clues');
  // Дуель: обидва дуелянти завжди, навіть без спроб.
  // Нахил першої картки (11d) теж показує рядок: ведучий бачить, куди її тягнуть, ще до першого ходу.
  // Живий вибір (12b) теж: рядок видно ще до відповіді й першого ходу.
  const shown = duel ? live.rows : live.rows.filter((row) => row.answered || started(row) || draftOf(row, drafts) !== undefined || tilting(row, tilts));
  const queueShown = blitz !== undefined && blitz !== null;
  // Командний бліц: чернетки тих, хто ще не в черзі, — під чергою.
  const queued = queueShown ? live.rows.filter((row) => draftOf(row, drafts) !== undefined) : [];
  const ticking = !collapsed && [...live.rows, ...(live.aside?.rows ?? [])].some((row) => draftOf(row, drafts) !== undefined);
  const now = useServerNow(ticking, offsetMs);
  const context: RowContext = { view, tilts, drafts, now };
  const count = !duel && (
    <p className="meta live-count">{queue ? t('blitzQueued', { count: view.blitz?.queue.length ?? 0 }) : t('answeredOf', { answered: live.answered, total: live.total })}</p>
  );
  const body = collapsed ? (
    <>
      {count}
      {queueShown && blitz}
    </>
  ) : (
    <>
      {count}
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
          {queued.length > 0 && <Rows rows={queued} {...context} />}
        </>
      ) : shown.length > 0 ? (
        <Rows rows={shown} {...context} />
      ) : (
        <p className="meta">{t('noResponses')}</p>
      )}
      {live.aside !== null && (
        <details className="live-aside">
          <summary>{t(live.aside.kind === 'ghosts' ? 'liveGhosts' : 'liveHall', { answered: live.aside.answered, total: live.aside.total })}</summary>
          <Rows rows={live.aside.rows} {...context} />
        </details>
      )}
    </>
  );
  if (compact) return <div className="live-answers is-compact">{body}</div>;
  return (
    <section id="live-answers" className={collapsed ? 'panel live-answers is-collapsed' : 'panel live-answers'} aria-labelledby="live-answers-title" tabIndex={-1}>
      <h2 id="live-answers-title">
        {t('liveTitle')}
        <HelpButton id="setting.live" />
      </h2>
      {body}
    </section>
  );
}
