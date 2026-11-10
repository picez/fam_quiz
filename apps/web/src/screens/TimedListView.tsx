import { useEffect, useRef, useState, type FormEvent } from 'react';
import { LIMITS, type PlayerTimedList, type PublicQuestion, type TimedListInfo } from '@quiz/shared';
import { signed } from '../format';
import { errorText, t } from '../i18n';
import type { Send } from '../live/types';

/** Пауза в наборі, після якої слово перевіряється без Enter. */
export const LIST_CHECK_MS = 400;
/** Скільки видно «−50» біля лічильника після слова не зі списку. */
const MINUS_MS = 1500;
/** Блимання вже знайденої клітинки при повторі. */
const AGAIN_MS = 600;
/** Трусіння поля після промаху з Enter. */
const SHAKE_MS = 300;
/** Скільки чекати, поки телефонна клавіатура відкриється, перш ніж прокрутити поле у видиму частину. */
const KEYBOARD_MS = 300;

/** Те саме слово з іншим регістром чи пробілами по краях — для пошуку клітинки повтору. */
const sameWord = (a: string, b: string) => a.trim().toLocaleLowerCase('uk') === b.trim().toLocaleLowerCase('uk');

/** Нумеровані клітинки: знайдені — з назвою; fresh — щойно знайдена (анімація), again — повтор (блимання). */
export function TimedListCells({ total, found, fresh = null, again = null }: { total: number; found: { index: number; text: string }[]; fresh?: number | null; again?: number | null }) {
  const byIndex = new Map(found.map((entry) => [entry.index, entry.text]));
  return (
    <ol className="timedlist-cells">
      {Array.from({ length: total }, (_, at) => {
        const index = at + 1;
        const text = byIndex.get(index);
        if (text === undefined) {
          return (
            <li key={index} className="timedlist-cell" aria-label={t('listCellN', { index })}>
              <span className="timedlist-n">{index}</span>
            </li>
          );
        }
        const className = ['timedlist-cell', 'is-found', index === fresh ? 'is-fresh' : '', index === again ? 'is-again' : ''].filter(Boolean).join(' ');
        return (
          <li key={index} className={className}>
            <span className="timedlist-n">{index}</span>
            <span className="timedlist-text" dir="auto">
              {text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Лічильник «6 / 10» і, з мінусом, «Слово не зі списку: −50». */
function TimedListCount({ found, total, minus, flash = false }: { found: number; total: number; minus: number | null; flash?: boolean }) {
  return (
    <div className="timedlist-count">
      <p className="timedlist-counter" dir="ltr">
        {t('listCount', { found, total })}
        {flash && minus !== null && <span className="timedlist-minus-flash">{`−${minus}`}</span>}
      </p>
      {minus !== null && <p className="meta">{t('listMinusNote', { minus })}</p>}
    </div>
  );
}

type Check = { word: string; enter: boolean };

/** Телефон: лічильник, поле без кнопки, клітинки; живе введення через 400 мс, Enter — з мінусом. */
export function TimedListPlay({ list, question, paused, send }: { list: PlayerTimedList; question: PublicQuestion; paused: boolean; send: Send }) {
  const [word, setWord] = useState('');
  const [status, setStatus] = useState('');
  const [fresh, setFresh] = useState<number | null>(null);
  const [again, setAgain] = useState<number | null>(null);
  const [shake, setShake] = useState(false);
  const [minusFlash, setMinusFlash] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef<HTMLHeadingElement>(null);
  // Поточне значення поля для відповідей сервера, що приходять пізніше за рендер.
  const value = useRef('');
  const listNow = useRef(list);
  listNow.current = list;
  /** Один запит за раз; поки він іде, остання зміна чекає тут. */
  const busy = useRef(false);
  const waiting = useRef<Check | null>(null);
  /** Останнє слово, яке вже пішло на перевірку без Enter: те саме вдруге не шлемо. */
  const checked = useRef<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const known = useRef(new Set(list.found.map((entry) => entry.index)));

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
  const cancel = (name: string) => {
    const old = timers.current.get(name);
    if (old !== undefined) clearTimeout(old);
    timers.current.delete(name);
  };

  useEffect(() => {
    const all = timers.current;
    return () => {
      for (const timer of all.values()) clearTimeout(timer);
      all.clear();
    };
  }, []);

  // Нова знахідка (власна чи товариша по команді) з'являється з анімацією й озвучується.
  useEffect(() => {
    const added = list.found.filter((entry) => !known.current.has(entry.index));
    for (const entry of list.found) known.current.add(entry.index);
    const last = added[added.length - 1];
    if (last === undefined) return;
    setFresh(last.index);
    setStatus(t('listFoundItem', { text: last.text }));
  }, [list.found]);

  useEffect(() => {
    if (list.done) done.current?.focus();
  }, [list.done]);

  const info = question.timedlist;
  const minus = info?.minus ?? null;
  const off = paused || !list.canType;

  /** Поле — до порожнього, лише якщо в ньому досі те саме слово, що пішло на сервер. */
  const clearIf = (sent: string) => {
    if (value.current !== sent) return;
    value.current = '';
    setWord('');
  };

  const run = async (request: Check) => {
    if (busy.current) {
      // Enter важливіший за живу перевірку: не губиться, якщо за ним прийде ще літера.
      if (request.enter || waiting.current?.enter !== true) waiting.current = request;
      return;
    }
    busy.current = true;
    if (!request.enter) checked.current = request.word;
    try {
      const result = await send('player:list', request);
      if (result.ok) {
        clearIf(request.word);
      } else if (result.error === 'list_repeat') {
        clearIf(request.word);
        const cell = listNow.current.found.find((entry) => sameWord(entry.text, request.word));
        if (cell !== undefined) {
          setAgain(cell.index);
          later('again', AGAIN_MS, () => setAgain(null));
        }
        setStatus(errorText('list_repeat'));
      } else if (result.error === 'list_miss') {
        // Живий промах — не помилка: гравець ще набирає.
        if (request.enter) {
          clearIf(request.word);
          setShake(true);
          later('shake', SHAKE_MS, () => setShake(false));
          if (minus !== null) {
            setMinusFlash(true);
            later('minus', MINUS_MS, () => setMinusFlash(false));
          }
          setStatus(errorText('list_miss'));
        }
      } else {
        setStatus(errorText(result.error));
      }
    } catch {
      setStatus(t('err_unknown'));
    } finally {
      busy.current = false;
      input.current?.focus();
      const next = waiting.current;
      waiting.current = null;
      if (next !== null) {
        // Жива перевірка йде з тим, що в полі зараз, а не з тим, що було під час запиту.
        if (next.enter) void run(next);
        else if (value.current.trim() !== '' && value.current !== checked.current) void run({ word: value.current, enter: false });
      }
    }
  };

  const change = (next: string) => {
    value.current = next;
    setWord(next);
    later('check', LIST_CHECK_MS, () => {
      const now = value.current;
      if (off || now.trim() === '' || now === checked.current) return;
      void run({ word: now, enter: false });
    });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const now = value.current;
    if (off || now.trim() === '') return;
    cancel('check');
    void run({ word: now, enter: true });
  };

  if (info === undefined) return null;

  return (
    <section className="timedlist-play">
      <TimedListCount found={list.found.length} total={list.total} minus={minus} flash={minusFlash} />
      {minus !== null && list.wrong > 0 && <p className="meta timedlist-wrong">{t('listWrong', { wrong: list.wrong })}</p>}
      {list.done ? (
        <div role="status">
          <h2 ref={done} tabIndex={-1}>
            {t('listDone')}
          </h2>
        </div>
      ) : (
        <form className="timedlist-form" onSubmit={submit}>
          <label className="field">
            <span className="meta">{t('listLabel')}</span>
            <input
              ref={input}
              className={shake ? 'is-shake' : undefined}
              type="text"
              dir="auto"
              inputMode="text"
              maxLength={LIMITS.listWord}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="done"
              value={word}
              disabled={off}
              onFocus={() => later('keyboard', KEYBOARD_MS, () => input.current?.scrollIntoView?.({ block: 'nearest' }))}
              onChange={(event) => change(event.target.value)}
            />
          </label>
          {/* Завжди в DOM: зміна тексту озвучується. */}
          <p className="timedlist-status" role="status" aria-live="polite">
            {status}
          </p>
        </form>
      )}
      <TimedListCells total={list.total} found={list.found} fresh={fresh} again={again} />
    </section>
  );
}

/** Після закриття: власні клітинки й лічильник, без поля. */
export function TimedListOutcome({ list, minus }: { list: PlayerTimedList; minus: number | null }) {
  return (
    <>
      <TimedListCount found={list.found.length} total={list.total} minus={null} />
      {minus !== null && list.wrong > 0 && <p className="meta timedlist-wrong">{t('listWrong', { wrong: list.wrong })}</p>}
      <TimedListCells total={list.total} found={list.found} />
    </>
  );
}

/** Рядки гравців: «6 / 10», помилки; на reveal — бали. */
export function TimedListBoard({ info, reveal }: { info: TimedListInfo; reveal: boolean }) {
  return (
    <ol className="rows timedlist-board">
      {info.rows.map((row) => (
        <li key={row.playerId}>
          <span className="name" dir="auto">
            {row.nickname}
          </span>
          <span className="tag" dir="ltr">
            {t('listCount', { found: row.found, total: info.total })}
          </span>
          {row.wrong > 0 && <span className="tag timedlist-wrong">{t('listWrong', { wrong: row.wrong })}</span>}
          {reveal && row.points !== null && (
            <span className="score" dir="ltr">
              {signed(row.points)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Увесь список: номер, назва, знахідники (імена), бали кожному; mine — підсвітити власні знахідки. */
export function TimedListReveal({ info, mine }: { info: TimedListInfo; mine?: string }) {
  if (info.items === null) return null;
  const names = new Map(info.rows.map((row) => [row.playerId, row.nickname]));
  return (
    <ol className={info.items.length >= 11 ? 'timedlist-reveal is-wide' : 'timedlist-reveal'}>
      {info.items.map((item) => (
        <li key={item.index} className={mine !== undefined && item.finders.includes(mine) ? 'is-mine' : undefined}>
          <span className="timedlist-n">{item.index}</span>
          <span className="timedlist-text" dir="auto">
            {item.text}
          </span>
          <span className="meta timedlist-finders" dir="auto">
            {item.finders.length === 0 ? t('listNobody') : t('listFinders', { names: item.finders.map((id) => names.get(id) ?? id).join(', ') })}
          </span>
          {item.points !== null && item.finders.length > 0 && (
            <span className="score" dir="ltr">
              {signed(item.points)}
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
