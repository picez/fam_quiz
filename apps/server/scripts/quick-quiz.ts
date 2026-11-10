/**
 * Коротка пробна вікторина з усіма новими типами (27b–28d): узята з «Сім доріг», щоб власник
 * швидко пройшов кожен тип. Сід `quick`.
 */
import type { Question, Quiz, Round } from '@quiz/shared';
import { mixQuiz } from './mix-quiz';

const roundOf = (quiz: Quiz, id: string): Round => {
  const round = quiz.rounds.find((r) => r.id === id);
  if (round === undefined) throw new Error(`no round ${id}`);
  return round;
};

const questionsOf = (round: Round): Question[] => ('questions' in round ? (round.questions as Question[]) : []);

export const quickQuiz = (): Quiz => {
  const mix = mixQuiz();
  const classic = mix.rounds.filter((r) => r.type === 'classic').flatMap(questionsOf);
  const first = (type: Question['type']): Question => {
    const found = classic.find((q) => q.type === type);
    if (found === undefined) throw new Error(`no ${type} in classic rounds`);
    return found;
  };
  const tryout = ['moreless', 'timedlist', 'letterwords', 'wordladder', 'drawing'] as const;

  const bets = roundOf(mix, 'mx-bets');
  const auction = roundOf(mix, 'mx-auction');
  const puzzles = roundOf(mix, 'mx-puzzles');
  const shorten = <R extends Round>(round: R, ids: (qs: Question[]) => Question[]): R =>
    ({ ...round, questions: ids(questionsOf(round)) }) as R;

  return {
    title: 'Пробний забіг: усі нові типи',
    description: 'Коротка вікторина, щоб спробувати кожен новий тип запитань і раундів.',
    // «Заміна» потребує запасних запитань — у пробній вікторині їх немає.
    settings: { ...mix.settings, buffs: (mix.settings.buffs ?? []).filter((b) => b !== 'swap'), debuffShop: false },
    rounds: [
      {
        ...roundOf(mix, 'mx-warmup'),
        id: 'qk-new',
        title: 'Нові запитання',
        description: 'По одному запитанню кожного нового типу: «Більше чи менше», «Список на час», «Слова з літер», «Словесна драбина» й «Малюнок».',
        questions: tryout.map(first),
      } as Round,
      shorten(bets, (qs) => qs.slice(0, 2)),
      shorten(auction, (qs) => qs.slice(0, 2)),
      roundOf(mix, 'mx-truth'),
      shorten(puzzles, (qs) => [qs[0]!, qs[2]!]),
    ],
  };
};
