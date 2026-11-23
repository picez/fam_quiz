import { boardCells, type Quiz, type Round } from '@quiz/shared';
import { t } from '../i18n';
import { booleanCounts, type IssuePlace } from './draft';
import { REMINDER_MIN_TIME, timeFieldShown, type LayoutFlags } from './question-layout';

/** М'яке нагадування (74): показується в панелі зауважень і ніколи не заважає зберегти. */
export interface Reminder {
  text: string;
  place: IssuePlace;
}

/** Прапорці видимості, з якими QuizEditor показує запитання раунду (ті самі вирази, що в його JSX). */
export function roundLayout(round: Round): LayoutFlags {
  return {
    showPoints: !['final', 'bets', 'ladder', 'think'].includes(round.type),
    showHint: true,
    showTime: round.type !== 'ladder' || round.timer,
    showVideo: true,
    showAudio: true,
    showReveal: round.type === 'classic',
  };
}

/** Типові прапорці QuestionEditor (клітинки дошки, питання на виживання). */
const DEFAULT_LAYOUT: LayoutFlags = { showPoints: true, showHint: true, showTime: true, showVideo: true, showAudio: true, showReveal: false };

/** Нагадування: порядок — опис, далі раунди; у раунді спершу таймери, потім «так чи ні». */
export function remindersOf(quiz: Quiz): Reminder[] {
  const reminders: Reminder[] = [];
  if (quiz.description.trim() === '') reminders.push({ text: t('reminderNoDescription'), place: { kind: 'general', card: 'about' } });
  const several = quiz.rounds.length > 1;
  quiz.rounds.forEach((round, roundIndex) => {
    const where = (text: string) => (several ? `${t('problemRound', { round: roundIndex + 1 })} ${text}` : text);
    const timer = (seconds: number, index: number) => t('reminderTimer', { index, seconds, min: REMINDER_MIN_TIME });
    if (round.type === 'board') {
      round.categories.forEach((category, categoryIndex) => {
        category.cells.forEach((cell, index) => {
          if (!timeFieldShown(cell.question, DEFAULT_LAYOUT) || cell.question.timeLimit >= REMINDER_MIN_TIME) return;
          const text = timer(cell.question.timeLimit, index + 1);
          reminders.push({
            text: where(t('problemCell', { category: categoryIndex + 1, problem: text.charAt(0).toLowerCase() + text.slice(1) })),
            place: { kind: 'cell', round: roundIndex, category: categoryIndex, index, card: 'time' },
          });
        });
      });
    } else if (round.type !== 'truth') {
      const layout = roundLayout(round);
      round.questions.forEach((question, index) => {
        if (!timeFieldShown(question, layout) || question.timeLimit >= REMINDER_MIN_TIME) return;
        reminders.push({ text: where(timer(question.timeLimit, index + 1)), place: { kind: 'question', round: roundIndex, question: index, card: 'time' } });
      });
      if (round.type === 'survival') {
        round.trials.forEach((trial, index) => {
          if (!timeFieldShown(trial, DEFAULT_LAYOUT) || trial.timeLimit >= REMINDER_MIN_TIME) return;
          reminders.push({ text: where(timer(trial.timeLimit, index + 1)), place: { kind: 'round', round: roundIndex, settings: true } });
        });
      }
    }
    if (round.type === 'truth') return;
    const { yes, no } = booleanCounts(round.type === 'board' ? boardCells(round).map(({ cell }) => cell.question) : round.questions);
    if (yes + no >= 4 && (yes === 0 || no === 0)) {
      reminders.push({
        text: where(t(yes === 0 ? 'reminderBooleansNo' : 'reminderBooleansYes', { count: yes + no })),
        place: { kind: 'round', round: roundIndex, settings: false },
      });
    }
  });
  return reminders;
}
