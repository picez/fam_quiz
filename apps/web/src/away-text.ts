import { awaySeconds, type AwayMark } from '@quiz/shared';
import { countText, t } from './i18n';

/** «🙈 відволікався 12 с (2 рази)», «🙈 зараз поза грою», «🙈 зараз поза грою · 12 с (2 рази)»; withName — «🙈 Оля: відволікався 4 с (1 раз)». */
export function awayMarkText(mark: AwayMark, withName: boolean): string {
  const vars = { name: mark.nickname, seconds: awaySeconds(mark.ms), times: countText('awayTimes', mark.count, { count: mark.count }) };
  if (!mark.out) return t(withName ? 'awayMarkNamed' : 'awayMark', vars);
  if (mark.ms === 0) return t(withName ? 'awayOutNamed' : 'awayOut', vars);
  return t(withName ? 'awayOutMoreNamed' : 'awayOutMore', vars);
}

/** Позначки рядка пульта: ім'я — лише в рядку команди; рядок однієї людини (опитування в командній грі) — без імені. */
export function awayRowTexts(rowId: string, marks: readonly AwayMark[], teams: boolean): string[] {
  const named = teams && !(marks.length === 1 && marks[0]?.personId === rowId);
  return marks.map((mark) => awayMarkText(mark, named));
}

/** Рядок сцени: «🙈 Оля, Петро»; порожньо — ''. */
export function stageAwayText(names: string[]): string {
  return names.length === 0 ? '' : t('awayStage', { names: names.join(', ') });
}
