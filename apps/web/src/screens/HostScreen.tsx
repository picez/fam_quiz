import { useEffect, useRef, useState } from 'react';
import { clueShare, revealShare, type Answer, type ClientToServerEvents, type Grade, type HostBoard, type HostView } from '@quiz/shared';
import { secondsLeft } from '../clock';
import { ChainBoard } from './ChainView';
import { SortBoard } from './SortView';
import { WallReveal } from './WallReveal';
import { WallTable } from './WallTable';
import { PollBars } from './PollBars';
import { HostCloud } from './HostCloud';
import { SurveyBoard } from './SurveyBoard';
import { answerText, correctText, markText, num, questionClass, questionLabel, roundLabel, streaksOf } from '../format';
import { errorText, t, type TextKey } from '../i18n';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import type { Send } from '../live/types';
import { BlitzCellNotes, Board, BoardLegend } from './Board';
import { TurnSchedule } from './TurnSchedule';
import { BoardIntro } from './Dice';
import { QuestionImage } from './QuestionImage';
import { QuestionAudio } from './QuestionAudio';
import { SliderScale } from './SliderScale';
import { PinBoard } from './PinBoard';
import { publicLeadMs, questionElapsedMs, useRevealProgress } from '../reveal';
import type { AudioCommand } from '../live/useGame';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { BlitzQueue } from './BlitzQueue';
import { useBlinkingRows, useVerdictBlink } from './verdict-blink';
import { InviteFriends } from './InviteFriends';
import { Timer, timerStatus, useTimeOver } from '../live/Timer';
import { Standings } from './Standings';
import { MenuLinks } from './MenuLinks';
import { DebuffPanel, debuffTagText, PointsPanel } from './HostPlayerTools';
import { BuffBadge, HintRequests, SharedOvertime, SpareMark } from './Buffs';
import { BuffToast, DebuffToast, LiveNotices } from '../live/LiveNotices';
import { SplashChip, useSplash } from '../live/Splash';
import { GuidePageView } from '../live/Guide';
import { HostDuelPanel } from './DuelView';
import { HelpButton } from '../help/HelpButton';
import { cellHelpId } from '../help/host-help';

interface Props {
  view: HostView;
  code: string;
  stageUrl: string;
  joinUrl: string;
  send: Send;
  /** Різниця «час сервера мінус час пристрою» для відліку до пропуску ходу. */
  offsetMs?: number;
  /** Чи відкрита сцена; без неї звук грає цей пульт. */
  stageOnline?: boolean;
  /** Остання команда звуку від ведучого (її бачить і цей пульт). */
  audioCommand?: AudioCommand | null;
}

type HostEvent = keyof ClientToServerEvents;

/** Єдина головна дія кожного етапу. */
const MAIN_ACTION: Partial<Record<HostView['phase'], { label: TextKey; event: HostEvent }>> = {
  lobby: { label: 'start', event: 'host:start' },
  guide: { label: 'next', event: 'host:next' },
  intro: { label: 'startRound', event: 'host:next' },
  question: { label: 'lock', event: 'host:lock' },
  locked: { label: 'reveal', event: 'host:next' },
  reveal: { label: 'next', event: 'host:next' },
  leaderboard: { label: 'nextQuestion', event: 'host:next' },
  round_end: { label: 'nextRound', event: 'host:next' },
};

/** Етапи, на яких раунд ще триває й його можна завершити достроково. */
const IN_ROUND: HostView['phase'][] = ['duel', 'intro', 'wager', 'board', 'question', 'locked', 'reveal', 'leaderboard'];

/** Рядок контексту: поточний раунд і (за потреби) тип запитання, кожне з «ⓘ». */
function HostContext({ round, question }: { round: NonNullable<HostView['round']>; question?: NonNullable<HostView['question']> }) {
  return (
    <p className="meta host-context">
      <span>{roundLabel(round.title, round.index, round.type)}</span>
      <HelpButton id={`round.${round.type}`} />
      {question !== undefined && (
        <>
          <span aria-hidden="true"> · </span>
          <span>{t(`type_${question.type}`)}</span>
          <HelpButton id={`question.${question.type}`} />
          {question.audio != null && (
            <>
              <span aria-hidden="true"> · </span>
              <span aria-hidden="true">🎵</span>
              <HelpButton id="setting.audio" />
            </>
          )}
          {question.reveal != null && (
            <>
              <span aria-hidden="true"> · </span>
              <span>{t(question.reveal === 'pixels' ? 'revealTag_pixels' : 'revealTag_blur')}</span>
              <HelpButton id="setting.reveal" />
            </>
          )}
        </>
      )}
    </p>
  );
}

/** «Хто я?» на пульті: усі підказки з позначками, поточна частка ціни й (усна клітинка) кнопка наступної. */
function HostClues({ view, clues, offsetMs, idle, onOpen }: { view: HostView; clues: string[]; offsetMs: number; idle: boolean; onOpen: () => void }) {
  const pub = view.question?.clues;
  const [, setTick] = useState(0);
  const ticking = pub != null && pub.nextAt !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 500);
    return () => clearInterval(id);
  }, [ticking]);
  if (pub == null) return null;
  const opened = pub.shown.length;
  const k = Math.max(1, opened);
  const now = Date.now() + offsetMs;
  const state = (index: number) => {
    if (index < opened) return t('clueOpened');
    if (pub.byHost) return t('clueClosed');
    // Пауза чи утримання: наступної миті немає, але підказки не закриті — час просто стоїть.
    if (pub.nextAt === null) return view.phase === 'question' ? t('cluePaused') : t('clueClosed');
    return t('clueIn', { seconds: Math.max(0, Math.ceil((pub.nextAt + (index - opened) * pub.intervalSeconds * 1000 - now) / 1000)) });
  };
  return (
    <div className="host-clues">
      <p className="meta">
        {t('type_clues')}
        <HelpButton id="question.clues" />
      </p>
      <ol>
        {clues.map((text, index) => (
          <li key={index} className={index < opened ? undefined : 'is-closed'}>
            <span className="clue-n">{index + 1}</span>
            <span>{text}</span>
            <span className="clue-state">{state(index)}</span>
          </li>
        ))}
      </ol>
      <p className="meta">{t('cluesHostNow', { k, n: pub.total, percent: Math.round(clueShare(pub.total, k) * 100) })}</p>
      {pub.byHost && view.phase === 'question' && (
        <div className="panel-actions">
          {opened < pub.total ? (
            <button type="button" className="btn" disabled={idle} onClick={onOpen}>
              {t('clueOpen', { n: opened + 1 })}
            </button>
          ) : (
            <button type="button" className="btn" disabled>
              {t('cluesAllOpen')}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Відлік до автоматичного пропуску ходу відсутнього гравця. */
function SkipNote({ board, view, offsetMs }: { board: HostBoard; view: HostView; offsetMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  const running = board.skipAt !== null;
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running, board.skipAt]);

  const chooser = board.turn === null ? undefined : view.players.find((player) => player.id === board.turn?.playerId);
  if (chooser === undefined || chooser.connected) return null;
  const name = chooser.nickname;
  if (board.skipAt !== null) {
    const seconds = secondsLeft({ endsAt: board.skipAt, remainingMs: null }, offsetMs, now) ?? 0;
    return <p className="banner is-away">{t(view.phase === 'question' ? 'answererAwayClose' : 'chooserAwaySkip', { name, seconds })}</p>;
  }
  return view.paused && view.phase === 'board' ? <p className="banner is-away">{t('chooserAwayPaused', { name })}</p> : null;
}

/** Сцена, якої нема вже STAGE_GONE_MS: короткий розрив (перепідключення, оновлення сцени) не вмикає звук на пульті. */
export const STAGE_GONE_MS = 3000;

function useStageGone(stageOnline: boolean): boolean {
  // Якщо сцени немає вже при відкритті пульту, чекати нічого.
  const [gone, setGone] = useState(!stageOnline);
  useEffect(() => {
    if (stageOnline) {
      setGone(false);
      return;
    }
    const id = setTimeout(() => setGone(true), STAGE_GONE_MS);
    return () => clearTimeout(id);
  }, [stageOnline]);
  return gone && !stageOnline;
}

export function HostScreen({ view, code, stageUrl, joinUrl, send, offsetMs = 0, stageOnline = true, audioCommand = null }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { phase, correct, round } = view;
  const inRound = round !== null && IN_ROUND.includes(phase);
  const lastRound = round !== null && round.index === round.total - 1;
  const live = phase !== 'lobby' && phase !== 'finished';
  const final = view.final;
  const isFinal = round?.type === 'final';
  // Опитування й хмара не мають відповіді: розкриття — це результати.
  const votes = view.question?.type === 'poll' || view.question?.type === 'wordcloud';
  const base = phase === 'locked' && votes ? { label: 'revealVotes' as const, event: 'host:next' as const } : MAIN_ACTION[phase];
  // «Як грати»: на останній сторінці «Далі» веде до гри, тож окрема «До гри» вже не потрібна.
  const guide = phase === 'guide' ? view.guide : null;
  const guideLast = guide !== null && guide.page >= guide.pages.length - 1;
  // У фіналі свої підписи головної кнопки; без розкритих гравців «Далі» лишається звичайним.
  const duelStage = view.duel?.stage ?? null;
  const main =
    duelStage === 'declared' && (phase === 'intro' || phase === 'reveal' || phase === 'leaderboard' || phase === 'round_end')
      ? { label: 'duelStart' as const, event: 'host:next' as const }
      : phase === 'duel'
        ? duelStage === 'answer'
          ? { label: view.duel?.ending === true ? ('duelResults' as const) : ('duelNextQuestion' as const), event: 'host:next' as const }
          : duelStage === 'result'
            ? { label: 'duelContinue' as const, event: 'host:next' as const }
            : undefined
        : isFinal && phase === 'intro'
      ? { label: 'finalStart' as const, event: 'host:next' as const }
      : isFinal && phase === 'wager'
        ? { label: 'finalShowQuestion' as const, event: 'host:next' as const }
        : isFinal && phase === 'reveal' && final !== null && final.left === 0 && final.splitNext
          ? { label: 'finalSplitBank' as const, event: 'host:next' as const }
          : isFinal && phase === 'reveal' && final !== null && final.left > 0
            ? { label: 'finalNextPlayer' as const, event: 'host:next' as const }
            : phase === 'guide' && guideLast
              ? { label: 'guideToGame' as const, event: 'host:next' as const }
              : base;
  const blitz = view.blitz;
  const board = view.board;
  // «100 до 1» на розкритті: головна кнопка спершу відкриває рядки по одному.
  const surveyStep = phase === 'reveal' && view.question?.type === 'survey' && view.survey !== null && view.survey.shown < view.survey.total;
  const chooserId = board?.turn?.playerId ?? null;
  // У полі оцінка йде одразу після відповіді вибравшого: у запитанні лише коли ведучий оцінює вручну.
  // Сортування й стіна рахують бали самі: ручної оцінки в них немає (сервер її відхиляє).
  const canGradeBoard =
    board !== null &&
    blitz === null &&
    view.question !== null &&
    view.question.type !== 'sort' &&
    view.question.type !== 'wall' &&
    chooserId !== null &&
    ((phase === 'question' && board.manual && board.cell?.answerMode === 'voice') || phase === 'locked' || phase === 'reveal');
  const voiceCell = blitz === null && board?.cell?.answerMode === 'voice';
  // Відповідь з телефона, що чекає на рішення ведучого (помаранчева).
  // На усній клітинці помаранчева лише позначка ведучого: приймати чи перевибирати там нічого.
  const pending = phase === 'question' && !voiceCell && view.spotlight !== null && view.spotlight.grade === null ? view.spotlight : null;
  const manualPending = pending !== null && ((board !== null && board.manual) || (blitz !== null && blitz.manual));
  // На бліц-клітинці відповідає голова черги, а не вибравший.
  const instant = blitz?.instant === true;
  const answering = blitz !== null ? (instant ? null : (blitz.queue[0] ?? null)) : (board?.turn ?? null);
  // Під час заставки залишок більший за ліміт (таймер стартує після неї): обрізаємо до повного часу, як Timer.
  const secondsRaw = phase === 'question' ? secondsLeft(view, offsetMs, Date.now()) : null;
  const secondsNow = secondsRaw !== null && view.limitMs !== null ? Math.min(secondsRaw, Math.ceil(view.limitMs / 1000)) : secondsRaw;
  const timeShown = phase === 'question' && (view.endsAt !== null || view.remainingMs !== null);
  // Спільний час сплив, а розкриття чекає на гравця з додатковим часом: головна кнопка — «Не чекати» (та сама host:lock).
  const sharedOver = useTimeOver(view.endsAt, view.remainingMs, offsetMs);
  // Звук без сцени грає тут: починається після заставки запитання, як на сцені.
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const stageGone = useStageGone(stageOnline);
  const underSplash = phase === 'question' && (splashNow?.splash.kind === 'question' || splashNow?.splash.kind === 'cell');
  // Поступ проявлення потрібен лише запитанню з проявленням: решта не перемальовується щоразу.
  const revealP = useRevealProgress(view, view.question?.reveal ? view.question : null, offsetMs);
  const noWait = phase === 'question' && view.overtime.length > 0 && sharedOver;
  const debuffKinds = view.allowed.debuffs;
  // У бліці оцінка остаточна: змінювати її на reveal не можна.
  const clip = view.question?.audio?.clip ?? null;
  const canGrade = phase === 'reveal' && correct?.type === 'text' && round?.type !== 'blitz' && !isFinal;

  // Лічильники опитування: з відповідей, ще до розкриття.
  const voteCounts: Record<string, number> = {};
  for (const response of view.responses) {
    if (response.answer?.type === 'poll') voteCounts[response.answer.optionId] = (voteCounts[response.answer.optionId] ?? 0) + 1;
  }

  const act = async (event: HostEvent, payload?: unknown) => {
    const result = await send(event, payload);
    setError(result.ok ? null : errorText(result.error));
  };

  const blink = useVerdictBlink(view.spotlight);
  const blinking = useBlinkingRows(blitz?.rows ?? [], view.questionIndex);
  // Позначка варіанта, названого вголос: звичайна усна клітинка, single/multi/boolean, поки відповідь не розкрита.
  const questionType = view.question?.type;
  const canName =
    (phase === 'question' || phase === 'locked') &&
    board?.cell?.answerMode === 'voice' &&
    board.cell.kind === 'normal' &&
    (questionType === 'single' || questionType === 'multi' || questionType === 'boolean');
  const name = (answer: Answer | null) => void act('host:name', { answer });

  // Кроки гри йдуть по одному: подвійний дотик не має перескочити етап.
  const [stepping, setStepping] = useState(false);
  const steppingRef = useRef(false);
  const step = (event: HostEvent) => {
    if (steppingRef.current) return;
    const release = () => {
      steppingRef.current = false;
      setStepping(false);
    };
    steppingRef.current = true;
    setStepping(true);
    // Якщо підтвердження загубилося, кнопка не має лишитися заблокованою назавжди.
    const fallback = setTimeout(release, 3000);
    void act(event).finally(() => {
      clearTimeout(fallback);
      release();
    });
  };

  const endGame = () => {
    if (window.confirm(t('endConfirm'))) void act('host:end');
  };

  const endRound = () => {
    // В останньому раунді завершення раунду є завершенням гри.
    if (window.confirm(t(lastRound ? 'endConfirm' : 'endRoundConfirm'))) void act('host:end-round');
  };

  const judge = (playerId: string, correct: boolean) => void act('host:judge', { playerId, correct });

  const adjust = (seconds: number) => void act('host:time', { seconds });

  const grade = (playerId: string, value: Grade) => void act('host:override', { playerId, grade: value });

  // Порядок кола: позиції міняються місцями, ведучий бачить результат одразу.
  // Поки відповідь не прийшла, кнопки вимкнені: інакше другий дотик піде зі старого порядку.
  const [ordering, setOrdering] = useState(false);
  const orderingRef = useRef(false);
  const reorder = (event: HostEvent, payload?: unknown) => {
    if (orderingRef.current) return;
    const release = () => {
      orderingRef.current = false;
      setOrdering(false);
    };
    orderingRef.current = true;
    setOrdering(true);
    const fallback = setTimeout(release, 3000);
    void act(event, payload).finally(() => {
      clearTimeout(fallback);
      release();
    });
  };
  // «Прийняти» й «Перевибрати» називають гравця й ідуть по одному: поки підтвердження не прийшло,
  // другий дотик не має зачепити наступну відповідь черги бліцу.
  const [deciding, setDeciding] = useState(false);
  const decidingRef = useRef(false);
  const decide = (event: 'host:accept' | 'host:repick', playerId: string) => {
    if (decidingRef.current) return;
    const release = () => {
      decidingRef.current = false;
      setDeciding(false);
    };
    decidingRef.current = true;
    setDeciding(true);
    const fallback = setTimeout(release, 3000);
    void act(event, { playerId }).finally(() => {
      clearTimeout(fallback);
      release();
    });
  };

  // Поки тур кидків триває, раунд не починається; ведучий може кинути за тих, хто лишився, або впорядкувати вручну.
  const diceRolling = phase === 'intro' && board !== null && board.dice !== null && !board.dice.done;

  const move = (from: number, to: number) => {
    if (board === null) return;
    const ids = board.order.map((entry) => entry.playerId);
    [ids[from], ids[to]] = [ids[to], ids[from]];
    reorder('host:order', { playerIds: ids });
  };

  const [tools, setTools] = useState<{ playerId: string; kind: 'points' | 'debuff' } | null>(null);
  const toggleTools = (playerId: string, kind: 'points' | 'debuff') =>
    setTools((open) => (open?.playerId === playerId && open.kind === kind ? null : { playerId, kind }));

  const kick = (playerId: string, name: string) => {
    if (window.confirm(t('kickConfirm', { name }))) void act('host:kick', { playerId });
  };

  return (
    <main className="app host">
      <LiveNotices>
        <BuffToast view={view} offsetMs={offsetMs} />
        <DebuffToast notice={view.debuffNotice} offsetMs={offsetMs} />
      </LiveNotices>
      {/* Пульт заставкою не закривається: лише значок position: fixed у правому верхньому куті. */}
      <SplashChip view={view} offsetMs={offsetMs} />
      <header className="bar">
        <span>{t('hostTitle')}</span>
        <strong className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t('paused')}
        </p>
      )}

      <p className="meta">
        {t(`phase_${phase}`)}
        {round !== null && round.total > 1 && (phase === 'intro' || phase === 'round_end') && `, ${t('roundOf', { index: round.index + 1, total: round.total })}`}
        {view.questionIndex >= 0 && phase !== 'intro' && phase !== 'round_end' && phase !== 'board' && phase !== 'duel' && `, ${questionLabel(round, view.questionIndex, view.total)}`}
        {phase === 'question' && board === null &&
          `, ${blitz === null ? t('answeredOf', { answered: view.answeredCount, total: view.playerCount }) : instant ? t('answeredOf', { answered: blitz.rows.length, total: view.playerCount }) : t('blitzQueued', { count: blitz.queue.length })}`}
      </p>

      {view.surveySkipped.map((text) => (
        <p key={text} className="host-warning" role="alert">
          {t('surveySkipped', { text })}
        </p>
      ))}

      {guide !== null && (
        <section className="panel">
          <GuidePageView guide={guide} size="host" />
        </section>
      )}

      {phase === 'intro' && round !== null && (
        <section className="panel">
          {round.total > 1 && <p className="meta">{t('roundOf', { index: round.index + 1, total: round.total })}</p>}
          <div className="with-help">
            <h1 className="question">{roundLabel(round.title, round.index, round.type)}</h1>
            <HelpButton id={`round.${round.type}`} />
          </div>
          <RoundFacts round={round} total={view.total} />
          <RoundBriefing brief={round.brief} description={round.description} newcomers={view.newcomers} />
        </section>
      )}

      {phase === 'intro' && board !== null && (
        <section className="panel">
          <h2>{t('boardOrder')}</h2>
          <ol className="rows">
            {board.order.map((entry, index) => (
              <li key={entry.playerId}>
                <span className="rank">{index + 1}</span>
                <span className="name">{entry.nickname}</span>
                <button
                  type="button"
                  className="btn btn-small btn-icon"
                  aria-label={t('turnUp', { name: entry.nickname })}
                  disabled={ordering || index === 0}
                  onClick={() => move(index, index - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-small btn-icon"
                  aria-label={t('turnDown', { name: entry.nickname })}
                  disabled={ordering || index === board.order.length - 1}
                  onClick={() => move(index, index + 1)}
                >
                  ↓
                </button>
              </li>
            ))}
          </ol>
          {/* Не липкий .actions: під кнопками ще кидки й розклад, футер не має їх накривати. */}
          <div className="panel-actions">
            <button type="button" className="btn" disabled={ordering || diceRolling} onClick={() => reorder('host:dice')}>
              {t('diceStart')}
            </button>
            {diceRolling && (
              <button type="button" className="btn" disabled={ordering} onClick={() => reorder('host:roll')}>
                {t('diceRollForRest')}
              </button>
            )}
            <button
              type="button"
              className="btn"
              disabled={ordering}
              onClick={() => reorder('host:order', { playerIds: view.players.map((player) => player.id) })}
            >
              {t('orderByJoin')}
            </button>
          </div>
          <BoardIntro board={board} />
          {diceRolling && board.dice !== null && (
            <p className="meta">
              {t('diceStartLocked', {
                names: board.dice.rows
                  .filter((row) => row.waiting)
                  .map((row) => row.nickname)
                  .join(', '),
              })}
            </p>
          )}
        </section>
      )}

      {phase === 'board' && board !== null && (
        <section className="panel">
          {round !== null && <HostContext round={round} />}
          {board.turn !== null && <p className="lead">{t('boardChooser', { name: board.turn.nickname })}</p>}
          <SkipNote board={board} view={view} offsetMs={offsetMs} />
          <Board board={board} onPick={(cellId) => void act('host:pick', { cellId })} />
          <BoardLegend board={board} />
          <TurnSchedule board={board} heading={t('turnQueueTitle')} limit={3} />
          <div className="panel-actions">
            <button type="button" className="btn" onClick={() => void act('host:skip')}>
              {t('skipTurn')}
            </button>
          </div>
        </section>
      )}

      {view.question !== null && phase !== 'finished' && (
        <section className="panel">
          {round !== null && <HostContext round={round} question={view.question} />}
          {board !== null && board.cell !== null && (
            <p className="meta">
              {t('cellTitle', { category: board.cell.category, price: board.cell.price })}
              {board.cell.mark !== 'none' && <span className="cell-mark">{markText(board.cell.mark)}</span>}
              {board.cell.kind === 'blitz' && <span className="cell-mark">{t('cellBlitz')}</span>}
              <HelpButton id={cellHelpId(board.cell)} />
            </p>
          )}
          {board !== null && <BlitzCellNotes board={board} instant={view.blitz?.instant === true} />}
          {answering !== null && <p className="lead">{t('boardAnswering', { name: answering.nickname })}</p>}
          {phase === 'question' && board !== null && <SkipNote board={board} view={view} offsetMs={offsetMs} />}
          <h1 className={questionClass(view.question.text)}>{view.question.text}</h1>
          {view.question.pin === null && <QuestionImage url={view.question.imageUrl} />}
          {view.question.reveal !== null && view.question.imageUrl !== null && (
            <p className="meta reveal-tag">
              {t(view.question.reveal === 'pixels' ? 'revealTag_pixels' : 'revealTag_blur')}
              {phase === 'question' && ` · ${t('revealNow', { percent: Math.round(revealShare(revealP, 1) * 100) })}`}
            </p>
          )}
          <YouTubePlayer video={view.question.video} masked={phase !== 'reveal'} />
          {(blitz !== null || board !== null) && (
            <>
              {canName && <p className="meta">{t('nameHint')}</p>}
              <SpotlightChoices
                question={view.question}
                spotlight={view.spotlight}
                reveal={phase === 'reveal' ? correct : null}
                blink={blink}
                voice={board?.cell?.answerMode === 'voice'}
                onName={canName ? name : undefined}
                removed={view.removed}
              />
            </>
          )}
          {view.sliderMarks !== null && view.question.slider !== null && correct?.type === 'slider' && (
            <SliderScale slider={view.question.slider} correct={correct.correct} tolerance={correct.tolerance} zeroBeyond={correct.zeroBeyond} marks={view.sliderMarks} highlight={view.sliderMarks[0]?.playerId} />
          )}
          {correct?.type === 'clues' && view.question.clues !== null && <HostClues view={view} clues={correct.clues} offsetMs={offsetMs} idle={view.paused || view.held || underSplash} onOpen={() => void act('host:clue')} />}
          {correct?.type === 'pin' && view.question.pin !== null && (
            <div className="host-pin">
              <p className="meta">
                {t('type_pin')}
                <HelpButton id="question.pin" />
              </p>
              <PinBoard
                pin={view.question.pin}
                imageUrl={view.question.imageUrl}
                marks={view.pinMarks ?? []}
                target={correct.target}
                radii={{ full: correct.fullRadius, zero: correct.zeroRadius }}
                highlight={phase === 'reveal' ? view.pinMarks?.[0]?.playerId : undefined}
              />
            </div>
          )}
          {correct !== null && correct.type !== 'wall' && correct.type !== 'poll' && correct.type !== 'wordcloud' && correct.type !== 'survey' && <p className="answer">{t('correctAnswer', { answer: correctText(correct, view.question.choices) })}</p>}
          {correct?.hint !== undefined && <p className="meta hint-known">{t('hintKnown', { hint: correct.hint })}</p>}
        </section>
      )}

      {clip !== null && (phase === 'question' || phase === 'locked' || phase === 'reveal') && (
        <section className="panel host-audio">
          <p className="meta">{stageGone ? t('audioHere') : t('audioOnStage')}</p>
          <div className="panel-actions">
            <button type="button" className="btn btn-small" onClick={() => void act('host:audio', { action: 'replay' })}>
              {t('audioReplay')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => void act('host:audio', { action: 'stop' })}>
              {t('audioStop')}
            </button>
          </div>
          {stageGone && (
            <QuestionAudio
              key={`${view.round?.index ?? 0}:${view.questionIndex}`}
              clip={clip}
              questionKey={`${view.round?.index ?? 0}:${view.questionIndex}`}
              ready={phase === 'question' && !underSplash && !view.paused}
              paused={view.paused}
              command={audioCommand}
              elapsedMs={() => questionElapsedMs(view, Date.now() + offsetMs)}
              splash={underSplash}
            />
          )}
        </section>
      )}

      {timeShown && (
        <div className="panel-actions host-time">
          <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} leadMs={view.question === null ? 0 : publicLeadMs(view.question)} />
          {view.overtime.length > 0 && <SharedOvertime view={view} offsetMs={offsetMs} />}
          <button type="button" className="btn btn-small" disabled={secondsNow !== null && secondsNow <= 5} onClick={() => adjust(-15)}>
            {t('timeMinus')}
          </button>
          <button type="button" className="btn btn-small" disabled={secondsNow !== null && secondsNow >= 120} onClick={() => adjust(15)}>
            {t('timePlus')}
          </button>
        </div>
      )}

      {pending !== null && (
        <section className="panel">
          <h2>{t('pendingTitle')}</h2>
          <ul className="rows">
            <li>
              <span className="name">{pending.nickname}</span>
              <span className="given">{answerText(pending.answer, correct, view.question?.choices)}</span>
              <span className="tag is-pending">{t('pendingTitle')}</span>
            </li>
          </ul>
          <div className="actions">
            {!manualPending && (
              <button type="button" className="btn btn-small" disabled={deciding} onClick={() => decide('host:accept', pending.playerId)}>
                {t('acceptAnswer')}
              </button>
            )}
            {manualPending && (
              <>
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => (blitz !== null ? judge(pending.playerId, true) : grade(pending.playerId, 'correct'))}
                >
                  {t('judgeCorrect')}
                </button>
                {blitz === null && round?.partial === true && (
                  <button type="button" className="btn btn-small" onClick={() => grade(pending.playerId, 'partial')}>
                    {t('gradePartial')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-small"
                  onClick={() => (blitz !== null ? judge(pending.playerId, false) : grade(pending.playerId, 'wrong'))}
                >
                  {t('judgeWrong')}
                </button>
              </>
            )}
            <button type="button" className="btn btn-small" disabled={deciding} onClick={() => decide('host:repick', pending.playerId)}>
              {t('repick')}
            </button>
          </div>
        </section>
      )}

      {phase === 'wager' && final !== null && (
        <section className="panel">
          <h2>{t('finalPlaced', { placed: final.placed, total: final.total })}</h2>
          <ul className="rows wager-list">
            {final.wagers.map((entry) => (
              <li key={entry.playerId}>
                <span className="name">{entry.nickname}</span>
                <span className="given">{entry.wager === null ? t('finalThinking') : num(entry.wager)}</span>
                {/* Стале місце для «ва-банк»: межа ставки в усіх рядках стоїть в одній колонці. */}
                <span className="allin-slot">{entry.allIn && <span className="allin-tag">{t('finalAllInTag')}</span>}</span>
                <span className="meta">{t('finalLimit', { limit: num(entry.limit) })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {final !== null && (phase === 'locked' || phase === 'reveal') && final.pending.length > 0 && (
        <section className="panel">
          <h2>{t('pendingTitle')}</h2>
          <ul className="rows">
            {final.pending.map((entry) => (
              <li key={entry.playerId}>
                <span className="name">{entry.nickname}</span>
                <span className="given">{answerText(entry.answer, correct, view.question?.choices)}</span>
                <span className="row-actions">
                  <button type="button" className="btn btn-small" onClick={() => grade(entry.playerId, 'correct')}>
                    {t('finalGradeCorrect')}
                  </button>
                  <button type="button" className="btn btn-small" onClick={() => grade(entry.playerId, 'wrong')}>
                    {t('finalGradeWrong')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {phase === 'reveal' && final !== null && (
        <section className="panel">
          <h2>{t('finalRevealed', { shown: final.shown.length, total: final.total })}</h2>
          {final.mode === 'bank' && (
            <p className="bank-meter" role="status">
              <span className="bank-meter-text">
                {final.split === null
                  ? t('finalBank', { bank: num(final.bank) })
                  : final.split.refund
                    ? t('finalRefundMeter')
                    : t('finalBankSplit', { bank: num(final.split.bank) })}
              </span>
            </p>
          )}
          <ul className="rows wager-list">
            {final.entries.map((entry) => {
              const revealed = final.shown.some((shown) => shown.playerId === entry.playerId);
              const waiting = final.pending.some((item) => item.playerId === entry.playerId);
              return (
                <li key={entry.playerId} className={entry.grade === 'correct' ? 'is-correct' : 'is-wrong'}>
                  <span className="name">{entry.nickname}</span>
                  <span className="given">{entry.answer === null ? t('finalSilent') : answerText(entry.answer, correct, view.question?.choices)}</span>
                  <span className="tag">{num(entry.wager)}</span>
                  <span className="score">{`${num(entry.before)} → ${num(entry.after)}`}</span>
                  <span className="allin-slot">{entry.allIn && <span className="allin-tag">{t('finalAllInTag')}</span>}</span>
                  {/* Місце частки зарезервоване з першого розкриття: розподіл не зсуває рядки. */}
                  {final.mode === 'bank' && (
                    <span className="wager-share">{entry.share === null ? '' : t('finalBankShare', { share: num(entry.share) })}</span>
                  )}
                  {revealed && (
                    <span className={entry.grade === 'correct' ? 'tag is-correct' : 'tag is-wrong'}>{entry.grade === 'correct' ? '✓' : '✗'}</span>
                  )}
                  {entry.answer !== null && !waiting && (
                    <button
                      type="button"
                      className="btn btn-small"
                      onClick={() => grade(entry.playerId, entry.grade === 'correct' ? 'wrong' : 'correct')}
                    >
                      {t(entry.grade === 'correct' ? 'finalGradeWrong' : 'finalGradeCorrect')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {view.question !== null && live && blitz !== null && instant && (
        <section className="panel">
          <h2>{t('blitzQueue')}</h2>
          <BlitzQueue rows={blitz.rows} reserve={view.playerCount} question={view.question} blinking={blinking} highlightHead closed={phase !== 'question'} />
        </section>
      )}

      {view.question !== null && live && blitz !== null && !instant && (
        <>
          {/* Після закриття запитання черги вже немає: лишаються тільки спроби. */}
          {phase === 'question' && (
            <section className="panel">
              <h2>{t('blitzQueue')}</h2>
              {blitz.queue.length === 0 ? (
                <p className="meta">{t('noResponses')}</p>
              ) : (
                <ul className="rows">
                  {blitz.queue.map((entry, index) => (
                    <li key={entry.playerId}>
                      <span className="name">{entry.nickname}</span>
                      {blitz.voice && index === 0 ? (
                        <span className="row-actions">
                          <button type="button" className="btn btn-small" onClick={() => judge(entry.playerId, true)}>
                            {t('judgeCorrect')}
                          </button>
                          <button type="button" className="btn btn-small" onClick={() => judge(entry.playerId, false)}>
                            {t('judgeWrong')}
                          </button>
                        </span>
                      ) : (
                        <span className="given">{entry.answer === null ? t('blitzTyping') : answerText(entry.answer, correct, view.question?.choices)}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          {blitz.attempts.length > 0 && (
            <section className="panel">
              <h2>{t('blitzAttemptsTitle')}</h2>
              <ul className="rows">
                {blitz.attempts.map((attempt, index) => (
                  <li key={`${attempt.playerId}-${index}`}>
                    <span className="name">{attempt.nickname}</span>
                    <span className="given">{attempt.answer === null ? t('blitzMissed') : answerText(attempt.answer, correct, view.question?.choices)}</span>
                    <span className={attempt.grade === 'wrong' ? 'tag is-wrong' : 'tag is-correct'}>
                      {t(attempt.grade === 'correct' ? 'accepted' : 'rejected')}
                    </span>
                    <span className="score">{num(attempt.points)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {phase === 'question' && view.hints.length > 0 && (
        <section className="panel">
          <HintRequests hints={view.hints} send={send} onError={setError} />
        </section>
      )}

      {view.question !== null && live && board !== null && blitz === null && (
        <section className="panel">
          <h2>{t('responses')}</h2>
          <ul className="rows">
            {board.turn !== null && (
              <li>
                <span className="name">{board.turn.nickname}</span>
                {(() => {
                  const response = view.responses.find((entry) => entry.playerId === chooserId);
                  const given = response?.answer ?? board.answer;
                  return (
                    <>
                      <span className="given">
                        {given === null
                          ? board.cell?.answerMode === 'voice'
                            ? t('answeredAloud')
                            : '—'
                          : response !== undefined && response.spare !== null
                            ? answerText(given, response.spare)
                            : answerText(given, correct, view.question?.choices)}
                      </span>
                      {response !== undefined && (
                        <>
                          {response.buff !== null && <BuffBadge kind={response.buff} />}
                          {response.spare !== null && <SpareMark spare={response.spare} />}
                          {response.grade !== null && (
                            <>
                              <span className={response.grade === 'wrong' ? 'tag is-wrong' : 'tag is-correct'}>
                                {t(response.grade === 'partial' ? 'partialTag' : response.accepted ? 'accepted' : 'rejected')}
                              </span>
                              <span className="score">{num(response.points)}</span>
                            </>
                          )}
                        </>
                      )}
                    </>
                  );
                })()}
              </li>
            )}
          </ul>
          {canGradeBoard && chooserId !== null && (
            <div className="actions">
              <button type="button" className="btn btn-small" onClick={() => grade(chooserId, 'correct')}>
                {t('accept')}
              </button>
              {round?.partial === true && (
                <button type="button" className="btn btn-small" onClick={() => grade(chooserId, 'partial')}>
                  {t('gradePartial')}
                </button>
              )}
              <button type="button" className="btn btn-small" onClick={() => grade(chooserId, 'wrong')}>
                {t('gradeWrong')}
              </button>
            </div>
          )}
        </section>
      )}

      {view.chain !== null && (
        <section className="panel">
          <h2>{t('chainTitle')}</h2>
          <ChainBoard chain={view.chain} reveal={phase === 'reveal'} />
        </section>
      )}

      {view.sort !== null && (
        <section className="panel">
          <h2>{t('sortTitle')}</h2>
          <SortBoard sort={view.sort} reveal={phase === 'reveal'} />
        </section>
      )}

      {/* Стіна: ведучий бачить групи завжди й поступ кожного гравця наживо. */}
      {correct?.type === 'wall' && (
        <section className="panel host-wall">
          <h2>
            {t('hostWallTitle')}
            <HelpButton id="question.wall" />
          </h2>
          <WallReveal question={correct} />
          {view.wall !== null && <WallTable info={view.wall} />}
        </section>
      )}

      {view.survey !== null && view.question?.type === 'survey' && (
        <section className="panel host-survey">
          <h2>
            {t('hostSurveyTitle')}
            <HelpButton id="question.survey" />
          </h2>
          <p className="meta">{t(view.survey.source === 'cloud' ? 'surveyFromCloud' : 'surveyFromHost')}</p>
          <SurveyBoard info={view.survey} showClosed />
        </section>
      )}

      {correct?.type === 'poll' && view.question !== null && (
        <section className="panel host-poll">
          <h2>
            {t('hostPollTitle')}
            <HelpButton id="question.poll" />
          </h2>
          <PollBars choices={view.question.choices} counts={voteCounts} total={view.responses.length} />
        </section>
      )}

      {view.question?.type === 'wordcloud' && view.cloud !== null && (
        <section className="panel">
          <h2>
            {t('hostCloudTitle')}
            <HelpButton id="question.wordcloud" />
          </h2>
          <p className="meta">{t('cloudHideHint')}</p>
          <HostCloud words={view.cloud} onHide={(key, hidden) => void act('host:cloud-hide', { key, hidden })} />
        </section>
      )}

      {/* Під час класичного ланцюжка бали ще не пораховано, а поступ уже показує панель «Ланцюжок». */}
      {view.question !== null && live && blitz === null && board === null && !(isFinal && phase === 'reveal') && !((view.chain !== null || view.sort !== null || correct?.type === 'wall') && !isFinal && phase === 'question') && (
        <section className="panel">
          <h2>{t('responses')}</h2>
          {view.responses.length === 0 && !isFinal ? (
            <p className="meta">{t('noResponses')}</p>
          ) : (
            <ul className="rows">
              {/* До розкриття записи фіналу містять лише тих, хто відповів: мовчазних видно як гравці мінус відповіді. */}
              {isFinal &&
                view.players
                  .filter((player) => !view.responses.some((response) => response.playerId === player.id))
                  .map((player) => (
                    <li key={`silent-${player.id}`}>
                      <span className="name">{player.nickname}</span>
                      <span className="given">{t(phase === 'question' ? 'finalThinking' : 'finalSilent')}</span>
                    </li>
                  ))}
              {view.responses.map((response) => (
                <li key={response.playerId}>
                  <span className="name">{response.nickname}</span>
                  {response.buff !== null && <BuffBadge kind={response.buff} />}
                  {response.spare !== null && <SpareMark spare={response.spare} />}
                  <span className="given">
                    {response.spare !== null ? answerText(response.answer, response.spare) : answerText(response.answer, correct, view.question?.choices)}
                  </span>
                  {response.clue !== null && <span className="meta">{t('clueAt', { n: response.clue })}</span>}
                  {/* У фіналі вердикт і бали з'являються лише на розкритті: до того в рядку тільки відповідь. */}
                  {!isFinal && response.grade !== null && (
                    <>
                      <span className={response.grade === 'wrong' ? 'tag is-wrong' : 'tag is-correct'}>
                        {t(response.grade === 'partial' ? 'partialTag' : response.accepted ? 'accepted' : 'rejected')}
                        {response.overridden && `, ${t('changedByHost')}`}
                      </span>
                      <span className="score">{num(response.points)}</span>
                    </>
                  )}
                  {response.streakBonus > 0 && <span className="streak-bonus">{t('streakBonusLine', { points: response.streakBonus })}</span>}
                  {canGrade && (
                    <>
                      {response.grade !== 'correct' && (
                        <button type="button" className="btn btn-small" onClick={() => grade(response.playerId, 'correct')}>
                          {t('accept')}
                        </button>
                      )}
                      {round?.partial === true && response.grade !== 'partial' && (
                        <button type="button" className="btn btn-small" onClick={() => grade(response.playerId, 'partial')}>
                          {t('gradePartial')}
                        </button>
                      )}
                      {response.grade !== 'wrong' && (
                        <button type="button" className="btn btn-small" onClick={() => grade(response.playerId, 'wrong')}>
                          {t('reject')}
                        </button>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {view.duel !== null && <HostDuelPanel view={view} offsetMs={offsetMs} send={send} onError={setError} />}

      {phase === 'round_end' && round !== null && (
        <section className="panel">
          <h2>{t('roundResults', { index: round.index + 1 })}</h2>
          <Standings standings={view.standings} streaks={streaksOf(view.players)} />
        </section>
      )}

      {phase === 'finished' ? (
        <section className="panel">
          <h2>{t('gameOver')}</h2>
          <Standings standings={view.standings} />
          <MenuLinks role="host" />
        </section>
      ) : (
        <section className="panel">
          <h2>{`${t('players')}: ${view.players.length}`}</h2>
          <ul className="rows">
            {view.players.map((player) => (
              <li key={player.id} className="player-row">
                <span className="name">{player.nickname}</span>
                {!player.connected && <span className="tag is-wrong">{t('disconnected')}</span>}
                {player.debuff !== null && <span className="tag debuff-tag">{debuffTagText(player.debuff)}</span>}
                {player.streak >= 2 && <span className="streak">{t('streakMark', { count: player.streak })}</span>}
                <span className="score">{num(player.score)}</span>
                {live &&
                  (debuffKinds.length > 0 ? (['points', 'debuff'] as const) : (['points'] as const)).map((kind) => (
                    <button
                      key={kind}
                      type="button"
                      className="btn btn-small"
                      aria-expanded={tools?.playerId === player.id && tools.kind === kind}
                      onClick={() => toggleTools(player.id, kind)}
                    >
                      {t(kind)}
                    </button>
                  ))}
                <button type="button" className="btn btn-small" onClick={() => kick(player.id, player.nickname)}>
                  {t('kick')}
                </button>
                {live && tools?.playerId === player.id && (tools.kind === 'points' ? <PointsPanel player={player} send={send} onError={setError} /> : <DebuffPanel player={player} kinds={debuffKinds} send={send} onError={setError} />)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {phase === 'lobby' && <InviteFriends code={code} />}

      <nav className="links">
        <a href={stageUrl} target="_blank" rel="noreferrer">
          {t('stageLink')}
        </a>
        <a href="/help" target="_blank" rel="noreferrer">
          {t('helpLink')}
        </a>
        <span className="meta">{`${t('joinLink')}: ${joinUrl}`}</span>
      </nav>

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <footer className="actions">
        {live && (
          <>
            {/* Під час дуелі раунд не завершують: дуель могла початися на заставці, і раунд пропустився б увесь. Вихід — «Скасувати дуель». */}
            {inRound && !lastRound && phase !== 'duel' && (
              <button type="button" className="btn btn-danger" onClick={endRound}>
                {t('endRound')}
              </button>
            )}
            <button type="button" className="btn btn-danger" onClick={inRound && lastRound ? endRound : endGame}>
              {t('end')}
            </button>
            <button
              type="button"
              className={view.paused ? 'btn btn-primary' : 'btn'}
              disabled={stepping}
              onClick={() => step(view.paused ? 'host:resume' : 'host:pause')}
            >
              {t(view.paused ? 'resume' : 'pause')}
            </button>
          </>
        )}
        {guide !== null && !guideLast && !view.paused && (
          <button type="button" className="btn" disabled={stepping} onClick={() => step('host:guide-skip')}>
            {t('guideToGame')}
          </button>
        )}
        {surveyStep && !view.paused && (
          <button type="button" className="btn" disabled={stepping} onClick={() => void act('host:survey-all')}>
            {t('surveyAllRows')}
          </button>
        )}
        {main !== undefined && !view.paused && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={stepping || (phase === 'lobby' && view.players.length === 0) || diceRolling}
            onClick={() => step(main.event)}
          >
            {surveyStep && view.survey !== null
              ? t('surveyNextRow', { shown: view.survey.shown + 1, total: view.survey.total })
              : t(main.label === 'lock' && blitz !== null && board !== null ? 'closeCell' : main.label === 'lock' && noWait ? 'noWait' : main.label)}
          </button>
        )}
      </footer>
    </main>
  );
}
