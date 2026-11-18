import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { WORDLE_KEYBOARD, wordleKeyboard, type PlayerWordle, type WordleInfo, type WordleMark } from '@quiz/shared';
import { signed } from '../format';
import { countText, errorText, t, type TextKey } from '../i18n';
import type { Send } from '../live/types';

/** «Вгадай слово» (48): сітка, клавіатура ЙЦУКЕН, телефон, сцена й пульт. Літери завжди українські: сітка й клавіші — LTR. */

const MARK_TEXT: Record<WordleMark, TextKey> = { hit: 'wordleHit', near: 'wordleNear', miss: 'wordleMiss' };
const MARKS: readonly WordleMark[] = ['hit', 'near', 'miss'];
const KEY_LETTERS = new Set(WORDLE_KEYBOARD.flat());

const stateText = (mark: WordleMark) => t(MARK_TEXT[mark]);
const upper = (word: string) => word.toLocaleUpperCase('uk');

/**
 * Клітинка: колір — ще й форма (is-hit — рамка, is-near — коло, is-miss — менша) і текст («к — на місці»).
 * Без літери (сцена до розкриття) — лише стан.
 */
function Cell({ letter, mark }: { letter: string | null; mark: WordleMark | null }) {
  if (mark === null) {
    return (
      <span className={letter === null ? 'wordle-cell' : 'wordle-cell is-typed'} aria-hidden={letter === null ? true : undefined}>
        {letter ?? ''}
      </span>
    );
  }
  return (
    <span className={`wordle-cell is-${mark}`} role="img" aria-label={letter === null ? stateText(mark) : t('wordleCell', { letter, state: stateText(mark) })}>
      {letter ?? ''}
    </span>
  );
}

/** Сітка tries × letters: прийняті рядки, рядок набору (current) і порожні. */
export function WordleGrid({ letters, tries, rows, current }: { letters: number; tries: number; rows: { letters: string[] | null; marks: WordleMark[] }[]; current?: string[] }) {
  const style = { '--letters': letters } as CSSProperties;
  return (
    <ol className="wordle-grid" dir="ltr" lang="uk" style={style}>
      {Array.from({ length: Math.max(tries, rows.length) }, (_, index) => {
        const row = rows[index];
        if (row !== undefined) {
          return (
            <li key={index} className="wordle-row">
              {row.marks.map((mark, at) => (
                <Cell key={at} letter={row.letters?.[at] ?? null} mark={mark} />
              ))}
            </li>
          );
        }
        const typing = current !== undefined && index === rows.length;
        return (
          <li key={index} className={typing ? 'wordle-row is-current' : 'wordle-row'} aria-hidden={typing ? undefined : true}>
            {Array.from({ length: letters }, (_, at) => (
              <Cell key={at} letter={typing ? (current[at] ?? null) : null} mark={null} />
            ))}
          </li>
        );
      })}
    </ol>
  );
}

/** Легенда під сіткою телефона: три зразки форм і слова. */
function WordleLegend() {
  return (
    <ul className="wordle-legend" aria-label={t('wordleLegend')}>
      {MARKS.map((mark) => (
        <li key={mark}>
          <span className={`wordle-cell is-${mark}`} aria-hidden="true" />
          <span>{stateText(mark)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Клавіатура: три ряди ЙЦУКЕН (12 клавіш найширший ряд — уміщається на 360 px) і ряд «⌫» / «Перевірити». */
export function WordleKeys({ marks, disabled, onLetter, onErase, onCheck, canCheck }: { marks: Record<string, WordleMark>; disabled: boolean; onLetter(l: string): void; onErase(): void; onCheck(): void; canCheck: boolean }) {
  return (
    <div className="wordle-keys" dir="ltr">
      {WORDLE_KEYBOARD.map((row, index) => (
        <div key={index} className="wordle-keys-row" lang="uk" style={{ '--keys': row.length } as CSSProperties}>
          {row.map((letter) => {
            const mark = marks[letter];
            return (
              <button
                key={letter}
                type="button"
                className={mark === undefined ? 'wordle-key' : `wordle-key is-${mark}`}
                aria-label={mark === undefined ? undefined : t('wordleCell', { letter, state: stateText(mark) })}
                disabled={disabled}
                onClick={() => onLetter(letter)}
              >
                {letter}
              </button>
            );
          })}
        </div>
      ))}
      <div className="wordle-keys-row is-actions">
        <button type="button" className="wordle-key is-erase" aria-label={t('wordleErase')} disabled={disabled} onClick={onErase}>
          ⌫
        </button>
        <button type="button" className="btn btn-primary wordle-check" disabled={disabled || !canCheck} onClick={onCheck}>
          {t('wordleCheck')}
        </button>
      </div>
    </div>
  );
}

/** Підсумок у живій області: вгадано зі спроби N чи спроби скінчилися; інакше порожньо. */
function outcomeText(wordle: PlayerWordle): string {
  if (wordle.solved) return t('wordleSolved', { tries: wordle.rows.length });
  return wordle.rows.length >= wordle.tries ? t('wordleOut') : '';
}

/**
 * Телефон: власна сітка (у команді — сітка команди), легенда, жива область для причини відмови й підсумку, клавіатура.
 * Рядок набору — локальний стан; «Перевірити» (чи Enter) шле слово. Учасник команди, що не відповідає, бачить сітку без клавіатури.
 */
export function WordlePlay({ wordle, paused, readOnly, send }: { wordle: PlayerWordle; paused: boolean; readOnly: boolean; send: Send }) {
  const [typed, setTyped] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const done = wordle.solved || wordle.rows.length >= wordle.tries;
  const typing = !readOnly && !done;
  const off = !typing || paused || !wordle.canGuess;

  const add = (letter: string) => {
    if (off) return;
    setError(null);
    setTyped((current) => (current.length >= wordle.letters ? current : [...current, letter]));
  };
  const erase = () => {
    if (off) return;
    setError(null);
    setTyped((current) => current.slice(0, -1));
  };
  /** Один запит за раз: подвійний дотик не шле другої спроби, поки сервер не відповів. Відмова лишає рядок. */
  const check = async () => {
    if (off || busy.current || typed.length !== wordle.letters) return;
    const sent = typed.join('');
    busy.current = true;
    try {
      const result = await send('player:wordle', { word: sent });
      if (result.ok) {
        setTyped((current) => (current.join('') === sent ? [] : current));
        setError(null);
      } else {
        setError(errorText(result.error));
      }
    } catch {
      setError(t('err_unknown'));
    } finally {
      busy.current = false;
    }
  };

  // Фізична клавіатура (комп'ютер): літери, Backspace, Enter. Поля вводу й комбінації з Ctrl/Alt/⌘ не перехоплюються.
  useEffect(() => {
    if (off) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
      if (event.key === 'Backspace') {
        event.preventDefault();
        erase();
      } else if (event.key === 'Enter') {
        // Фокус на клавіші після дотику: без preventDefault Enter ще й «натиснув» би її.
        event.preventDefault();
        void check();
      } else {
        const letter = event.key.toLocaleLowerCase('uk');
        if (KEY_LETTERS.has(letter)) {
          event.preventDefault();
          add(letter);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <section className="wordle-play">
      <WordleGrid letters={wordle.letters} tries={wordle.tries} rows={wordle.rows} current={typing ? typed : undefined} />
      <WordleLegend />
      {/* Завжди в DOM: причина відмови й підсумок озвучуються, а їхня поява не зсуває клавіатури. */}
      <p className="wordle-status" role="status" aria-live="polite">
        {error ?? outcomeText(wordle)}
      </p>
      {readOnly ? (
        <p className="lead wordle-watch">{t('wordleWatch')}</p>
      ) : (
        !done && <WordleKeys marks={wordleKeyboard(wordle.rows)} disabled={off} onLetter={add} onErase={erase} onCheck={() => void check()} canCheck={typed.length === wordle.letters} />
      )}
    </section>
  );
}

/** Після закриття: власна сітка, «Вгадано з N-ї спроби!» / «Спроби скінчилися» / «Час вийшов»; на розкритті — слово. */
export function WordleOutcome({ wordle }: { wordle: PlayerWordle }) {
  const title = wordle.solved ? t('wordleSolved', { tries: wordle.rows.length }) : wordle.rows.length >= wordle.tries ? t('wordleOut') : t('timeUp');
  return (
    <div className="wordle-outcome">
      <WordleGrid letters={wordle.letters} tries={wordle.tries} rows={wordle.rows} />
      <h2>{title}</h2>
      {wordle.word !== null && (
        <p className="wordle-word" dir="auto">
          {t('wordleWordIs', { word: upper(wordle.word) })}
        </p>
      )}
    </div>
  );
}

/**
 * Сцена й пульт: міні-сітки всіх гравців (команд) з іменами. Літери — коли зріз їх дав (пульту з відкриття, сцені — на розкритті);
 * сцена до розкриття бачить лише кольори. На розкритті — слово великими, «вгадав за N спроби» / «не вгадав» і бали.
 */
export function WordleBoard({ info, reveal }: { info: WordleInfo; reveal: boolean }) {
  return (
    <section className="wordle-stage">
      {reveal && info.word !== null && (
        <div className="wordle-answer">
          <p className="meta">{t('wordleCorrect')}</p>
          <p className="wordle-answer-word" dir="ltr" lang="uk">
            {upper(info.word)}
          </p>
        </div>
      )}
      <ol className={info.rows.length > 8 ? 'wordle-board is-many' : 'wordle-board'}>
        {info.rows.map((row) => (
          <li key={row.playerId} className={reveal && !row.solved ? 'is-out' : undefined}>
            <WordleGrid letters={info.letters} tries={info.tries} rows={row.marks.map((marks, index) => ({ letters: row.guesses?.[index] ?? null, marks }))} />
            <span className="name" dir="auto">
              {row.nickname}
            </span>
            {reveal ? (
              <span className="tag">{row.solved ? countText('wordleSolvedIn', row.tries, { count: row.tries }) : t('wordleNotSolved')}</span>
            ) : (
              row.guesses !== null && <span className="tag">{t('wordleLive', { tries: row.tries, total: info.tries })}</span>
            )}
            {reveal && row.points !== null && (
              <span className="score" dir="ltr">
                {signed(row.points)}
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
