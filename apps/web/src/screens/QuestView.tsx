import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { LIMITS, QUEST_WINDOW_MS, evenPageSize, pageSlice, type HostQuest, type PlayerQuest, type QuestInfo, type QuestRow } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { num, signed } from '../format';
import { countText, errorText, t } from '../i18n';
import { Timer, timerStatus } from '../live/Timer';
import type { Send } from '../live/types';
import { jigsawTablePageSize } from './JigsawView';
import { puzzleGrid, usePage } from './PuzzleView';

/**
 * «Квест із кодом» (29g), телефон. Код телефон не знає до показу: у комірках лише власні відкриті символи (у командах — спільні),
 * перевіряє код сервер — поле шле сирий рядок.
 */

/** Комірки коду: символ або порожня; номер порядку дрібно (лише коли order є — пульт); code — показаний код. */
export function QuestLock({ length, slots, order, code }: { length: number; slots?: (string | null)[]; order?: number[]; code?: string | null }) {
  const chars = Array.from({ length }, (_, index) => (code != null ? (Array.from(code)[index] ?? null) : (slots?.[index] ?? null)));
  return (
    <div className="quest-lock" style={{ '--quest-length': String(length) } as CSSProperties}>
      {/* Код читається зліва направо в будь-якій мові (в арабській — теж). */}
      <div className="quest-lock-row" dir="ltr">
        {chars.map((char, index) => {
          const step = order === undefined ? -1 : order.indexOf(index);
          return (
            <span key={index} className={char === null ? 'quest-cell is-empty' : 'quest-cell'} dir="ltr">
              {char ?? ''}
              {step >= 0 && (
                <span className="quest-cell-order" title={t('questOrderMark', { n: step + 1 })}>
                  {step + 1}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** Рядок бонусу: «Зараз: 83 % бонусу» або «Бонус: баф «50/50»». */
function shareLine(info: QuestInfo): string {
  return info.bonus.kind === 'buff' ? t('questBuffNow', { buff: buffName(info.bonus.buff) }) : t('questShareNow', { share: Math.round(info.shareNow * 100) });
}

/** Причина відмови: довжині потрібне число символів коду. */
function refusal(code: string, length: number): string {
  return code === 'quest_length' ? t('err_quest_length', { length }) : errorText(code);
}

/** Результат розв'язання: бали, баф або «бафи вже розібрали». */
function solvedLine(solved: NonNullable<PlayerQuest['solved']>): string {
  if (solved.points !== null) return t('questSolvedPoints', { points: num(solved.points) });
  if (solved.buff !== null) return t('questSolvedBuff', { buff: buffName(solved.buff) });
  return t('questSolvedLate');
}

type PanelProps = {
  info: QuestInfo;
  mine: PlayerQuest;
  paused: boolean;
  send: Send;
  onError?: (text: string | null) => void;
  /** Чернетка поля ззовні: так введене переживає закриття аркуша й зміну етапу. Без них — власний стан. */
  value?: string;
  onValue?: (value: string) => void;
};

/** Глобальне запитання, комірки, поле й кнопка, спроби, частка бонусу, результат; на shown — код і ✓/✗. */
export function QuestPanel({ info, mine, paused, send, onError, value: given, onValue }: PanelProps) {
  const [own, setOwn] = useState('');
  const value = given ?? own;
  const setValue = (next: string) => {
    if (onValue !== undefined) onValue(next);
    if (given === undefined) setOwn(next);
  };
  const [error, setError] = useState<string | null>(null);
  // Скільки неправильних спроб було до останньої прийнятої: більше — «Не той код».
  const [wrongFrom, setWrongFrom] = useState<number | null>(null);
  // Одна спроба за раз; кнопку на мить очікування не притлумлюємо.
  const busy = useRef(false);
  const shown = info.stage === 'shown' && info.code !== null;
  const solved = mine.solved;
  const canEnter = mine.canEnter && !paused && !shown && solved === null && mine.left > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || !canEnter || value.trim() === '') return;
    busy.current = true;
    const before = mine.tries.length;
    const code = value;
    void Promise.resolve(send('player:quest', { code }))
      .then(
        (result) => {
          if (result.ok) {
            setError(null);
            setWrongFrom(before);
            setValue('');
            onError?.(null);
          } else {
            const text = refusal(result.error, info.length);
            setError(text);
            setWrongFrom(null);
            onError?.(text);
          }
        },
        () => {
          const text = errorText('unknown');
          setError(text);
          onError?.(text);
        },
      )
      .finally(() => {
        busy.current = false;
      });
  };

  const wrong = wrongFrom !== null && solved === null && mine.tries.length > wrongFrom;

  return (
    <section className="quest-panel">
      <p className="quest-prompt" dir="auto">
        {info.prompt}
      </p>
      <QuestLock length={info.length} slots={mine.slots} code={shown ? info.code : null} />
      {shown ? (
        <p className="lead quest-shown" role="status">
          {t('questShownCode', { code: info.code ?? '' })}{' '}
          <span className={solved !== null ? 'quest-verdict is-right' : 'quest-verdict is-wrong'}>{solved !== null ? '✓' : '✗'}</span>
        </p>
      ) : solved !== null ? (
        <p className="lead quest-solved" role="status">
          {solvedLine(solved)}
        </p>
      ) : (
        <>
          <form className="quest-form" onSubmit={submit} noValidate>
            <label className="field quest-field">
              <span className="meta">{t('questInputLabel')}</span>
              <input
                className="quest-input"
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                dir="auto"
                enterKeyHint="go"
                maxLength={LIMITS.maxQuestInput}
                value={value}
                disabled={mine.left === 0}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
                  setWrongFrom(null);
                }}
              />
            </label>
            <button type="submit" className="btn btn-primary quest-enter" disabled={!canEnter || value.trim() === ''}>
              {t('questEnter')}
            </button>
          </form>
          <p className="meta quest-error" role="status">
            {error ?? (wrong ? t('questWrong') : null)}
          </p>
          <p className="meta quest-left" aria-live="polite">
            {mine.left === 0 ? t('questOut') : countText('questLeft', mine.left, { count: mine.left })}
          </p>
          <p className="meta quest-share">{shareLine(info)}</p>
        </>
      )}
      {mine.tries.length > 0 && (
        <ul className="quest-tries" aria-label={t('questWrong')}>
          {mine.tries.map((code) => (
            <li key={code}>
              <del dir="ltr">{code}</del>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Пігулка шапки «🔐{opened}/{length}»; відкриває нижній аркуш із QuestPanel (портал, position: fixed — запитання під ним не зсувається).
 * main — панель коду вже основний вміст екрана (заставка раунду, вікно, показаний код): аркуша немає, дотик гортає до панелі.
 */
export function QuestButton({ info, mine, paused, send, value, onValue, main = false }: { info: QuestInfo; mine: PlayerQuest; paused: boolean; send: Send; value?: string; onValue?: (value: string) => void; main?: boolean }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const opened = mine.slots.filter((slot) => slot !== null).length;
  // Панель стала основним вмістом — аркуш закривається: двох полів «Код» не буває.
  if (open && main) setOpen(false);

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      // Фокус на «Закрити», не на поле: клавіатура не вискакує сама.
      closeRef.current?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open]);
  // Tab ходить колом по полю й кнопках аркуша.
  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') return;
    const items = [...(cardRef.current?.querySelectorAll<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? [])];
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const here = document.activeElement;
    if (event.shiftKey && (here === first || !cardRef.current?.contains(here))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (here === last || !cardRef.current?.contains(here))) {
      event.preventDefault();
      first.focus();
    }
  };
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className="table-button quest-button"
        aria-label={`${t('questSheetTitle')}: ${t('questRowOpened', { opened, length: info.length })}`}
        aria-haspopup={main ? undefined : 'dialog'}
        aria-expanded={main ? undefined : open}
        dir="ltr"
        onClick={() => {
          if (main) document.querySelector('.app .quest-panel')?.scrollIntoView?.({ block: 'start' });
          else setOpen(true);
        }}
      >
        {t('questButton', { opened, length: info.length })}
      </button>
      {open &&
        createPortal(
          <div className="table-sheet quest-sheet" role="dialog" aria-modal="true" aria-label={t('questSheetTitle')} tabIndex={-1} onClick={onBackdrop} onKeyDown={onKeyDown}>
            <div ref={cardRef} className="table-card quest-card">
              <h2>{t('questSheetTitle')}</h2>
              <QuestPanel info={info} mine={mine} paused={paused} send={send} value={value} onValue={onValue} />
              <button ref={closeRef} type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                {t('buffHelpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/* ── Сцена й пульт (29g, задача 8). Код сцена не знає до stage 'shown': рядки несуть лише кількість відкритих позицій. ── */

const solvedCount = (info: QuestInfo) => info.rows.filter((row) => row.solved !== null).length;

const QUEST_ROWS_PAGE = 16;
const QUEST_STRIP_PAGE = 8;

/** Один рядок: нік · ●●○○ · ✗✗ · ✓; повний підпис — для читача з екрана (на сцені його не видно). */
function QuestRowItem({ row, length }: { row: QuestRow; length: number }) {
  const text = row.solved === null ? t('questRowOpened', { opened: row.opened, length }) : row.solved.after > 0 ? t('questRowSolved', { after: row.solved.after }) : t('questRowSolvedStart');
  return (
    <li className={row.solved === null ? 'quest-row' : 'quest-row is-solved'} data-player={row.playerId}>
      <span className="quest-row-name" dir="auto" title={row.nickname}>
        {row.nickname}
      </span>
      <span className="quest-row-dots" aria-hidden="true" dir="ltr">
        {Array.from({ length }, (_, i) => (i < row.opened ? '●' : '○')).join('')}
      </span>
      {row.triesUsed > 0 && (
        <span className="quest-row-miss" aria-hidden="true" dir="ltr">
          {'✗'.repeat(row.triesUsed)}
        </span>
      )}
      {row.solved !== null && (
        <span className="quest-row-win" aria-hidden="true" dir="ltr">
          ✓ {row.solved.place}
        </span>
      )}
      <span className="sr-only">{text}</span>
    </li>
  );
}

/** Рядки учасників сіткою: понад most — рівні сторінки по черзі (usePage), сітка за puzzleGrid. */
export function QuestRows({ rows, length, most = QUEST_ROWS_PAGE, host = false }: { rows: readonly QuestRow[]; length: number; most?: number; host?: boolean }) {
  const size = evenPageSize(rows.length, most);
  const page = usePage(rows.length, size, !host);
  const shown = host ? rows : pageSlice(rows, page, size);
  const grid = puzzleGrid(shown.length, false);
  const cols = Math.min(grid.cols, 4);
  return (
    <ul className={grid.dense ? 'quest-rows is-dense' : 'quest-rows'} style={{ '--cols': cols, '--rows': Math.max(1, Math.ceil(shown.length / cols)) } as CSSProperties}>
      {shown.map((row) => (
        <QuestRowItem key={row.playerId} row={row} length={length} />
      ))}
    </ul>
  );
}

/** Смуга сцени: compact (question/locked) — один рядок без глобального запитання; повна (розкриття, таблиця між запитаннями) — з запитанням і рядками. */
export function QuestStrip({ info, compact = false }: { info: QuestInfo; compact?: boolean }) {
  const line = t('questStrip', { length: info.length, count: solvedCount(info) });
  if (compact) {
    return (
      <p className="meta quest-strip" role="status">
        {line}
      </p>
    );
  }
  return (
    <section className="quest-strip is-full">
      <p className="meta">{line}</p>
      <p className="quest-strip-prompt" dir="auto">
        {info.prompt}
      </p>
      <QuestRows rows={info.rows} length={info.length} most={QUEST_STRIP_PAGE} />
    </section>
  );
}

/** Бонус у клітинці таблиці: бали, баф або «—». */
function bonusText(row: QuestRow): string {
  if (row.solved === null) return '—';
  if (row.solved.points !== null) return signed(row.solved.points);
  if (row.solved.buff !== null) return buffName(row.solved.buff);
  return '—';
}

/** Таблиця «місце · нік · після запитання · бонус» у порядку сервера (розв'язали — за місцем, далі решта); на сцені понад 12 рядків — сторінки. */
function QuestTable({ rows, host = false }: { rows: readonly QuestRow[]; host?: boolean }) {
  const size = jigsawTablePageSize(rows.length);
  const page = usePage(rows.length, size, !host);
  const shown = host ? rows : pageSlice(rows, page, size);
  return (
    <div className="quest-table-wrap">
      <table className={host ? 'jigsaw-table quest-table is-host' : 'jigsaw-table quest-table'} style={host ? undefined : ({ '--rows': shown.length } as CSSProperties)}>
        <thead>
          <tr>
            <th scope="col">{t('questTablePlace')}</th>
            <th scope="col" />
            <th scope="col">{t('questTableAfter')}</th>
            <th scope="col">{t('questTableBonus')}</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((row) => (
            <tr key={row.playerId} className={row.solved === null ? 'is-undone' : 'is-done'}>
              <td className="rank">{row.solved === null ? '—' : row.solved.place}</td>
              <td className="name" dir="auto">
                {row.nickname}
              </td>
              <td>{row.solved === null ? '—' : row.solved.after}</td>
              <td className="score">{bonusText(row)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Сцена: intro — глобальне запитання й порожній замок; вікно на leaderboard — запитання, замок, годинник і рядки; shown — код у замку й таблиця
 * (round_end — лише код, таблиця раунду йде нижче). До shown символів немає: замок порожній, рядки несуть лічильники.
 */
export function QuestStage({ info, phase, offsetMs, paused = false }: { info: QuestInfo; phase: string; offsetMs: number; paused?: boolean }) {
  const shown = info.stage === 'shown' && info.code !== null;
  const inWindow = info.stage === 'window';
  return (
    <div className={`quest-stage${shown ? ' is-shown' : ''}${inWindow ? ' is-window' : ''}${phase === 'intro' ? ' is-intro' : ''}`}>
      <p className="lead quest-stage-prompt" dir="auto">
        {info.prompt}
      </p>
      <QuestLock length={info.length} code={shown ? info.code : null} />
      {inWindow && (
        <div className="quest-clock">
          <span className="meta">{t('questWindow')}</span>
          <Timer view={info} offsetMs={offsetMs} total={QUEST_WINDOW_MS} status={timerStatus({ paused, held: false })} />
        </div>
      )}
      {phase !== 'intro' && !(shown && phase === 'round_end') && (shown ? <QuestTable rows={info.rows} /> : <QuestRows rows={info.rows} length={info.length} />)}
    </div>
  );
}

/** «м:сс» від початку (мс). */
function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Час спроби: від початку раунду (since), а без нього — година доби. */
function timeText(at: number, since: number | undefined): string {
  if (since !== undefined) return clockText(at - since);
  const date = new Date(at);
  return [date.getHours(), date.getMinutes(), date.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
}

/**
 * Пульт: код з номерами порядку над символами, у вікні — годинник і «Показати код» (host:next); учасники з позиціями, бонусом і всіма спробами
 * (рядок, час, після якого запитання, ✓/✗, у командах — хто ввів). since — початок раунду для часу спроб; showButton=false — головна кнопка пульта.
 */
export function HostQuestPanel({ quest, send, onError, offsetMs, since, showButton = true, paused = false }: { quest: HostQuest; send: Send; onError?: (text: string | null) => void; offsetMs: number; since?: number; showButton?: boolean; paused?: boolean }) {
  const inWindow = quest.stage === 'window';
  const detail = new Map(quest.detail.map((entry) => [entry.playerId, entry]));
  const show = () => void send('host:next', undefined).then((result) => onError?.(result.ok ? null : errorText(result.error)));
  return (
    <section className="panel quest-host">
      <h2>{t('questSheetTitle')}</h2>
      <p className="meta" dir="auto">
        {quest.prompt}
      </p>
      <div className="quest-host-code">
        <QuestLock length={quest.length} code={quest.code} order={quest.order} />
      </div>
      <p className="meta">{t('questStrip', { length: quest.length, count: solvedCount(quest) })}</p>
      {inWindow && (
        <div className="quest-clock">
          <span className="meta">{t('questWindow')}</span>
          <Timer view={quest} offsetMs={offsetMs} total={QUEST_WINDOW_MS} status={timerStatus({ paused, held: false })} />
          {showButton && (
            <button type="button" className="btn btn-primary" onClick={show}>
              {t('questHostShow')}
            </button>
          )}
        </div>
      )}
      <ul className="rows quest-host-rows">
        {quest.rows.map((row) => {
          const own = detail.get(row.playerId);
          return (
            <li key={row.playerId} className="quest-host-row">
              <span className="name" dir="auto">
                {row.nickname}
              </span>
              <span className="given quest-host-slots" dir="ltr">
                {(own?.slots ?? []).map((slot) => slot ?? '·').join(' ')}
              </span>
              <span className="meta">{row.solved === null ? t('questRowOpened', { opened: row.opened, length: quest.length }) : `${row.solved.place}. ${bonusText(row)}`}</span>
              {own !== undefined && own.tries.length > 0 && (
                <ul className="quest-host-tries">
                  {own.tries.map((attempt, index) => (
                    <li key={index} className={attempt.right ? 'quest-try is-right' : 'quest-try is-wrong'}>
                      <span dir="ltr">{t('questHostTry', { code: attempt.code, time: timeText(attempt.at, since), after: attempt.after })}</span>
                      <span aria-hidden="true">{attempt.right ? ' ✓' : ' ✗'}</span>
                      {attempt.by !== null && <span className="meta"> {t('questHostBy', { name: attempt.by })}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
