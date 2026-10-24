import { useEffect, useRef, useState } from 'react';
import type { BluffInfo, BluffOptionView } from '@quiz/shared';
import { t } from '../i18n';

const FLIP_MS = 700;

function metaOf(option: BluffOptionView) {
  if (option.kind === null) return null;
  const label =
    option.kind === 'truth'
      ? t('bluffTruth')
      : option.kind === 'spare'
        ? t('bluffSpare')
        : t('bluffLieBy', { names: (option.authors ?? []).join(', ') });
  const by = option.pickedBy ?? [];
  return (
    <>
      <span className="bluff-meta">{label}</span>
      <span className="bluff-meta">{by.length > 0 ? t('bluffPickedBy', { names: by.join(', ') }) : t('bluffNobody')}</span>
    </>
  );
}

/**
 * Варіанти блефу: текст; у відкритих — «Правда» / «Вигадка {authors}» / «Запасна вигадка ведучого» і «Купилися: {names}» або «Ніхто не купився».
 * Щойно відкритий перегортається (.is-flipping, без анімації за prefers-reduced-motion). big — сцена; host — пульт бачить усе й «прибрано».
 */
export function BluffBoard({ info, big = false, host = false }: { info: BluffInfo; big?: boolean; host?: boolean }) {
  // Перегортається лише варіант, що відкрився на очах: перший показ усе відкрите не анімує.
  const seen = useRef<Set<string> | null>(null);
  const [flipping, setFlipping] = useState<string[]>([]);
  useEffect(() => {
    const open = new Set(info.options.filter((option) => option.open).map((option) => option.id));
    const before = seen.current;
    seen.current = open;
    if (before === null) return;
    const fresh = [...open].filter((id) => !before.has(id));
    if (fresh.length === 0) return;
    setFlipping(fresh);
    const timer = setTimeout(() => setFlipping([]), FLIP_MS);
    return () => clearTimeout(timer);
  }, [info]);

  const options = host ? info.options : info.options.filter((option) => !option.removed);
  const latest = info.options.find((option) => option.id === info.lastOpenedId && option.open) ?? null;
  const dense = big && options.length >= 7;
  const classes = ['bluff-board', big ? 'is-big' : '', dense ? 'is-dense' : ''].filter((c) => c !== '');
  return (
    <>
      {big && (
        <p className="sr-only" aria-live="polite">
          {latest === null ? '' : `${latest.text}. ${latest.kind === 'truth' ? t('bluffTruth') : latest.kind === 'spare' ? t('bluffSpare') : t('bluffLieBy', { names: (latest.authors ?? []).join(', ') })}`}
        </p>
      )}
      <ol className={classes.join(' ')}>
        {options.map((option) => {
          const open = option.open || (host && option.kind !== null);
          const rowClasses = [
            'bluff-row',
            option.kind === 'truth' && open ? 'is-truth' : '',
            !open && info.stage === 'reveal' ? 'is-closed' : '',
            host && option.removed ? 'is-removed' : '',
            flipping.includes(option.id) ? 'is-flipping' : '',
          ].filter((c) => c !== '');
          return (
            <li key={option.id} className={rowClasses.join(' ')}>
              <span>{option.text}</span>
              {host && option.removed ? <span className="bluff-meta">{t('bluffRemoved')}</span> : open && metaOf(option)}
            </li>
          );
        })}
      </ol>
    </>
  );
}
