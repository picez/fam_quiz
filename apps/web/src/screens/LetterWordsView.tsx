import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LIMITS, ladderKey, wordLetters, type LetterWordsInfo, type PlayerLetterWords, type PublicQuestion } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

/** Блимання вже знайденого слова при повторі. */
const AGAIN_MS = 600;
/** Трусіння поля після відмови. */
const SHAKE_MS = 300;
/** Скільки чекати, поки телефонна клавіатура відкриється, перш ніж прокрутити поле у видиму частину. */
const KEYBOARD_MS = 300;
/** Найкоротше слово, яке має сенс надсилати. */
const MIN_WORD = LIMITS.minLetterWord;

/** Літери поля (малі, NFC), без апострофів, пробілів та інших не-літер: так рахуються плитки й довжина слова. */
function fieldLetters(text: string): string[] {
  return [...text.normalize('NFC').toLocaleLowerCase('uk')].filter((c) => /\p{L}/u.test(c));
}

/** Великою — як на плитці. */
const upper = (letter: string) => letter.toLocaleUpperCase('uk');

/** Дотик до кнопки не забирає фокус (і клавіатуру Android) з поля. */
const keepFocus = { onPointerDown: (event: { preventDefault: () => void }) => event.preventDefault(), onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault() };

/**
 * Плитки набору. used — літери, вже взяті полем: k-та плитка літери гасне, коли поле взяло цю літеру k разів.
 * onPick — додати літеру; без нього — лише показ (сцена, пульт). off — гра стоїть (пауза, кінець часу): усі плитки бліді й неактивні.
 */
export function LetterTiles({
  letters,
  used = [],
  onPick,
  big = false,
  off = false,
}: {
  letters: string[];
  used?: string[];
  onPick?: (letter: string) => void;
  big?: boolean;
  off?: boolean;
}) {
  const taken = new Map<string, number>();
  for (const l of used) taken.set(l, (taken.get(l) ?? 0) + 1);
  const seen = new Map<string, number>();
  const className = ['letterwords-tiles', big ? 'is-big' : '', off && onPick !== undefined ? 'is-off' : ''].filter(Boolean).join(' ');
  if (onPick === undefined) {
    return (
      <ul className={className} lang="uk" dir="ltr">
        {letters.map((letter, at) => (
          <li key={at} className="letterwords-tile">
            {upper(letter)}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className={className} lang="uk" dir="ltr">
      {letters.map((letter, at) => {
        const nth = (seen.get(letter) ?? 0) + 1;
        seen.set(letter, nth);
        const out = off || (taken.get(letter) ?? 0) >= nth;
        return (
          <button
            key={at}
            type="button"
            className="letterwords-tile"
            aria-label={t('lettersTile', { letter: upper(letter) })}
            aria-disabled={out}
            {...keepFocus}
            onClick={() => {
              if (!out) onPick(letter);
            }}
          >
            {upper(letter)}
          </button>
        );
      })}
    </div>
  );
}

/** Власні слова: новіші зверху, з кількістю літер; fresh — щойно додане (анімація), again — повтор (блимання). */
export function LetterWordsMine({ words, fresh = null, again = null }: { words: PlayerLetterWords['words']; fresh?: string | null; again?: string | null }) {
  return (
    <section className="letterwords-mine">
      <h2 className="meta">{t('lettersMine', { n: words.length })}</h2>
      <ol lang="uk" dir="auto">
        {[...words].reverse().map((word) => (
          <li key={word.text} className={[word.text === fresh ? 'is-fresh' : '', word.text === again ? 'is-again' : ''].filter(Boolean).join(' ') || undefined}>
            <span className="letterwords-word">{word.text}</span>
            <span className="tag">{t('lettersLength', { n: word.letters })}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Телефон: плитки, поле, «Додати», ⌫, «Очистити», «Перемішати», список своїх слів. */
export function LetterWordsPlay({ info, question, paused, send }: { info: PlayerLetterWords; question: PublicQuestion; paused: boolean; send: Send }) {
  const letters = question.letterwords?.letters ?? [];
  const [word, setWord] = useState('');
  const [status, setStatus] = useState('');
  const [shake, setShake] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [again, setAgain] = useState<string | null>(null);
  // Перемішаний порядок — лише локальний; новий набір (роздача) скидає його.
  const [order, setOrder] = useState<{ source: string; letters: string[] } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Поточне значення поля для відповідей сервера, що приходять пізніше за рендер.
  const value = useRef('');
  const wordsNow = useRef(info.words);
  wordsNow.current = info.words;
  /** Один запит за раз; Enter, натиснутий під час запиту, чекає тут. */
  const busy = useRef(false);
  const waiting = useRef<string | null>(null);
  /** Слово, що зараз у запиті: другий дотик до «Додати» на ньому не ставить його в чергу вдруге. */
  const inFlight = useRef<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const known = useRef(new Set(info.words.map((w) => w.text)));

  const later = (name: string, ms: number, run: () => void) => {
    const old = timers.current.get(name);
    if (old !== undefined) clearTimeout(old);
    timers.current.set(
      name,
      setTimeout(() => {
        timers.current.delete(name);
        run();
      }, ms),
    );
  };

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const timer of all.values()) clearTimeout(timer);
      all.clear();
    };
  }, []);

  // Нове слово (власне чи товариша по команді) з'являється з анімацією й озвучується.
  useEffect(() => {
    const added = info.words.filter((w) => !known.current.has(w.text));
    for (const w of info.words) known.current.add(w.text);
    const last = added[added.length - 1];
    if (last === undefined) return;
    setFresh(last.text);
    setStatus(t('lettersAdded', { word: last.text }));
  }, [info.words]);

  const off = paused || !info.canType;
  const offNow = useRef(off);
  offNow.current = off;

  const change = (next: string) => {
    value.current = next;
    setWord(next);
  };

  /** Поле — до порожнього, лише якщо в ньому досі те саме слово; дописаний за час відповіді хвіст лишається, без склеювання. */
  const clearIf = (sent: string) => {
    const now = value.current;
    if (!now.startsWith(sent)) return;
    change(now.slice(sent.length).replace(/^[\s,;]+/u, ''));
  };

  const run = async (sent: string) => {
    busy.current = true;
    inFlight.current = sent;
    try {
      const result = await send('player:letters', { word: sent });
      if (result.ok) {
        clearIf(sent);
      } else if (result.error === 'too_soon') {
        // Ліміт частоти — не помилка гравця: слово лишається, його можна надіслати ще раз.
      } else if (result.error === 'letters_repeat') {
        // Повтор нічого не коштує: блимає наявне слово, поле звільняється для наступного.
        clearIf(sent);
        const key = ladderKey(sent);
        if (key !== null && wordsNow.current.some((w) => w.text === key)) {
          setAgain(key);
          later('again', AGAIN_MS, () => setAgain(null));
        }
        setStatus(errorText('letters_repeat'));
      } else {
        // Не з набору, не існує, закоротке: поле лишається, щоб виправити.
        setShake(true);
        later('shake', SHAKE_MS, () => setShake(false));
        setStatus(errorText(result.error));
      }
    } catch {
      setStatus(t('err_unknown'));
    } finally {
      busy.current = false;
      inFlight.current = null;
      // Фокус повертається, лише якщо гравець свідомо не пішов з поля: інакше клавіатура вискакувала б знову.
      const active = document.activeElement;
      if (active === null || active === document.body || active === input.current) input.current?.focus();
      const next = waiting.current;
      waiting.current = null;
      // Enter з черги — лише для слова, що досі в полі.
      if (next !== null && !offNow.current && value.current === next) void run(next);
    }
  };

  const enough = fieldLetters(word).length >= MIN_WORD;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const now = value.current;
    if (offNow.current || fieldLetters(now).length < MIN_WORD) return;
    if (busy.current) {
      // Те саме слово вже в запиті — не дублюємо; інше — чекає своєї черги.
      waiting.current = now === inFlight.current ? null : now;
      return;
    }
    void run(now);
  };

  const pick = (letter: string) => {
    if (off) return;
    change(value.current + letter);
  };
  const erase = () => change([...value.current].slice(0, -1).join(''));

  const source = letters.join('');
  const tiles = order !== null && order.source === source ? order.letters : letters;
  const shuffle = () => {
    const next = [...tiles];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    setOrder({ source, letters: next });
  };

  if (question.letterwords === undefined) return null;

  return (
    <section className="letterwords-play">
      <LetterTiles letters={tiles} used={fieldLetters(word)} onPick={pick} off={off} />
      <form className="letterwords-form" onSubmit={submit}>
        <label className="field">
          <span className="meta">{t('lettersLabel')}</span>
          <input
            ref={input}
            className={shake ? 'is-shake' : undefined}
            type="text"
            dir="ltr"
            lang="uk"
            inputMode="text"
            maxLength={LIMITS.letterWord}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="send"
            value={word}
            disabled={off}
            onFocus={() => later('keyboard', KEYBOARD_MS, () => input.current?.scrollIntoView?.({ block: 'nearest' }))}
            onChange={(event) => change(event.target.value)}
          />
        </label>
        {/* Завжди в DOM: зміна тексту озвучується, а поява причини не зсуває кнопок. */}
        <p className="letterwords-status" role="status" aria-live="polite">
          {status}
        </p>
        <div className="letterwords-actions">
          <button type="submit" className="btn btn-primary" disabled={off || !enough} {...keepFocus}>
            {t('wordLadderAdd')}
          </button>
          <button type="button" className="btn" aria-label={t('lettersErase')} title={t('lettersErase')} disabled={off || word === ''} {...keepFocus} onClick={erase}>
            ⌫
          </button>
          <button type="button" className="btn" disabled={off || word === ''} {...keepFocus} onClick={() => change('')}>
            {t('lettersClear')}
          </button>
          <button type="button" className="btn" disabled={off || letters.length < 2} {...keepFocus} onClick={shuffle}>
            {t('lettersShuffle')}
          </button>
        </div>
      </form>
      <LetterWordsMine words={info.words} fresh={fresh} again={again} />
    </section>
  );
}

/**
 * Рядки гравців: «Слів: 5»; ведучому — усі слова наживо; на reveal — найкращі слова, «ще N», бали.
 * mine — підсвітити власний рядок.
 */
export function LetterWordsBoard({ info, reveal, mine }: { info: LetterWordsInfo; reveal: boolean; mine?: string }) {
  return (
    <ol className="rows letterwords-board">
      {info.rows.map((row) => {
        const all = info.words?.[row.playerId] ?? null;
        const shown = all ?? row.top;
        return (
          <li key={row.playerId} className={mine !== undefined && row.playerId === mine ? 'is-mine' : undefined}>
            <span className="name" dir="auto">
              {row.nickname}
            </span>
            <span className="tag">{t('lettersLive', { n: row.found })}</span>
            {reveal && row.points !== null && (
              <span className="score" dir="ltr">
                {signed(row.points)}
              </span>
            )}
            {shown !== null && shown.length > 0 && (
              <span className="letterwords-words" lang="uk" dir="auto">
                {shown.join(', ')}
              </span>
            )}
            {all === null && row.more !== null && row.more > 0 && <span className="meta letterwords-more">{t('lettersMore', { n: row.more })}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** Найдовші можливі слова: 1–2 слова з кількістю літер і «Усього слів у наборі: N»; порожньо — lettersNoneExist; поки невідомо — нічого. */
export function LetterWordsBest({ info }: { info: LetterWordsInfo }) {
  if (info.best === null) return null;
  return (
    <section className="letterwords-best">
      <h2>{t('lettersBestTitle')}</h2>
      {info.best.length === 0 ? (
        <p className="meta">{t('lettersNoneExist')}</p>
      ) : (
        <>
          <ul lang="uk" dir="auto">
            {info.best.map((word) => (
              <li key={word}>
                <span className="letterwords-word">{word}</span>
                <span className="tag">{t('lettersLength', { n: wordLetters(word).length })}</span>
              </li>
            ))}
          </ul>
          {info.possible !== null && <p className="meta">{t('lettersPossible', { n: info.possible })}</p>}
        </>
      )}
    </section>
  );
}
