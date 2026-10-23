import type { BuffKind } from '@quiz/shared';
import { t, type TextKey } from './i18n';

export const BUFF_ICONS: Record<BuffKind, string> = {
  fifty: '½',
  double: '×2',
  retry: '↻',
  time: '⏱',
  shield: '🛡',
  audience: '👥',
  hint: '💡',
  swap: '🔄',
};

export function buffName(kind: BuffKind): string {
  return t(`buff_${kind}` as TextKey);
}
