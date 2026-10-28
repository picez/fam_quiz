import type { AppealReason, AppealView, Choice, GameAppeal, PublicQuestion, Question } from '@quiz/shared';
import { answerText, correctText, signed } from './format';
import { countText, t } from './i18n';

/** «⚖️ Оля оскаржує»; командна гра — «⚖️ Команда «Червоні» оскаржує». */
export function appealTitle(view: AppealView, teams: boolean): string {
  return t(teams ? 'appealTitleTeam' : 'appealTitle', { name: view.by.nickname });
}

/**
 * Порядок варіантів, який бачив цей екран: choices його запитання, якщо це те саме запитання, що й в апеляції
 * (той самий тип, текст і набір варіантів; у PublicQuestion немає id). Інше запитання (запасне) — undefined.
 */
export function appealPresented(view: AppealView, shown: PublicQuestion | null | undefined): Choice[] | undefined {
  const question = view.question;
  if (shown === null || shown === undefined || (question.type !== 'single' && question.type !== 'multi')) return undefined;
  if (shown.type !== question.type || shown.text !== question.text) return undefined;
  const ids = new Set(question.options.map((option) => option.id));
  return shown.choices.length === ids.size && shown.choices.every((choice) => ids.has(choice.id)) ? shown.choices : undefined;
}

/** Правильна відповідь без літер (порядок показу невідомий): тексти правильних варіантів. */
function plainCorrect(question: Question): string {
  if (question.type !== 'single' && question.type !== 'multi') return correctText(question);
  const correct = question.type === 'single' ? [question.correctId] : question.correctIds;
  return question.options
    .filter((option) => correct.includes(option.id))
    .map((option) => answerText({ type: 'single', optionId: option.id }, question))
    .join(', ');
}

/**
 * grade — «Відповідь «Одеська», правильна — «Одеса». Зарахувати?»; away — «Штраф за вихід із гри. Зняти штраф?».
 * presented — порядок варіантів цього екрана (appealPresented): тоді літери з обох боків за ним; без нього — без літер з обох боків.
 */
export function appealAsk(view: AppealView, presented?: Choice[]): string {
  if (view.reason === 'away') return t('appealAskAway');
  const correct = presented === undefined ? plainCorrect(view.question) : correctText(view.question, presented);
  return t('appealAsk', { answer: answerText(view.answer, view.question, presented), correct });
}

/** «так 3 · ні 1 · ще думають 2» (один — «ще думає 1»); без тих, хто думає, — «так 3 · ні 1». */
export function appealCountText(view: Pick<AppealView, 'yes' | 'no' | 'waiting'>): string {
  if (view.waiting === 0) return t('appealCount', { yes: view.yes, no: view.no });
  return countText('appealCountWaiting', view.waiting, { yes: view.yes, no: view.no, count: view.waiting });
}

/** «⚖️ Зараховано! +200» (без балів — «⚖️ Зараховано!»), «⚖️ Штраф знято», «⚖️ Лишається як було · так 1 · ні 1», «⚖️ Зараховано ведучим», скасоване «так» — «⚖️ Рішення залу скасовано»; відкрита чи cancelled — null. */
export function appealResultText(view: AppealView): string | null {
  // Бали рішення «так» скасовано в «↶ Бали»: картка не каже «Зараховано!».
  if (view.outcome === 'yes' && view.undone) return t('appealResultUndone');
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

/** «⚖️ зараховано 2:0», «⚖️ лишилось як було 1:1», «⚖️ зараховано ведучим»; away — «⚖️ штраф знято 2:0» / «⚖️ штраф лишився 0:2». */
export function historyAppealText(appeal: GameAppeal): string {
  if (appeal.outcome === 'host') return t('historyAppealHost');
  const away = appeal.reason === 'away';
  const key = appeal.outcome === 'yes' ? (away ? 'historyAppealAwayYes' : 'historyAppealYes') : away ? 'historyAppealAwayKept' : 'historyAppealKept';
  return t(key, { yes: appeal.yes, no: appeal.no });
}
