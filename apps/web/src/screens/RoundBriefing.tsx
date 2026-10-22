import type { RoundBrief } from '@quiz/shared';
import { t } from '../i18n';
import { roundSummary } from '../round-summary';

/** Опис автора (якщо є) і пояснення правил раунду; для заставки й попереднього перегляду в редакторі. */
export function RoundBriefing({ brief, description }: { brief: RoundBrief; description: string }) {
  return (
    <div className="round-brief">
      {description.trim() !== '' && <p className="round-brief-note">{description}</p>}
      <ul className="round-brief-lines" aria-label={t('roundBriefTitle')}>
        {roundSummary(brief).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
