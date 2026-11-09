import { useEffect, useRef, useState, type FormEvent } from 'react';
import { collapseLadder, LIMITS, type PlayerWordLadder, type PublicQuestion, type WordLadderInfo } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send, SendResult } from '../live/types';

/** Скільки чекати, поки телефонна клавіатура відкриється, перш ніж прокрутити поле у видиму частину. */
const KEYBOARD_MS = 300;

/**
 * Стовпчик драбини: старт і прийняті слова (понад 5 — старт, друге, «…», два останні),
 * під ними рядок порожніх клітинок, якщо current. Слова українські й в арабському інтерфейсі: стовпчик завжди LTR.
 */
export function WordLadderColumn({ start, words, letters, current = false }: { start: string; target: string; words: string[]; letters: number; current?: boolean }) {
  const items = collapseLadder([start, ...words]);
  return (
    <ol className="wordladder-column" dir="ltr" lang="uk">
      {items.map((word, index) =>
        word === null ? (
          <li key={index} className="wordladder-gap" aria-label={t('wordLadderGap')}>
            …
          </li>
        ) : (
          <li key={index} className={index === 0 ? 'wordladder-word is-start' : 'wordladder-word'}>
            {word}
          </li>
        ),
      )}
      {current && (
        <li className="wordladder-word is-next" aria-hidden="true">
          {Array.from({ length: letters }, (_, at) => (
            <span key={at} className="wordladder-cell" />
          ))}
        </li>
      )}
    </ol>
  );
}

/** «ПОЛЕ → ТАРА»: зліва направо й в арабському інтерфейсі. */
export function WordLadderGoal({ start, target }: { start: string; target: string }) {
  return (
    <p className="wordladder-goal" dir="ltr" lang="uk">
      {t('wordLadderGoal', { start, target })}
    </p>
  );
}

/** Телефон: «ПОЛЕ → ТАРА», стовпчик, поле вводу, «Додати», «Крок назад», повідомлення сервера; після фінішу — «Готово! Кроків: N». */
export function WordLadderPlay({ ladder, question, paused, send }: { ladder: PlayerWordLadder; question: PublicQuestion; paused: boolean; send: Send }) {
  const [word, setWord] = useState('');
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const status = useRef<HTMLParagraphElement>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) clearTimeout(timer.current);
  }, []);

  const info = question.wordladder;
  if (info === undefined) return null;
  const off = paused || !ladder.canAdd;

  /** Поле й повідомлення під ним — над клавіатурою. */
  const keepVisible = (delay: number) => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      status.current?.scrollIntoView?.({ block: 'nearest' });
    }, delay);
  };

  /** Один запит за раз: подвійний дотик не шле другого, поки сервер не відповів на перший. */
  const run = async (request: () => Promise<SendResult>, clear: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await request();
      if (result.ok) {
        if (clear) setWord('');
        setError(null);
      } else {
        setError(errorText(result.error));
      }
    } finally {
      busy.current = false;
      input.current?.focus();
      keepVisible(0);
    }
  };

  const add = (event: FormEvent) => {
    event.preventDefault();
    if (off || word.trim() === '') return;
    void run(() => send('player:wordladder', { word }), true);
  };

  return (
    <section className="wordladder-play">
      <WordLadderGoal start={info.start} target={info.target} />
      <p className="meta">{t('wordLadderMax', { max: info.maxSteps })}</p>
      <WordLadderColumn start={info.start} target={info.target} words={ladder.words} letters={info.letters} current={!ladder.finished} />
      {ladder.finished ? (
        <>
          <h2>{t('wordLadderDone', { steps: ladder.steps })}</h2>
          <p className="lead">{t('wordLadderWait')}</p>
        </>
      ) : (
        <form className="wordladder-form" onSubmit={add}>
          <label className="field">
            <span className="meta">{t('wordLadderLabel')}</span>
            <input
              ref={input}
              type="text"
              dir="ltr"
              lang="uk"
              inputMode="text"
              maxLength={LIMITS.wordLadderWord}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              value={word}
              disabled={off}
              onFocus={() => keepVisible(KEYBOARD_MS)}
              onChange={(event) => setWord(event.target.value)}
            />
          </label>
          {/* Завжди в DOM: зміна тексту озвучується, а поява причини не зсуває кнопок. */}
          <p ref={status} className="wordladder-status" role="status" aria-live="polite">
            {error ?? ''}
          </p>
          <div className="wordladder-actions">
            <button type="submit" className="btn btn-primary" disabled={off}>
              {t('wordLadderAdd')}
            </button>
            <button type="button" className="btn" disabled={off || !ladder.canBack} onClick={() => void run(() => send('player:wordladder-back'), false)}>
              {t('wordLadderBack')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/** Підсумок драбини після закриття: власний стовпчик і «Готово! Кроків: N» або «Не встигли дійти до цілі». */
export function WordLadderOutcome({ ladder, question }: { ladder: PlayerWordLadder; question: PublicQuestion }) {
  const info = question.wordladder;
  if (info === undefined) return null;
  return (
    <>
      <WordLadderGoal start={info.start} target={info.target} />
      <WordLadderColumn start={info.start} target={info.target} words={ladder.words} letters={info.letters} />
      <h2>{ladder.finished ? t('wordLadderDone', { steps: ladder.steps }) : t('wordLadderOut')}</h2>
    </>
  );
}

/** Місце за кроками: рівні кроки ділять місце; хто не дійшов, місця не має. */
function rankOf(info: WordLadderInfo, steps: number, finished: boolean): string {
  if (!finished) return '—';
  return String(1 + info.rows.filter((row) => row.finished && row.steps < steps).length);
}

/** Шлях ведучого: слова зліва направо, навіть в арабському інтерфейсі. */
export function WordLadderPath({ path }: { path: string[] }) {
  return (
    <section className="wordladder-path">
      <h2>{t('wordLadderHostPath')}</h2>
      <ol dir="ltr" lang="uk">
        {path.map((word, index) => (
          <li key={index} className={index === 0 || index === path.length - 1 ? 'is-end' : undefined}>
            {word}
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * Рядки гравців: кроки або «фініш»; на reveal — місце, слова фінішера й бали.
 * Слова показуються, коли зріз їх дав (ведучому завжди, іншим лише на reveal).
 */
export function WordLadderBoard({ info, reveal }: { info: WordLadderInfo; reveal: boolean }) {
  return (
    <ol className="rows wordladder-board">
      {info.rows.map((row) => (
        // Під час запитання «не дійшов» означає «ще грає»: тьмяніє лише на розкритті.
        <li key={row.playerId} className={reveal && !row.finished ? 'is-out' : undefined}>
          {reveal && <span className="rank">{rankOf(info, row.steps, row.finished)}</span>}
          <span className="name" dir="auto">{row.nickname}</span>
          <span className="tag">{row.finished ? t('wordLadderRowFinished') : t('wordLadderRowSteps', { steps: row.steps })}</span>
          {reveal && row.points !== null && <span className="score" dir="ltr">{signed(row.points)}</span>}
          {row.words !== null && row.words.length > 0 && (
            <span className="wordladder-words" dir="ltr" lang="uk">
              {row.words.join(' → ')}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
