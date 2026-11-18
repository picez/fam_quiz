import { LIBRARY_SORTS, isLocale, type LibraryCard, type LibrarySort, type Locale } from '@quiz/shared';
import { useEffect, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorText, t, type TextKey } from '../i18n';
import { LibraryCardView } from '../library/LibraryCardView';
import { libraryCatalog } from '../library/library-api';
import { ENABLED_LOCALES, LOCALE_NAMES } from '../locales/locales';

/** Пауза після останньої літери, перш ніж іти за новим списком. */
export const SEARCH_DELAY_MS = 300;
const SORT_LABELS: Record<LibrarySort, TextKey> = { popular: 'librarySortPopular', new: 'librarySortNew' };

/** /library: каталог відкритих вікторин; бачить і гість. Пошук, порядок і мова живуть в адресі. */
export function Library(): JSX.Element {
  const [params, setParams] = useSearchParams();
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

  const update = (changes: Record<string, string>) => {
    const copy = new URLSearchParams(params);
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

  // Перша сторінка — при кожній зміні пошуку, порядку чи мови.
  useEffect(() => {
    let current = true;
    setItems(null);
    setError(null);
    void libraryCatalog({ q, sort, lang, offset: 0 }).then((result) => {
      if (!current) return;
      if (result.ok) {
        setItems(result.data.items);
        setNext(result.data.next);
      } else {
        setItems([]);
        setNext(null);
        setError(errorText(result.error));
      }
    });
    return () => {
      current = false;
    };
  }, [q, sort, lang]);

  const more = async () => {
    if (next === null) return;
    setBusy(true);
    const result = await libraryCatalog({ q, sort, lang, offset: next });
    setBusy(false);
    if (!result.ok) return setError(errorText(result.error));
    setError(null);
    setItems((list) => [...(list ?? []), ...result.data.items]);
    setNext(result.data.next);
  };

  return (
    <main className="app wide">
      <h1>{t('libraryTitle')}</h1>
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

      {error !== null && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {items === null && <p className="meta">{t('loading')}</p>}
      {items !== null && items.length === 0 && error === null && <p className="lead">{t('libraryEmpty')}</p>}
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
