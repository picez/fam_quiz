import { QRCodeSVG } from 'qrcode.react';
import { hallPoints, type BoardInfo, type Choice, type FinalInfo, type Question as FullQuestion, type SortTilt, type StageView, type SurvivalInfo } from '@quiz/shared';
import { LETTERS, answerText, choiceLabel, num, correctPairs, correctText, markText, sliderNumber, sliderValueText, pinDistanceText, questionClass, orderLabelsText, questionLabel, roundLabel, streaksOf } from '../format';
import { t, type TextKey } from '../i18n';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import { ChoiceFace, choicesClass } from './ChoiceFace';
import { MatchColumns, PairList } from './MatchView';
import { AdjustmentToast, BuffToast, DebuffToast, LiveNotices, StageDebuffs } from '../live/LiveNotices';
import { SharedOvertime, StageBuffs } from './Buffs';
import { DuelBanner, DuelStage } from './DuelView';
import { GuidePageView } from '../live/Guide';
import { Splash, useSplash } from '../live/Splash';
import { Timer, timerStatus } from '../live/Timer';
import { BlitzCellNotes, Board, BoardLegend } from './Board';
import { BoardIntro } from './Dice';
import { TurnSchedule } from './TurnSchedule';
import { RevealImage } from './RevealImage';
import { QuestionAudio } from './QuestionAudio';
import { SliderScale } from './SliderScale';
import { PinBoard } from './PinBoard';
import { CluesList } from './CluesList';
import { ClueOpens } from './ClueOpens';
import { publicLeadMs, questionElapsedMs, revealStage, useRevealProgress } from '../reveal';
import type { AudioCommand } from '../live/useGame';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { BlitzQueue } from './BlitzQueue';
import { useBlinkingRows, useVerdictBlink } from './verdict-blink';
import { Standings } from './Standings';
import { RoundHighlights } from './ScoreTable';
import { roundGains, roundHighlights } from '../score-table';
import { StageTeams } from './StageTeams';
import { WipeoutLadder, WipeoutSide } from './WipeoutLadder';
import { SurvivalBoard } from './SurvivalBoard';
import { LadderBoard } from './LadderBoard';
import { LadderAudience, LadderLifelineBadges, ladderOutcomeText } from './LadderStatus';
import { SurvivalDoors } from './SurvivalDoors';
import { MenuLinks } from './MenuLinks';
import { ChainBoard, ChainWords, fullMask } from './ChainView';
import { SortBoard, SortReveal, SortStage, SortWords } from './SortView';
import { WallGrid } from './WallGrid';
import { WallReveal } from './WallReveal';
import { WallTable } from './WallTable';
import { PollBars } from './PollBars';
import { WordCloud } from './WordCloud';
import { BluffBoard } from './BluffBoard';
import { SurveyBoard } from './SurveyBoard';

interface Props {
  view: StageView;
  code: string;
  /** Повна адреса входу гравця; з неї будується QR-код. */
  joinUrl: string;
  offsetMs: number;
  hostOnline: boolean;
  /** Остання команда звуку від ведучого. */
  audioCommand?: AudioCommand | null;
  /** Останній нахил картки сортування за тим, хто сортує (11d). */
  tilts?: Record<string, SortTilt>;
}

const NO_TILTS: Record<string, SortTilt> = {};

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
        {view.autopilot && <p className="meta stage-bot">{`🤖 ${t('stageBotHosts')}`}</p>}
        <p className="meta">{t('joinAt')}</p>
        <p className="address">{hostOf(joinUrl)}</p>
        <p className="meta">{t('joinCode')}</p>
        <p className="code">{`${code.slice(0, 3)} ${code.slice(3)}`}</p>
      </div>
      <div className="qr">
        <QRCodeSVG value={joinUrl} size={256} bgColor="#F5F1E6" fgColor="#0E1020" marginSize={2} />
      </div>
      {view.teams !== null ? (
        <div className="roster">
          <StageTeams teams={view.teams} />
        </div>
      ) : (
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
      )}
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

function Question({ view, offsetMs, blink, blinking, audioCommand, tilts }: Pick<Props, 'view' | 'offsetMs'> & { tilts: Record<string, SortTilt>; blink: boolean; blinking: ReadonlySet<string>; audioCommand: AudioCommand | null }) {
  const { question, reveal, stats } = view;
  // Поки йде заставка запитання чи клітинки, запитання під шаром ще не почалося: aria-busy для читачів екрана.
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const busy = view.phase === 'question' && (splashNow?.splash.kind === 'question' || splashNow?.splash.kind === 'cell');
  // Поступ проявлення рахується лише для запитань із проявленням: решта не перемальовується щоразу.
  const revealP = useRevealProgress(view, view.question?.reveal ? view.question : null, offsetMs);
  if (question === null) return null;
  const correctIds =
    reveal === null
      ? []
      : reveal.type === 'single'
        ? [reveal.correctId]
        : reveal.type === 'multi'
          ? reveal.correctIds
          : [];
  const showChoices = question.type === 'single' || question.type === 'multi' || question.type === 'poll';
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
  const sliderHint = question.slider === null ? '' : t('sliderOnPhone', { min: sliderNumber(question.slider.min, question.slider.step), max: sliderValueText(question.slider.max, question.slider) });
  const scale = reveal !== null && reveal.type === 'slider' && question.slider !== null && view.sliderMarks !== null ? { correct: reveal, slider: question.slider, marks: view.sliderMarks } : null;
  const hint = voice ? null : question.type === 'slider' ? sliderHint : question.type === 'chain' ? t('chainOnPhone') : question.type === 'clues' ? t(question.clues?.self === true ? (view.teams !== null ? 'cluesOnPhoneSelfTeams' : 'cluesOnPhoneSelf') : 'cluesOnPhone') : question.type === 'pin' ? t('pinOnPhone') : question.type === 'sort' ? t('sortOnPhone') : question.type === 'wall' ? t('wallOnPhone') : question.type === 'survey' ? t('surveyOnPhone', { n: question.survey?.answers ?? 3 }) : question.type === 'wordcloud' ? t('cloudOnPhone', { words: question.cloud?.words ?? 3 }) : question.type === 'order' ? orderHint : question.type === 'match' ? t('matchOnPhone') : showChoices || question.type === 'boolean' ? null : t('typeOnPhone');

  return (
    <div className={view.wipeout !== null ? 'stage-question has-wipeout-side' : 'stage-question'} aria-busy={busy || undefined}>
      <header className="bar">
        <span>{questionLabel(view.round, view.questionIndex, view.total)}</span>
        {view.board === null && (
          <span>
            {question.type === 'chain'
              ? t('chainFinishedOf', { finished: view.answeredCount, total: view.playerCount })
              : question.type === 'wall'
              ? t('wallFinishedOf', { finished: view.answeredCount, total: view.playerCount })
              : question.type === 'poll'
              ? t('votedOf', { voted: view.answeredCount, total: view.playerCount })
              : question.type === 'wordcloud'
              ? t('cloudWrittenOf', { n: view.answeredCount, total: view.playerCount })
              : question.type === 'sort' && view.sort !== null
              ? // Записи з'являються й у тих, хто не встиг, на locked: рахуємо лише тих, хто відсортував усе.
                t('sortFinishedOf', { finished: view.sort.rows.filter((row) => row.timeMs !== null).length, total: view.playerCount })
              : view.wipeout !== null
              ? // На розкритті згорілі вже не «в грі»: рахуємо тих, хто грав сходинку.
                t('answeredOf', { answered: view.answeredCount, total: view.phase === 'reveal' ? view.wipeout.rows.filter((row) => row.prev !== null).length : view.wipeout.inCount })
              : view.survival !== null
              ? t('answeredOf', { answered: view.answeredCount, total: view.survival.aliveCount })
              : view.blitz === null
              ? t('answeredOf', { answered: view.answeredCount, total: view.playerCount })
              : instant
              ? t('answeredOf', { answered: queueRows.length, total: view.playerCount })
              : t('blitzQueued', { count: view.blitz.queue.length })}
          </span>
        )}
      </header>
      {view.wipeout !== null && view.wipeout.current >= 0 && (
        <p className="meta wipeout-strip">
          {t('wipeoutStageStrip', { index: view.wipeout.current + 1, total: view.wipeout.ladder.length, price: num(view.wipeout.ladder[view.wipeout.current] ?? 0) })}
        </p>
      )}
      {view.survival !== null && view.survival.current >= 0 && (
        <p className="meta survival-strip">
          {t('survivalStageStrip', { index: view.survival.current + 1, total: view.survival.total, alive: view.survival.aliveCount, ghosts: view.survival.ghostCount })}
        </p>
      )}
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
            <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} leadMs={view.bluff?.stage === 'choice' ? 0 : publicLeadMs(question)} />
            {view.overtime.length > 0 && <SharedOvertime view={view} offsetMs={offsetMs} />}
          </div>
        )}
      </div>
      {finalReveal && view.final !== null && <FinalReveal final={view.final} question={reveal} presented={view.question?.choices} />}
      {question.clues !== null && !finalReveal && (
        <CluesList clues={question.clues} offsetMs={offsetMs} all={reveal?.type === 'clues' ? reveal.clues : undefined} big />
      )}
      {question.clues?.opens != null && !finalReveal && <ClueOpens opens={question.clues.opens} revealed={view.phase === 'reveal'} big />}
      {!finalReveal && question.pin === null && <RevealImage url={question.imageUrl} mode={question.reveal} stage={revealStage(revealP)} />}
      {question.audio?.clip != null && (
        <QuestionAudio
          key={`${view.round?.index ?? 0}:${view.questionIndex}`}
          clip={question.audio.clip}
          questionKey={`${view.round?.index ?? 0}:${view.questionIndex}`}
          ready={view.phase === 'question' && !busy && !view.paused}
          paused={view.paused}
          command={audioCommand}
          elapsedMs={() => questionElapsedMs(view, Date.now() + offsetMs)}
          splash={busy}
        />
      )}
      {!finalReveal && <YouTubePlayer video={question.video} masked={reveal === null} />}
      {finalReveal && question.type !== 'match' ? null : question.chain !== null ? (
        reveal !== null && reveal.type === 'chain' ? (
          <ChainWords first={reveal.words[0]} masks={reveal.words.slice(1).map(fullMask)} tone="is-correct" />
        ) : (
          <ChainWords first={question.chain.first} masks={question.chain.masks} />
        )
      ) : question.sort !== null ? (
        view.sort?.live ? (
          <SortStage
            question={question}
            info={view.sort}
            live={view.sort.live}
            reveal={reveal !== null && reveal.type === 'sort' ? reveal : null}
            tilts={tilts}
            paused={view.paused}
            offsetMs={offsetMs}
            team={view.teams !== null}
            headed={answering !== null}
          />
        ) : (
          <>
            <SortReveal categories={question.sort.categories} question={reveal !== null && reveal.type === 'sort' ? reveal : null} total={question.sort.total} />
            {/* Поле: до розкриття під категоріями — усі слова за абеткою. */}
            {view.board !== null && reveal === null && view.sort?.words && <SortWords words={view.sort.words} />}
          </>
        )
      ) : question.wall !== null ? (
        <div className={reveal?.type === 'wall' ? 'stage-fit stage-wall is-reveal' : 'stage-fit stage-wall'}>
          {reveal?.type === 'wall' ? (
            <>
              <WallReveal question={reveal} big />
              {view.wall !== null && <WallTable info={view.wall} compact />}
            </>
          ) : (
            <WallGrid wall={question.wall} found={(view.wall?.rows[0]?.tiles ?? []).map((tiles, color) => ({ tiles, color }))} big />
          )}
        </div>
      ) : question.type === 'bluff' && view.bluff !== null ? (
        <div className="stage-fit stage-bluff">
          {view.bluff.stage === 'lies' ? (
            <>
              <p className="lead">{t('bluffStageOnPhone')}</p>
              <p className="meta">{t('bluffWritten', { n: view.bluff.written, total: view.playerCount })}</p>
            </>
          ) : (
            <>
              {view.bluff.stage === 'choice' && <p className="lead">{t('bluffChoiceHint')}</p>}
              <BluffBoard info={view.bluff} big autopilot={view.autopilot} />
              {view.bluff.stage === 'choice' && <p className="meta">{t('bluffPickedCount', { n: view.bluff.picked, total: view.playerCount })}</p>}
            </>
          )}
        </div>
      ) : question.type === 'survey' && view.survey !== null ? (
        <div className="stage-fit stage-survey">
          <SurveyBoard info={view.survey} big />
          {view.phase === 'question' && hint !== null && hint !== '' && <p className="lead">{hint}</p>}
          {reveal === null && view.survey.source === 'cloud' && <p className="meta">{t('surveyFromCloud')}</p>}
        </div>
      ) : question.type === 'poll' && reveal?.type === 'poll' && stats !== null ? (
        <div className="stage-fit stage-poll">
          <PollBars choices={question.choices} counts={stats.counts} total={stats.answered} big />
        </div>
      ) : question.type === 'wordcloud' && reveal !== null ? (
        <div className="stage-fit stage-cloud">
          {view.cloud === null || view.cloud.length === 0 ? <p className="lead">{t('cloudEmpty')}</p> : <WordCloud words={view.cloud} />}
          {view.cloudVoters !== null && view.cloudVoters > 0 && <p className="meta">{t('cloudCaption', { voters: view.cloudVoters })}</p>}
        </div>
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
        reveal === null && hint !== null && question.type !== 'survey' && question.type !== 'bluff' && <p className="lead">{hint}</p>
      )}
      {scale !== null && (
        <SliderScale slider={scale.slider} correct={scale.correct.correct} tolerance={scale.correct.tolerance} zeroBeyond={scale.correct.zeroBeyond} marks={scale.marks} highlight={scale.marks[0]?.playerId} />
      )}
      {question.pin !== null && (
        <div className="stage-pin">
          {/* Обгортка-контейнер: дошка бере найбільший розмір, що вміщається в решту висоти екрана, не розтягуючи мапу. */}
          <div className="stage-pin-fit">
            <PinBoard
              pin={question.pin}
              imageUrl={question.imageUrl}
              marks={reveal?.type === 'pin' ? (view.pinMarks ?? []) : []}
              target={reveal?.type === 'pin' ? reveal.target : undefined}
              radii={reveal?.type === 'pin' ? { full: reveal.fullRadius, zero: reveal.zeroRadius } : undefined}
              highlight={reveal?.type === 'pin' ? view.pinMarks?.[0]?.playerId : undefined}
            />
          </div>
          {reveal?.type === 'pin' && view.pinMarks !== null && view.pinMarks.length > 0 && view.pinMarks[0].points > 0 && (
            <p className="lead pin-best">{t('pinBest', { name: view.pinMarks[0].nickname, distance: pinDistanceText(reveal, view.pinMarks[0].x, view.pinMarks[0].y) })}</p>
          )}
        </div>
      )}
      {reveal !== null && view.survival !== null && <SurvivalReveal info={view.survival} />}
      {reveal !== null && scale === null && question.type !== 'pin' && question.type !== 'match' && question.type !== 'chain' && question.type !== 'sort' && question.type !== 'wall' && question.type !== 'poll' && question.type !== 'wordcloud' && question.type !== 'survey' && question.type !== 'bluff' && <p className="lead answer">{t('correctAnswer', { answer: correctText(reveal, question.choices) })}</p>}
      {view.wipeout !== null && <WipeoutSide info={view.wipeout} reveal={view.phase === 'reveal'} />}
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
      {view.phase === 'intro' && <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} autopilot={view.autopilot} fit />}
      {view.phase === 'wager' && <p className="lead">{t('finalStageWagers', { placed: final.placed, total: final.total })}</p>}
    </div>
  );
}

function Intro({ view }: { view: StageView }) {
  if (view.round === null) return null;
  if (view.round.type === 'final') return <FinalStage view={view} />;
  if (view.round.type === 'ladder' && view.ladder !== null) return <LadderIntro view={view} info={view.ladder} />;
  const head = (
    <>
      {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
      <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
      <RoundFacts round={view.round} total={view.total} />
      <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} autopilot={view.autopilot} fit />
    </>
  );
  return (
    <div className={view.board !== null ? 'stage-board is-board-intro' : view.round.type === 'survival' ? 'stage-board stage-survival is-intro' : 'stage-board'}>
      {/* Поле з описом: на широкому екрані опис і правила ліворуч, кидки й розклад праворуч (як у «Мільйонері»). */}
      {view.board !== null ? <div className="board-intro-main">{head}</div> : head}
      {view.round.type === 'wipeout' && view.wipeout !== null && <WipeoutLadder info={view.wipeout} size="stage" players={false} />}
      {view.round.type === 'survival' && view.survival !== null && (
        <>
          <p className="lead survival-target">
            {view.survival.bonus > 0 ? t('survivalTarget', { target: view.survival.target, bonus: num(view.survival.bonus) }) : t('survivalTargetNoBonus', { target: view.survival.target })}
          </p>
          <SurvivalBoard info={view.survival} size="stage" />
        </>
      )}
      {/* Обгортка сцени: без опису розклад поруч із кидками; з описом — друга колонка заставки, кидки над розкладом. */}
      {view.board !== null && (
        <div className="stage-dice">
          <BoardIntro board={view.board} />
        </div>
      )}
    </div>
  );
}

/** Заставка «Мільйонера»: зліва розклад раунду й картка учасника (до вибору — «Хто піде на драбину?»), справа драбина — усе на один екран. */
function LadderIntro({ view, info }: { view: StageView; info: NonNullable<StageView['ladder']> }) {
  if (view.round === null) return null;
  return (
    <div className="stage-board ladder-stage-intro">
      <div className="ladder-intro-main">
        {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
        <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
        <RoundFacts round={view.round} total={view.total} />
        <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} autopilot={view.autopilot} fit />
        <div className="ladder-contestant">
          {info.contestant === null ? (
            <p className="lead">{t('ladderStageWho')}</p>
          ) : (
            <>
              <p className="question ladder-contestant-name">{info.contestant.nickname}</p>
              {info.drawn && info.pick !== 'host' && <p className="meta">{t(`ladderStageDrawn_${info.pick}` as TextKey)}</p>}
            </>
          )}
        </div>
      </div>
      <LadderBoard info={info} size="stage" />
    </div>
  );
}

/** Запитання «Мільйонера»: зліва запитання з варіантами й підказками, справа драбина; вибір учасника з locked, зал — на розкритті. */
function LadderStage({ view, offsetMs, audioCommand }: { view: StageView; offsetMs: number; audioCommand: AudioCommand | null }) {
  const info = view.ladder;
  const { question, reveal } = view;
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  if (info === null || question === null) return null;
  const busy = view.phase === 'question' && splashNow?.splash.kind === 'question';
  const correctId = reveal !== null && reveal.type === 'single' ? reveal.correctId : null;
  const pick = info.contestantPick;
  const level = info.steps[info.current]?.level ?? 0;
  const hall = info.hall;
  return (
    <div className="stage-question stage-ladder" aria-busy={busy || undefined}>
      <header className="bar">
        <span>{questionLabel(view.round, view.questionIndex, view.total)}</span>
        <span>{t('ladderStageHallCount', { answered: hall.answered, total: hall.total })}</span>
      </header>
      <div className="ladder-stage-body">
        <div className="ladder-stage-main">
          <div className="stage-main">
            <h1 className={questionClass(question.text)}>{question.text}</h1>
            {view.phase === 'question' && info.timer && (
              <div className="stage-clock">
                <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} leadMs={publicLeadMs(question)} />
              </div>
            )}
          </div>
          <LadderLifelineBadges info={info} />
          <RevealImage url={question.imageUrl} mode={question.reveal} stage={revealStage(1)} />
          {question.audio?.clip != null && (
            <QuestionAudio
              key={`${view.round?.index ?? 0}:${view.questionIndex}`}
              clip={question.audio.clip}
              questionKey={`${view.round?.index ?? 0}:${view.questionIndex}`}
              ready={view.phase === 'question' && !busy && !view.paused}
              paused={view.paused}
              command={audioCommand}
              elapsedMs={() => questionElapsedMs(view, Date.now() + offsetMs)}
              splash={busy}
            />
          )}
          <YouTubePlayer video={question.video} masked={reveal === null} />
          <ul className={choicesClass(question.choices)}>
            {question.choices.map((choice, index) => {
              // 50/50: прибраний варіант лишається на своєму місці з літерою — тьмяний і перекреслений, як на телефоні.
              if (info.fifty?.includes(choice.id)) {
                return (
                  <li key={choice.id} className="choice is-removed" aria-label={t('choiceRemoved', { choice: choiceLabel(choice, index) })}>
                    <ChoiceFace choice={choice} letter={LETTERS[index]} />
                    <span className="removed-tag">{t('removedTag')}</span>
                  </li>
                );
              }
              const mine = pick === choice.id;
              const tone = correctId === choice.id ? ' is-correct' : mine && correctId !== null ? ' is-wrong' : '';
              return (
                <li key={choice.id} className={`choice${tone}${mine ? ' is-picked' : ''}`}>
                  <ChoiceFace choice={choice} letter={LETTERS[index]} />
                  {mine && view.phase === 'locked' && <span className="tag ladder-final">{t('ladderStageFinal')}</span>}
                </li>
              );
            })}
          </ul>
          <LadderAudience info={info} question={question} offsetMs={offsetMs} />
          {reveal !== null && hall.right !== null && <p className="lead ladder-hall-hits">{t('ladderStageHall', { right: hall.right, answered: hall.answered, points: num(hallPoints(level)) })}</p>}
        </div>
        <LadderBoard info={info} size="stage" />
      </div>
    </div>
  );
}

/** Між запитаннями «Мільйонера»: велика драбина, рішення учасника чи підсумок замість таблиці. */
function LadderBetween({ view }: { view: StageView }) {
  const info = view.ladder;
  if (info === null) return null;
  const name = info.contestant?.nickname ?? '';
  return (
    <div className="stage-board stage-ladder-between">
      <h1 className="question ladder-between-line" role="status">
        {info.outcome !== null
          ? ladderOutcomeText(info)
          : info.decision === 'pending'
            ? t('ladderStageDeciding', { name, points: num(info.banked) })
            : t('ladderPlayingOn')}
      </h1>
      <LadderBoard info={info} size="stage" />
    </div>
  );
}

/** Між запитаннями «Ва-банк»: велика драбина замість таблиці й відлік вікна рішення. */
function WipeoutBetween({ view, offsetMs }: { view: StageView; offsetMs: number }) {
  const info = view.wipeout;
  if (info === null) return null;
  const decide = info.decide;
  return (
    <div className="stage-board stage-wipeout">
      <h1 className="question">{t(info.decisions ? 'wipeoutDecisionsTitle' : 'wipeoutLadderTitle')}</h1>
      {decide !== null && (decide.endsAt !== null || decide.remainingMs !== null) && (
        <div className="stage-clock">
          <Timer view={decide} offsetMs={offsetMs} status={timerStatus(view)} />
        </div>
      )}
      <WipeoutLadder info={info} size="stage" />
    </div>
  );
}

/** Після розкриття: хто «на межі» і скільки привидів відгадали. */
function SurvivalReveal({ info }: { info: SurvivalInfo }) {
  const edge = info.rows.filter((row) => row.status === 'edge');
  const hits = info.ghosts.right !== null && info.ghosts.answered > 0;
  if (edge.length === 0 && !hits) return null;
  return (
    <div className="survival-reveal">
      {edge.length > 0 && (
        <p className="lead survival-edge-line">
          <span className="meta">{t('survivalEdgeGroup')}: </span>
          {edge.map((row) => row.nickname).join(', ')}
        </p>
      )}
      {hits && info.ghosts.right !== null && <p className="meta survival-ghost-hits">{t('survivalGhostHits', { right: info.ghosts.right, answered: info.ghosts.answered })}</p>}
    </div>
  );
}

/** Між запитаннями «Вибування»: випробування (питання чи двері «на межі») або вердикт, а поруч — живі й привиди. */
function SurvivalBetween({ view, offsetMs }: { view: StageView; offsetMs: number }) {
  const info = view.survival;
  if (info === null) return null;
  const trial = info.trial;
  const edgeRows = info.rows.filter((row) => row.trial !== null);
  const closed = trial?.stage === 'closed';
  const question = trial?.question ?? null;
  return (
    <div className="stage-board stage-survival">
      <header className="survival-head">
        {trial === null ? (
          info.verdict !== null && <h1 className="question survival-verdict">{t(info.verdict === 'all_wrong' ? 'survivalAllWrong' : 'survivalAllRight')}</h1>
        ) : (
          <>
            {trial.fellBack && <p className="meta">{t('survivalFellBack')}</p>}
            <h1 className="question">{question !== null ? question.text : t('survivalTrialLuck')}</h1>
            {trial.stage === 'open' && (trial.endsAt !== null || trial.remainingMs !== null) && (
              <div className="stage-clock">
                <Timer view={trial} offsetMs={offsetMs} total={trial.limitMs} status={timerStatus(view)} />
              </div>
            )}
            {trial.stage === 'open' && (
              <p className="meta" role="status">
                {t('survivalTrialDone', { n: trial.done, total: trial.total })}
              </p>
            )}
          </>
        )}
      </header>
      <div className="survival-body">
        {trial !== null && (
          <div className="survival-trial-area">
            {question !== null && question.choices.length > 0 && (
              <ul className={choicesClass(question.choices)}>
                {question.choices.map((choice, index) => (
                  <li key={choice.id} className={closed && trial.reveal?.type === 'single' && trial.reveal.correctId === choice.id ? 'choice is-correct' : 'choice'}>
                    <ChoiceFace choice={choice} letter={LETTERS[index]} />
                  </li>
                ))}
              </ul>
            )}
            {closed && trial.reveal !== null && question !== null && (
              <p className="lead answer">{t('correctAnswer', { answer: correctText(trial.reveal, question.choices) })}</p>
            )}
            <ul className={trial.kind === 'luck' ? 'survival-edge-rows is-luck' : 'survival-edge-rows'}>
              {edgeRows.map((row) => (
                <li key={row.playerId} className={row.trial === 'out' ? 'is-out' : row.trial === 'safe' ? 'is-safe' : undefined}>
                  <span className="name">{row.nickname}</span>
                  {trial.kind === 'luck' && (
                    <SurvivalDoors
                      picked={null}
                      disabled
                      reveal={closed && row.door !== null && row.door.trap !== null ? { picked: row.door.picked, auto: row.door.auto, trap: row.door.trap } : null}
                      size="stage"
                    />
                  )}
                  <span className="survival-mark">
                    {row.trial === 'safe'
                      ? t('survivalSafeMark')
                      : row.trial === 'out'
                        ? t('survivalOutMark')
                        : row.trial === 'done'
                          ? t(trial.kind === 'question' ? 'survivalAnswered' : 'survivalPicked')
                          : t('survivalAnswering')}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <SurvivalBoard info={info} size="stage" hideEdge={trial !== null} />
      </div>
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

/** Скільки рядків таблиці й подіуму вміщає сцена 1280 × 720 у два стовпчики; більше — 15 і «…і ще N». */
const STAGE_ROWS_MAX = 16;

export function StageScreen({ view, code, joinUrl, offsetMs, hostOnline, audioCommand = null, tilts = NO_TILTS }: Props) {
  const { phase, standings } = view;
  // Хук на рівні екрана: миготіння має пережити зміну етапу question → reveal.
  const blink = useVerdictBlink(view.spotlight);
  const blinking = useBlinkingRows(view.blitz?.rows ?? [], view.questionIndex);
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  // Підсумки раунду (11f): з рядком «найкращий / ривок» показуємо 7 рядків, щоб сцена 1280 × 720 не прокручувалась.
  const roundEndIndex = phase === 'round_end' && view.round !== null ? view.round.index : null;
  const highlights = roundEndIndex !== null && standings !== null ? roundHighlights(standings, roundEndIndex) : null;
  const highlighted = highlights !== null && (highlights.best !== null || highlights.climb !== null);
  return (
    <main className="app stage">
      <DuelBanner duel={view.duel} phase={view.phase} autopilot={view.autopilot} />
      <LiveNotices>
        <AdjustmentToast notice={view.notice} offsetMs={offsetMs} teams={view.teams !== null} rounds={view.round?.total ?? 1} />
        <BuffToast view={view} offsetMs={offsetMs} />
        <DebuffToast notice={view.debuffNotice} offsetMs={offsetMs} />
      </LiveNotices>
      {/* Заставка — шар position: fixed над розкладкою етапу, яка вже стоїть під ним. */}
      <Splash view={view} offsetMs={offsetMs} size="stage" />
      {/* Значки бафів і дебафів — один стовпчик у кутку, position: fixed. */}
      <div className="stage-tags">
        {(phase === 'question' || phase === 'locked' || phase === 'reveal') && <StageBuffs buffs={view.buffs} board={view.board !== null} autopilot={view.autopilot} />}
        <StageDebuffs debuffs={view.debuffs} />
      </div>
      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}
      {phase === 'lobby' && <Lobby view={view} code={code} joinUrl={joinUrl} />}
      {phase === 'guide' && view.guide !== null && <GuidePageView guide={view.guide} size="stage" autopilot={view.autopilot} />}
      {(phase === 'question' || phase === 'locked' || phase === 'reveal') && view.ladder !== null && <LadderStage view={view} offsetMs={offsetMs} audioCommand={audioCommand} />}
      {(phase === 'question' || phase === 'locked' || phase === 'reveal') && view.ladder === null && <Question view={view} offsetMs={offsetMs} blink={blink} blinking={blinking} audioCommand={audioCommand} tilts={tilts} />}
      {phase === 'duel' && view.duel !== null && <DuelStage view={view} offsetMs={offsetMs} />}
      {phase === 'wager' && <FinalStage view={view} />}
      {phase === 'intro' && <Intro view={view} />}
      {phase === 'board' && view.board !== null && <BoardStage board={view.board} />}
      {phase === 'leaderboard' && view.wipeout !== null && <WipeoutBetween view={view} offsetMs={offsetMs} />}
      {phase === 'leaderboard' && view.survival !== null && <SurvivalBetween view={view} offsetMs={offsetMs} />}
      {phase === 'leaderboard' && view.ladder !== null && <LadderBetween view={view} />}
      {(phase === 'leaderboard' || phase === 'round_end' || phase === 'finished') && standings !== null && !(phase === 'leaderboard' && view.ladder !== null) && (
        <div className={phase === 'finished' ? 'stage-board is-final' : roundEndIndex !== null ? `stage-board is-round-end${highlighted ? ' has-highlights' : ''}` : 'stage-board'}>
          <h1 className="question">
            {phase === 'finished'
              ? t('podium')
              : phase === 'round_end' && view.round !== null
                ? t('roundResults', { index: view.round.index + 1 })
                : t('leaderboard')}
          </h1>
          <Standings
            standings={standings}
            limit={phase === 'finished' || phase === 'leaderboard' ? (standings.length > STAGE_ROWS_MAX ? STAGE_ROWS_MAX - 1 : undefined) : highlighted ? 7 : 8}
            more={(phase === 'finished' || phase === 'leaderboard') && standings.length > STAGE_ROWS_MAX ? standings.length - (STAGE_ROWS_MAX - 1) : undefined}
            streaks={phase === 'finished' ? undefined : streaksOf(view.players)}
            teams={view.teams}
            gains={roundEndIndex !== null ? roundGains(standings, roundEndIndex) : undefined}
          />
          {roundEndIndex !== null && <RoundHighlights standings={standings} roundIndex={roundEndIndex} />}
        </div>
      )}
      {/* Не під заставкою «Підсумки»: шар однаково перехоплює дотики. */}
      {phase === 'finished' && splashNow === null && <MenuLinks role="stage" />}
    </main>
  );
}
