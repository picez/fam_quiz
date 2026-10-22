import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { ChainInfo, ChainMask, PlayerChain, PublicQuestion } from '@quiz/shared';
import { secondsText, signed } from '../format';
import { errorText, t } from '../i18n';
import { secondsLeft } from '../clock';
import { Timer } from '../live/Timer';
import type { Send } from '../live/types';

const LETTER = /\p{L}/u;
/** Слово довше за стільки клітинок стискається й отримує лічильник літер. */
const LONG_WORD = 14;

/** Повна маска слова для розкриття. */
export function fullMask(word: string): ChainMask {
  return [...word];
}

/** Слова плитками: перше й маски; current — індекс маски поточного слова; tone — '' | 'is-correct'. */
export function ChainWords({ first, masks, current, tone = '' }: { first: string; masks: ChainMask[]; current?: number; tone?: string }) {
  const words: { mask: ChainMask; className: string }[] = [
    { mask: fullMask(first), className: 'chain-word is-first' },
    ...masks.map((mask, index) => ({ mask, className: index === current ? 'chain-word is-current' : 'chain-word' })),
  ];
  return (
    <ol className={`chain-words ${tone}`.trim()}>
      {words.map(({ mask, className }, index) => {
        const long = mask.length > LONG_WORD;
        return (
          <li key={index} className={long ? `${className} is-long` : className} aria-label={mask.map((c) => c ?? '_').join('')}>
            {mask.map((char, at) =>
              char === null ? (
                <span key={at} className="chain-cell is-blank" aria-hidden="true">
                  {' '}
                </span>
              ) : LETTER.test(char) ? (
                <span key={at} className="chain-cell" aria-hidden="true">
                  {char}
                </span>
              ) : (
                <span key={at} className="chain-sep" aria-hidden="true">
                  {char}
                </span>
              ),
            )}
            {long && (
              <span className="chain-count" aria-hidden="true">
                {mask.filter((char) => char === null || LETTER.test(char)).length}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Мілісекунди до особистого кінця часу; на паузі — збережений залишок. */
function remainingOf(chain: PlayerChain, offsetMs: number, nowMs: number): number {
  if (chain.remainingMs !== null) return chain.remainingMs;
  if (chain.deadline === null) return 0;
  return Math.max(0, chain.deadline - (nowMs + offsetMs));
}

/** Ланцюжок гравця: плитки, поле слова, «Перевірити», «Підказка», власний час. */
export function ChainPlay({
  chain,
  question,
  paused,
  offsetMs,
  send,
}: {
  chain: PlayerChain;
  question: PublicQuestion;
  paused: boolean;
  offsetMs: number;
  send: Send;
}) {
  const [word, setWord] = useState('');
  const [miss, setMiss] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const done = chain.timeMs !== null;
  const running = chain.deadline !== null && !done;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, [running, chain.deadline]);

  if (question.chain === null) return null;
  const left = secondsLeft({ endsAt: chain.deadline, remainingMs: chain.remainingMs }, offsetMs, now);
  const hintOff = !chain.canHint || paused || (left !== null && left <= chain.hintMs / 1000);
  // Особистий час вийшов, а запитання ще відкрите: поле ховається, бо будь-яке слово сервер відхилить.
  const out = !done && left === 0;

  const guess = async (event: FormEvent) => {
    event.preventDefault();
    if (busy.current || word.trim() === '') return;
    busy.current = true;
    try {
      const result = await send('player:guess', { word });
      if (result.ok) {
        setWord('');
        setMiss(false);
        setError(null);
      } else if (result.error === 'wrong_word') {
        setMiss(true);
        setError(null);
      } else {
        setMiss(false);
        setError(errorText(result.error));
      }
    } finally {
      busy.current = false;
      input.current?.focus();
    }
  };

  const hint = async () => {
    // Подвійний дотик не має коштувати дві підказки.
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await send('player:hint');
      setMiss(false);
      setError(result.ok ? null : errorText(result.error));
    } finally {
      busy.current = false;
      input.current?.focus();
    }
  };

  return (
    <section className="chain-play">
      {!done && !out && <Timer view={{ endsAt: chain.deadline, remainingMs: chain.remainingMs }} offsetMs={offsetMs} />}
      <ChainWords first={question.chain.first} masks={chain.masks} current={done ? undefined : chain.solved} />
      {done ? (
        <h2>{t('chainDone', { time: secondsText(chain.timeMs ?? 0) })}</h2>
      ) : out ? (
        <h2>{t('chainOutOfTime')}</h2>
      ) : (
        <>
          <form className="chain-form" onSubmit={(event) => void guess(event)}>
            <label className="field">
              <span className="meta">{t('chainGuessLabel')}</span>
              <input
                ref={input}
                type="text"
                maxLength={30}
                autoComplete="off"
                autoCapitalize="none"
                enterKeyHint="go"
                value={word}
                disabled={paused}
                onChange={(event) => setWord(event.target.value)}
              />
            </label>
            <button type="submit" className="btn btn-primary" disabled={paused}>
              {t('chainCheck')}
            </button>
            <button type="button" className="btn" disabled={hintOff} onClick={() => void hint()}>
              {t('chainHintButton', { seconds: chain.hintMs / 1000 })}
            </button>
          </form>
          {miss && (
            <p className="chain-miss" role="status">
              {t('chainMiss')}
            </p>
          )}
          {error !== null && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <p className="chain-clock">{t('chainMyTime', { time: secondsText(Math.max(0, chain.limitMs - remainingOf(chain, offsetMs, now))) })}</p>
        </>
      )}
    </section>
  );
}

/** Місце за часом: рівні часи ділять місце; хто не пройшов, місця не має. */
function rankOf(chain: ChainInfo, timeMs: number | null): string {
  if (timeMs === null) return '—';
  return String(1 + chain.rows.filter((row) => row.timeMs !== null && row.timeMs < timeMs).length);
}

/** Поступ або рейтинг (на reveal) гравців без літер. */
export function ChainBoard({ chain, reveal }: { chain: ChainInfo; reveal: boolean }) {
  return (
    <ol className="rows chain-board">
      {chain.rows.map((row) => (
        // Під час запитання «не пройшов» означає «ще грає»: тьмяніє лише на розкритті.
        <li key={row.playerId} className={reveal && row.timeMs === null ? 'is-out' : undefined}>
          {reveal && <span className="rank">{rankOf(chain, row.timeMs)}</span>}
          <span className="name">{row.nickname}</span>
          <span className="tag">
            {row.timeMs === null
              ? t('chainRowWords', { solved: row.solved, total: chain.total })
              : t('chainRowTime', { time: secondsText(row.timeMs) })}
          </span>
          {row.hints > 0 && <span className="tag">{t('chainHints', { count: row.hints })}</span>}
          {reveal && row.points !== null && <span className="score">{signed(row.points)}</span>}
        </li>
      ))}
    </ol>
  );
}
