import { QRCodeSVG } from 'qrcode.react';
import type { BoardInfo, Choice, FinalInfo, Question as FullQuestion, StageView } from '@quiz/shared';
import { LETTERS, answerText, correctPairs, correctText, markText, questionClass, orderLabelsText, questionLabel, roundLabel, streaksOf } from '../format';
import { t } from '../i18n';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { MatchColumns, PairList } from './MatchView';
import { AdjustmentToast, BuffToast, StageDebuffs } from '../live/LiveNotices';
import { SharedOvertime, StageBuffs } from './Buffs';
import { DuelBanner, DuelStage } from './DuelView';
import { GuidePageView } from '../live/Guide';
import { Splash, useSplash } from '../live/Splash';
import { Timer, timerStatus } from '../live/Timer';
import { BlitzCellNotes, Board, BoardLegend } from './Board';
import { BoardIntro } from './Dice';
import { TurnSchedule } from './TurnSchedule';
import { QuestionImage } from './QuestionImage';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { BlitzQueue } from './BlitzQueue';
import { useBlinkingRows, useVerdictBlink } from './verdict-blink';
import { Standings } from './Standings';
import { MenuLinks } from './MenuLinks';
import { ChainBoard, ChainWords, fullMask } from './ChainView';
import { SortBoard, SortReveal, SortWords } from './SortView';

interface Props {
  view: StageView;
  code: string;
  /** Повна адреса входу гравця; з неї будується QR-код. */
  joinUrl: string;
  offsetMs: number;
  hostOnline: boolean;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

function Lobby({ view, code, joinUrl }: Pick<Props, 'view' | 'code' | 'joinUrl'>) {
  return (
    <div className="stage-lobby">
      <div className="invite">
        <p className="meta">{t('joinAt')}</p>
        <p className="address">{hostOf(joinUrl)}</p>
        <p className="meta">{t('joinCode')}</p>
        <p className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</p>
      </div>
      <div className="qr">
        <QRCodeSVG value={joinUrl} size={256} bgColor="#F5F1E6" fgColor="#0E1020" marginSize={2} />
      </div>
      <div className="roster">
        <p className="meta">{view.playerCount === 0 ? t('noPlayersYet') : t('playersIn', { count: view.playerCount })}</p>
        <ul className="chips">
          {view.players.map((player) => (
            <li key={player.id} className={player.connected ? undefined : 'is-away'}>
              {player.nickname}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Розкриті гравці фіналу: найновіший зверху й виділений, щоб він завжди був на екрані. */
function FinalReveal({ final, question, presented }: { final: FinalInfo; question: FullQuestion | null; presented?: Choice[] }) {
  const bank = final.mode === 'bank';
  const refund = final.split?.refund === true;
  // Коротко, щоб лічильник завжди лишався в один рядок; повне пояснення — на телефонах.
  const meter =
    final.split === null
      ? t('finalBank', { bank: final.bank })
      : final.split.refund
        ? t('finalRefundMeter')
        : t('finalBankSplit', { bank: final.split.bank });
  /** Куди пішла ставка: при поверненні — назад гравцю; за ставки 0 нічого не дописується. */
  const stakeNote = (entry: FinalInfo['shown'][number]) => {
    if (!bank || entry.wager === 0) return '';
    if (refund) return ` · ${t('finalStakeReturned')}`;
    return ` · ${t(entry.grade === 'correct' ? 'finalStakeKept' : 'finalStakeToBank')}`;
  };
  // Найдовші підписи резервують ширину колонок, щоб розподіл і повернення нічого не зсували.
  const shareReserve = t('finalBankShare', { share: final.split?.bank ?? final.bank });
  return (
    <>
      {bank && (
        // Лічильник завжди на місці з першого розкриття: змінюється лише текст.
        <div className="bank-meter" role="status">
          <span key={meter} className="bank-meter-text">
            {meter}
          </span>
        </div>
      )}
      {/* Сталі колонки: ім'я з «ВА-БАНК!», відповідь, ставка, рахунок і (у банку) частка — значок не зсуває решту. */}
      <ol className={bank ? 'rows wager-list wager-reveal is-bank' : 'rows wager-list wager-reveal'}>
        {[...final.shown].reverse().map((entry, index) => (
          <li key={entry.playerId} className={index === 0 ? 'wager-latest' : undefined}>
            <span className="wager-who">
              <span className="name">{entry.nickname}</span>
              {entry.allIn && <span className="allin-badge">{t('finalAllInBadge')}</span>}
            </span>
            <span className="given">{answerText(entry.answer, question, presented)}</span>
            <span
              className="tag wager-stake"
              data-reserve={bank ? `${t('finalWagerTag', { wager: entry.wager })} · ${t('finalStakeKept')}` : undefined}
              data-reserve-alt={bank ? `${t('finalWagerTag', { wager: entry.wager })} · ${t('finalStakeReturned')}` : undefined}
            >
              {t('finalWagerTag', { wager: entry.wager })}
              {stakeNote(entry)}
            </span>
            <span className={entry.after === entry.before ? 'wager-delta' : entry.after > entry.before ? 'wager-delta is-up' : 'wager-delta is-down'}>
              {`${entry.before} → ${entry.after}`}
            </span>
            {bank && (
              <span className="wager-share" data-reserve={shareReserve}>
                {entry.share === null ? '' : t('finalBankShare', { share: entry.share })}
              </span>
            )}
          </li>
        ))}
      </ol>
      {final.left > 0 && <p className="meta">{t('finalLeft', { left: final.left })}</p>}
    </>
  );
}

function Question({ view, offsetMs, blink, blinking }: Pick<Props, 'view' | 'offsetMs'> & { blink: boolean; blinking: ReadonlySet<string> }) {
  const { question, reveal, stats } = view;
  // Поки йде заставка запитання чи клітинки, запитання під шаром ще не почалося: aria-busy для читачів екрана.
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const busy = view.phase === 'question' && (splashNow?.splash.kind === 'question' || splashNow?.splash.kind === 'cell');
  if (question === null) return null;
  const correctIds =
    reveal === null
      ? []
      : reveal.type === 'single'
        ? [reveal.correctId]
        : reveal.type === 'multi'
          ? reveal.correctIds
          : [];
  const showChoices = question.type === 'single' || question.type === 'multi';
  const voice = view.board?.cell?.answerMode === 'voice';
  // Поле й бліц показують відповідь одного гравця кольором; на усній клітинці — позначку ведучого.
  // Миттєвий бліц показує варіанти як класичне запитання: чужого вибору до розкриття на сцені немає.
  const instant = view.blitz?.instant === true;
  const spotlit = !instant && (view.blitz !== null || view.board !== null);
  // Червона відповідь бліцу вже минула: відповідає голова черги, а не її автор.
  const pendingSpot = view.spotlight?.grade === null ? view.spotlight : null;
  // На бліц-клітинці вибравший лише обирає: відповідає голова черги.
  const blitzCell = view.board?.cell?.kind === 'blitz';
  const answering = instant ? null : (pendingSpot ?? (blitzCell ? null : view.board?.turn) ?? view.blitz?.queue[0] ?? null);
  const queueRows = view.blitz?.rows ?? [];
  // Розкриття фіналу йде по одному гравцю: відео, картинка й варіанти зникають, щоб список був на екрані.
  const finalReveal = view.final !== null && view.phase === 'reveal';
  const orderLabels = question.orderLabels === null ? '' : orderLabelsText(question.orderLabels);
  const orderHint = orderLabels === '' ? t('orderOnPhone') : t('orderOnPhoneLabels', { labels: orderLabels });
  const hint = voice ? null : question.type === 'chain' ? t('chainOnPhone') : question.type === 'sort' ? t('sortOnPhone') : question.type === 'order' ? orderHint : question.type === 'match' ? t('matchOnPhone') : showChoices || question.type === 'boolean' ? null : t('typeOnPhone');

  return (
    <div className="stage-question" aria-busy={busy || undefined}>
      <header className="bar">
        <span>{questionLabel(view.round, view.questionIndex, view.total)}</span>
        {view.board === null && (
          <span>
            {question.type === 'chain'
              ? t('chainFinishedOf', { finished: view.answeredCount, total: view.playerCount })
              : question.type === 'sort' && view.sort !== null
              ? // Записи з'являються й у тих, хто не встиг, на locked: рахуємо лише тих, хто відсортував усе.
                t('sortFinishedOf', { finished: view.sort.rows.filter((row) => row.timeMs !== null).length, total: view.playerCount })
              : view.blitz === null
              ? t('answeredOf', { answered: view.answeredCount, total: view.playerCount })
              : instant
              ? t('answeredOf', { answered: queueRows.length, total: view.playerCount })
              : t('blitzQueued', { count: view.blitz.queue.length })}
          </span>
        )}
      </header>
      {view.board !== null && view.board.cell !== null && (
        <p className="lead cell-head">
          <span className="cell-tag">{t('cellTitle', { category: view.board.cell.category, price: view.board.cell.price })}</span>
          {view.board.cell.mark !== 'none' && <span className="cell-mark">{markText(view.board.cell.mark)}</span>}
          {view.board.cell.kind === 'blitz' && <span className="cell-mark">{t('cellBlitz')}</span>}
          {view.blitz !== null && !instant ? (
            <span className="answering-line">{answering !== null ? t('boardAnswering', { name: answering.nickname }) : ''}</span>
          ) : (
            answering !== null && <span>{t('boardAnswering', { name: answering.nickname })}</span>
          )}
        </p>
      )}
      {view.board !== null && <BlitzCellNotes board={view.board} instant={view.blitz?.instant === true} />}
      {view.board === null && view.blitz !== null && !instant ? (
        // Бліц з кнопкою: рядок завжди займає місце, тож поява голови черги не зсуває запитання.
        <p className="lead answering-line">{answering !== null ? t('boardAnswering', { name: answering.nickname }) : ''}</p>
      ) : (
        view.board === null && answering !== null && <p className="lead">{t('boardAnswering', { name: answering.nickname })}</p>
      )}
      {/* На розкритті фіналу запитання не розтягується: лічильник банку й список стоять на місці, поки рядків більшає. */}
      <div className={finalReveal ? 'stage-main is-reveal' : 'stage-main'}>
        <h1 className={questionClass(question.text)}>{question.text}</h1>
        {view.phase === 'question' && (
          // «Чекаємо …» висить під табло поза потоком: його поява на спільному кінці нічого не зсуває.
          <div className="stage-clock">
            <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />
            {view.overtime.length > 0 && <SharedOvertime view={view} offsetMs={offsetMs} />}
          </div>
        )}
      </div>
      {finalReveal && view.final !== null && <FinalReveal final={view.final} question={reveal} presented={view.question?.choices} />}
      {!finalReveal && <QuestionImage url={question.imageUrl} />}
      {!finalReveal && <YouTubePlayer video={question.video} masked={reveal === null} />}
      {finalReveal && question.type !== 'match' ? null : question.chain !== null ? (
        reveal !== null && reveal.type === 'chain' ? (
          <ChainWords first={reveal.words[0]} masks={reveal.words.slice(1).map(fullMask)} tone="is-correct" />
        ) : (
          <ChainWords first={question.chain.first} masks={question.chain.masks} />
        )
      ) : question.sort !== null ? (
        <>
          <SortReveal categories={question.sort.categories} question={reveal !== null && reveal.type === 'sort' ? reveal : null} total={question.sort.total} />
          {/* Поле: до розкриття під категоріями — усі слова за абеткою. */}
          {view.board !== null && reveal === null && view.sort?.words && <SortWords words={view.sort.words} />}
        </>
      ) : spotlit ? (
        <SpotlightChoices question={question} spotlight={view.spotlight} reveal={reveal} stats={stats} voice={voice} blink={blink} removed={view.removed} />
      ) : question.type === 'match' ? (
        reveal === null ? (
          <MatchColumns left={question.choices} right={question.right} />
        ) : (
          <>
            <h2 className="match-heading">{t('correctPairs')}</h2>
            <PairList pairs={correctPairs(reveal)} tone="is-correct" />
          </>
        )
      ) : (
        showChoices && (
          <ul className={choicesClass(question.choices)}>
            {question.choices.map((choice, index) => (
              <li key={choice.id} className={correctIds.includes(choice.id) ? 'choice is-correct' : 'choice'}>
                <ChoiceFace choice={choice} letter={LETTERS[index]} />
                {stats !== null && <span className="count">{stats.counts[choice.id] ?? 0}</span>}
              </li>
            ))}
          </ul>
        )
      )}
      {view.chain !== null && !finalReveal && <ChainBoard chain={view.chain} reveal={view.phase === 'reveal'} />}
      {view.sort !== null && view.final === null && <SortBoard sort={view.sort} reveal={view.phase === 'reveal'} />}
      {/* Рядок переможця бліцу завжди займає місце: його поява на locked не зсуває сцену. */}
      {view.sort !== null && view.round?.type === 'blitz' && (
        <p className="lead winner sort-line">
          {view.phase === 'locked' || view.phase === 'reveal' ? (view.sort.winner === null ? t('sortNoWinner') : t('sortWinner', { name: view.sort.winner.nickname })) : ''}
        </p>
      )}
      {instant && <BlitzQueue rows={queueRows} reserve={view.playerCount} question={question} blinking={blinking} closed={view.phase !== 'question'} />}
      {view.blitz !== null && !instant && view.phase !== 'reveal' && view.blitz.queue.length > 0 && (
        <ol className="rows blitz-queue">
          {view.blitz.queue.map((entry, index) => (
            <li key={entry.playerId}>
              <span className="rank">{index + 1}</span>
              <span className="name">{entry.nickname}</span>
              {index === 0 && <span className="tag">{t('blitzChecking')}</span>}
            </li>
          ))}
        </ol>
      )}
      {view.blitz !== null && (view.phase === 'reveal' || (instant && view.phase === 'locked')) && (
        <p className="lead winner">
          {view.blitz.winner === null ? t('blitzNoWinner') : t('blitzWinner', { name: view.blitz.winner.nickname })}
        </p>
      )}
      {question.type === 'sort' && hint !== null ? (
        // Підказка сортування лишає своє місце й на розкритті: сцена не зсувається.
        <p className="lead sort-line">{reveal === null ? hint : ''}</p>
      ) : (
        reveal === null && hint !== null && <p className="lead">{hint}</p>
      )}
      {reveal !== null && question.type !== 'match' && question.type !== 'chain' && question.type !== 'sort' && <p className="lead answer">{t('correctAnswer', { answer: correctText(reveal, question.choices) })}</p>}
    </div>
  );
}

function FinalStage({ view }: { view: StageView }) {
  if (view.round === null || view.final === null) return null;
  const { final } = view;
  const theme = final.theme.trim() === '' ? t('finalLabel') : final.theme;
  return (
    <div className="stage-board">
      <p className="meta">{t('finalLabel')}</p>
      <h1 className="question wager-theme">{theme}</h1>
      {view.phase === 'intro' && <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} />}
      {view.phase === 'wager' && <p className="lead">{t('finalStageWagers', { placed: final.placed, total: final.total })}</p>}
    </div>
  );
}

function Intro({ view }: { view: StageView }) {
  if (view.round === null) return null;
  if (view.round.type === 'final') return <FinalStage view={view} />;
  return (
    <div className={view.board !== null ? 'stage-board is-board-intro' : 'stage-board'}>
      {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
      <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
      <RoundFacts round={view.round} total={view.total} />
      <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} />
      {/* Обгортка сцени: на широкому екрані розклад стає поруч із кидками, а не під ними. */}
      {view.board !== null && (
        <div className="stage-dice">
          <BoardIntro board={view.board} />
        </div>
      )}
    </div>
  );
}

function BoardStage({ board }: { board: BoardInfo }) {
  return (
    <div className="stage-board board-with-legend">
      <Board board={board} />
      <aside className="board-aside">
        <BoardLegend board={board} />
        <TurnSchedule board={board} heading={t('turnQueueTitle')} limit={3} />
      </aside>
      {board.turn !== null && <p className="lead board-turn">{t('boardChooser', { name: board.turn.nickname })}</p>}
    </div>
  );
}

export function StageScreen({ view, code, joinUrl, offsetMs, hostOnline }: Props) {
  const { phase, standings } = view;
  // Хук на рівні екрана: миготіння має пережити зміну етапу question → reveal.
  const blink = useVerdictBlink(view.spotlight);
  const blinking = useBlinkingRows(view.blitz?.rows ?? [], view.questionIndex);
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  return (
    <main className="app stage">
      <DuelBanner duel={view.duel} phase={view.phase} />
      <AdjustmentToast notice={view.notice} offsetMs={offsetMs} />
      <BuffToast notice={view.buffNotice} offsetMs={offsetMs} />
      {/* Заставка — шар position: fixed над розкладкою етапу, яка вже стоїть під ним. */}
      <Splash view={view} offsetMs={offsetMs} size="stage" />
      {/* Значки бафів і дебафів — один стовпчик у кутку, position: fixed. */}
      <div className="stage-tags">
        {(phase === 'question' || phase === 'locked' || phase === 'reveal') && <StageBuffs buffs={view.buffs} board={view.board !== null} />}
        <StageDebuffs debuffs={view.debuffs} />
      </div>
      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}
      {phase === 'lobby' && <Lobby view={view} code={code} joinUrl={joinUrl} />}
      {phase === 'guide' && view.guide !== null && <GuidePageView guide={view.guide} size="stage" />}
      {(phase === 'question' || phase === 'locked' || phase === 'reveal') && <Question view={view} offsetMs={offsetMs} blink={blink} blinking={blinking} />}
      {phase === 'duel' && view.duel !== null && <DuelStage view={view} offsetMs={offsetMs} />}
      {phase === 'wager' && <FinalStage view={view} />}
      {phase === 'intro' && <Intro view={view} />}
      {phase === 'board' && view.board !== null && <BoardStage board={view.board} />}
      {(phase === 'leaderboard' || phase === 'round_end' || phase === 'finished') && standings !== null && (
        <div className={phase === 'finished' ? 'stage-board is-final' : 'stage-board'}>
          <h1 className="question">
            {phase === 'finished'
              ? t('podium')
              : phase === 'round_end' && view.round !== null
                ? t('roundResults', { index: view.round.index + 1 })
                : t('leaderboard')}
          </h1>
          <Standings
            standings={standings}
            limit={phase === 'finished' ? undefined : 8}
            streaks={phase === 'finished' ? undefined : streaksOf(view.players)}
          />
        </div>
      )}
      {/* Не під заставкою «Підсумки»: шар однаково перехоплює дотики. */}
      {phase === 'finished' && splashNow === null && <MenuLinks role="stage" />}
    </main>
  );
}
