import { LIBRARY_SORTS, isLocale, type LibraryCard, type LibrarySort, type Locale } from '@quiz/shared';
import { useEffect, useRef, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorText, t, type TextKey } from '../i18n';
import { HelpButton } from '../help/HelpButton';
import { LibraryCardView } from '../library/LibraryCardView';
import { libraryCatalog } from '../library/library-api';
import { ENABLED_LOCALES, LOCALE_NAMES } from '../locales/locales';
import { EmptyState, LoadError, Loading } from '../ui/PageState';
import { useAccount } from '../useAccount';
import { QuizzesTabs } from './QuizzesTabs';

/** Пауза після останньої літери, перш ніж іти за новим списком. */
export const SEARCH_DELAY_MS = 300;
const SORT_LABELS: Record<LibrarySort, TextKey> = { popular: 'librarySortPopular', new: 'librarySortNew' };

/** /library: каталог відкритих вікторин; бачить і гість. Пошук, порядок і мова живуть в адресі. */
export function Library(): JSX.Element {
  const [params, setParams] = useSearchParams();
  // 77: з акаунтом бібліотека — вкладка «Вікторин»; гість бачить її окремо, як пункт меню.
  const signedIn = useAccount().status === 'signed-in';
  const q = params.get('q') ?? '';
  const sortParam = params.get('sort');
  const sort: LibrarySort = LIBRARY_SORTS.find((one) => one === sortParam) ?? 'popular';
  const langParam = params.get('lang') ?? '';
  const lang: Locale | '' = isLocale(langParam) ? langParam : '';

  const [text, setText] = useState(q);
  const [items, setItems] = useState<LibraryCard[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 76: «Спробувати ще раз» після збою першої сторінки.
  const [attempt, setAttempt] = useState(0);

  // Свіжі параметри для таймера пошуку: зміна порядку чи мови за ці 300 мс не має бути перезаписаною.
  const latest = useRef(params);
  latest.current = params;
  // Номер поточного списку: відповідь «Показати ще» для старих фільтрів відкидається.
  const generation = useRef(0);

  const update = (changes: Record<string, string>) => {
    const copy = new URLSearchParams(latest.current);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '' || (key === 'sort' && value === 'popular')) copy.delete(key);
      else copy.set(key, value);
    }
    setParams(copy, { replace: true });
  };

  // Запит іде в адресу лише після паузи в наборі.
  useEffect(() => {
    if (text === q) return;
    const timer = setTimeout(() => update({ q: text }), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  // Запит змінився з адреси (назад/вперед) — поле показує його.
  useEffect(() => setText(q), [q]);

  // Перша сторінка — при кожній зміні пошуку, порядку чи мови.
  useEffect(() => {
    let current = true;
    generation.current += 1;
    setItems(null);
    setNext(null);
    setBusy(false);
    setError(null);
    void libraryCatalog({ q, sort, lang, offset: 0 }).then((result) => {
      if (!current) return;
      if (result.ok) {
        setItems(result.data.items);
        setNext(result.data.next);
      } else {
        // Список так і не прийшов: на місці списку — помилка з повтором.
        setItems(null);
        setNext(null);
        setError(errorText(result.error));
      }
    });
    return () => {
      current = false;
    };
  }, [q, sort, lang, attempt]);

  const more = async () => {
    if (next === null) return;
    const mine = generation.current;
    setBusy(true);
    const result = await libraryCatalog({ q, sort, lang, offset: next });
    if (mine !== generation.current) return;
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    setError(null);
    setItems((list) => [...(list ?? []), ...result.data.items]);
    setNext(result.data.next);
  };

  return (
    <main className="app wide">
      {signedIn && <QuizzesTabs />}
      <div className="autopilot-head">
        <h1>{t('libraryTitle')}</h1>
        <HelpButton id="setting.library" />
      </div>
      <div className="library-filters">
        <label className="field library-search">
          <span>{t('librarySearch')}</span>
          <input type="search" value={text} maxLength={100} autoComplete="off" onChange={(event) => setText(event.target.value)} />
        </label>
        <label className="field">
          <span>{t('librarySort')}</span>
          <select value={sort} onChange={(event) => update({ sort: event.target.value })}>
            {LIBRARY_SORTS.map((one) => (
              <option key={one} value={one}>
                {t(SORT_LABELS[one])}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{t('libraryLanguage')}</span>
          <select value={lang} onChange={(event) => update({ lang: event.target.value })}>
            <option value="">{t('libraryAnyLanguage')}</option>
            {ENABLED_LOCALES.map((locale) => (
              <option key={locale} value={locale}>
                {LOCALE_NAMES[locale]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {items === null && error === null && <Loading list />}
      {items === null && error !== null && <LoadError message={error} onRetry={() => setAttempt((n) => n + 1)} />}
      {items !== null && error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items !== null && items.length === 0 && error === null && (
        <EmptyState text={t('libraryEmpty')}>
          {(q !== '' || lang !== '') && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                setText('');
                update({ q: '', lang: '' });
              }}
            >
              {t('libraryClearSearch')}
            </button>
          )}
        </EmptyState>
      )}
      {items !== null && items.length > 0 && (
        <ul className="library-list">
          {items.map((card) => (
            <LibraryCardView key={card.id} card={card} />
          ))}
        </ul>
      )}
      {next !== null && (
        <button type="button" className="btn" disabled={busy} onClick={more}>
          {t('libraryMore')}
        </button>
      )}
    </main>
  );
}
