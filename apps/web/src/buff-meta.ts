import type { BuffKind } from '@quiz/shared';
import { t, type TextKey } from './i18n';

/** Значки — одноколірні текстові гліфи (не кольорові емодзі): на темному тлі всі вісім однаково контрастні. */
export const BUFF_ICONS: Record<BuffKind, string> = {
  fifty: '½',
  double: '×2',
  retry: '↻',
  time: '⏱',
  shield: '🛡',
  audience: '%',
  hint: '?',
  swap: '⇄',
};

/** autopilot: у грі без ведучого підказка — з вікторини, тож «від ведучого» не пишемо. */
export function buffName(kind: BuffKind, autopilot = false): string {
  if (autopilot && kind === 'hint') return t('buff_hintAuto');
  return t(`buff_${kind}` as TextKey);
}
