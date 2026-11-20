import { useEffect, useState, type JSX } from 'react';
import type { AdminBotPerson } from '@quiz/shared';
import { errorText, t } from '../i18n';
import { nickText } from '../nick';
import { searchBotPeople } from './admin-api';

const SEARCH_MIN = 2;
const SEARCH_DELAY_MS = 300;

export type PickedPerson = Pick<AdminBotPerson, 'id' | 'nickname'>;

/** Пошук людей за ніком: від двох символів, із затримкою; помилка — текстом. */
function usePeopleSearch(query: string): { found: AdminBotPerson[]; error: string | null } {
  const [state, setState] = useState<{ found: AdminBotPerson[]; error: string | null }>({ found: [], error: null });
  useEffect(() => {
    const q = query.trim();
    if (q.length < SEARCH_MIN) {
      setState({ found: [], error: null });
      return;
    }
    let current = true;
    const timer = setTimeout(() => {
      void searchBotPeople(q).then((result) => {
        if (current) setState(result.ok ? { found: result.data, error: null } : { found: [], error: errorText(result.error) });
      });
    }, SEARCH_DELAY_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query]);
  return state;
}

/**
 * Вибір людей за ніком (56, винесено в 59): вибрані — списком з «×», пошук — кнопками; понад `max` додати не можна.
 * `id` — префікс id поля пошуку (на сторінці можуть бути два вибори).
 */
export function PeoplePicker({ id, value, onChange, max }: { id: string; value: PickedPerson[]; onChange: (next: PickedPerson[]) => void; max: number }): JSX.Element {
  const [query, setQuery] = useState('');
  const search = usePeopleSearch(query);
  const found = search.found.filter((person) => !value.some((chosen) => chosen.id === person.id));
  const full = value.length >= max;
  const searchId = `${id}-search`;
  return (
    <>
      {value.length > 0 && (
        <ul className="admin-bot-people">
          {value.map((person) => (
            <li key={person.id}>
              <span dir="auto">{nickText(person.nickname)}</span>
              <button type="button" className="btn btn-small" aria-label={t('adminBotPlanRemove', { name: nickText(person.nickname) })} onClick={() => onChange(value.filter((chosen) => chosen.id !== person.id))}>
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <label className="field compact" htmlFor={searchId}>
        <span>{t('adminBotPlanSearch')}</span>
        <input id={searchId} type="search" value={query} maxLength={40} autoComplete="off" onChange={(e) => setQuery(e.target.value)} />
      </label>
      {search.error !== null && <p className="error">{search.error}</p>}
      {found.length > 0 && (
        <ul className="admin-bot-found">
          {found.map((person) => (
            <li key={person.id}>
              <button type="button" className="btn btn-small" dir="auto" disabled={full} onClick={() => onChange([...value, { id: person.id, nickname: person.nickname }])}>
                {nickText(person.nickname)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
