import type { RoundBrief, RoundInfo } from '@quiz/shared';
import { roundFacts } from '../format';
import { t } from '../i18n';
import { roundHow } from '../guide-text';
import { roundSummary } from '../round-summary';

/** Опис автора (якщо є) і пояснення правил раунду; для заставки й попереднього перегляду в редакторі. */
export function RoundBriefing({ brief, description, newcomers = false }: { brief: RoundBrief; description: string; newcomers?: boolean }) {
  return (
    <div className="round-brief">
      {description.trim() !== '' && <p className="round-brief-note">{description}</p>}
      {newcomers && (
        <div className="round-brief-how">
          <h2>{t('roundHowTitle')}</h2>
          <p>{roundHow(brief)[0]}</p>
        </div>
      )}
      <ul className="round-brief-lines" aria-label={t('roundBriefTitle')}>
        {roundSummary(brief).map((line, index) => (
          <li key={`${index}-${line}`}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

/** Скільки запитань у раунді й скільки часу на кожне; у фіналі нічого. */
export function RoundFacts({ round, total }: { round: RoundInfo; total: number }) {
  const facts = roundFacts(round, total);
  return facts === null ? null : <p className="round-facts">{facts}</p>;
}
