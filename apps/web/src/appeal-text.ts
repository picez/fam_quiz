import type { AppealReason, AppealView } from '@quiz/shared';
import { answerText, correctText, signed } from './format';
import { t } from './i18n';

/** «⚖️ Оля оскаржує»; командна гра — «⚖️ Команда «Червоні» оскаржує». */
export function appealTitle(view: AppealView, teams: boolean): string {
  return t(teams ? 'appealTitleTeam' : 'appealTitle', { name: view.by.nickname });
}

/** grade — «Відповідь «Одеська», правильна — «Одеса». Зарахувати?»; away — «Штраф за вихід із гри. Зняти штраф?». */
export function appealAsk(view: AppealView): string {
  if (view.reason === 'away') return t('appealAskAway');
  return t('appealAsk', { answer: answerText(view.answer, view.question), correct: correctText(view.question) });
}

/** «так 3 · ні 1 · ще думають 2»; без тих, хто думає, — «так 3 · ні 1». */
export function appealCountText(view: Pick<AppealView, 'yes' | 'no' | 'waiting'>): string {
  return view.waiting > 0 ? t('appealCountWaiting', { yes: view.yes, no: view.no, waiting: view.waiting }) : t('appealCount', { yes: view.yes, no: view.no });
}

/** «⚖️ Зараховано! +200» (без балів — «⚖️ Зараховано!»), «⚖️ Штраф знято», «⚖️ Лишається як було · так 1 · ні 1», «⚖️ Ведучий зарахував»; відкрита чи cancelled — null. */
export function appealResultText(view: AppealView): string | null {
  switch (view.outcome) {
    case 'yes':
      if (view.reason === 'away') return t('appealResultAway');
      return view.points > 0 ? t('appealResultYes', { points: signed(view.points) }) : t('appealResultYesBare');
    case 'no':
    case 'tie':
      return t('appealResultKept', { count: appealCountText({ yes: view.yes, no: view.no, waiting: 0 }) });
    case 'host':
      return t('appealResultHost');
    default:
      return null;
  }
}

/** «⚖️ Оскаржити (лишилось 2)» / «⚖️ Оскаржити штраф (лишилось 1)». */
export function appealButtonText(reason: AppealReason, left: number): string {
  return t(reason === 'away' ? 'appealButtonAway' : 'appealButton', { left });
}
