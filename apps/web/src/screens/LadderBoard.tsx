import type { CSSProperties } from 'react';
import type { LadderInfo, LadderStep } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

type Size = 'stage' | 'host' | 'phone';

/** Телефон: поточна сходинка і по одній з боків (або перші три до початку, останні три на верху). */
function phoneWindow(info: LadderInfo): { step: LadderStep; index: number }[] {
  const all = info.steps.map((step, index) => ({ step, index }));
  const span = 3;
  if (all.length <= span) return all;
  const center = Math.min(Math.max(info.current, 0), all.length - 1);
  const start = Math.min(Math.max(center - 1, 0), all.length - span);
  return all.slice(start, start + span);
}

/** Назва сходинки для читача з екрана: сума й усе, що на ній особливе, — сума не ховається. */
function stepLabel(step: LadderStep): string {
  const marks = [step.safe ? t('ladderSafe') : null, step.state === 'current' ? t('ladderCurrent') : null, step.state === 'failed' ? t('ladderFailed') : null];
  return [num(step.level), ...marks.filter((mark): mark is string => mark !== null)].join(', ');
}

/**
 * Драбина «Мільйонера»: сходинки згори вниз (верх — найбільша сума), неспалимі виділені, поточна підсвічена,
 * пройдені приглушені, сходинка помилки позначена. На телефоні — компактна смуга.
 */
export function LadderBoard({ info, size }: { info: LadderInfo; size: Size }) {
  const rows = (size === 'phone' ? phoneWindow(info) : info.steps.map((step, index) => ({ step, index }))).reverse();
  return (
    <section className={`ladder-board is-${size}`} aria-label={t('ladderTitle')} style={{ '--ladder-steps': rows.length } as CSSProperties}>
      <ol className="ladder-steps">
        {rows.map(({ step, index }) => (
          <li
            key={index}
            className={`ladder-step is-${step.state}${step.safe ? ' is-safe' : ''}`}
            aria-label={stepLabel(step)}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="ladder-number" aria-hidden="true">
              {index + 1}
            </span>
            <span className="ladder-level" aria-hidden="true">
              {num(step.level)}
            </span>
            {step.state === 'failed' && (
              <span className="ladder-mark" aria-hidden="true">
                ✗
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
