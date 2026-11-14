import type { AchievementId } from '@quiz/shared';
import { textMatches } from '@quiz/engine';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { answerRow, ownRows } from './achievement-rows';
import type { AchievementWho } from './game-achievements';

/** Пороги досягнень за типи запитань (план 33). */
export const TYPE_LIMITS = {
  singleRight: 10,
  multiCorrect: 3,
  booleanAll: 6,
  textExact: 5,
  orderItems: 5,
  matchPairs: 5,
  morelessPairs: 5,
} as const;

/**
 * Досягнення за типи запитань завершеної гри (план 33, «Рішення»); незавершена — порожньо.
 * Прості типи — за відповіді: свої рядки (у командній грі людина з answeredBy) на основних запитаннях; запасні не рахуються.
 */
export function typeAchievements(game: AchievementGame, who: AchievementWho): Set<AchievementId> {
  const got = new Set<AchievementId>();
  if (game.status !== 'finished') return got;
  const L = TYPE_LIMITS;
  const questions = new Map(game.questions.map((q) => [q.index, q]));
  const answers = ownRows(game, who).filter(answerRow);
  const accepted = answers.filter((r) => r.accepted);
  /** Основне запитання рядка; запасне (spareId) знімок основного не знає. */
  const mainOf = (r: AchievementRow): AchievementQuestion | undefined => (r.spareId === null ? questions.get(r.questionIndex) : undefined);

  // «Палець на пульсі»: прийняті основні single поза бліцом (там кілька спроб) і не «Правда про гравця».
  const singles = new Set(
    accepted.flatMap((r) => {
      const q = mainOf(r);
      return q?.question.type === 'single' && !q.blitz && q.ref.truth === undefined ? [r.questionIndex] : [];
    }),
  );
  if (singles.size >= L.singleRight) got.add('single_ten');

  // «Усе й одразу»: множина вибраних дорівнює множині правильних, правильних щонайменше 3.
  if (
    accepted.some((r) => {
      const question = mainOf(r)?.question;
      if (question?.type !== 'multi' || r.payload?.type !== 'multi' || question.correctIds.length < L.multiCorrect) return false;
      const picked = new Set(r.payload.optionIds);
      return picked.size === question.correctIds.length && question.correctIds.every((id) => picked.has(id));
    })
  )
    got.add('all_at_once');

  // «Не монетка»: основні boolean поза бліцом зі своєю відповіддю — щонайменше 6, і всі прийняті.
  const booleans = new Map<number, boolean>();
  for (const r of answers) {
    const q = mainOf(r);
    if (q?.question.type !== 'boolean' || q.blitz) continue;
    booleans.set(r.questionIndex, (booleans.get(r.questionIndex) ?? false) || r.accepted);
  }
  if (booleans.size >= L.booleanAll && [...booleans.values()].every(Boolean)) got.add('not_a_coin');

  // «Слово в слово»: точний збіг з написанням автора (textMatches), без допуску описок textAccepts.
  const exact = new Set(
    accepted.flatMap((r) => {
      const question = mainOf(r)?.question;
      return question?.type === 'text' && r.payload?.type === 'text' && textMatches(question.accepted, r.payload.value) ? [r.questionIndex] : [];
    }),
  );
  if (exact.size >= L.textExact) got.add('word_for_word');

  // «Усе по поличках»: порядок поелементно як в автора, елементів щонайменше 5.
  if (
    answers.some((r) => {
      const question = mainOf(r)?.question;
      if (question?.type !== 'order' || r.payload?.type !== 'order' || question.items.length < L.orderItems) return false;
      const ids = r.payload.itemIds;
      return ids.length === question.items.length && question.items.every((item, i) => ids[i] === item.id);
    })
  )
    got.add('in_order');

  // «Пара до пари»: кожна пара автора з'єднана, пар щонайменше 5.
  if (
    answers.some((r) => {
      const question = mainOf(r)?.question;
      if (question?.type !== 'match' || r.payload?.type !== 'match' || question.pairs.length < L.matchPairs) return false;
      const links = r.payload.links;
      return (
        links.length === question.pairs.length &&
        new Set(links.map((link) => link.left)).size === links.length &&
        links.every((link) => question.pairs.some((pair) => pair.left.id === link.left && pair.right.id === link.right))
      );
    })
  )
    got.add('pair_to_pair');

  // «Найкоротший шлях»: дійти до цілі за стільки кроків, як в автора (path.length − 1), або менше.
  if (
    answers.some((r) => {
      const question = mainOf(r)?.question;
      return question?.type === 'wordladder' && r.payload?.type === 'wordladder' && r.payload.finished && r.payload.steps <= question.path.length - 1;
    })
  )
    got.add('short_path');

  // «Чуття на числа» й «Дзеркальна логіка»: усі порівняння правильно чи всі навпаки; пропущене порівняння — не «навпаки».
  for (const r of answers) {
    if (r.payload?.type !== 'moreless' || r.payload.total < L.morelessPairs) continue;
    if (r.payload.right === r.payload.total) got.add('number_sense');
    if (r.payload.right === 0 && r.payload.picks.length === r.payload.total) got.add('mirror_logic');
  }

  return got;
}
