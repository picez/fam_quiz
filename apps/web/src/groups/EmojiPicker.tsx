import { useRef, type KeyboardEvent } from 'react';
import { GROUP_EMOJI, type GroupEmoji } from '@quiz/shared';
import { t } from '../i18n';

/** Значок групи (12k): 24 радіокнопки-чипи сіткою; стрілки ходять значками, у фокусі лише вибраний (roving tabindex). */
export function EmojiPicker({ value, onChange }: { value: GroupEmoji; onChange: (emoji: GroupEmoji) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
    const steps: Record<string, number> = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 };
    const step = steps[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = GROUP_EMOJI.indexOf(value);
    const next = GROUP_EMOJI[(index + step + GROUP_EMOJI.length) % GROUP_EMOJI.length]!;
    onChange(next);
    box.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[GROUP_EMOJI.indexOf(next)]?.focus();
  };
  return (
    <div ref={box} className="group-emoji-picker" role="radiogroup" aria-label={t('groupEmojiLabel')} onKeyDown={onKey}>
      {GROUP_EMOJI.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="radio"
          aria-checked={emoji === value}
          tabIndex={emoji === value ? 0 : -1}
          className={emoji === value ? 'chip is-on' : 'chip'}
          onClick={() => onChange(emoji)}
        >
          {emoji}
        </button>
      ))}
    </div>
  );
}
