import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { LadderInfo, LadderStep } from '@quiz/shared';
import { num } from '../format';
import { t } from '../i18n';

type Size = 'stage' | 'host' | 'phone';

/** Назва сходинки для читача з екрана: сума й усе, що на ній особливе, — сума не ховається. */
function stepLabel(step: LadderStep): string {
  const marks = [step.safe ? t('ladderSafe') : null, step.state === 'current' ? t('ladderCurrent') : null, step.state === 'failed' ? t('ladderFailed') : null];
  return [num(step.level), ...marks.filter((mark): mark is string => mark !== null)].join(', ');
}

/**
 * Драбина «Мільйонера»: сходинки згори вниз (верх — найбільша сума), неспалимі виділені, поточна підсвічена,
 * пройдені приглушені, сходинка помилки позначена. На телефоні — уся драбина компактними рядками; довга гортається,
 * і поточна сходинка (чи помилка) стоїть у полі зору.
 */
export function LadderBoard({ info, size }: { info: LadderInfo; size: Size }) {
  const rows = info.steps.map((step, index) => ({ step, index })).reverse();
  const list = useRef<HTMLOListElement | null>(null);
  const focus = info.steps.findIndex((step) => step.state === 'current' || step.state === 'failed');
  // Телефон: список гортається сам, лише в межах смуги — сторінка не стрибає.
  useLayoutEffect(() => {
    const el = list.current;
    if (size !== 'phone' || el === null || focus < 0) return;
    const item = el.querySelector<HTMLElement>('[data-focus]');
    if (item === null) return;
    // Поточна — посередині смуги: видно й сходинки над нею, і пройдені під нею.
    const top = item.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop;
    el.scrollTop = Math.max(0, top - (el.clientHeight - item.offsetHeight) / 2);
  }, [size, focus]);
  return (
    <section className={`ladder-board is-${size}`} aria-label={t('ladderTitle')} style={{ '--ladder-steps': rows.length } as CSSProperties}>
      <ol className="ladder-steps" ref={list}>
        {rows.map(({ step, index }) => (
          <li
            key={index}
            className={`ladder-step is-${step.state}${step.safe ? ' is-safe' : ''}`}
            aria-label={stepLabel(step)}
            aria-current={step.state === 'current' ? 'step' : undefined}
            data-focus={index === focus || undefined}
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
