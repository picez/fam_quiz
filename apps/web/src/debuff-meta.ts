import type { DebuffKind } from '@quiz/shared';
import { t, type TextKey } from './i18n';

export const DEBUFF_ICONS: Record<DebuffKind, string> = { shake: '📳', fog: '🌫️', freeze: '🧊', mirror: '🪞', guests: '🐾', mud: '🟫' };

export function debuffName(kind: DebuffKind): string {
  return t(`debuff_${kind}` as TextKey);
}
