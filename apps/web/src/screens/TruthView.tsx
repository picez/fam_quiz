import { useId, useRef, useState } from 'react';
import { LIMITS, truthText, type Answer, type HostTruth, type PlayerTruth, type PublicQuestion, type StageView, type TruthInfo, type TruthRecap } from '@quiz/shared';
import { questionClass, signed } from '../format';
import { errorText, t } from '../i18n';
import { Timer, timerStatus } from '../live/Timer';
import type { Send } from '../live/types';
import { StageAnswerers } from './StageAnswerers';

/** Понад стільки імен сцена ущільнює список і рядки розкриття: 20+ гравців уміщаються на 1600×900. */
const MANY_TRUTH_NAMES = 12;

/**
 * Телефон: поле факту (до 200 символів, лічильник), «Зберегти»; збережений текст або позначка ведучого. Факти закрито — нічого.
 * Відмова truth_closed приходить разом зі зрізом canWrite:false — форми вже немає, тож її текст іде в onError (рядок помилки екрана).
 */
export function TruthFactForm({ truth, send, onError }: { truth: PlayerTruth; send: Send; onError?: (text: string | null) => void }) {
  const id = useId();
  const [value, setValue] = useState(truth.fact);
  // Поки людина пише, новий зріз поле не скидає; без правок поле йде за збереженим текстом.
  const [dirty, setDirty] = useState(false);
  const [seen, setSeen] = useState(truth.fact);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  if (seen !== truth.fact) {
    setSeen(truth.fact);
    if (!dirty) setValue(truth.fact);
  }
  if (!truth.canWrite) return null;
  const save = () => {
    if (busy.current) return;
    busy.current = true;
    const text = truthText(value);
    void send('player:truth', { text })
      .then((result) => {
        if (!result.ok && result.error === 'truth_closed' && onError !== undefined) {
          setError(null);
          onError(errorText(result.error));
          return;
        }
        setError(result.ok ? null : errorText(result.error));
        if (result.ok) setDirty(false);
      })
      .catch(() => setError(errorText('network')))
      .finally(() => {
        busy.current = false;
      });
  };
  // Той самий текст рушій не міняє (і схованого не відкриває): кнопка оживає лише з новим текстом.
  const changed = truthText(value) !== truth.fact;
  return (
    <section className="panel truth-form">
      <label className="field" htmlFor={id}>
        <span className="lead">{t('truthFactLabel')}</span>
      </label>
      <p className="meta">{t('truthFactHint')}</p>
      <textarea
        id={id}
        className="truth-text"
        dir="auto"
        rows={3}
        maxLength={LIMITS.truthText}
        value={value}
        onChange={(event) => {
          setValue(event.target.value.slice(0, LIMITS.truthText));
          setDirty(true);
          setError(null);
        }}
      />
      <div className="truth-form-row">
        <span className="meta truth-count" dir="ltr">
          {t('truthFactCount', { count: value.length })}
        </span>
        <button type="button" className="btn btn-primary" disabled={!changed} onClick={save}>
          {t('truthFactSave')}
        </button>
      </div>
      {truth.hidden ? (
        <p className="lead truth-hidden">{t('truthFactHidden')}</p>
      ) : (
        truth.fact !== '' && (
          <p className="meta truth-saved" dir="auto">
            {t('truthFactSaved', { text: truth.fact })}
          </p>
        )
      )}
      <p className="meta truth-error" role="status">
        {error}
      </p>
    </section>
  );
}

/** Пульт: людина · факт · «Сховати»/«Показати» (host:truth-hide); зіграні й поза колодою (після роздачі) — без кнопки; число нехованих. */
export function HostTruthFacts({ truth, send, onError }: { truth: HostTruth; send: Send; onError?: (text: string | null) => void }) {
  const busy = useRef(false);
  const toggle = (playerId: string, hidden: boolean) => {
    if (busy.current) return;
    busy.current = true;
    void send('host:truth-hide', { playerId, hidden })
      .then((result) => onError?.(result.ok ? null : errorText(result.error)))
      .finally(() => {
        busy.current = false;
      });
  };
  const visible = truth.facts.filter((fact) => !fact.hidden).length;
  return (
    <section className="panel truth-host">
      <h2>{t('truthHostTitle')}</h2>
      {truth.facts.length === 0 ? (
        <p className="meta">{t('truthHostNone')}</p>
      ) : (
        <>
          <p className="meta">{t('truthFactsCount', { count: visible })}</p>
          <ul className="rows truth-facts">
            {truth.facts.map((fact) => (
              <li key={fact.id} className={fact.hidden ? 'truth-fact is-hidden' : 'truth-fact'}>
                <span className="name" dir="auto">
                  {fact.nickname}
                </span>
                <span className="truth-fact-text" dir="auto">
                  {fact.text}
                </span>
                {fact.revised && <span className="tag truth-revised">{t('truthHostRevised')}</span>}
                {fact.hidden && <span className="tag is-wrong">{t('truthHostHiddenMark')}</span>}
                {fact.played ? (
                  <span className="tag">{t('truthHostPlayed')}</span>
                ) : !fact.inDeck ? null : (
                  <button type="button" className="btn btn-small" onClick={() => toggle(fact.id, !fact.hidden)}>
                    {t(fact.hidden ? 'truthHostShow' : 'truthHostHide')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Імена для читання (товариш, що не відповідає): позначене чернеткою — пунктиром; порядок — як у варіантах. */
export function TruthNames({ question, draft, mark }: { question: PublicQuestion; draft: Answer | null; mark: string }) {
  const marked = draft?.type === 'single' ? draft.optionId : null;
  return (
    <ul className="truth-names is-readonly">
      {question.choices.map((choice) => (
        <li key={choice.id} className={choice.id === marked ? 'truth-name is-draft' : 'truth-name'} dir="auto">
          {choice.text}
          {choice.id === marked && <span className="draft-mark">{mark}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Телефон на question: «Хто це написав?» і імена кнопками в одну колонку; один вибір → player:answer. Факт — у заголовку екрана.
 * held — підсумок раунду попереду: під іменами нагадування, що автора назвуть наприкінці раунду.
 */
export function TruthPick({ question, disabled, send, held = false }: { question: PublicQuestion; disabled: boolean; send: Send; held?: boolean }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const pick = (optionId: string) => {
    if (busy.current || disabled || picked !== null) return;
    busy.current = true;
    setPicked(optionId);
    void send('player:answer', { type: 'single', optionId })
      .then((result) => {
        if (result.ok) return setError(null);
        setError(errorText(result.error));
        setPicked(null);
      })
      .catch(() => {
        setError(errorText('network'));
        setPicked(null);
      })
      .finally(() => {
        busy.current = false;
      });
  };
  return (
    <section className="truth-pick">
      <p className="lead">{t('truthWho')}</p>
      <ul className="truth-names">
        {question.choices.map((choice) => (
          <li key={choice.id}>
            <button
              type="button"
              className={choice.id === picked ? 'btn truth-name is-picked' : 'btn truth-name'}
              dir="auto"
              disabled={disabled || picked !== null}
              onClick={() => pick(choice.id)}
            >
              {choice.text}
            </button>
          </li>
        ))}
      </ul>
      {held && <p className="meta truth-held-hint">{t('truthHeldNote')}</p>}
      <p className="meta truth-error" role="status">
        {error}
      </p>
    </section>
  );
}

/** Телефон автора (і його команди): «Це ваш факт — вгадують інші». */
export function TruthOwn({ team }: { team: boolean }) {
  return (
    <p className="lead truth-own" role="status">
      {t(team ? 'truthOwnTeam' : 'truthOwn')}
    </p>
  );
}

/**
 * Сцена на question/locked: «Хто це написав?», факт великим, «Факт k з n», таймер, імена дрібно — без букв варіантів і
 * без позначок «відповів» по людях (лише лічильник); у командах — рядок відповідачів (12g). На reveal замість імен — розкриття.
 */
export function TruthStage({ view, offsetMs }: { view: StageView; offsetMs: number }) {
  const { question, truth } = view;
  if (question === null || truth === undefined || truth.index === null) return null;
  // Розкриття останнього факту — підсумок усього раунду.
  if (view.phase === 'reveal' && truth.recap !== undefined) {
    return (
      <div className="stage-question truth-stage is-recap">
        <TruthRecapView recap={truth.recap} big />
      </div>
    );
  }
  // Підсумок попереду: після закриття (і на «розкритті», яке сцена бачить як locked) — замість автора печатка.
  const sealed = truth.held === true && view.phase !== 'question';
  return (
    <div className="stage-question truth-stage">
      <header className="bar">
        <span>{t('truthOf', { index: truth.index + 1, total: truth.count })}</span>
        {/* На reveal playerCount — усі гравці (для «Місце N з M»), а не ті, хто вгадує: лічильник лише поки запитання йде. */}
        {view.phase !== 'reveal' && <span>{t('answeredOf', { answered: view.answeredCount, total: view.playerCount })}</span>}
      </header>
      {/* Командна гра не в режимі captain: хто відповідає за кожну команду — за всі однаково (капітан), команда автора не випадає. */}
      <StageAnswerers view={view} />
      <p className="lead truth-who">{t('truthWho')}</p>
      <div className="stage-main">
        <h1 className={questionClass(question.text)} dir="auto">
          {question.text}
        </h1>
        {view.phase === 'question' && (
          <div className="stage-clock">
            <Timer view={view} offsetMs={offsetMs} total={view.limitMs} status={timerStatus(view)} />
          </div>
        )}
      </div>
      {sealed && (
        <p className="truth-seal" role="status">
          <svg className="truth-seal-mark" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          <span>
            <strong>{t(truth.sealed === true ? 'truthSealed' : 'truthClosed')}</strong>
            <span className="truth-seal-note">{t('truthHeldNote')}</span>
          </span>
        </p>
      )}
      {view.phase === 'reveal' ? (
        <TruthReveal truth={truth} big />
      ) : (
        <ul className={question.choices.length > MANY_TRUTH_NAMES ? 'truth-stage-names is-many' : 'truth-stage-names'}>
          {question.choices.map((choice) => (
            <li key={choice.id} dir="auto">
              {choice.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Сцена й телефони на reveal: автор великим, бали автора, хто кого вибрав (✓/✗). До розкриття — нічого. */
export function TruthReveal({ truth, big = false }: { truth: TruthInfo; big?: boolean }) {
  const { reveal } = truth;
  if (reveal === null) return null;
  return (
    <section className={['truth-reveal', big ? 'is-big' : '', big && reveal.picks.length > MANY_TRUTH_NAMES ? 'is-many' : ''].filter(Boolean).join(' ')}>
      <p className="truth-author" dir="auto">
        {t('truthAuthorIs', { nickname: reveal.author.nickname })}
      </p>
      <p className={reveal.points > 0 ? 'lead truth-author-points is-up' : 'lead truth-author-points'}>{t('truthAuthorPoints', { points: signed(reveal.points) })}</p>
      {reveal.picks.length > 0 && (
        <ul className="truth-picks">
          {reveal.picks.map((pick) => (
            <li key={pick.id} className={pick.picked === null ? 'truth-pick-row' : pick.correct ? 'truth-pick-row is-correct' : 'truth-pick-row is-wrong'} dir="auto">
              {pick.picked === null ? t('truthNoPick', { nickname: pick.nickname }) : `${t('truthPicked', { nickname: pick.nickname, picked: pick.picked })} ${pick.correct ? '✓' : '✗'}`}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Понад стільки фактів сцена ставить підсумок у чотири колонки дрібніше. */
const MANY_RECAP_FACTS = 9;
/** Понад стільки вгадувачів картка підсумку пише «Вгадали N з M» замість імен. */
const MANY_RECAP_NAMES = 6;

/** Свій учасник на телефоні: id у виборах (соло — гравець, команда — команда) і чи факт свій (мій чи моєї команди). */
export interface TruthRecapMine {
  id: string;
  own: (authorId: string) => boolean;
  /** Командна гра: вибір робить команда (капітан), тож «Вибір команди» / «Команда вгадала», а не «Ваш вибір» / «Ви вгадали». */
  team?: boolean;
}

/**
 * Підсумок раунду (сцена, пульт, телефон): картки «факт → автор», хто вгадав і бали автора, у порядку гри.
 * big — сцена (сітка карток); mine — телефон: на кожній картці свій вибір (✓/✗) чи «Ваш факт», угорі — скільки вгадано.
 */
export function TruthRecapView({ recap, big = false, mine, title = true }: { recap: TruthRecap; big?: boolean; mine?: TruthRecapMine; title?: boolean }) {
  const many = recap.facts.length > MANY_RECAP_FACTS;
  const cols = recap.facts.length <= 4 ? 2 : many ? 4 : 3;
  const guessed = mine === undefined ? [] : recap.facts.flatMap((fact) => fact.picks.filter((pick) => pick.id === mine.id));
  const team = mine?.team === true;
  return (
    <section className={['truth-recap', big ? `is-big cols-${cols}` : '', big && many ? 'is-many' : ''].filter(Boolean).join(' ')}>
      {title && <h2 className="truth-recap-title">{t('truthRecapTitle')}</h2>}
      {recap.early && <p className="meta truth-recap-early">{t('truthRecapEarly')}</p>}
      {guessed.length > 0 && <p className="lead truth-recap-score">{t(team ? 'truthRecapTeamMine' : 'truthRecapMine', { count: guessed.filter((pick) => pick.correct).length, total: guessed.length })}</p>}
      <ol className="truth-recap-list">
        {recap.facts.map((fact, index) => {
          const right = fact.picks.filter((pick) => pick.correct);
          const own = mine?.own(fact.author.id) === true;
          const pick = mine === undefined ? undefined : fact.picks.find((p) => p.id === mine.id);
          return (
            <li key={index} className={own ? 'truth-recap-card is-own' : 'truth-recap-card'}>
              <p className="truth-recap-fact" dir="auto">
                {fact.text}
              </p>
              <p className="truth-recap-author" dir="auto">
                {fact.author.nickname}
              </p>
              <p className="meta truth-recap-right" dir="auto">
                {right.length === 0
                  ? t('truthRecapNobody')
                  : right.length > MANY_RECAP_NAMES
                    ? t('truthRecapRightCount', { count: right.length, total: fact.picks.length })
                    : t('truthRecapRight', { names: right.map((p) => p.nickname).join(', ') })}
                {fact.points > 0 && <span className="truth-recap-points">{t('truthAuthorPoints', { points: signed(fact.points) })}</span>}
              </p>
              {own ? (
                <p className="truth-recap-mine is-own">{t(team ? 'truthRecapOwnTeam' : 'truthRecapOwn')}</p>
              ) : (
                pick !== undefined && (
                  <p className={pick.picked === null ? 'truth-recap-mine' : pick.correct ? 'truth-recap-mine is-correct' : 'truth-recap-mine is-wrong'} dir="auto">
                    {pick.picked === null ? t(team ? 'truthTeamSkipped' : 'truthYouSkipped') : `${t(team ? 'truthTeamPick' : 'truthYourPick', { nickname: pick.picked })} ${pick.correct ? '✓' : '✗'}`}
                  </p>
                )
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Телефон і пульт на round_end / finished: підсумок у «Хто що написав», що розгортається. */
export function TruthRecapFold({ recap, mine, open }: { recap: TruthRecap; mine?: TruthRecapMine; open: boolean }) {
  return (
    <details className="panel truth-recap-fold" open={open}>
      <summary>
        {t('truthRecapTitle')} <span className="meta">({recap.facts.length})</span>
      </summary>
      <TruthRecapView recap={recap} mine={mine} title={false} />
    </details>
  );
}

/** Телефон на locked раунду, чий підсумок попереду: свій вибір (у командах — вибір команди; без вердикту) і «автора назвемо наприкінці раунду». */
export function TruthHeldPick({ question, answer, team = false }: { question: PublicQuestion; answer: Answer | null; team?: boolean }) {
  const picked = answer?.type === 'single' ? (question.choices.find((choice) => choice.id === answer.optionId)?.text ?? null) : null;
  return (
    <section className="sent truth-held">
      <h2 dir="auto">{picked === null ? t(team ? 'truthTeamSkipped' : 'truthYouSkipped') : t(team ? 'truthTeamPick' : 'truthYourPick', { nickname: picked })}</h2>
      <p className="lead">{t('truthHeldNote')}</p>
    </section>
  );
}

/** Сцена й телефони на round_end пропущеного раунду. */
export function TruthSkipped() {
  return (
    <p className="lead truth-skipped" role="status">
      {t('truthSkipped')}
    </p>
  );
}
