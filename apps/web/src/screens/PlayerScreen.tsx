import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Answer, DiceInfo, PlayerBlitz, PlayerView, PublicQuestion, Spotlight } from '@quiz/shared';
import { correctText, markText, pickedText, shownChoices, num, questionClass, questionLabel, roundLabel, secondsText, signed } from '../format';
import { countText, errorText, t } from '../i18n';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import { AdjustmentToast, BuffToast } from '../live/LiveNotices';
import { Timer, timerStatus, useTimeOver } from '../live/Timer';
import type { Send } from '../live/types';
import { AnswerInput } from './AnswerInput';
import { BlitzCellNotes, Board, BoardLegend } from './Board';
import { TurnSchedule } from './TurnSchedule';
import { BoardIntro } from './Dice';
import { QuestionImage } from './QuestionImage';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { useBlinkingRows, useVerdictBlink } from './verdict-blink';
import { BlitzQueue } from './BlitzQueue';
import { Standings } from './Standings';
import { ChainPlay, ChainWords } from './ChainView';
import { SortPlay, SortWatch } from './SortView';
import { DebuffZone, useDebuffQuestion } from './Debuffs';
import { DuelBanner, DuelButton, DuelPlay } from './DuelView';
import { BuffRow, OvertimeLine, RetryPrompt } from './Buffs';

interface Props {
  view: PlayerView;
  hostOnline: boolean;
  offsetMs: number;
  send: Send;
}

function Result({ view }: { view: PlayerView }) {
  const { result } = view.me;
  const title =
    result === null
      ? t('resultNone')
      : result.grade === 'correct'
        ? t('resultCorrect')
        : result.grade === 'partial'
          ? t('resultPartial')
          : t('resultWrong');
  const tone = result === null || result.points <= 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={`result ${tone}`}>
      <h2>{title}</h2>
      {result !== null && result.points !== 0 && <p className="earned">{signed(result.points)}</p>}
      {result !== null && result.streakBonus > 0 && <p className="streak-bonus">{t('streakBonusLine', { points: result.streakBonus })}</p>}
      {view.me.chain !== null && (
        <p>{view.me.chain.timeMs !== null ? t('chainDone', { time: secondsText(view.me.chain.timeMs) }) : t('chainOutOfTime')}</p>
      )}
      {view.me.sort !== null && <SortOutcome view={view} />}
      {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal, view.question?.choices) })}</p>}
      {view.blitz !== null && (
        <p className="winner">
          {view.blitz.winner === null ? t('blitzNoWinner') : t('blitzWinner', { name: view.blitz.winner.nickname })}
        </p>
      )}
    </section>
  );
}

/** Власний підсумок сортування: час повного сортування або скільки встиг. */
function sortOutcomeText(sort: NonNullable<PlayerView['me']['sort']>): string {
  return sort.timeMs !== null
    ? t('sortDone', { time: secondsText(sort.timeMs) })
    : t('sortOutOfTime', { sorted: sort.sorted, total: sort.total });
}

/** Рядок підсумку сортування в результаті; у бліці — ще й переможець. */
function SortOutcome({ view }: { view: PlayerView }) {
  if (view.me.sort === null) return null;
  return (
    <>
      <p>{sortOutcomeText(view.me.sort)}</p>
      <SortWinner view={view} />
    </>
  );
}

/** Бліц-сортування: хто першим відсортував усе (ім'я відповідей не розкриває). */
function SortWinner({ view }: { view: PlayerView }) {
  if (view.round?.type !== 'blitz' || view.sort === null) return null;
  return (
    <p className="winner">{view.sort.winner === null ? t('sortNoWinner') : t('sortWinner', { name: view.sort.winner.nickname })}</p>
  );
}

/**
 * Місце під кнопку «Кинути кубик»: висота зарезервована, тож поява й зникнення кнопки нічого не зсуває.
 * Поки кидок летить на сервер, кнопка вимкнена: подвійний дотик не надсилає вдруге.
 */
function DiceAction({ dice, meId, paused, send, onError }: { dice: DiceInfo; meId: string; paused: boolean; send: Send; onError: (message: string | null) => void }) {
  const [rolling, setRolling] = useState(false);
  const rollingRef = useRef(false);
  // Номер поточного кидка: пізня відповідь старого кидка не звільняє кнопку для нового.
  const tokenRef = useRef(0);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (fallbackRef.current !== null) clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    };
  }, []);
  const mine = dice.rows.find((row) => row.playerId === meId);
  const roll = () => {
    if (rollingRef.current) return;
    rollingRef.current = true;
    setRolling(true);
    const token = ++tokenRef.current;
    const release = () => {
      if (tokenRef.current !== token || !rollingRef.current) return;
      rollingRef.current = false;
      if (fallbackRef.current !== null) clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
      if (mountedRef.current) setRolling(false);
    };
    // Відповідь може не прийти (send без тайм-ауту): кнопка не лишається вимкненою назавжди.
    fallbackRef.current = setTimeout(release, 3000);
    void send('player:roll', undefined)
      .then((result) => {
        if (mountedRef.current) onError(result.ok ? null : errorText(result.error));
      })
      .finally(release);
  };
  return (
    <div className="dice-action">
      {mine?.waiting === true ? (
        <button type="button" className="btn btn-primary" disabled={paused || rolling} onClick={roll}>
          {t('rollDice')}
        </button>
      ) : (
        <p className="lead">{t('diceMineWait')}</p>
      )}
    </div>
  );
}

/** Ставка гравця у фіналі: числове поле (його можна змінити) або єдина ставка 0. */
function WagerForm({
  final,
  bank,
  send,
  onError,
}: {
  final: { wager: number | null; limit: number; allIn: boolean };
  bank: boolean;
  send: Send;
  onError: (message: string | null) => void;
}) {
  const [value, setValue] = useState(final.wager === null ? '' : String(final.wager));
  const place = async (amount: number, allIn = false) => {
    const result = await send('player:wager', allIn ? { amount, allIn: true } : { amount });
    onError(result.ok ? null : errorText(result.error));
  };
  const amount = value.trim() === '' ? Number.NaN : Number(value);
  const valid = Number.isInteger(amount) && amount >= 0 && amount <= final.limit;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (valid) void place(amount);
  };
  return (
    <section className="wager-form">
      {final.limit > 0 ? (
        <form onSubmit={submit}>
          <p className="lead">{t('finalWagerPrompt', { limit: final.limit })}</p>
          {bank && <p className="meta">{t('finalBankRule')}</p>}
          <div className="wager-row">
            <label className="field">
              <span className="meta">{t('finalWagerLabel')}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={final.limit}
                step={1}
                placeholder={t('finalWagerPlaceholder', { limit: final.limit })}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </label>
            <button
              type="button"
              className="btn btn-allin"
              onClick={() => {
                setValue(String(final.limit));
                void place(final.limit, true);
              }}
            >
              {t('finalAllIn')}
            </button>
          </div>
          <button type="submit" className="btn btn-primary" disabled={!valid}>
            {t('finalPlace')}
          </button>
        </form>
      ) : (
        <>
          {bank && <p className="meta">{t('finalBankRule')}</p>}
          <p className="lead">{t('finalZeroScore')}</p>
          <button type="button" className="btn btn-primary" onClick={() => void place(0)}>
            {t('finalPlaceZero')}
          </button>
        </>
      )}
      {final.wager !== null && (
        <p className="wager-mine">{t(final.allIn ? 'finalMyWagerAllIn' : 'finalMyWager', { wager: final.wager })}</p>
      )}
    </section>
  );
}

/**
 * Рядок під дельтою у спільному банку: одна з підказок за станом розподілу.
 * Ставка 0 нічого не віддає й нічого не ділить; при поверненні правильна відповідь чує нейтральне «Ставки повертаються».
 */
function bankNote(view: PlayerView, result: { grade: string }): string {
  const final = view.final;
  const split = final?.split ?? null;
  const correct = result.grade === 'correct';
  const wager = view.me.final?.wager ?? 0;
  if (split?.refund) return t(correct ? 'finalRefundNote' : 'finalRefund');
  if (!correct) return wager === 0 ? t('finalZeroStakeLost') : t('finalLostToBank');
  if (wager === 0) return t('finalNoShare');
  if (split === null) {
    // Усіх розкрито, а банк порожній: кроку розподілу не буде, чекати нічого.
    const noSplit = final !== null && final.left === 0 && final.bank === 0;
    return t(noSplit ? 'finalStakeSaved' : 'finalKeptStake');
  }
  const mine = split.shares.find((entry) => entry.playerId === view.me.id);
  return t('finalBankShare', { share: num(mine?.share ?? 0) });
}

/** Результат гравця у фіналі: «+ставка» або «−ставка» і новий рахунок; до свого розкриття очікування. */
function FinalResult({ view }: { view: PlayerView }) {
  const { result } = view.me;
  if (result === null) return <p className="lead">{t('finalWaitReveal')}</p>;
  const won = result.grade === 'correct';
  const bank = view.final?.mode === 'bank';
  return (
    <section className={`result ${won ? 'is-correct' : 'is-wrong'}`}>
      <h2>{t(won ? 'resultCorrect' : 'resultWrong')}</h2>
      <p className="wager-delta">{signed(result.points)}</p>
      {bank && <p className="wager-note">{bankNote(view, result)}</p>}
      <p>{t('finalNewScore', { score: num(view.me.score) })}</p>
      {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal, view.question?.choices) })}</p>}
    </section>
  );
}

/** Рядок стану миттєвого бліцу під варіантами: власне місце в черзі чи вердикт. */
function instantStatus(blitz: PlayerBlitz, timeOver: boolean): string {
  if (blitz.canAnswer && timeOver) return t('blitzTimeOver');
  if (blitz.canAnswer && blitz.position === 1) return t('blitzRepickAgain');
  if (blitz.position === 1) return t('blitzMineChecking');
  if (blitz.position !== null) return t('blitzMineQueued', { position: blitz.position });
  if (blitz.grade === 'wrong') return t('blitzMineWrong');
  if (blitz.grade === 'correct') return t('blitzMineCorrect');
  return '';
}

export function PlayerScreen({ view, hostOnline, offsetMs, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { me, phase, question } = view;
  // Хук на рівні екрана: під «Дзеркалом» варіанти зсуваються по колу; інакше те саме запитання.
  const shown = useDebuffQuestion(question, me.debuff);

  const submit = async (answer: Answer) => {
    const result = await send('player:answer', answer);
    setError(result.ok ? null : errorText(result.error));
  };

  const board = view.board;
  const chooserIsMe = board?.turn?.playerId === me.id;
  const chooserName = board?.turn?.nickname ?? '';
  const { spotlight } = view;
  // Хто відповідає: власник помаранчевої відповіді, інакше вибравший на полі чи голова черги бліцу.
  // Червона відповідь бліцу вже минула, тож її автор не «відповідає».
  // На бліц-клітинці вибравший лише обирає: відповідає голова черги.
  const blitzCell = board?.cell?.kind === 'blitz';
  // Миттєвий бліц: усі відповідають разом, рядка «Відповідає …» немає, голову видно в черзі.
  const instant = view.blitz?.instant === true;
  const answering = instant
    ? null
    : ((spotlight?.grade === null ? spotlight : null) ?? (blitzCell ? null : board?.turn) ?? view.blitz?.queue[0] ?? null);
  const othersAnswer = answering !== null && answering.playerId !== me.id;
  const myPending = spotlight !== null && spotlight.grade === null && spotlight.playerId === me.id;
  const voice = board?.cell?.answerMode === 'voice';
  // Хук на рівні екрана: миготіння має пережити зміну гілки question → reveal.
  // У миттєвому бліці власний вибір стоїть на місці варіантів і мигає вердиктом, як чужий spotlight деінде.
  const own: Spotlight | null =
    instant && me.answer !== null ? { playerId: me.id, nickname: me.nickname, answer: me.answer, grade: me.blitz?.grade ?? null } : null;
  const blink = useVerdictBlink(instant ? own : spotlight);
  const rowBlink = useBlinkingRows(view.blitz?.rows ?? [], view.questionIndex);
  // Після «Перевибрати» голова відповідає у власному вікні, навіть коли загальний час уже вийшов.
  const repickEnd = me.blitz?.position === 1 && me.blitz.deadline !== null ? me.blitz.deadline : null;
  const timeOver = useTimeOver(repickEnd ?? view.endsAt, repickEnd !== null ? null : view.remainingMs, offsetMs);
  // Бафи: власний кінець (з додатковим часом — особистий) гасить ряд; спільний кінець показує, на кого чекає розкриття.
  const myClock = me.overtime !== null ? { endsAt: me.overtime.deadline, remainingMs: me.overtime.remainingMs } : null;
  const buffTimeOver = useTimeOver(myClock?.endsAt ?? view.endsAt, myClock !== null ? myClock.remainingMs : view.remainingMs, offsetMs);
  const sharedOver = useTimeOver(view.endsAt, view.remainingMs, offsetMs);
  const waiting = phase === 'question' && myClock === null && sharedOver && view.overtime.length > 0;
  const activeBuff = me.buffs?.active ?? null;
  const retryStage = activeBuff?.retry ?? null;
  const queue =
    instant && view.blitz !== null ? (
      <BlitzQueue rows={view.blitz.rows} reserve={view.playerCount} question={question} blinking={rowBlink} closed={phase !== 'question'} />
    ) : null;

  const pick = async (cellId: string) => {
    const result = await send('player:pick', { cellId });
    setError(result.ok ? null : errorText(result.error));
  };

  const chainMine = question?.type === 'chain' && me.chain !== null;
  const isSort = question?.type === 'sort';

  const place = me.rank !== null && <p className="place">{t('yourPlace', { rank: me.rank, total: view.playerCount })}</p>;

  return (
    <main className="app player">
      {/* Смуга й сповіщення — position: fixed, тож нічого не зсувають. */}
      <DuelBanner duel={view.duel} phase={view.phase} />
      <AdjustmentToast notice={view.notice} offsetMs={offsetMs} />
      <BuffToast notice={view.buffNotice} offsetMs={offsetMs} />
      <header className="bar">
        <span>{me.nickname}</span>
        {/* Кнопка не вища за рядок шапки: її поява не зсуває екран. */}
        <DuelButton duel={me.duel} paused={view.paused} send={send} onError={setError} />
        <strong className="score">{num(me.score)}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}

      {phase === 'lobby' && <p className="lead">{t('inLobby')}</p>}

      {phase === 'duel' && view.duel !== null && <DuelPlay view={view} offsetMs={offsetMs} send={send} onError={setError} />}

      {phase === 'intro' && view.round !== null && (
        <>
          {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
          <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
          <RoundFacts round={view.round} total={view.total} />
          <RoundBriefing brief={view.round.brief} description={view.round.description} />
          {board !== null && (
            <BoardIntro board={board} meId={me.id}>
              {board.dice !== null && !board.dice.done && (
                <DiceAction dice={board.dice} meId={me.id} paused={view.paused} send={send} onError={setError} />
              )}
            </BoardIntro>
          )}
        </>
      )}

      {phase === 'wager' && me.final !== null && (
        <>
          {view.round !== null && <p className="meta">{roundLabel(view.round.title, view.round.index, view.round.type)}</p>}
          <WagerForm key={me.final.limit} final={me.final} bank={view.final?.mode === 'bank'} send={send} onError={setError} />
        </>
      )}

      {phase === 'board' && board !== null && (
        <>
          <p className="lead">{chooserIsMe ? t('yourPick') : t('boardChooser', { name: chooserName })}</p>
          <Board board={board} onPick={chooserIsMe ? (cellId) => void pick(cellId) : undefined} disabled={view.paused} />
          <BoardLegend board={board} />
          <TurnSchedule board={board} heading={t('turnQueueTitle')} limit={3} />
        </>
      )}

      {phase === 'question' && question !== null && (
        <>
          <div className="question-head">
            {/* «Чекаємо …» стає на місце підпису (той лишається прихованим і тримає висоту): поява на спільному кінці нічого не зсуває. */}
            <div className="question-meta">
              <p className={waiting ? 'meta is-hidden' : 'meta'}>{questionLabel(view.round, view.questionIndex, view.total)}</p>
              {waiting && <OvertimeLine rows={view.overtime} offsetMs={offsetMs} />}
            </div>
            {!chainMine && <Timer view={myClock ?? view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />}
          </div>
          {board !== null && board.cell !== null && (
            <p className="meta">
              {t('cellTitle', { category: board.cell.category, price: board.cell.price })}
              {board.cell.mark !== 'none' && <span className="cell-mark">{markText(board.cell.mark)}</span>}
              {board.cell.kind === 'blitz' && <span className="cell-mark">{t('cellBlitz')}</span>}
            </p>
          )}
          {board !== null && <BlitzCellNotes board={board} instant={view.blitz?.instant === true} />}
          {me.blitz !== null && !instant ? (
            // Бліц з кнопкою: рядок завжди займає місце, тож поява голови черги не зсуває запитання.
            <p className="lead answering-line">{othersAnswer ? t('boardAnswering', { name: answering.nickname }) : ''}</p>
          ) : (
            othersAnswer && !isSort && <p className="lead">{t('boardAnswering', { name: answering.nickname })}</p>
          )}
          <DebuffZone debuff={me.debuff} limitMs={view.limitMs} offsetMs={offsetMs} questionIndex={view.questionIndex}>
            <h1 className={questionClass(question.text)}>{question.text}</h1>
            <QuestionImage url={question.imageUrl} />
            <YouTubePlayer video={question.video} masked={view.reveal === null} />
            {/* Ряд бафів — з першої миті запитання до його закриття, однакового розміру в усіх станах. */}
            {me.buffs !== null && <BuffRow buffs={me.buffs} paused={view.paused} timeOver={buffTimeOver} send={send} onError={setError} />}
            {/* У фіналі гравець грає на ставку: ціни за слово немає. */}
            {isSort && view.round?.type !== 'final' && <p className="meta sort-points">{countText('sortPointsPerWord', question.points, { points: question.points })}</p>}
            {isSort && me.sort !== null ? (
              <SortPlay question={shown ?? question} sort={me.sort} paused={view.paused} offsetMs={offsetMs} send={send} />
            ) : isSort ? (
              view.sort !== null && <SortWatch question={question} info={view.sort} />
            ) : chainMine && me.chain !== null ? (
              <ChainPlay chain={me.chain} question={question} paused={view.paused} offsetMs={offsetMs} send={send} />
            ) : instant && me.blitz !== null ? (
              <>
                {me.blitz.canAnswer ? (
                  // Після нуля поле лишається на місці, лише вимкнене: варіанти не стрибають, а сервер однаково відмовив би.
                  <fieldset className="inputs" disabled={view.paused || timeOver}>
                    <AnswerInput
                      key={`${view.questionIndex}-${me.blitz.position ?? 0}-${me.answer === null}`}
                      question={shown ?? question}
                      onSubmit={(answer) => {
                        if (!timeOver) void submit(answer);
                      }}
                    />
                  </fieldset>
                ) : (
                  <SpotlightChoices question={question} spotlight={own} reveal={null} blink={blink} />
                )}
                {/* Відлік вікна стоїть у рядку стану з зарезервованою висотою: ні поява, ні зникнення не зсувають черги. */}
                <div className="blitz-status-row">
                  {/* Сервер зсуває вікно лише після продовження, тож на паузі відлік вікна не показуємо. */}
                  {me.blitz.canAnswer && repickEnd !== null && !view.paused && !timeOver && (
                    <Timer view={{ endsAt: repickEnd, remainingMs: null }} offsetMs={offsetMs} />
                  )}
                  <p className="blitz-status">{instantStatus(me.blitz, timeOver)}</p>
                </div>
                {queue}
              </>
            ) : myPending ? (
              <section className="sent">
                <SpotlightChoices question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
                <p className="lead">{t('pendingWait')}</p>
              </section>
            ) : me.blitz !== null ? (
              <>
                {(me.blitz.position === null || voice || (spotlight !== null && spotlight.playerId !== me.id)) && (
                  <SpotlightChoices question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
                )}
                <BlitzTurn
                  view={view}
                  shown={shown ?? question}
                  labelled={spotlight !== null && spotlight.playerId !== me.id}
                  blitz={me.blitz}
                  voice={voice}
                  offsetMs={offsetMs}
                  onSubmit={submit}
                  send={send}
                  onError={setError}
                />
              </>
            ) : board !== null && !chooserIsMe ? (
              <SpotlightChoices question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
            ) : board !== null && voice && me.answer === null ? (
              <>
                {/* Вибрав сам: досить «Відповідайте вголос», без «Гравець відповідає вголос» над ним. */}
                <SpotlightChoices question={question} spotlight={spotlight} reveal={null} blink={blink} voice placeholder={false} />
                <p className="lead">{t('answerAloud')}</p>
              </>
            ) : me.answer !== null ? (
              <section className="sent">
                <h2>{t('answerSent')}</h2>
                <p>{pickedText(me.answer, shownChoices(question))}</p>
              </section>
            ) : activeBuff !== null && retryStage === 'choice' ? (
              // Часткова перша відповідь: вибір замість поля відповіді.
              <RetryPrompt active={activeBuff} question={question} send={send} onError={setError} />
            ) : (
              // На паузі поле лишається на місці, інакше гравець втратив би вже введене.
              // «Неправильно, ще одна спроба» стоїть у рядку пояснень бафів, тож варіанти не зсуваються.
              <fieldset className="inputs" disabled={view.paused}>
                <AnswerInput key={`${view.questionIndex}-${retryStage ?? ''}`} question={shown ?? question} removed={activeBuff?.removed} onSubmit={submit} />
              </fieldset>
            )}
          </DebuffZone>
        </>
      )}

      {phase === 'locked' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
          {/* У ланцюжку немає однієї правильної відповіді: гравець бачить свій результат і чекає на рейтинг. */}
          {isSort ? (
            // Сортування: власний підсумок і очікування розкриття; глядач на полі бачить прогрес того, хто сортував.
            <section className="sent">
              {me.sort !== null ? (
                <h2>{sortOutcomeText(me.sort)}</h2>
              ) : (
                question !== null && view.sort !== null && <SortWatch question={question} info={view.sort} />
              )}
              <SortWinner view={view} />
              <p className="lead">{t('sortWaitResults')}</p>
            </section>
          ) : me.chain !== null && question !== null && question.chain !== null ? (
            <section className="sent">
              <ChainWords first={question.chain.first} masks={me.chain.masks} />
              <h2>{me.chain.timeMs !== null ? t('chainDone', { time: secondsText(me.chain.timeMs) }) : t('chainOutOfTime')}</h2>
              <p className="lead">{t('chainWaitResults')}</p>
            </section>
          ) : instant ? (
            <>
              {/* Миттєвий бліц: власний вибір і черга з вердиктами; чужий вибір — лише з розкриття. */}
              {question !== null && <SpotlightChoices question={question} spotlight={own} reveal={null} blink={blink} />}
              {queue}
              <p className="winner">
                {view.blitz?.winner ? t('blitzWinner', { name: view.blitz.winner.nickname }) : t('blitzNoWinner')}
              </p>
              <p className="lead">{t('waitReveal')}</p>
            </>
          ) : (
            <>
              {/* Поле й бліц: варіанти з помаранчевою відповіддю чи позначкою ведучого лишаються до розкриття. */}
              {question !== null && (spotlight !== null || board !== null || view.blitz !== null) && (
                <SpotlightChoices question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
              )}
              <p className="lead">{t('waitReveal')}</p>
            </>
          )}
        </>
      )}

      {phase === 'reveal' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
          {view.final !== null ? (
            <FinalResult view={view} />
          ) : board !== null && !chooserIsMe && view.blitz === null ? (
            <section className="result">
              {question !== null && !isSort && <SpotlightChoices question={question} spotlight={spotlight} reveal={view.reveal} blink={blink} voice={voice} />}
              <h2>{t('boardAnswered', { name: chooserName })}</h2>
              {view.reveal !== null && <p>{t('correctAnswer', { answer: correctText(view.reveal, question?.choices) })}</p>}
            </section>
          ) : (
            <>
              {/* Вибравший і бліц: варіанти з кольором вердикту над власним результатом; вердикт уже в Result, тож без voice. */}
              {instant
                ? question !== null && <SpotlightChoices question={question} spotlight={own} reveal={view.reveal} blink={blink} voice={false} />
                : spotlight !== null &&
                  question !== null && <SpotlightChoices question={question} spotlight={spotlight} reveal={view.reveal} blink={blink} voice={false} />}
              {queue}
              <Result view={view} />
            </>
          )}
        </>
      )}

      {phase === 'leaderboard' && view.standings !== null && (
        <>
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
        </>
      )}

      {phase === 'round_end' && view.standings !== null && (
        <>
          <h1 className="question">{t('roundResults', { index: (view.round?.index ?? 0) + 1 })}</h1>
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
        </>
      )}

      {phase === 'finished' && (
        <>
          <h1 className="question">{t('gameOver')}</h1>
          {place}
          {view.standings !== null && <Standings standings={view.standings} highlightId={me.id} />}
        </>
      )}

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </main>
  );
}

/** Хід гравця в запитанні бліцу: кнопка, місце в черзі й поле відповіді. */
function BlitzTurn({
  view,
  shown,
  blitz,
  voice,
  labelled,
  offsetMs,
  onSubmit,
  send,
  onError,
}: {
  view: PlayerView;
  /** Запитання для поля відповіді (з урахуванням «Дзеркала»). */
  shown: PublicQuestion;
  blitz: PlayerBlitz;
  voice: boolean;
  /** Над полем стоїть відповідь голови черги: власне поле підписуємо. */
  labelled: boolean;
  offsetMs: number;
  onSubmit: (answer: Answer) => void;
  send: Send;
  onError: (message: string | null) => void;
}) {
  const { me, question } = view;
  if (question === null) return null;

  const buzz = async () => {
    const result = await send('player:buzz');
    onError(result.ok ? null : errorText(result.error));
  };

  if (blitz.position !== null) {
    if (me.answer !== null) {
      return (
        <section className="sent">
          <h2>{t('blitzSent', { position: blitz.position })}</h2>
          <p>{pickedText(me.answer, shownChoices(question))}</p>
        </section>
      );
    }
    return (
      <>
        <p className="blitz-place">{t('blitzPlace', { position: blitz.position })}</p>
        {/* Сервер зсуває вікно лише після продовження, тож на паузі відлік вікна не показуємо. */}
        {blitz.deadline !== null && !view.paused && <Timer view={{ endsAt: blitz.deadline, remainingMs: null }} offsetMs={offsetMs} />}
        {voice ? (
          blitz.position === 1 ? <p className="lead">{t('answerAloud')}</p> : null
        ) : (
          <>
            {labelled && <h2 className="meta">{t('blitzYourAnswer')}</h2>}
            <fieldset className="inputs" disabled={view.paused}>
              <AnswerInput key={`${view.questionIndex}-${blitz.attemptsUsed}`} question={shown} onSubmit={onSubmit} />
            </fieldset>
          </>
        )}
      </>
    );
  }

  const out = blitz.attemptsLeft === 0;
  return (
    <>
      {(out || blitz.attemptsUsed > 0) && <p className="blitz-note">{t(out ? 'blitzOut' : 'blitzRetry')}</p>}
      {!out && (
        <button type="button" className="btn btn-primary btn-buzz" disabled={!blitz.canBuzz} onClick={() => void buzz()}>
          {t('buzz')}
        </button>
      )}
    </>
  );
}
