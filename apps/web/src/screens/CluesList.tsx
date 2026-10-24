import { useEffect, useState } from 'react';
import type { PublicClues } from '@quiz/shared';
import { t } from '../i18n';

interface Props {
  clues: PublicClues;
  /** Зсув годинника сервера: відлік до наступної підказки — за часом сервера. */
  offsetMs: number;
  /** Після розкриття: усі підказки без заглушок. */
  all?: string[];
  /** Сцена: великий шрифт. */
  big?: boolean;
}

/** Підказки «Хто я?»: відкриті з номерами (остання підсвічена), далі заглушки «Підказка N — за M с» або «— відкриє ведучий». all — після розкриття: усі. */
export function CluesList({ clues, offsetMs, all, big = false }: Props) {
  const [, setTick] = useState(0);
  // Годинник тикає лише поки є мить наступної підказки.
  const ticking = all === undefined && clues.nextAt !== null;
  useEffect(() => {
    if (!ticking) return;
    const id = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(id);
  }, [ticking, clues.nextAt]);

  const items = all ?? clues.shown;
  const hidden = all === undefined ? Math.max(0, clues.total - items.length) : 0;
  const now = Date.now() + offsetMs;
  const placeholder = (index: number) => {
    const n = items.length + index + 1;
    if (clues.byHost) return t('clueByHost', { n });
    if (clues.nextAt === null) return t('clueN', { n });
    const at = clues.nextAt + index * clues.intervalSeconds * 1000;
    return t('clueSoon', { n, seconds: Math.max(0, Math.ceil((at - now) / 1000)) });
  };

  return (
    <ol className={big ? 'clues-list is-big' : 'clues-list'} aria-label={t('cluesTitle')}>
      {items.map((text, index) => (
        <li key={index} className={all === undefined && index === items.length - 1 ? 'clue is-new' : 'clue'}>
          <span className="clue-n" aria-hidden="true">
            {index + 1}
          </span>
          <span className="clue-text">{text}</span>
        </li>
      ))}
      {Array.from({ length: hidden }, (_, index) => (
        <li key={items.length + index} className="clue is-hidden">
          {placeholder(index)}
        </li>
      ))}
    </ol>
  );
}
