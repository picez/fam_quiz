import { useEffect, useState } from 'react';
import type { PrizeItem, PrizePlacesInfo } from '@quiz/shared';
import { gamePrizes, placePrizes } from '../api';
import { errorText, t } from '../i18n';

type Chosen = [string, string, string];
const PLACES = [0, 1, 2] as const;

const chosenOf = (info: PrizePlacesInfo): Chosen => [info.places[0] ?? '', info.places[1] ?? '', info.places[2] ?? ''];

/** Панель «Призи гри» в лобі пульта й автора: кому з призів склад дістанеться на 1-му, 2-му, 3-му місці. */
export function PrizePlaces({ code }: { code: string }) {
  const [info, setInfo] = useState<PrizePlacesInfo | null>(null);
  const [chosen, setChosen] = useState<Chosen>(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [quiet, setQuiet] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    void gamePrizes(code).then((result) => {
      if (!alive) return;
      if (result.ok) {
        setInfo(result.data);
        setChosen(chosenOf(result.data));
        setError(null);
        setQuiet(null);
      } else if (result.error === 'unauthorized' || result.error === 'not_found') setQuiet(result.error);
      else setError(errorText(result.error));
    });
    return () => {
      alive = false;
    };
  }, [code, attempt]);

  if (info === null) {
    if (quiet === 'unauthorized') return <p className="meta">{t('prizesSignIn')}</p>;
    if (quiet !== null || error === null) return null;
    return (
      <div className="prize-places-error">
        <p className="error" role="alert">{error}</p>
        <button type="button" className="btn btn-small" onClick={() => setAttempt((n) => n + 1)}>
          {t('prizesRetry')}
        </button>
      </div>
    );
  }

  const empty = info.options.length === 0 && info.places.every((id) => id === null);
  if (empty)
    return (
      <section className="panel prize-places">
        <h2>{t('prizePlaces')}</h2>
        <p className="meta">
          {t('prizesNoneYet')}{' '}
          <a href="/prizes" target="_blank" rel="noreferrer">
            {t('prizesTitle')}
          </a>
        </p>
      </section>
    );

  const nameOf = (item: PrizeItem) => item.content.name;
  const put = async () => {
    setBusy(true);
    setError(null);
    setSaved(false);
    const result = await placePrizes(code, chosen.map((id) => (id === '' ? null : id)));
    setBusy(false);
    if (result.ok) {
      setInfo(result.data);
      setChosen(chosenOf(result.data));
      setSaved(true);
    } else setError(errorText(result.error));
  };

  return (
    <section className="panel prize-places">
      <h2>{t('prizePlaces')}</h2>
      {PLACES.map((index) => (
        <label key={index} className="prize-place">
          <span className="meta">{t('prizePlace', { place: index + 1 })}</span>
          <select
            value={chosen[index]}
            onChange={(event) => {
              const next = [...chosen] as Chosen;
              next[index] = event.target.value;
              setChosen(next);
              setSaved(false);
            }}
          >
            <option value="">{t('prizeNone')}</option>
            {info.options.map((item) => (
              <option key={item.id} value={item.id} disabled={chosen.some((id, other) => id === item.id && other !== index)}>
                {nameOf(item)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button type="button" className="btn" disabled={busy} onClick={() => void put()}>
        {t('prizePut')}
      </button>
      {saved && <p className="meta" role="status">{t('prizePlaced')}</p>}
      {error !== null && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
