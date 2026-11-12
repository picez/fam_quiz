import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { LIMITS, type PlayerQuest, type QuestInfo } from '@quiz/shared';
import { buffName } from '../buff-meta';
import { num } from '../format';
import { countText, errorText, t } from '../i18n';
import type { Send } from '../live/types';

/**
 * «Квест із кодом» (29g), телефон. Код телефон не знає до показу: у комірках лише власні відкриті символи (у командах — спільні),
 * перевіряє код сервер — поле шле сирий рядок.
 */

/** Комірки коду: символ або порожня; номер порядку дрібно (лише коли order є — пульт); code — показаний код. */
export function QuestLock({ length, slots, order, code }: { length: number; slots?: (string | null)[]; order?: number[]; code?: string | null }) {
  const chars = Array.from({ length }, (_, index) => (code != null ? (Array.from(code)[index] ?? null) : (slots?.[index] ?? null)));
  return (
    <div className="quest-lock" style={{ '--quest-length': String(length) } as CSSProperties}>
      <div className="quest-lock-row">
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
                maxLength={LIMITS.maxQuestInput}
                value={value}
                disabled={mine.left === 0}
                onChange={(event) => {
                  setValue(event.target.value);
                  setError(null);
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

/** Пігулка шапки «🔐 {opened}/{length}»; відкриває нижній аркуш із QuestPanel (портал, position: fixed — запитання під ним не зсувається). */
export function QuestButton({ info, mine, paused, send, value, onValue }: { info: QuestInfo; mine: PlayerQuest; paused: boolean; send: Send; value?: string; onValue?: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const wasOpen = useRef(false);
  const opened = mine.slots.filter((slot) => slot !== null).length;

  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      cardRef.current?.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)')?.focus();
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
      <button ref={triggerRef} type="button" className="table-button quest-button" aria-haspopup="dialog" dir="ltr" onClick={() => setOpen(true)}>
        {t('questButton', { opened, length: info.length })}
      </button>
      {open &&
        createPortal(
          <div className="table-sheet quest-sheet" role="dialog" aria-modal="true" aria-label={t('questSheetTitle')} tabIndex={-1} onClick={onBackdrop} onKeyDown={onKeyDown}>
            <div ref={cardRef} className="table-card quest-card">
              <h2>{t('questSheetTitle')}</h2>
              <QuestPanel info={info} mine={mine} paused={paused} send={send} value={value} onValue={onValue} />
              <button type="button" className="btn btn-small" onClick={() => setOpen(false)}>
                {t('buffHelpClose')}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
