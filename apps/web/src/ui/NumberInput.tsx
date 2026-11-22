import { forwardRef, type ChangeEvent, type InputHTMLAttributes, type KeyboardEvent } from 'react';
import { sanitizeNumber, type NumberRules } from './sanitize-number';

export interface NumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'min' | 'max' | 'step'> {
  /** Дозволити мінус на початку. */
  negative?: boolean;
  /** Дозволити один десятковий роздільник («,» чи «.» → «.»). */
  decimal?: boolean;
  /** Межі й крок для стрілок ↑/↓ (як у колишнього type="number"); перевірку значення поле не робить. */
  min?: number;
  max?: number;
  step?: number;
}

const setNativeValue = (input: HTMLInputElement, value: string) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
};

/**
 * Текстове поле для числа: набране, вставлене, перетягнуте й набране через IME проходить через
 * sanitizeNumber ще до onChange, тож event.target.value у власника вже чисте. type="text", бо
 * type="number" пропускає «e», «+», «.», а Firefox — будь-що. Клавіатура телефону: numeric
 * (decimal для дробів); зі знаком — звичайна, бо цифрова клавіатура iOS не має мінуса.
 */
export const NumberInput = forwardRef<HTMLInputElement, NumberInputProps>(function NumberInput(
  { negative = false, decimal = false, min, max, step, maxLength, inputMode, onChange, onKeyDown, ...rest },
  ref,
) {
  const rules: NumberRules = { negative, decimal, maxLength };

  const change = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const raw = input.value;
    const clean = sanitizeNumber(raw, rules);
    if (clean !== raw) {
      const caret = input.selectionStart ?? raw.length;
      const at = Math.min(sanitizeNumber(raw.slice(0, caret), rules).length, clean.length);
      input.value = clean;
      try {
        input.setSelectionRange(at, at);
      } catch {
        // Поле без виділення (не в фокусі в деяких браузерах): каретка лишається в кінці.
      }
    }
    onChange?.(event);
  };

  const key = (event: KeyboardEvent<HTMLInputElement>) => {
    onKeyDown?.(event);
    if (event.defaultPrevented || decimal || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    if (min === undefined && max === undefined && step === undefined) return;
    event.preventDefault();
    const input = event.currentTarget;
    const current = Number(input.value);
    const by = (step ?? 1) * (event.key === 'ArrowUp' ? 1 : -1);
    let next = input.value.trim() === '' || !Number.isFinite(current) ? (min ?? 0) : current + by;
    if (min !== undefined) next = Math.max(min, next);
    if (max !== undefined) next = Math.min(max, next);
    if (String(next) === input.value) return;
    setNativeValue(input, String(next));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return (
    <input
      {...rest}
      ref={ref}
      type="text"
      inputMode={inputMode ?? (negative ? undefined : decimal ? 'decimal' : 'numeric')}
      // Браузер не перевіряє min/max у type="text"; атрибути лишаються як опис меж для тестів і читачів коду.
      min={min}
      max={max}
      step={step}
      maxLength={maxLength}
      onChange={change}
      onKeyDown={key}
    />
  );
});
