import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clueShare, isUnscored, revealShare, type Answer, type DiceInfo, type SubmittedAnswer, type PlayerBlitz, type PlayerSurveyLine, type PlayerView, type PublicClues, type PublicQuestion, type Question, type SortTilt, type Spotlight } from '@quiz/shared';
import { answerText, correctText, markText, pickedText, sliderValueText, shownChoices, num, questionClass, questionLabel, roundLabel, secondsText, signed } from '../format';
import { countText, errorText, t } from '../i18n';
import { typeHow } from '../guide-text';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import { AdjustmentToast, BuffToast, DebuffToast, LiveNotices } from '../live/LiveNotices';
import { GuidePageView } from '../live/Guide';
import { Splash, useSplash } from '../live/Splash';
import { AwayAlarm, AwayNote } from '../live/AwayAlarm';
import { Timer, timerStatus, useTimeOver } from '../live/Timer';
import type { Send } from '../live/types';
import { publicWindowMs, questionElapsedMs, revealStage, useRevealProgress } from '../reveal';
import { AnswerInput } from './AnswerInput';
import { BlitzCellNotes, Board, BoardLegend } from './Board';
import { TurnSchedule } from './TurnSchedule';
import { BoardIntro } from './Dice';
import { RevealImage } from './RevealImage';
import { CluesList } from './CluesList';
import { PinBoard } from './PinBoard';
import { SliderScale } from './SliderScale';
import { YouTubePlayer } from './YouTubePlayer';
import { SpotlightChoices } from './SpotlightChoices';
import { useBlinkingRows, useVerdictBlink } from './verdict-blink';
import { BlitzQueue } from './BlitzQueue';
import { Standings } from './Standings';
import { FactCards, GameCardView, OwnRevealLine, RoundCardView } from './FactCards';
import { ChainPlay, ChainWords } from './ChainView';
import { SortPlay, SortReveal, SortWatch } from './SortView';
import { WallGrid } from './WallGrid';
import { WallReveal } from './WallReveal';
import { WallInput } from './WallInput';
import { SurveyBoard } from './SurveyBoard';
import { BluffBoard } from './BluffBoard';
import { BluffChoice } from './BluffChoice';
import { BluffLieInput } from './BluffLieInput';
import { DebuffStrip, DebuffZone, useDebuffQuestion } from './Debuffs';
import { DuelBanner, DuelButton, DuelPlay } from './DuelView';
import { DuelistPicker } from './DuelistPicker';
import { TeamBar, buzzerOf, memberName } from './TeamBar';
import { TeamLobby } from './TeamLobby';
import { AuthorLobby } from './AuthorLobby';
import { TeamWatch, useDraftSender, type DraftInput } from './TeamWatch';
import { MenuLinks } from './MenuLinks';
import { DebuffShop } from './DebuffShop';
import { TableButton } from './TableSheet';
import { AuthorMenu } from './AuthorMenu';
import { useGuardedSend } from '../live/useGuardedSend';
import { useStageGone } from '../live/useStageGone';
import { QuestionAudio } from './QuestionAudio';
import { SurvivalBoard } from './SurvivalBoard';
import { SurvivalTrial } from './SurvivalTrial';
import { WipeoutDecision } from './WipeoutDecision';
import { WipeoutLadder, WipeoutStepList, WipeoutStrip } from './WipeoutLadder';
import { LadderBoard } from './LadderBoard';
import { LadderDecision } from './LadderDecision';
import { LadderHall } from './LadderHall';
import { LadderLifelines } from './LadderLifelines';
import { ladderOutcomeText } from './LadderStatus';
import { BuffPanel, BuffRow, OvertimeLine, RetryPrompt, VoteSheet } from './Buffs';

interface Props {
  view: PlayerView;
  hostOnline: boolean;
  offsetMs: number;
  send: Send;
  /** Останній нахил картки сортування за тим, хто сортує (11d). */
  tilts?: Record<string, SortTilt>;
  /** Код кімнати (з Play.tsx): для лобі автора. */
  code?: string;
  /** Посилання на сцену автора, якщо токен сцени є на цьому пристрої. */
  stageUrl?: string | null;
  /** Чи під'єднана сцена (звук без сцени — задача 8). */
  stageOnline?: boolean;
}

/** Рядок про власну долю в «Вибуванні» наприкінці раунду й гри: привиду — після якого запитання вибув (якщо відомо), живому — бонус (якщо він був). */
function survivalStateLine(own: PlayerView['me']['survival']): string | null {
  if (own === null) return null;
  if (own.status === 'ghost') return own.outAfter === null ? null : t('survivalOutAfter', { n: own.outAfter });
  return own.bonus === null || own.bonus <= 0 ? null : t('survivalBonusGot', { bonus: num(own.bonus) });
}

/** «Хто я?» на телефоні: відкриті підказки, частка ціни зараз і (власний темп, 12c) кнопка наступної з ціною після натиску. */
function CluesNow({ clues, offsetMs, more }: { clues: PublicClues; offsetMs: number; more?: { disabled: boolean; onOpen: () => void } }) {
  const k = Math.max(1, clues.shown.length);
  return (
    <>
      <CluesList clues={clues} offsetMs={offsetMs} />
      <p className="meta clues-now">{t('cluesNow', { k, n: clues.total, percent: Math.round(clueShare(clues.total, k) * 100) })}</p>
      {more !== undefined && k < clues.total && (
        <button type="button" className="btn clue-more" disabled={more.disabled} onClick={more.onOpen}>
          {t('clueMore', { percent: Math.round(clueShare(clues.total, k + 1) * 100) })}
        </button>
      )}
    </>
  );
}

/** Розкриття «Хто я?» і точки: усі підказки або мапа з точкою гравця, правильною точкою й колами. */
function RevealDetail({ view, answer, player }: { view: PlayerView; answer: Answer | null; player: { id: string; nickname: string } }) {
  const { reveal, question } = view;
  if (reveal === null || question === null) return null;
  if (reveal.type === 'clues' && question.clues !== null) return <CluesList clues={question.clues} offsetMs={0} all={reveal.clues} />;
  if (reveal.type === 'pin' && question.pin !== null) {
    const marks = answer?.type === 'pin' ? [{ playerId: player.id, nickname: player.nickname, x: answer.x, y: answer.y }] : [];
    return (
      <PinBoard
        pin={question.pin}
        imageUrl={question.imageUrl}
        marks={marks}
        target={reveal.target}
        radii={{ full: reveal.fullRadius, zero: reveal.zeroRadius }}
        highlight={player.id}
      />
    );
  }
  return null;
}

/** Знайдені групи глядача на полі: позиції з рядка того, хто вибрав. */
const foundOf = (rows: number[][] | null | undefined) => (rows ?? []).map((tiles, color) => ({ tiles, color }));

/** Власні відповіді «100 до 1» списком: до розкриття — як введено, на розкритті — з місцем і популярністю влучених. */
function SurveyLines({ values, lines }: { values: string[]; lines: PlayerSurveyLine[] | null }) {
  return (
    <ul className="survey-lines">
      {(lines ?? values.map((value): PlayerSurveyLine => ({ value, rank: null, text: null, popularity: null, pending: true }))).map((line, index) => {
        const hit = line.rank !== null;
        const miss = lines !== null && !hit && !line.pending;
        return (
          <li key={index} className={hit ? 'survey-line is-hit' : miss ? 'survey-line is-miss' : 'survey-line'}>
            {hit ? t('surveyLineHit', { value: line.value, rank: line.rank ?? 0, popularity: line.popularity ?? 0 }) : miss ? t('surveyLineMiss', { value: line.value }) : line.value}
          </li>
        );
      })}
    </ul>
  );
}

/** Власний підсумок «100 до 1» на розкритті: рядки зі збігами й підказка, що табло на екрані. */
function SurveyOutcome({ view }: { view: PlayerView }) {
  if (view.reveal?.type !== 'survey') return null;
  const { me } = view;
  return (
    <>
      {me.answer?.type === 'survey' && <SurveyLines values={me.answer.values} lines={me.survey?.lines ?? null} />}
      <p className="meta">{t('surveyBoardOnStage')}</p>
    </>
  );
}

/** Власний підсумок стіни: сітка зі знайденими групами, правильні групи й рядок «Груп: N з M · бали». */
function WallOutcome({ view }: { view: PlayerView }) {
  const { question, reveal, me } = view;
  if (question?.wall == null || reveal?.type !== 'wall') return null;
  const found = me.answer?.type === 'wall' ? me.answer.found : (me.wall?.found.length ?? 0);
  // Група отримує колір, яким гравець її знайшов (за текстом першої плитки); решта — нейтральні.
  const colors = reveal.groups.map((group) => {
    const own = me.wall?.found.find((f) => group.tiles.some((tile) => tile.text === question.wall?.tiles[f.tiles[0]]));
    return own === undefined ? null : own.color;
  });
  return (
    <>
      <WallGrid wall={question.wall} found={me.wall?.found ?? []} />
      <WallReveal question={reveal} colors={colors} />
      <p>{t('wallResult', { found, groups: reveal.groups.length, points: num(me.result?.points ?? 0) })}</p>
    </>
  );
}

/** Опитування й «хмара»: без балів і вердикту, лише власний вибір. */
function VoteResult({ view }: { view: PlayerView }) {
  const { me, question } = view;
  return (
    <section className="result vote-result">
      <h2>{t('voteResultsOnStage')}</h2>
      {me.answer !== null && question !== null && <p>{pickedText(me.answer, shownChoices(question), question.slider)}</p>}
    </section>
  );
}

/** Блеф на етапі question: вигадка, потім вибір; кожен етап підписаний. */
function BluffPlay({ view, paused, send, onDraft }: { view: PlayerView; paused: boolean; send: Send; onDraft?: DraftInput }) {
  const { bluff } = view;
  const mine = view.me.bluff;
  // Вибір, що раптом зник посеред фази, означає: ведучий прибрав цей варіант.
  const pickNow = mine?.pick ?? null;
  const stageNow = bluff?.stage ?? null;
  const lastPick = useRef<string | null>(null);
  const [lost, setLost] = useState(false);
  useEffect(() => {
    if (pickNow !== null) setLost(false);
    else if (lastPick.current !== null && stageNow === 'choice') setLost(true);
    lastPick.current = pickNow;
  }, [pickNow, stageNow]);
  if (bluff === null || mine === null) return null;
  if (bluff.stage === 'lies') {
    return (
      <section className="bluff-play">
        <p className="bluff-stage">{t('bluffStageLies')}</p>
        {mine.lie === null ? (
          <fieldset className="inputs" disabled={paused}>
            <BluffLieInput send={send} onDraft={onDraft} />
          </fieldset>
        ) : (
          <p className="lead">{t('bluffLieSent', { lie: mine.lie })}</p>
        )}
        <p className="meta">{t('bluffWritten', { n: bluff.written, total: view.playerCount })}</p>
      </section>
    );
  }
  const picked = mine.pick === null ? null : (bluff.options.find((option) => option.id === mine.pick) ?? null);
  return (
    <section className="bluff-play">
      <p className="bluff-stage">{t('bluffStageChoice')}</p>
      {picked === null && lost && <p className="meta bluff-lost" role="status">{t(view.autopilot ? 'bluffPickRemovedAuthor' : 'bluffPickRemoved')}</p>}
      {picked === null ? (
        <fieldset className="inputs" disabled={paused}>
          <BluffChoice options={bluff.options} own={mine.own} send={send} />
        </fieldset>
      ) : (
        <p className="lead">{t('bluffPicked', { text: picked.text })}</p>
      )}
      <p className="meta">{t('bluffPickedCount', { n: bluff.picked, total: view.playerCount })}</p>
    </section>
  );
}

/** Розкриття блефу: табло; власний результат — лише коли правду відкрито. */
function BluffResult({ view }: { view: PlayerView }) {
  const { bluff, me } = view;
  if (bluff === null || me.bluff === null) return null;
  const { result } = me;
  // Правду відкрито, коли відкрито всі варіанти (як spoilerHeld); мовчун без запису правди не отримує.
  const open = bluff.total > 0 && bluff.shown >= bluff.total;
  const took = me.bluff.truth !== null;
  const tone = result === null || result.points <= 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={open && took ? `result ${tone}` : 'result'}>
      <BluffBoard info={bluff} autopilot={view.autopilot} />
      {open ? (
        <>
          <h2>{took ? t(me.bluff.truth ? 'bluffTruthYes' : me.bluff.pick === null ? 'bluffNoChoice' : 'bluffTruthNo') : t('bluffSilent')}</h2>
          {me.bluff.fooled !== null && me.bluff.fooled > 0 && <p>{t('bluffFooledYou', { n: me.bluff.fooled })}</p>}
          {result !== null && result.points !== 0 && <p className="earned">{signed(result.points)}</p>}
          {result !== null && result.streakBonus > 0 && <p className="streak-bonus">{t('streakBonusLine', { points: result.streakBonus })}</p>}
        </>
      ) : (
        <p className="lead">{t('bluffWaitTruth')}</p>
      )}
    </section>
  );
}

function Result({ view }: { view: PlayerView }) {
  if (view.question !== null && isUnscored(view.question)) return <VoteResult view={view} />;
  const { result } = view.me;
  // «Ва-банк»: хто вибув раніше, цього запитання не грав — вердикту йому не показуємо.
  const wipeout = view.wipeout;
  const mineRow = wipeout?.rows.find((row) => row.playerId === view.me.id);
  const watching = view.me.wipeout !== null && view.me.wipeout.status !== 'in' && mineRow?.step !== wipeout?.current;
  if (watching) {
    return (
      <section className="result">
        <h2>{t('wipeoutWatching')}</h2>
        {view.phase === 'reveal' && wipeout !== null && <WipeoutStepList info={wipeout} size="phone" highlightId={view.me.id} />}
      </section>
    );
  }
  // «Вибування»: привид грає для себе — вердикт без балів.
  const ghost = view.me.survival?.status === 'ghost';
  if (ghost) {
    const right = view.me.survival?.ghostCorrect ?? null;
    return (
      <section className={`result ${right === null ? 'is-neutral' : right ? 'is-correct' : 'is-wrong'}`}>
        <h2>{right === null ? t('resultNone') : t(right ? 'survivalGhostRight' : 'survivalGhostWrong')}</h2>
        <RevealDetail view={view} answer={view.me.answer} player={view.me} />
        {view.reveal !== null && view.reveal.type !== 'wall' && view.reveal.type !== 'survey' && view.reveal.type !== 'pin' && (
          <p>{t('correctAnswer', { answer: correctText(view.reveal, view.question?.choices) })}</p>
        )}
      </section>
    );
  }
  // «Мільйонер»: учасник бачить сходинку, а не бали за запитання.
  const climber = view.me.ladder?.role === 'contestant' ? view.ladder : null;
  const stepLevel = climber === null ? null : (climber.steps[climber.current]?.level ?? null);
  const title =
    climber !== null && result !== null
      ? result.grade === 'correct' && stepLevel !== null
        ? t('ladderStepRight', { level: num(stepLevel) })
        : t('ladderStepWrong')
      : result === null
      ? t('resultNone')
      : result.grade === 'correct'
        ? t('resultCorrect')
        : result.grade === 'partial'
          ? t('resultPartial')
          : t('resultWrong');
  // Учасник драбини завжди має 0 балів: тон — за правильністю.
  const tone = climber !== null ? (result?.grade === 'correct' ? 'is-correct' : 'is-wrong') : result === null || result.points <= 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={`result ${tone}`}>
      <h2>{title}</h2>
      {climber !== null ? null : view.me.wipeout !== null ? (
        // «Ва-банк»: результат запитання — це банк, а не бали за нього.
        <p className="wipeout-bank">{view.me.wipeout.status === 'burned' ? t('wipeoutBurned') : t('wipeoutBank', { bank: num(view.me.wipeout.bank) })}</p>
      ) : (
        <>
          {result !== null && result.points !== 0 && <p className="earned">{signed(result.points)}</p>}
          {result !== null && result.streakBonus > 0 && <p className="streak-bonus">{t('streakBonusLine', { points: result.streakBonus })}</p>}
        </>
      )}
      {view.phase === 'reveal' && wipeout !== null && view.me.wipeout !== null && <WipeoutStepList info={wipeout} size="phone" highlightId={view.me.id} />}
      {view.me.chain !== null && (
        <p>{view.me.chain.timeMs !== null ? t('chainDone', { time: secondsText(view.me.chain.timeMs) }) : t('chainOutOfTime')}</p>
      )}
      {view.me.sort !== null && <SortOutcome view={view} />}
      <WallOutcome view={view} />
      <SurveyOutcome view={view} />
      {view.me.survival?.status === 'edge' && <p className="lead survival-edge">{t('survivalEdge')}</p>}
      <RevealDetail view={view} answer={view.me.answer} player={view.me} />
      {view.reveal !== null &&
        (view.reveal.type === 'wall' || view.reveal.type === 'survey' ? null : view.reveal.type === 'pin' ? (
          // Точка: мапа вище; словами — лише відстань власної точки.
          view.me.answer?.type === 'pin' && <p>{answerText(view.me.answer, view.reveal)}</p>
        ) : view.reveal.type === 'slider' && view.me.answer?.type === 'slider' && view.question?.slider != null ? (
          <>
            <p>
              {t('sliderYours', {
                value: sliderValueText(view.me.answer.value, view.question.slider),
                correct: correctText(view.reveal, view.question.choices),
              })}
            </p>
            <SliderScale
              slider={view.question.slider}
              correct={view.reveal.correct}
              tolerance={view.reveal.tolerance}
              zeroBeyond={view.reveal.zeroBeyond}
              marks={[{ playerId: view.me.id, nickname: view.me.nickname, value: view.me.answer.value }]}
              highlight={view.me.id}
            />
          </>
        ) : (
          <p>{t('correctAnswer', { answer: correctText(view.reveal, view.question?.choices) })}</p>
        ))}
      {view.blitz !== null && (
        <p className="winner">
          {view.blitz.winner === null ? t('blitzNoWinner') : t('blitzWinner', { name: view.blitz.winner.nickname })}
        </p>
      )}
    </section>
  );
}

const NO_TILTS: Record<string, SortTilt> = {};

/** Власний підсумок сортування: час повного сортування або скільки встиг. */
function sortOutcomeText(sort: NonNullable<PlayerView['me']['sort']>): string {
  return sort.timeMs !== null
    ? t('sortDone', { time: secondsText(sort.timeMs) })
    : t('sortOutOfTime', { sorted: sort.sorted, total: sort.total });
}

/** Рядок підсумку сортування в результаті; у бліці — ще й переможець. */
function SortOutcome({ view }: { view: PlayerView }) {
  if (view.me.sort === null) return null;
  const { reveal, question } = view;
  return (
    <>
      <p>{sortOutcomeText(view.me.sort)}</p>
      {/* Свій підсумок по словах (11d): ✗N і «не встиг» лише для себе. */}
      {reveal?.type === 'sort' && question?.sort != null && (
        <SortReveal categories={question.sort.categories} question={reveal} total={question.sort.total} marks={view.me.sort.marks} />
      )}
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
function instantStatus(blitz: PlayerBlitz, timeOver: boolean, autopilot: boolean): string {
  if (blitz.canAnswer && timeOver) return t('blitzTimeOver');
  if (blitz.canAnswer && blitz.position === 1) return t('blitzRepickAgain');
  if (blitz.position === 1) return t(autopilot ? 'blitzMineCheckingAuto' : 'blitzMineChecking');
  if (blitz.position !== null) return t('blitzMineQueued', { position: blitz.position });
  if (blitz.grade === 'wrong') return t('blitzMineWrong');
  if (blitz.grade === 'correct') return t('blitzMineCorrect');
  return '';
}

/**
 * Повний час для власного годинника: спільний ліміт плюс власний додатковий час (кінець особистий − кінець спільний;
 * на паузі — різниця залишків). Найбільше значення за запитання тримається: пауза після спільного кінця
 * зменшує додатковий час на витрачене, а смужка не має стрибати.
 */
function usePersonalTotal(
  view: { questionIndex: number; limitMs: number | null; endsAt: number | null; remainingMs: number | null },
  myClock: { endsAt: number | null; remainingMs: number | null } | null,
): number | null {
  const kept = useRef<{ questionIndex: number; total: number } | null>(null);
  if (view.limitMs === null || myClock === null) return view.limitMs;
  const extra =
    myClock.endsAt !== null && view.endsAt !== null
      ? myClock.endsAt - view.endsAt
      : myClock.remainingMs !== null && view.remainingMs !== null
        ? myClock.remainingMs - view.remainingMs
        : 0;
  let total = view.limitMs + Math.max(0, extra);
  if (kept.current !== null && kept.current.questionIndex === view.questionIndex) total = Math.max(total, kept.current.total);
  kept.current = { questionIndex: view.questionIndex, total };
  return total;
}

export function PlayerScreen({ view, hostOnline, offsetMs, send, tilts = NO_TILTS, code = '', stageUrl = null, stageOnline = true }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { me, phase, question } = view;
  const decideGuard = useGuardedSend(send, setError);
  const resumeGuard = useGuardedSend(send, setError);
  // Командна гра: керує той, хто має право діяти за команду; капітан один — його телефон бере бафи, дебафи й крамницю.
  const team = view.team;
  const acting = team === null || team.canAct;
  const captain = team === null || team.captain;
  const debuff = captain ? me.debuff : null;
  // «Ва-банк»: гравець, що вже не в грі, дивиться — поля відповіді в нього немає.
  const wipeoutWatching = me.wipeout !== null && me.wipeout.status !== 'in';
  // «Вибування»: привид відповідає «для себе».
  const survivalGhost = me.survival?.status === 'ghost';
  // Поступ проявлення картинки: лише за часом; від locked — 1 (повна).
  const revealP = useRevealProgress(view, question, offsetMs);
  const revealStageNow = revealStage(revealP);
  // Хук на рівні екрана: під «Дзеркалом» варіанти зсуваються по колу; інакше те саме запитання.
  const shown = useDebuffQuestion(question, debuff);

  // Заставка перед запитанням: шар пропускає дотики (pointer-events: none), тож поле й бафи під ним вимкнені до старту.
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const notStarted = phase === 'question' && splashNow !== null && (splashNow.splash.kind === 'question' || splashNow.splash.kind === 'cell');
  const locked = view.paused || notStarted;
  // Під будь-якою заставкою (раунд, фінал, підсумки) кнопки шапки й вступу вимкнені: крізь шар їх не натиснути наосліп.
  const splashUp = splashNow !== null;
  // Гра без ведучого й без сцени: звук запитання грає на телефонах (сервер шле джерело лише тоді).
  const stageGone = useStageGone(stageOnline);
  const clip = view.autopilot ? (question?.audio?.clip ?? null) : null;
  // Власне запасне (заміна): свій фрагмент із нового програвача, час — від появи запасного (особистий годинник).
  const onSpare = me.buffs?.active?.kind === 'swap';

  const submit = async (answer: Answer) => {
    // До старту сервер однаково відмовив би: дотик, що проскочив крізь вимкнене поле, нічого не надсилає.
    if (notStarted) return;
    // Подана відповідь не мусить перебитися чернеткою, що ще чекає на відправку.
    sendDraft.cancel();
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
  const clockTotal = usePersonalTotal(view, myClock);
  const waiting = phase === 'question' && myClock === null && sharedOver && view.overtime.length > 0;
  const activeBuff = me.buffs?.active ?? null;
  const retryStage = activeBuff?.retry ?? null;
  const tip =
    me.tip !== null && activeBuff?.spare !== true
      ? me.tip === 'clues' && question?.clues?.self === true
        ? t('typeHowCluesSelf')
        : typeHow(me.tip, question?.orderLabels?.top ?? '')
      : null;
  // «Хто я?» у власному темпі (12c): відкриває той, хто відповідає (у команді — хто діє за неї; на полі — хто вибрав), до відповіді.
  // Перша спроба retry, що чекає другої, — теж відповідь: рушій відмовить already_answered.
  const clueGuard = useGuardedSend(send, setError);
  const cluesMine =
    phase === 'question' && question?.clues?.self === true && acting && me.answer === null && activeBuff?.first == null && (board === null || chooserIsMe) && !onSpare;
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
  const isWall = question?.type === 'wall';
  const isSurvey = question?.type === 'survey';
  const isBluff = question?.type === 'bluff';
  const unscored = question !== null && isUnscored(question);
  // Чернетка команди йде лише від того, хто зараз відповідає за неї (товаришам і пульту).
  const trialDraft = team !== null && team.canAct && phase === 'leaderboard' && me.survival?.canAnswerTrial === true;
  const teamDraftOn = (team !== null && team.canAct && phase === 'question' && question !== null && !unscored && !instant) || trialDraft;
  // Живий вибір соло-гравця для пульта (12b): будь-яке поле до «Надіслати», крім миттєвого бліцу; у грі без ведучого — ні.
  // Опитування й хмару командної гри кожен проходить сам: його вибір теж іде лише пульту.
  const soloDraft =
    (team === null || (unscored && phase === 'question')) &&
    !view.autopilot &&
    !instant &&
    ((phase === 'question' && question !== null && me.answer === null) || (phase === 'leaderboard' && me.survival?.canAnswerTrial === true));
  const draftOn = teamDraftOn || soloDraft;
  // Хід стіни, ланцюжка (і підказка) чи етап блефу міняє відбиток відповіді на сервері: «вже надіслано» скидається.
  const draftKey = [
    view.questionIndex,
    me.blitz?.attemptsUsed ?? 0,
    retryStage ?? '',
    phase,
    me.wall?.found.length ?? 0,
    me.wall?.mistakes ?? 0,
    me.chain?.solved ?? 0,
    me.chain?.hints ?? 0,
    view.bluff?.stage ?? '',
  ].join('-');
  const sendDraft = useDraftSender(send, draftOn, draftKey);
  const onDraft = draftOn ? sendDraft : undefined;
  // Решта команди дивиться: запитання, де відповідає не вона. Бліц з кнопкою — поки відповідає натиснувший; глядач на полі лишається глядачем.
  const teamWatching =
    team !== null &&
    !team.canAct &&
    phase === 'question' &&
    question !== null &&
    !unscored &&
    !wipeoutWatching &&
    !instant &&
    // Усно відповідає будь-хто: екран перегляду не потрібен.
    !voice &&
    (me.blitz === null || buzzerOf(view) !== null) &&
    !(board !== null && !chooserIsMe && me.blitz === null);

  const place = me.rank !== null && <p className="place">{t('yourPlace', { rank: me.rank, total: view.playerCount })}</p>;

  return (
    // aria-busy: під заставкою запитання чи клітинки поле вже стоїть, але запитання ще не почалося.
    <main className="app player" aria-busy={notStarted || undefined}>
      {/* Смуга й сповіщення — position: fixed, тож нічого не зсувають. */}
      <DuelBanner duel={view.duel} phase={view.phase} autopilot={view.autopilot} />
      <LiveNotices>
        <AdjustmentToast notice={view.notice} offsetMs={offsetMs} teams={view.teams !== null} rounds={view.round?.total ?? 1} />
        <BuffToast view={view} offsetMs={offsetMs} selfId={me.id} />
        <DebuffToast notice={view.debuffNotice} offsetMs={offsetMs} selfId={me.id} />
      </LiveNotices>
      {/* Запрошення проголосувати — нижній аркуш position: fixed: чужий баф нічого не зсуває. */}
      {phase === 'question' && question !== null && (
        <VoteSheet key={view.questionIndex} prompt={me.vote} question={question} paused={view.paused} offsetMs={offsetMs} send={send} onError={setError} />
      )}
      {/* Заставка — шар position: fixed над розкладкою етапу, що вже стоїть: поява й зникнення нічого не зсувають. */}
      <Splash view={view} offsetMs={offsetMs} size="phone" />
      <header className="bar">
        <span>{team !== null ? team.nickname : me.nickname}</span>
        {/* Кнопка не вища за рядок шапки: її поява не зсуває екран. */}
        <DuelButton duel={captain || me.duel === null ? me.duel : { ...me.duel, rights: null }} paused={view.paused || splashUp} send={send} onError={setError} />
        {me.shop !== null && captain && <DebuffShop shop={me.shop} score={me.score} send={send} onError={setError} />}
        <AuthorMenu view={view} send={send} />
        {view.table !== null && <TableButton table={view.table} meId={me.id} teams={view.teams} breakdown={view.myBreakdown} />}
        <strong className="score">{num(me.score)}</strong>
      </header>

      {view.paused && (
        <p className={view.author !== null ? 'banner author-paused' : 'banner'} role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
          {view.author !== null && view.phase !== 'finished' && (
            <button type="button" className="btn btn-small" disabled={resumeGuard.busy} onClick={() => void resumeGuard.run('host:resume', undefined)}>
              {t('authorResume')}
            </button>
          )}
        </p>
      )}

      <TeamBar view={view} />
      <DuelistPicker view={view} send={send} onError={setError} />

      {phase === 'lobby' && view.author === null && <p className="lead">{t('inLobby')}</p>}
      {phase === 'lobby' && view.author !== null && (
        <AuthorLobby code={code} stageUrl={stageUrl} joinUrl={`${window.location.origin}/play/${code}`} send={send} onError={setError} />
      )}
      {phase === 'lobby' && <TeamLobby view={view} send={send} onError={setError} />}

      {phase === 'guide' && view.guide !== null && <GuidePageView guide={view.guide} size="phone" autopilot={view.autopilot} />}

      {phase === 'duel' && view.duel !== null && <DuelPlay view={view} offsetMs={offsetMs} send={send} onError={setError} />}

      {phase === 'intro' && view.round !== null && (
        <>
          {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
          <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
          <RoundFacts round={view.round} total={view.total} />
          <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} autopilot={view.autopilot} />
          {view.ladder !== null && me.ladder !== null && (
            <p className="lead ladder-intro" role="status">
              {view.ladder.contestant === null
                ? t(view.autopilot ? 'ladderWaitDraw' : 'ladderWaitPick')
                : me.ladder.role === 'contestant'
                  ? t('ladderYouClimb')
                  : t('ladderWhoClimbs', { name: view.ladder.contestant.nickname })}
            </p>
          )}
          {board !== null && (
            <BoardIntro board={board} meId={me.id}>
              {board.dice !== null && !board.dice.done && (acting ? (
                <DiceAction dice={board.dice} meId={me.id} paused={view.paused || splashUp} send={send} onError={setError} />
              ) : (
                <p className="lead">{t('teamCaptainDecides')}</p>
              ))}
            </BoardIntro>
          )}
        </>
      )}

      {phase === 'wager' && me.final !== null && (
        <>
          {view.round !== null && <p className="meta">{roundLabel(view.round.title, view.round.index, view.round.type)}</p>}
          {acting ? (
            <WagerForm key={me.final.limit} final={me.final} bank={view.final?.mode === 'bank'} send={send} onError={setError} />
          ) : (
            <p className="lead">{t('teamCaptainWager')}</p>
          )}
        </>
      )}

      {phase === 'board' && board !== null && (
        <>
          <p className="lead">
            {chooserIsMe ? (acting ? t('yourPick') : t('teamCaptainPicks', { name: memberName(view, team?.captainId ?? null) })) : t('boardChooser', { name: chooserName })}
          </p>
          <Board board={board} onPick={chooserIsMe && acting ? (cellId) => void pick(cellId) : undefined} disabled={view.paused} />
          <BoardLegend board={board} />
          <TurnSchedule board={board} heading={t('turnQueueTitle')} limit={3} />
        </>
      )}

      {phase === 'question' && question !== null && (
        <>
          <div className="question-head">
            {/* «Чекаємо …» стає на місце підпису (той лишається прихованим і тримає висоту): поява на спільному кінці нічого не зсуває. */}
            <div className="question-meta">
              <p className={waiting ? 'meta is-hidden' : 'meta'}>
                {questionLabel(view.round, view.questionIndex, view.total)}
                {/* Запасне — власна заміна: позначка в тому самому рядку підпису, без нового блоку. */}
                {activeBuff?.spare === true && <span className="spare-tag">{t('spareTag')}</span>}
              </p>
              {waiting && <OvertimeLine rows={view.overtime} offsetMs={offsetMs} />}
            </div>
            {!chainMine && <Timer view={myClock ?? view} offsetMs={offsetMs} total={clockTotal} status={timerStatus(view)} leadMs={question.audio && view.bluff?.stage !== 'choice' ? publicWindowMs(question) - (question.timeLimit ?? 0) * 1000 : 0} />}
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
          {tip !== null && (
            <p className="type-tip" role="note">
              💡 {tip}
            </p>
          )}
          {team !== null && !captain && me.debuff !== null && <DebuffStrip debuff={me.debuff} />}
          <DebuffZone debuff={debuff} limitMs={view.limitMs} offsetMs={offsetMs} questionIndex={view.questionIndex}>
            <h1 className={questionClass(question.text)}>{question.text}</h1>
            <AwayNote away={view.away} />
            {/* Власна картинка точки — це основа мапи, вона вже в рамці. */}
            <RevealImage url={question.pin !== null ? null : question.imageUrl} mode={question.reveal || null} stage={revealStageNow} />
            {question.reveal && me.answer === null && (
              <p className="meta reveal-hint">
                {t('revealHint')} {t('revealNow', { percent: Math.round(revealShare(revealP, 1) * 100) })}
              </p>
            )}
            {/* Підказки й частка — і після відповіді, і глядачам на полі: підказки далі відкриваються. */}
            {question.clues !== null && (
              <CluesNow
                clues={question.clues}
                offsetMs={offsetMs}
                more={cluesMine ? { disabled: locked || buffTimeOver || clueGuard.busy, onOpen: () => void clueGuard.run('player:clue', undefined) } : undefined}
              />
            )}
            <YouTubePlayer video={question.video} masked={view.reveal === null} />
            {/* Ряд бафів — з першої миті запитання до його закриття, однакового розміру в усіх станах. */}
            {me.buffs !== null && captain && <BuffRow buffs={me.buffs} paused={view.paused} timeOver={buffTimeOver} notStarted={notStarted} autopilot={view.autopilot} send={send} onError={setError} />}
            {/* Підказка й голоси залу — у блоці сталої висоти, що з'являється лише з власним бафом. */}
            {activeBuff !== null && <BuffPanel active={activeBuff} question={question} offsetMs={offsetMs} />}
            {/* У фіналі гравець грає на ставку: ціни за слово немає. */}
            {isSort && view.round?.type !== 'final' && <p className="meta sort-points">{countText('sortPointsPerWord', question.points, { points: question.points })}</p>}
            {me.ladder?.role === 'contestant' && captain && (
              <LadderLifelines view={view} offsetMs={offsetMs} onUse={(kind) => void decideGuard.run('player:lifeline', { kind })} />
            )}
            {me.ladder?.role === 'hall' && <LadderHall view={view} />}
            {survivalGhost && <p className="lead survival-ghost-banner">{t('survivalGhostBanner')}</p>}
            {view.wipeout !== null && (phase === 'question' || phase === 'locked') && <WipeoutStrip info={view.wipeout} highlightId={me.id} />}
            {teamWatching ? (
              <TeamWatch view={view} tilts={tilts} offsetMs={offsetMs} />
            ) : wipeoutWatching ? (
              <p className="lead wipeout-state">{t('wipeoutOut')}</p>
            ) : isBluff ? (
              <BluffPlay view={view} paused={locked} send={send} onDraft={onDraft} />
            ) : isSort && me.sort !== null ? (
              <SortPlay question={shown ?? question} sort={me.sort} paused={locked} offsetMs={offsetMs} send={send} />
            ) : isSort ? (
              view.sort !== null && <SortWatch question={question} info={view.sort} tilts={tilts} paused={view.paused} offsetMs={offsetMs} />
            ) : isWall && me.wall !== null && question.wall !== null ? (
              <WallInput key={view.questionIndex} question={{ ...question, wall: question.wall }} wall={me.wall} paused={locked} send={send} onDraft={onDraft} />
            ) : isWall ? (
              // Глядач на полі бачить стіну того, хто вибрав, без дотиків.
              question.wall !== null && <WallGrid wall={question.wall} found={foundOf(view.wall?.rows[0]?.tiles)} />
            ) : chainMine && me.chain !== null ? (
              <ChainPlay chain={me.chain} question={question} paused={locked} offsetMs={offsetMs} send={send} onDraft={onDraft} />
            ) : instant && me.blitz !== null ? (
              <>
                {me.blitz.canAnswer ? (
                  // Після нуля поле лишається на місці, лише вимкнене: варіанти не стрибають, а сервер однаково відмовив би.
                  <fieldset className="inputs" disabled={locked || timeOver}>
                    <AnswerInput
                      key={`${view.questionIndex}-${me.blitz.position ?? 0}-${me.answer === null}`}
                      question={shown ?? question}
                      onSubmit={(answer) => {
                        if (!timeOver) void submit(answer);
                      }}
                    />
                  </fieldset>
                ) : (
                  <SpotlightChoices removed={view.removed} question={question} spotlight={own} reveal={null} blink={blink} />
                )}
                {/* Відлік вікна стоїть у рядку стану з зарезервованою висотою: ні поява, ні зникнення не зсувають черги. */}
                <div className="blitz-status-row">
                  {/* Сервер зсуває вікно лише після продовження, тож на паузі відлік вікна не показуємо. */}
                  {me.blitz.canAnswer && repickEnd !== null && !view.paused && !timeOver && (
                    <Timer view={{ endsAt: repickEnd, remainingMs: null }} offsetMs={offsetMs} />
                  )}
                  <p className="blitz-status">{instantStatus(me.blitz, timeOver, view.autopilot)}</p>
                </div>
                {queue}
              </>
            ) : myPending ? (
              <section className="sent">
                <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
                <p className="lead">{t(view.autopilot ? 'pendingWaitAuto' : 'pendingWait')}</p>
              </section>
            ) : me.blitz !== null ? (
              <>
                {(me.blitz.position === null || voice || (spotlight !== null && spotlight.playerId !== me.id)) && (
                  <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
                )}
                <BlitzTurn
                  view={view}
                  shown={shown ?? question}
                  labelled={spotlight !== null && spotlight.playerId !== me.id}
                  blitz={me.blitz}
                  voice={voice}
                  offsetMs={offsetMs}
                  notStarted={notStarted}
                  onSubmit={submit}
                  onDraft={onDraft}
                  confirm={teamDraftOn}
                  send={send}
                  onError={setError}
                />
              </>
            ) : board !== null && !chooserIsMe ? (
              <>
                {/* Глядач бачить мапу, але не точку вибравшого — лише що її поставлено. */}
                {question.pin !== null && <PinBoard pin={question.pin} imageUrl={question.imageUrl} />}
                {isSurvey && view.survey !== null && <SurveyBoard info={view.survey} />}
                <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
              </>
            ) : board !== null && voice && me.answer === null ? (
              <>
                {/* Вибрав сам: досить «Відповідайте вголос», без «Гравець відповідає вголос» над ним. */}
                <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={null} blink={blink} voice placeholder={false} />
                <p className="lead">{t('answerAloud')}</p>
              </>
            ) : me.answer !== null ? (
              <section className="sent">
                <h2>{t(me.ladder?.role === 'contestant' ? 'ladderFinalAnswer' : survivalGhost ? 'survivalGhostSent' : unscored ? 'voteSent' : me.answer.type === 'survey' ? 'surveySent' : 'answerSent')}</h2>
                {me.answer.type === 'pin' && question.pin !== null ? (
                  <PinBoard
                    pin={question.pin}
                    imageUrl={question.imageUrl}
                    marks={[{ playerId: me.id, nickname: me.nickname, x: me.answer.x, y: me.answer.y }]}
                    highlight={me.id}
                  />
                ) : me.answer.type === 'survey' ? (
                  <SurveyLines values={me.answer.values} lines={null} />
                ) : (
                  <p>{pickedText(me.answer, shownChoices(question), question.slider)}</p>
                )}
              </section>
            ) : activeBuff !== null && retryStage === 'choice' ? (
              // Часткова перша відповідь: вибір замість поля відповіді.
              <RetryPrompt active={activeBuff} question={question} send={send} onError={setError} paused={locked} />
            ) : (
              // На паузі поле лишається на місці, інакше гравець втратив би вже введене.
              // «Неправильно, ще одна спроба» стоїть у рядку пояснень бафів, тож варіанти не зсуваються.
              <>
                <fieldset className="inputs" disabled={locked || me.ladder?.hallClosed === true}>
                  <AnswerInput key={`${view.questionIndex}-${retryStage ?? ''}-${activeBuff?.spare === true ? 'spare' : 'main'}`} question={shown ?? question} removed={activeBuff?.removed ?? view.ladder?.fifty ?? view.removed} onSubmit={submit} onDraft={onDraft} confirm={teamDraftOn} />
                </fieldset>
                {teamDraftOn && <p className="meta team-you-answer">{t('teamYouAnswer')}</p>}
              </>
            )}
          </DebuffZone>
        </>
      )}

      {phase === 'locked' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
          <AwayNote away={view.away} />
          {/* Відповіді закрито: картинка, що проявлялася, вже повна. */}
          {question?.reveal && <RevealImage url={question.imageUrl} mode={question.reveal} stage={revealStageNow} />}
          {question?.clues != null && <CluesList clues={question.clues} offsetMs={offsetMs} />}
          {/* У ланцюжку немає однієї правильної відповіді: гравець бачить свій результат і чекає на рейтинг. */}
          {isSort ? (
            // Сортування: власний підсумок і очікування розкриття; глядач на полі бачить прогрес того, хто сортував.
            <section className="sent">
              {me.sort !== null ? (
                <h2>{sortOutcomeText(me.sort)}</h2>
              ) : (
                question !== null && view.sort !== null && <SortWatch question={question} info={view.sort} tilts={tilts} paused={view.paused} offsetMs={offsetMs} />
              )}
              <SortWinner view={view} />
              <p className="lead">{t('sortWaitResults')}</p>
            </section>
          ) : isBluff ? (
            <section className="sent">
              {me.bluff?.lie != null && <p>{t('bluffLieSent', { lie: me.bluff.lie })}</p>}
              <p className="lead">{t('waitReveal')}</p>
            </section>
          ) : isWall && question?.wall != null ? (
            <section className="sent">
              <WallGrid wall={question.wall} found={me.wall !== null ? me.wall.found : foundOf(view.wall?.rows[0]?.tiles)} />
              <p className="lead">{t('waitReveal')}</p>
            </section>
          ) : me.answer?.type === 'survey' ? (
            <section className="sent">
              <h2>{t('surveySent')}</h2>
              <SurveyLines values={me.answer.values} lines={null} />
              <p className="lead">{t('waitReveal')}</p>
            </section>
          ) : unscored && me.answer !== null && question !== null ? (
            <section className="sent">
              <h2>{t('voteSent')}</h2>
              <p>{pickedText(me.answer, shownChoices(question), question.slider)}</p>
              <p className="lead">{t('waitReveal')}</p>
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
              {question !== null && <SpotlightChoices removed={view.removed} question={question} spotlight={own} reveal={null} blink={blink} />}
              {queue}
              <p className="winner">
                {view.blitz?.winner ? t('blitzWinner', { name: view.blitz.winner.nickname }) : t('blitzNoWinner')}
              </p>
              <p className="lead">{t('waitReveal')}</p>
            </>
          ) : (
            <>
              {/* Поле й бліц: варіанти з помаранчевою відповіддю чи позначкою ведучого лишаються до розкриття. */}
              {isSurvey && view.survey !== null && <SurveyBoard info={view.survey} />}
              {question !== null && (spotlight !== null || board !== null || view.blitz !== null) && (
                <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
              )}
              <p className="lead">{t('waitReveal')}</p>
            </>
          )}
        </>
      )}

      {phase === 'reveal' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
          <AwayNote away={view.away} />
          {view.final !== null ? (
            <FinalResult view={view} />
          ) : isBluff ? (
            <BluffResult view={view} />
          ) : board !== null && !chooserIsMe && view.blitz === null ? (
            <section className="result">
              {/* «100 до 1»: підсумок — на табло (SurveyBoard), рядок відповіді з вердиктом зайвий. */}
              {question !== null && !isSort && !isWall && !isSurvey && <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={view.reveal} blink={blink} voice={voice} />}
              {/* Сортування: глядач бачить, як слова розкладаються по категоріях, тож рядок відповіді зайвий. */}
              {isSort && question?.sort != null && (
                <SortReveal categories={question.sort.categories} question={view.reveal !== null && view.reveal.type === 'sort' ? view.reveal : null} total={question.sort.total} marks={view.sort?.live?.marks ?? null} />
              )}
              {isWall && question?.wall != null && <WallGrid wall={question.wall} found={foundOf(view.wall?.rows[0]?.tiles)} />}
              {view.reveal?.type === 'wall' && <WallReveal question={view.reveal} colors={view.reveal.groups.map(() => null)} />}
              {isSurvey && view.survey !== null && <SurveyBoard info={view.survey} />}
              <RevealDetail view={view} answer={spotlight?.answer ?? null} player={{ id: spotlight?.playerId ?? '', nickname: spotlight?.nickname ?? chooserName }} />
              <h2>{t('boardAnswered', { name: chooserName })}</h2>
              {view.reveal !== null && !isSort && view.reveal.type !== 'pin' && view.reveal.type !== 'wall' && view.reveal.type !== 'survey' && <p>{t('correctAnswer', { answer: correctText(view.reveal, question?.choices) })}</p>}
            </section>
          ) : (
            <>
              {/* Вибравший і бліц: варіанти з кольором вердикту над власним результатом; вердикт уже в Result, тож без voice. */}
              {instant
                ? question !== null && <SpotlightChoices removed={view.removed} question={question} spotlight={own} reveal={view.reveal} blink={blink} voice={false} />
                : spotlight !== null &&
                  question !== null &&
                  !isSurvey && <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={view.reveal} blink={blink} voice={false} />}
              {queue}
              <Result view={view} />
            </>
          )}
          {view.own?.reveal != null && <OwnRevealLine fact={view.own.reveal} team={view.team !== null} />}
        </>
      )}

      {phase === 'leaderboard' && view.wipeout !== null && (
        <>
          {!acting && me.wipeout?.canDecide === true ? (
            <p className="lead team-decides">{t('teamCaptainDecides')}</p>
          ) : (
            <WipeoutDecision view={view} offsetMs={offsetMs} onDecide={(take) => void decideGuard.run('player:wipeout', { take })} />
          )}
          <WipeoutLadder info={view.wipeout} size="phone" highlightId={me.id} />
        </>
      )}

      {phase === 'leaderboard' && view.ladder !== null && (
        <>
          {!acting && view.ladder.decision === 'pending' && me.ladder?.role === 'contestant' ? (
            <p className="lead ladder-state team-decides">{t('teamCaptainDecides')}</p>
          ) : view.ladder.decision === 'pending' && me.ladder?.role === 'contestant' ? (
            <LadderDecision
              info={view.ladder}
              disabled={view.paused || !me.ladder.canDecide}
              onDecide={(take) => void decideGuard.run('player:ladder', { take })}
            />
          ) : view.ladder.outcome !== null ? (
            <p className="lead ladder-state">{ladderOutcomeText(view.ladder)}</p>
          ) : view.ladder.decision === 'pending' ? (
            <p className="lead ladder-state">{view.ladder.contestant === null ? t('ladderDecidingWait') : t('ladderDeciding', { name: view.ladder.contestant.nickname })}</p>
          ) : (
            <p className="lead ladder-state">{t('ladderPlayingOn')}</p>
          )}
          <LadderBoard info={view.ladder} size="phone" />
        </>
      )}

      {phase === 'leaderboard' && view.survival !== null && (
        <>
          {view.survival.trial !== null && !acting && (me.survival?.canAnswerTrial === true || me.survival?.canPickDoor === true) ? (
            <>
              <p className="lead survival-state team-decides">{t('teamCaptainDecides')}</p>
              {team?.draft != null && view.survival.trial.question !== null && (
                <p className="team-draft is-draft">
                  <span className="draft-mark">{t(buzzerOf(view) !== null ? 'teamDraftNeutral' : 'teamDraftMark')}</span>
                  {pickedText(team.draft, shownChoices(view.survival.trial.question), view.survival.trial.question.slider)}
                </p>
              )}
            </>
          ) : view.survival.trial !== null ? (
            <SurvivalTrial
              view={view}
              offsetMs={offsetMs}
              onAnswer={(answer) => {
                sendDraft.cancel();
                void decideGuard.run('player:trial', { answer });
              }}
              onDoor={(door) => void decideGuard.run('player:door', { door })}
              onDraft={onDraft}
              confirm={teamDraftOn}
            />
          ) : (
            view.survival.verdict !== null &&
            view.survival.verdict !== 'trial' && (
              <p className="lead survival-state">{t(view.survival.verdict === 'all_wrong' ? 'survivalAllWrong' : 'survivalAllRight')}</p>
            )
          )}
          <SurvivalBoard info={view.survival} size="phone" highlightId={me.id} />
        </>
      )}

      {phase === 'leaderboard' && view.wipeout === null && view.survival === null && view.ladder === null && view.standings !== null && (
        <>
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
        </>
      )}

      {phase === 'round_end' && view.standings !== null && (
        <>
          <h1 className="question">{t('roundResults', { index: (view.round?.index ?? 0) + 1 })}</h1>
          {me.wipeout !== null && <WipeoutDecision view={view} offsetMs={offsetMs} onDecide={() => undefined} />}
          {survivalStateLine(me.survival) !== null && <p className="lead survival-state">{survivalStateLine(me.survival)}</p>}
          {me.ladder?.won != null && <p className="lead ladder-state">{t('ladderWon', { points: num(me.ladder.won) })}</p>}
          {place}
          <Standings standings={view.standings} highlightId={me.id} limit={5} />
          {view.own?.round != null && <RoundCardView card={view.own.round} team={view.team !== null} />}
          {view.facts?.round != null && <FactCards cards={view.facts.round} withRound={false} title={t('roundFactsTitle')} />}
        </>
      )}

      {phase === 'finished' && (
        <>
          <h1 className="question">{t('gameOver')}</h1>
          {survivalStateLine(me.survival) !== null && <p className="lead survival-state">{survivalStateLine(me.survival)}</p>}
          {me.ladder?.won != null && <p className="lead ladder-state">{t('ladderWon', { points: num(me.ladder.won) })}</p>}
          {place}
          {view.own?.game != null && <GameCardView card={view.own.game} team={view.team !== null} />}
          {view.standings !== null && <Standings standings={view.standings} highlightId={me.id} />}
          <MenuLinks role="player" />
        </>
      )}

      {clip !== null && stageGone && (phase === 'question' || phase === 'locked' || phase === 'reveal') && (
        <div className="player-audio">
          <QuestionAudio
            key={`${view.round?.index ?? 0}:${view.questionIndex}:${onSpare ? 'spare' : 'main'}`}
            clip={clip}
            questionKey={`${view.round?.index ?? 0}:${view.questionIndex}:${onSpare ? 'spare' : 'main'}`}
            ready={phase === 'question' && !notStarted && !view.paused}
            paused={view.paused}
            command={null}
            elapsedMs={() => questionElapsedMs(onSpare && myClock !== null ? { ...view, ...myClock } : view, Date.now() + offsetMs)}
            splash={notStarted}
          />
        </div>
      )}

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {/* Тривога (12e) — останній шар екрана, над заставками, аркушами й смугою «Немає зв'язку». */}
      <AwayAlarm code={code} person={team?.memberId ?? me.id} away={view.lastAway} />
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
  notStarted,
  onSubmit,
  onDraft,
  confirm,
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
  /** Ще йде заставка клітинки: натискання й відповідь чекають на старт. */
  notStarted: boolean;
  onSubmit: (answer: Answer) => void;
  /** Живий вибір: команда — товаришам і пульту (лише від того, хто відповідає); соло — пульту. */
  onDraft?: (draft: SubmittedAnswer | null) => void;
  /** Командна гра: одиночний вибір з підтвердженням. */
  confirm: boolean;
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
          <p>{pickedText(me.answer, shownChoices(question), question.slider)}</p>
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
            <fieldset className="inputs" disabled={view.paused || notStarted}>
              <AnswerInput key={`${view.questionIndex}-${blitz.attemptsUsed}`} question={shown} onSubmit={onSubmit} onDraft={onDraft} confirm={confirm} />
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
        <button type="button" className="btn btn-primary btn-buzz" disabled={!blitz.canBuzz || notStarted} onClick={() => void buzz()}>
          {t('buzz')}
        </button>
      )}
    </>
  );
}
