import type { Choice } from '@quiz/shared';
import { ChoiceFace } from './ChoiceFace';
import { LETTERS } from '../format';
import { t } from '../i18n';

/** Стовпчики опитування: варіант, смуга шириною у відсоток, «{percent} % · {count}»; найпопулярніший підсвічений. */
export function PollBars({ choices, counts, total, big = false }: { choices: Choice[]; counts: Record<string, number>; total: number; big?: boolean }) {
  const top = Math.max(0, ...choices.map((choice) => counts[choice.id] ?? 0));
  return (
    <ul className={big ? 'poll-bars is-big' : 'poll-bars'}>
      {choices.map((choice, index) => {
        const count = counts[choice.id] ?? 0;
        const percent = total <= 0 ? 0 : Math.round((count / total) * 100);
        return (
          <li key={choice.id} className={top > 0 && count === top ? 'poll-bar is-top' : 'poll-bar'}>
            <span className="poll-label">
              <ChoiceFace choice={choice} letter={LETTERS[index]} />
            </span>
            <span className="poll-track" aria-hidden="true">
              <span className="poll-fill" style={{ width: `${percent}%` }} />
            </span>
            <span className="poll-value">{t('pollPercent', { percent, count })}</span>
          </li>
        );
      })}
    </ul>
  );
}
