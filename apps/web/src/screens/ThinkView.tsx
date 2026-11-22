import { useEffect, useId, useRef, useState } from 'react';
import { LIMITS, type HostThink, type Phase, type PlayerThink, type PublicQuestion, type StageView, type ThinkInfo, type ThinkOff, type ThinkRow, type ThinkWord } from '@quiz/shared';
import { num, questionClass, signed } from '../format';
import { errorText, t } from '../i18n';
import { RowReaction } from '../live/Reactions';
import { useAnswerFocus } from '../live/useAnswerFocus';
import { Timer, timerStatus } from '../live/Timer';
import type { Send } from '../live/types';
import type { DraftInput } from './TeamWatch';
import { parseSynonyms } from '../think-words';
import { MANY_ROWS } from './dense';

/** Понад стільки сердець ряд стискається до «❤️ N»: 10 сердець у рядку сцени з 24 гравцями — шум. */
const HEARTS_IN_ROW = 5;

/** Слово як його надсилає телефон: пробіли зведено, обрізано. */
const tidy = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * «Думай інакше» (35): ❤️ × lives, згаслі — до max; lost — останнє втрачене серце гасне (анімація лише без prefers-reduced-motion, у CSS).
 * Понад HEARTS_IN_ROW на старті — «❤️ N». aria-label — «Життя: N».
 */
export function ThinkHearts({ lives, max, lost = false }: { lives: number; max: number; lost?: boolean }) {
  const label = t('thinkHeartsLabel', { count: lives });
  if (max > HEARTS_IN_ROW) {
    return (
      <span className={lost ? 'think-hearts is-compact is-lost' : 'think-hearts is-compact'} role="img" aria-label={label} dir="ltr">
        <span aria-hidden="true">{lives > 0 ? '❤️' : '🤍'}</span>
        <span aria-hidden="true">{lives}</span>
      </span>
    );
  }
  return (
    <span className="think-hearts" role="img" aria-label={label} dir="ltr">
      {Array.from({ length: max }, (_, i) => {
        // lost: серце одразу за живими — щойно втрачене, воно гасне на очах.
        const gone = i >= lives;
        const fresh = lost && i === lives;
        return (
          <span key={i} aria-hidden="true" className={fresh ? 'think-heart is-gone is-lost' : gone ? 'think-heart is-gone' : 'think-heart'}>
            ❤️
          </span>
        );
      })}
    </span>
  );
}

/**
 * Телефон: тема, одне поле (maxLength 40, enterKeyHint send), «Надіслати» → player:answer { type: 'think', value }; після — «Ваше слово: …».
 * answer — уже прийняте слово (me.answer); out/spectator — лише статус, без поля. Поле не скидається від нових зрізів:
 * воно живе в стані компонента, а ключ ззовні — номер запитання.
 */
export function ThinkInput({
  question,
  think,
  disabled,
  send,
  answer = null,
  author = false,
  onDraft,
}: {
  question: PublicQuestion;
  think: PlayerThink;
  disabled: boolean;
  send: Send;
  answer?: string | null;
  author?: boolean;
  onDraft?: DraftInput;
}) {
  const id = useId();
  const [value, setValue] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  useAnswerFocus(field);
  if (think.status === 'spectator') return <p className="lead think-status">{t(author ? 'thinkSpectatorAuthor' : 'thinkSpectator')}</p>;
  if (think.status === 'out') return <p className="lead think-status">{t('thinkOutNow')}</p>;
  const mine = answer ?? sent;
  if (mine !== null) {
    return (
      <section className="sent think-sent">
        <h2 dir="auto">{t('thinkSent', { word: mine })}</h2>
      </section>
    );
  }
  const word = tidy(value);
  const submit = () => {
    if (busy.current || disabled || word === '') return;
    busy.current = true;
    onDraft?.cancel?.();
    void send('player:answer', { type: 'think', value: word })
      .then((result) => {
        setError(result.ok ? null : errorText(result.error));
        if (result.ok) setSent(word);
      })
      .catch(() => setError(errorText('network')))
      .finally(() => {
        busy.current = false;
      });
  };
  return (
    <form
      className="think-input"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p className="meta think-prompt">{t('thinkPrompt')}</p>
      <label className="field" htmlFor={id}>
        <span>{t('thinkInputLabel')}</span>
      </label>
      <input
        id={id}
        ref={field}
        className="think-field"
        dir="auto"
        value={value}
        maxLength={LIMITS.thinkWord}
        enterKeyHint="send"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        disabled={disabled}
        aria-describedby={`${id}-q`}
        onChange={(event) => {
          setValue(event.target.value);
          setError(null);
          const next = tidy(event.target.value);
          onDraft?.(next === '' ? null : { type: 'think', value: next });
        }}
      />
      <span id={`${id}-q`} className="sr-only">
        {question.text}
      </span>
      <button type="submit" className="btn btn-primary" disabled={disabled || word === ''}>
        {t('thinkSend')}
      </button>
      <p className="meta think-error" role="status">
        {error}
      </p>
    </form>
  );
}

/**
 * Телефон на reveal: «Ви в безпеці» / «Збіг: −1 ❤️» / «Без відповіді: −1 ❤️»; не на тему (51) — «−1 ❤️: відповідь не на тему»
 * (й зі збігом: життя одне); з 0 — ще й «Ви вибули — тепер ви глядач».
 */
export function ThinkPhoneVerdict({ think }: { think: PlayerThink }) {
  if (think.verdict === null) return null;
  const safe = think.verdict === 'safe' && think.off === null;
  return (
    <section className={safe ? 'think-verdict is-safe' : 'think-verdict is-hit'} role="status">
      <h2>{t(safe ? 'thinkSafe' : think.off !== null ? 'thinkVerdictOff' : think.verdict === 'hit' ? 'thinkHit' : 'thinkEmpty')}</h2>
      {!safe && think.lives === 0 && <p className="lead">{t('thinkOutNow')}</p>}
    </section>
  );
}

/** Тег «не на тему» (51): позначка ведучого чи голосування автопілота. */
function ThinkOffTag({ off }: { off: ThinkOff | null }) {
  if (off === null) return null;
  return <span className="tag is-wrong think-off">{t(off === 'vote' ? 'thinkOffVoteTag' : 'thinkOffTag')}</span>;
}

/**
 * Телефон на етапі голосування автопілота (51): «Чи всі на тему?», чужі відповіді кнопками-перемикачами (aria-pressed)
 * і «Готово» → player:think-vote { keys }; після згоди — «Голос враховано…», перемикачі лишаються (повторне «Готово» замінює).
 * Без права голосу — лише список: члену команди «Голосує капітан команди», решті «Гравці перевіряють…».
 */
export function ThinkVoteBallot({
  vote,
  send,
  onError,
  teamMember = false,
}: {
  vote: NonNullable<PlayerThink['vote']>;
  send: Send;
  onError?: (text: string | null) => void;
  /** Живий член команди не капітан: голосує капітан. */
  teamMember?: boolean;
}) {
  const [picked, setPicked] = useState<string[]>(() => vote.marked);
  const [sent, setSent] = useState(vote.done);
  const busy = useRef(false);
  if (!vote.canVote) {
    return (
      <section className="think-vote">
        <h2 className="think-vote-title">{t('thinkVoteTitle')}</h2>
        <p className="lead think-status">{t(teamMember ? 'thinkVoteCaptain' : 'thinkVoteWatch')}</p>
        <ul className="think-vote-list">
          {vote.entries.map((entry) => (
            <li key={entry.key} className="think-vote-entry" dir="auto">
              {entry.text}
            </li>
          ))}
        </ul>
      </section>
    );
  }
  // Зміна після «Готово» ще не надіслана: «Голос враховано» ховається до наступного «Готово».
  const toggle = (key: string) => {
    setPicked((now) => (now.includes(key) ? now.filter((k) => k !== key) : [...now, key]));
    setSent(false);
  };
  const submit = () => {
    if (busy.current) return;
    busy.current = true;
    // Порядок — за бюлетенем: надіслане не залежить від того, що натиснули першим.
    const keys = vote.entries.map((entry) => entry.key).filter((key) => picked.includes(key));
    void send('player:think-vote', { keys })
      .then((result) => {
        onError?.(result.ok ? null : errorText(result.error));
        if (result.ok) setSent(true);
      })
      .catch(() => onError?.(errorText('network')))
      .finally(() => {
        busy.current = false;
      });
  };
  return (
    <section className="think-vote">
      <h2 className="think-vote-title">{t('thinkVoteTitle')}</h2>
      <p className="meta">{t('thinkVoteLead')}</p>
      {vote.entries.length === 0 ? (
        <p className="lead think-status">{t('thinkVoteNothing')}</p>
      ) : (
        <ul className="think-vote-list">
          {vote.entries.map((entry) => {
            const on = picked.includes(entry.key);
            return (
              <li key={entry.key}>
                <button type="button" className={on ? 'btn think-vote-toggle is-on' : 'btn think-vote-toggle'} aria-pressed={on} dir="auto" onClick={() => toggle(entry.key)}>
                  {entry.text}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button type="button" className="btn btn-primary" onClick={submit}>
        {t('thinkVoteDone')}
      </button>
      <p className="meta think-vote-sent" role="status">
        {sent ? t('thinkVoteSent') : null}
      </p>
    </section>
  );
}

/** Рядок редактора пульту: слово й синоніми як їх набрали. */
interface DraftRow {
  word: string;
  synonyms: string;
}

const rowsOf = (words: ThinkWord[]): DraftRow[] => words.map((w) => ({ word: w.word, synonyms: w.synonyms.join(', ') }));
/** Порожній список — один порожній рядок: у ведучого завжди є поле (зокрема «Таймер скінчився — впишіть слово»). */
const editRowsOf = (words: ThinkWord[]): DraftRow[] => (words.length === 0 ? [{ word: '', synonyms: '' }] : rowsOf(words));
const wordsOf = (rows: DraftRow[]): ThinkWord[] =>
  rows.map((row) => ({ word: tidy(row.word), synonyms: parseSynonyms(row.synonyms) })).filter((w) => w.word !== '' || w.synonyms.length > 0);
const sameWords = (a: ThinkWord[], b: ThinkWord[]) => JSON.stringify(a) === JSON.stringify(b);
/** Автозбереження: стільки після останнього натискання, поки слова ще можна змінити, — щоб недозбережене не зникло з таймером. */
export const THINK_AUTOSAVE_MS = 600;

/**
 * Пульт: до 3 рядків «слово + синоніми», «Зберегти слова» → host:think-words (увесь список); і саме — через THINK_AUTOSAVE_MS
 * після набору, поки слова можна змінити. Поле не скидається новими зрізами, поки ведучий пише (є незбережені зміни);
 * !editable — лише читання чинних слів (think.draft) з «Слова зафіксовано»; locked з порожнім списком — «Таймер скінчився…».
 */
export function HostThinkWords({ think, phase, send, onError }: { think: HostThink; phase: Phase; send: Send; onError?: (text: string | null) => void }) {
  const [rows, setRows] = useState<DraftRow[]>(() => editRowsOf(think.draft));
  const [dirty, setDirty] = useState(false);
  const [seen, setSeen] = useState(think.draft);
  /** Росте після кожної відповіді на збереження: якщо поки воно летіло, ведучий писав далі, автозбереження спрацює знову. */
  const [saves, setSaves] = useState(0);
  const busy = useRef(false);
  const latest = useRef(rows);
  latest.current = rows;
  if (!sameWords(seen, think.draft)) {
    setSeen(think.draft);
    if (!dirty) setRows(editRowsOf(think.draft));
  }
  // Таймер скінчився, а слів немає: ведучий вписує їх один раз, і розкриття чекає.
  const late = phase === 'locked' && think.editable && think.draft.length === 0;
  const locked = !think.editable;
  const words = wordsOf(rows);
  const changed = !sameWords(words, think.draft);
  const edit = (next: DraftRow[]) => {
    setRows(next);
    setDirty(true);
  };
  const save = () => {
    if (busy.current) return;
    busy.current = true;
    const sent = words;
    void send('host:think-words', { words: sent })
      .then((result) => {
        onError?.(result.ok ? null : errorText(result.error));
        if (result.ok && sameWords(wordsOf(latest.current), sent)) setDirty(false);
      })
      .catch(() => onError?.(errorText('network')))
      .finally(() => {
        busy.current = false;
        setSaves((n) => n + 1);
      });
  };
  useEffect(() => {
    // Після таймера без слів рушій приймає лише одну зміну: пауза посеред слова зафіксувала б його половину — тут лише «Зберегти слова».
    if (!dirty || locked || late || !changed) return;
    const timer = setTimeout(save, THINK_AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // save бере слова з цього ж рендера: перезапуск лише від нового набору чи кінця попереднього збереження.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dirty, locked, late, changed, saves]);
  // Зафіксовано: показуємо те, що справді діє, а не недозбережений набір.
  const shown = locked ? rowsOf(think.draft) : rows;
  return (
    <section className="panel think-host-words">
      <h2>{t('thinkHostWords')}</h2>
      {locked && <p className="meta think-host-locked">{t('thinkHostLocked')}</p>}
      {late && <p className="lead think-host-late">{t('thinkHostLate')}</p>}
      {shown.map((row, index) => (
        <div className="think-word-row" key={index}>
          <label className="field">
            <span>{t('thinkWordLabel', { index: index + 1 })}</span>
            <input
              value={row.word}
              dir="auto"
              maxLength={LIMITS.thinkWord}
              disabled={locked}
              onChange={(event) => edit(rows.map((r, i) => (i === index ? { ...r, word: event.target.value } : r)))}
            />
          </label>
          <label className="field">
            <span>{t('thinkSynonymsLabel')}</span>
            <input
              value={row.synonyms}
              dir="auto"
              maxLength={LIMITS.maxThinkSynonyms * (LIMITS.thinkWord + 2)}
              disabled={locked}
              onChange={(event) => edit(rows.map((r, i) => (i === index ? { ...r, synonyms: event.target.value } : r)))}
            />
          </label>
          {!locked && (
            <button type="button" className="row-button think-word-remove" aria-label={`${t('thinkRemoveWord')} ${index + 1}`} title={t('thinkRemoveWord')} onClick={() => edit(rows.filter((_, i) => i !== index))}>
              ×
            </button>
          )}
        </div>
      ))}
      {!locked && (
        <div className="panel-actions">
          {rows.length < LIMITS.maxThinkWords && (
            <button type="button" className="btn btn-small btn-dashed" onClick={() => edit([...rows, { word: '', synonyms: '' }])}>
              {t('thinkAddWord')}
            </button>
          )}
          <button type="button" className="btn btn-small btn-primary" disabled={!changed} onClick={save}>
            {t('thinkHostSave')}
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Пульт: учасник · відповідь · «збіг»/«в безпеці»; на reveal — «Зарахувати збіг» / «Зняти збіг» → host:override { playerId, grade: 'wrong' | 'correct' }
 * і (51) «Не на тему» / «Зняти «не на тему»» → host:think-off { playerId, off } для непорожньої відповіді. Без відповіді — без кнопок.
 */
export function HostThinkAnswers({ think, phase, send, onError, noOff = false }: { think: HostThink; phase: Phase; send: Send; onError?: (text: string | null) => void; /** 68: пульт адміна в кімнаті бота — без «Не на тему». */ noOff?: boolean }) {
  const busy = useRef(false);
  const run = (action: () => ReturnType<Send>) => {
    if (busy.current) return;
    busy.current = true;
    void action()
      .then((result) => onError?.(result.ok ? null : errorText(result.error)))
      .catch(() => onError?.(errorText('network')))
      .finally(() => {
        busy.current = false;
      });
  };
  const mark = (playerId: string, grade: 'wrong' | 'correct') => run(() => send('host:override', { playerId, grade }));
  const markOff = (playerId: string, off: boolean) => run(() => send('host:think-off', { playerId, off }));
  const answered = think.answers.filter((row) => row.answer !== null).length;
  // Слів ведучого ще немає — порівнювати нема з чим: без позначки, а не «в безпеці».
  const judged = think.draft.length > 0;
  return (
    <section className="panel think-host-answers">
      <h2>
        {t('thinkHostAnswers')} <span className="meta">{t('answeredOf', { answered, total: think.answers.length })}</span>
      </h2>
      <ul className="rows think-answer-rows">
        {think.answers.map((row) => (
          <li key={row.id} className={[row.hit === true ? 'think-answer is-hit' : row.answer === null ? 'think-answer is-empty' : 'think-answer', row.off !== null ? 'is-off' : ''].filter(Boolean).join(' ')}>
            <span className="name" dir="auto">
              {row.nickname}
            </span>
            <span className="think-answer-word" dir="auto">
              {row.answer === null || row.answer === '' ? t('thinkHostNoAnswer') : row.answer}
            </span>
            {/* «в безпеці» поруч із «не на тему» суперечить: позначене не на тему — без нього (збіг лишається: і так одне життя). */}
            {judged && row.hit !== null && (row.hit || row.off === null) && <span className={row.hit ? 'tag is-wrong' : 'tag is-correct'}>{t(row.hit ? 'thinkHostHit' : 'thinkHostSafe')}</span>}
            {row.overridden && <span className="tag">{t('thinkHostOverridden')}</span>}
            <ThinkOffTag off={row.off} />
            {phase === 'reveal' && row.hit !== null && (
              <button type="button" className="btn btn-small" aria-label={`${t(row.hit ? 'thinkHostMarkSafe' : 'thinkHostMarkHit')}: ${row.nickname}`} onClick={() => mark(row.id, row.hit ? 'correct' : 'wrong')}>
                {t(row.hit ? 'thinkHostMarkSafe' : 'thinkHostMarkHit')}
              </button>
            )}
            {!noOff && phase === 'reveal' && row.answer !== null && row.answer !== '' && (
              <button type="button" className="btn btn-small" aria-label={`${t(row.off !== null ? 'thinkHostUnmarkOff' : 'thinkHostMarkOff')}: ${row.nickname}`} onClick={() => markOff(row.id, row.off === null)}>
                {t(row.off !== null ? 'thinkHostUnmarkOff' : 'thinkHostMarkOff')}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Ряд учасників: нік, ❤️ і (до reveal) ✓ «відповів» без тексту; вибулі — блідо. */
function ThinkRowsStrip({ think, me }: { think: ThinkInfo; me?: string }) {
  const many = think.rows.length > MANY_ROWS;
  return (
    <ul className={many ? 'think-rows is-many' : 'think-rows'}>
      {think.rows.map((row) => (
        <li key={row.id} className={['think-row', row.out ? 'is-out' : '', row.id === me ? 'is-me' : ''].filter(Boolean).join(' ')}>
          <span className="name" dir="auto">
            {row.nickname}
            <RowReaction rowId={row.id} />
          </span>
          <ThinkHearts lives={row.lives} max={think.lives} />
          {row.answered && (
            <span className="think-answered" role="img" aria-label={t('thinkAnsweredMark')}>
              ✓
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Сцена на question/locked: тема великим, таймер, «Питання k з n», ряд учасників із ❤️ і ✓ «відповів».
 * Етап голосування автопілота (51): «Чи всі на тему?», сітка відповідей без імен і «Проголосували: …» без кількостей позначок.
 */
export function ThinkStage({ view, offsetMs }: { view: StageView; offsetMs: number }) {
  const { question, think } = view;
  if (question === null || think === undefined) return null;
  const answered = think.rows.filter((row) => row.answered).length;
  const alive = think.rows.filter((row) => !row.out).length;
  return (
    <div className="stage-question think-stage">
      <header className="bar">
        <span>{think.index === null ? '' : t('thinkOf', { index: think.index + 1, total: think.total })}</span>
        <span>{t('answeredOf', { answered, total: alive })}</span>
      </header>
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
      {think.vote === null ? (
        <p className="lead think-stage-prompt">{t('thinkPrompt')}</p>
      ) : (
        <ThinkStageVote think={think} vote={think.vote} />
      )}
      <ThinkRowsStrip think={think} />
    </div>
  );
}

/** Сцена (51): бюлетень голосування — тексти за ключем без авторів; хто вже натиснув «Готово» — ніками. */
function ThinkStageVote({ think, vote }: { think: ThinkInfo; vote: NonNullable<ThinkInfo['vote']> }) {
  const names = vote.voted.map((id) => think.rows.find((row) => row.id === id)?.nickname).filter((name): name is string => name !== undefined);
  return (
    <section className="think-vote think-stage-vote">
      <h2 className="think-vote-title">{t('thinkVoteTitle')}</h2>
      <ul className="think-vote-grid">
        {vote.entries.map((entry) => (
          <li key={entry.key} className="think-vote-entry" dir="auto">
            {entry.text}
          </li>
        ))}
      </ul>
      <p className="meta think-vote-voted" dir="auto">
        {names.length === 0 ? t('thinkVoteNobody') : t('thinkVoteVoted', { names: names.join(', ') })}
      </p>
    </section>
  );
}

/** Рядок відповіді на розкритті: нік, слово (порожнє — «—»), ❤️ після; збіг і порожня — підсвічені. */
function RevealRow({ row, max, me, words }: { row: ThinkRow; max: number; me?: string; words: ThinkWord[] }) {
  const hit = row.verdict === 'hit' || row.verdict === 'empty' || row.off !== null;
  // З яким словом ведучого збіглася відповідь («Синя» ≈ «синій»): видно й без синонімів, які щільна сцена ховає.
  const matched = row.matched === null ? null : (words[row.matched]?.word ?? null);
  return (
    <li className={['think-reveal-row', hit ? 'is-hit' : 'is-safe', row.off !== null ? 'is-off' : '', row.id === me ? 'is-me' : ''].filter(Boolean).join(' ')}>
      <span className="name" dir="auto">
        {row.nickname}
        <RowReaction rowId={row.id} />
      </span>
      <span className="think-reveal-word" dir="auto">
        {row.answer === null || row.answer === '' ? '—' : row.answer}
        {matched !== null && (
          <small className="think-matched" dir="auto">
            {`≈ ${matched}`}
          </small>
        )}
      </span>
      {row.overridden && <span className="tag think-overridden">{t('thinkHostOverridden')}</span>}
      <ThinkOffTag off={row.off} />
      <ThinkHearts lives={row.lives} max={max} lost={row.lost} />
    </li>
  );
}

/** Сцена (і телефони) на reveal: слова ведучого великим (синоніми дрібно), відповіді всіх; втрачені — підсвічені, ❤️ гасне. */
export function ThinkReveal({ think, me, big = false }: { think: ThinkInfo; me?: string; big?: boolean }) {
  if (think.words === null) return null;
  const words = think.words;
  const answered = think.rows.filter((row) => row.verdict !== null);
  const many = answered.length > MANY_ROWS;
  return (
    <section className={big ? 'think-reveal is-big' : 'think-reveal'}>
      <h2 className="meta think-words-title">{t('thinkWordsTitle')}</h2>
      <ul className="think-words">
        {think.words.map((w, index) => (
          <li key={index} className="think-word">
            <strong dir="auto">{w.word}</strong>
            {w.synonyms.length > 0 && (
              <small className="think-synonyms" dir="auto">
                {w.synonyms.join(', ')}
              </small>
            )}
          </li>
        ))}
      </ul>
      <ul className={many ? 'think-reveal-rows is-many' : 'think-reveal-rows'}>
        {answered.map((row) => (
          <RevealRow key={row.id} row={row} max={think.lives} me={me} words={words} />
        ))}
      </ul>
    </section>
  );
}

/**
 * Сцена й телефони на round_end (і фініші, якщо раунд останній): таблиця місць — місце, нік, ❤️ чи «вибування на питанні k», очки раунду;
 * totals (сцена) — ще й колонка «Разом»: загальний рахунок учасника, щоб кімната бачила й підсумок гри.
 */
export function ThinkPlaces({ think, me, totals }: { think: ThinkInfo; me?: string; totals?: Record<string, number> }) {
  if (think.places === null || think.places.length === 0) return null;
  return (
    <section className="think-places">
      <h2>{t('thinkPlacesTitle')}</h2>
      <table className="think-places-table">
        {totals !== undefined && (
          <thead>
            <tr>
              <td colSpan={3} />
              <th scope="col" className="think-place-points">
                {t('thinkRoundCol')}
              </th>
              <th scope="col" className="think-place-total">
                {t('thinkTotalCol')}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {think.places.map((row) => (
            <tr key={row.id} className={row.id === me ? 'is-me' : undefined}>
              <td className="think-place">{t('thinkPlace', { place: row.place })}</td>
              <th scope="row" className="name" dir="auto">
                {row.nickname}
              </th>
              <td className="think-place-state">{row.outAt === null ? <ThinkHearts lives={row.lives} max={think.lives} /> : t('thinkOutAt', { index: row.outAt })}</td>
              <td className="think-place-points" dir="ltr">
                {signed(row.points)}
              </td>
              {totals !== undefined && (
                <td className="think-place-total" dir="ltr">
                  {num(totals[row.id] ?? 0)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
