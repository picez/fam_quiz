import { useEffect, useRef, useState, type FormEvent } from 'react';
import { clueShare, isUnscored, revealShare, type Answer, type DiceInfo, type PlayerBlitz, type PlayerSurveyLine, type PlayerView, type PublicClues, type PublicQuestion, type Question, type Spotlight } from '@quiz/shared';
import { answerText, correctText, markText, pickedText, sliderValueText, shownChoices, num, questionClass, questionLabel, roundLabel, secondsText, signed } from '../format';
import { countText, errorText, t } from '../i18n';
import { typeHow } from '../guide-text';
import { RoundBriefing, RoundFacts } from './RoundBriefing';
import { AdjustmentToast, BuffToast, DebuffToast, LiveNotices } from '../live/LiveNotices';
import { GuidePageView } from '../live/Guide';
import { Splash, useSplash } from '../live/Splash';
import { Timer, timerStatus, useTimeOver } from '../live/Timer';
import type { Send } from '../live/types';
import { publicWindowMs, revealStage, useRevealProgress } from '../reveal';
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
import { ChainPlay, ChainWords } from './ChainView';
import { SortPlay, SortReveal, SortWatch } from './SortView';
import { WallGrid } from './WallGrid';
import { WallReveal } from './WallReveal';
import { WallInput } from './WallInput';
import { SurveyBoard } from './SurveyBoard';
import { BluffBoard } from './BluffBoard';
import { BluffChoice } from './BluffChoice';
import { BluffLieInput } from './BluffLieInput';
import { DebuffZone, useDebuffQuestion } from './Debuffs';
import { DuelBanner, DuelButton, DuelPlay } from './DuelView';
import { MenuLinks } from './MenuLinks';
import { DebuffShop } from './DebuffShop';
import { TableButton } from './TableSheet';
import { BuffPanel, BuffRow, OvertimeLine, RetryPrompt, VoteSheet } from './Buffs';

interface Props {
  view: PlayerView;
  hostOnline: boolean;
  offsetMs: number;
  send: Send;
}

/** «Хто я?» на телефоні: відкриті підказки з відліком до наступної і частка ціни за правильну відповідь зараз. */
function CluesNow({ clues, offsetMs }: { clues: PublicClues; offsetMs: number }) {
  const k = Math.max(1, clues.shown.length);
  return (
    <>
      <CluesList clues={clues} offsetMs={offsetMs} />
      <p className="meta clues-now">{t('cluesNow', { k, n: clues.total, percent: Math.round(clueShare(clues.total, k) * 100) })}</p>
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
function BluffPlay({ view, paused, send }: { view: PlayerView; paused: boolean; send: Send }) {
  const { bluff } = view;
  const mine = view.me.bluff;
  if (bluff === null || mine === null) return null;
  if (bluff.stage === 'lies') {
    return (
      <section className="bluff-play">
        <p className="bluff-stage">{t('bluffStageLies')}</p>
        {mine.lie === null ? (
          <fieldset className="inputs" disabled={paused}>
            <BluffLieInput send={send} />
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
  const open = me.bluff.truth !== null;
  const tone = result === null || result.points <= 0 ? 'is-wrong' : 'is-correct';
  return (
    <section className={open ? `result ${tone}` : 'result'}>
      <BluffBoard info={bluff} />
      {open ? (
        <>
          <h2>{t(me.bluff.truth ? 'bluffTruthYes' : 'bluffTruthNo')}</h2>
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
      <WallOutcome view={view} />
      <SurveyOutcome view={view} />
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

export function PlayerScreen({ view, hostOnline, offsetMs, send }: Props) {
  const [error, setError] = useState<string | null>(null);
  const { me, phase, question } = view;
  // Поступ проявлення картинки: лише за часом; від locked — 1 (повна).
  const revealP = useRevealProgress(view, question, offsetMs);
  const revealStageNow = revealStage(revealP);
  // Хук на рівні екрана: під «Дзеркалом» варіанти зсуваються по колу; інакше те саме запитання.
  const shown = useDebuffQuestion(question, me.debuff);

  // Заставка перед запитанням: шар пропускає дотики (pointer-events: none), тож поле й бафи під ним вимкнені до старту.
  const splashNow = useSplash(view.splash, view.paused, offsetMs);
  const notStarted = phase === 'question' && splashNow !== null && (splashNow.splash.kind === 'question' || splashNow.splash.kind === 'cell');
  const locked = view.paused || notStarted;
  // Під будь-якою заставкою (раунд, фінал, підсумки) кнопки шапки й вступу вимкнені: крізь шар їх не натиснути наосліп.
  const splashUp = splashNow !== null;

  const submit = async (answer: Answer) => {
    // До старту сервер однаково відмовив би: дотик, що проскочив крізь вимкнене поле, нічого не надсилає.
    if (notStarted) return;
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
  const tip = me.tip !== null && activeBuff?.spare !== true ? typeHow(me.tip, question?.orderLabels?.top ?? '') : null;
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

  const place = me.rank !== null && <p className="place">{t('yourPlace', { rank: me.rank, total: view.playerCount })}</p>;

  return (
    // aria-busy: під заставкою запитання чи клітинки поле вже стоїть, але запитання ще не почалося.
    <main className="app player" aria-busy={notStarted || undefined}>
      {/* Смуга й сповіщення — position: fixed, тож нічого не зсувають. */}
      <DuelBanner duel={view.duel} phase={view.phase} />
      <LiveNotices>
        <AdjustmentToast notice={view.notice} offsetMs={offsetMs} />
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
        <span>{me.nickname}</span>
        {/* Кнопка не вища за рядок шапки: її поява не зсуває екран. */}
        <DuelButton duel={me.duel} paused={view.paused || splashUp} send={send} onError={setError} />
        {me.shop !== null && <DebuffShop shop={me.shop} score={me.score} send={send} onError={setError} />}
        {view.table !== null && <TableButton table={view.table} meId={me.id} />}
        <strong className="score">{num(me.score)}</strong>
      </header>

      {view.paused && (
        <p className="banner" role="status">
          {t(hostOnline ? 'paused' : 'waitingHost')}
        </p>
      )}

      {phase === 'lobby' && <p className="lead">{t('inLobby')}</p>}

      {phase === 'guide' && view.guide !== null && <GuidePageView guide={view.guide} size="phone" />}

      {phase === 'duel' && view.duel !== null && <DuelPlay view={view} offsetMs={offsetMs} send={send} onError={setError} />}

      {phase === 'intro' && view.round !== null && (
        <>
          {view.round.total > 1 && <p className="meta">{t('roundOf', { index: view.round.index + 1, total: view.round.total })}</p>}
          <h1 className="question">{roundLabel(view.round.title, view.round.index, view.round.type)}</h1>
          <RoundFacts round={view.round} total={view.total} />
          <RoundBriefing brief={view.round.brief} description={view.round.description} newcomers={view.newcomers} />
          {board !== null && (
            <BoardIntro board={board} meId={me.id}>
              {board.dice !== null && !board.dice.done && (
                <DiceAction dice={board.dice} meId={me.id} paused={view.paused || splashUp} send={send} onError={setError} />
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
              <p className={waiting ? 'meta is-hidden' : 'meta'}>
                {questionLabel(view.round, view.questionIndex, view.total)}
                {/* Запасне — власна заміна: позначка в тому самому рядку підпису, без нового блоку. */}
                {activeBuff?.spare === true && <span className="spare-tag">{t('spareTag')}</span>}
              </p>
              {waiting && <OvertimeLine rows={view.overtime} offsetMs={offsetMs} />}
            </div>
            {!chainMine && <Timer view={myClock ?? view} offsetMs={offsetMs} total={clockTotal} status={timerStatus(view)} leadMs={question.audio ? publicWindowMs(question) - (question.timeLimit ?? 0) * 1000 : 0} />}
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
          <DebuffZone debuff={me.debuff} limitMs={view.limitMs} offsetMs={offsetMs} questionIndex={view.questionIndex}>
            <h1 className={questionClass(question.text)}>{question.text}</h1>
            {/* Власна картинка точки — це основа мапи, вона вже в рамці. */}
            <RevealImage url={question.pin !== null ? null : question.imageUrl} mode={question.reveal || null} stage={revealStageNow} />
            {question.reveal && me.answer === null && (
              <p className="meta reveal-hint">
                {t('revealHint')} {t('revealNow', { percent: Math.round(revealShare(revealP, 1) * 100) })}
              </p>
            )}
            {/* Підказки й частка — і після відповіді, і глядачам на полі: підказки далі відкриваються. */}
            {question.clues !== null && <CluesNow clues={question.clues} offsetMs={offsetMs} />}
            <YouTubePlayer video={question.video} masked={view.reveal === null} />
            {/* Ряд бафів — з першої миті запитання до його закриття, однакового розміру в усіх станах. */}
            {me.buffs !== null && <BuffRow buffs={me.buffs} paused={view.paused} timeOver={buffTimeOver} notStarted={notStarted} send={send} onError={setError} />}
            {/* Підказка й голоси залу — у блоці сталої висоти, що з'являється лише з власним бафом. */}
            {activeBuff !== null && <BuffPanel active={activeBuff} question={question} offsetMs={offsetMs} />}
            {/* У фіналі гравець грає на ставку: ціни за слово немає. */}
            {isSort && view.round?.type !== 'final' && <p className="meta sort-points">{countText('sortPointsPerWord', question.points, { points: question.points })}</p>}
            {isBluff ? (
              <BluffPlay view={view} paused={locked} send={send} />
            ) : isSort && me.sort !== null ? (
              <SortPlay question={shown ?? question} sort={me.sort} paused={locked} offsetMs={offsetMs} send={send} />
            ) : isSort ? (
              view.sort !== null && <SortWatch question={question} info={view.sort} />
            ) : isWall && me.wall !== null && question.wall !== null ? (
              <WallInput key={view.questionIndex} question={{ ...question, wall: question.wall }} wall={me.wall} paused={locked} send={send} />
            ) : isWall ? (
              // Глядач на полі бачить стіну того, хто вибрав, без дотиків.
              question.wall !== null && <WallGrid wall={question.wall} found={foundOf(view.wall?.rows[0]?.tiles)} />
            ) : chainMine && me.chain !== null ? (
              <ChainPlay chain={me.chain} question={question} paused={locked} offsetMs={offsetMs} send={send} />
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
                  <p className="blitz-status">{instantStatus(me.blitz, timeOver)}</p>
                </div>
                {queue}
              </>
            ) : myPending ? (
              <section className="sent">
                <SpotlightChoices removed={view.removed} question={question} spotlight={spotlight} reveal={null} blink={blink} voice={voice} />
                <p className="lead">{t('pendingWait')}</p>
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
                <h2>{t(unscored ? 'voteSent' : me.answer.type === 'survey' ? 'surveySent' : 'answerSent')}</h2>
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
              <fieldset className="inputs" disabled={locked}>
                <AnswerInput key={`${view.questionIndex}-${retryStage ?? ''}-${activeBuff?.spare === true ? 'spare' : 'main'}`} question={shown ?? question} removed={activeBuff?.removed ?? view.removed} onSubmit={submit} />
              </fieldset>
            )}
          </DebuffZone>
        </>
      )}

      {phase === 'locked' && (
        <>
          <h1 className={questionClass(question?.text ?? '')}>{question?.text}</h1>
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
                question !== null && view.sort !== null && <SortWatch question={question} info={view.sort} />
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
                <SortReveal categories={question.sort.categories} question={view.reveal !== null && view.reveal.type === 'sort' ? view.reveal : null} total={question.sort.total} />
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
          <MenuLinks role="player" />
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
  notStarted,
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
  /** Ще йде заставка клітинки: натискання й відповідь чекають на старт. */
  notStarted: boolean;
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
        <button type="button" className="btn btn-primary btn-buzz" disabled={!blitz.canBuzz || notStarted} onClick={() => void buzz()}>
          {t('buzz')}
        </button>
      )}
    </>
  );
}
