import { QRCodeSVG } from 'qrcode.react';
import type { BoardInfo, Choice, FinalInfo, Question as FullQuestion, StageView } from '@quiz/shared';
import { LETTERS, answerText, correctPairs, correctText, markText, questionClass, orderLabelsText, questionLabel, roundLabel, streaksOf } from '../format';
import { t } from '../i18n';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { MatchColumns, PairList } from './MatchView';
import { Timer, timerStatus } from '../live/Timer';
import { BlitzCellNotes, Board, BoardLegend } from './Board';
import { BoardIntro } from './Dice';
import { QuestionImage } from './QuestionImage';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { BlitzQueue } from './BlitzQueue';
import { useBlinkingRows, useVerdictBlink } from './verdict-blink';
import { Standings } from './Standings';
import { ChainBoard, ChainWords, fullMask } from './ChainView';

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
  return (
    <>
      <ol className="rows wager-list">
        {[...final.shown].reverse().map((entry, index) => (
          <li key={entry.playerId} className={index === 0 ? 'wager-latest' : undefined}>
            <span className="name">{entry.nickname}</span>
            <span className="given">{answerText(entry.answer, question, presented)}</span>
            <span className="tag">{t('finalWagerTag', { wager: entry.wager })}</span>
            <span className={entry.after === entry.before ? 'wager-delta' : entry.after > entry.before ? 'wager-delta is-up' : 'wager-delta is-down'}>
              {`${entry.before} → ${entry.after}`}
            </span>
          </li>
        ))}
      </ol>
      {final.left > 0 && <p className="meta">{t('finalLeft', { left: final.left })}</p>}
    </>
  );
}

function Question({ view, offsetMs, blink, blinking }: Pick<Props, 'view' | 'offsetMs'> & { blink: boolean; blinking: ReadonlySet<string> }) {
  const { question, reveal, stats } = view;
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
  const hint = voice ? null : question.type === 'chain' ? t('chainOnPhone') : question.type === 'order' ? orderHint : question.type === 'match' ? t('matchOnPhone') : showChoices || question.type === 'boolean' ? null : t('typeOnPhone');

  return (
    <div className="stage-question">
      <header className="bar">
        <span>{questionLabel(view.round, view.questionIndex, view.total)}</span>
        {view.board === null && (
          <span>
            {question.type === 'chain'
              ? t('chainFinishedOf', { finished: view.answeredCount, total: view.playerCount })
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
      <div className="stage-main">
        <h1 className={questionClass(question.text)}>{question.text}</h1>
        {view.phase === 'question' && <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />}
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
      ) : spotlit ? (
        <SpotlightChoices question={question} spotlight={view.spotlight} reveal={reveal} stats={stats} voice={voice} blink={blink} />
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
      {reveal === null && hint !== null && <p className="lead">{hint}</p>}
      {reveal !== null && question.type !== 'match' && question.type !== 'chain' && <p className="lead answer">{t('correctAnswer', { answer: correctText(reveal, question.choices) })}</p>}
    </div>
  );
}

/** Порядок ходів поточного кола. */
function Order({ board }: { board: BoardInfo }) {
  return (
    <ol className="turn-order">
      {board.order.map((entry) => (
        <li key={entry.playerId} className={entry.playerId === board.turn?.playerId ? 'is-turn' : undefined}>
          {entry.nickname}
        </li>
      ))}
    </ol>
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
      {view.phase === 'intro' && <RoundBriefing brief={view.round.brief} description={view.round.description} />}
      {view.phase === 'wager' && <p className="lead">{t('finalStageWagers', { placed: final.placed, total: final.total })}</p>}
    </div>
  );
}

function Intro({ view }: { view: StageView }) {
  if (view.round === null) return null;
  if (view.round.type === 'final') return <FinalStage view={view} />;
  return (
    <div className="stage-board">
      {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
      <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
      <RoundFacts round={view.round} total={view.total} />
      <RoundBriefing brief={view.round.brief} description={view.round.description} />
      {view.board !== null && <BoardIntro board={view.board} />}
    </div>
  );
}

function BoardStage({ board }: { board: BoardInfo }) {
  return (
    <div className="stage-board board-with-legend">
      <Board board={board} />
      <aside className="board-aside">
        <BoardLegend board={board} />
        <Order board={board} />
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
  return (
    <main className="app stage">
      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}
      {phase === 'lobby' && <Lobby view={view} code={code} joinUrl={joinUrl} />}
      {(phase === 'question' || phase === 'locked' || phase === 'reveal') && <Question view={view} offsetMs={offsetMs} blink={blink} blinking={blinking} />}
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
    </main>
  );
}
