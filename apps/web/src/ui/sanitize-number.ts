/** Що дозволено в числовому полі. */
export interface NumberRules {
  /** Мінус на початку (бали ведучого, правильне число). */
  negative?: boolean;
  /** Один десятковий роздільник: «,» і «.» стають «.», як чекають розбори полів. */
  decimal?: boolean;
  /** Найбільша довжина результату. */
  maxLength?: number;
}

/** Цифри інших письм (арабсько-індійські, перські, повноширинні) → латинські. */
const DIGIT_BASES = [0x0660, 0x06f0, 0xff10, 0x0966];
/** Мінуси: дефіс, «−», тире, повноширинний і малий дефіси. */
const MINUS = new Set(['-', '−', '–', '‒', '－', '﹣']);
/** Десяткові роздільники: кома, крапка, арабський «٫», повноширинні. */
const DECIMAL = new Set([',', '.', '٫', '，', '．']);

function latinDigit(char: string): string | null {
  if (char >= '0' && char <= '9') return char;
  const code = char.codePointAt(0) ?? 0;
  for (const base of DIGIT_BASES) if (code >= base && code <= base + 9) return String(code - base);
  return null;
}

/**
 * Лишає в набраному чи вставленому лише число: цифри (зокрема «٠–٩» → «0–9»), мінус на початку
 * (лише з negative) і один десятковий роздільник (лише з decimal, завжди «.»). Букви, «e», «+»,
 * пробіли, емодзі й інші знаки відкидаються; зайві мінуси й роздільники теж.
 */
export function sanitizeNumber(raw: string, rules: NumberRules = {}): string {
  let out = '';
  let dot = false;
  for (const char of raw) {
    const digit = latinDigit(char);
    if (digit !== null) out += digit;
    else if (rules.negative === true && out === '' && MINUS.has(char)) out = '-';
    else if (rules.decimal === true && !dot && DECIMAL.has(char)) {
      out += '.';
      dot = true;
    }
  }
  return rules.maxLength !== undefined && rules.maxLength >= 0 ? out.slice(0, rules.maxLength) : out;
}
