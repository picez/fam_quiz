import { melodyHeardOf, type AchievementId } from '@quiz/shared';
import { textMatches } from '@quiz/engine';
import type { AchievementGame, AchievementQuestion, AchievementRow } from './achievement-games';
import { answerRow, ownRows, participantRows } from './achievement-rows';
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
  drawingGuessers: 2,
  sketchGuessers: 3,
  sudokuPlayers: 2,
  memoryMovesPerPair: 1.5,
  jigsawMinPieces: 4,
  halfTime: 0.5,
} as const;

/**
 * Досягнення за типи запитань завершеної гри (план 33, «Рішення»); незавершена — порожньо.
 * Прості типи — за відповіді: свої рядки (у командній грі людина з answeredBy) на основних запитаннях; запасні не рахуються.
 * Командні типи (TEAM_WIDE_TYPES) — за результат: рядки учасника таблиці, тобто вся команда; малюнок — художнику.
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

  // Командні й «головоломкові» типи (TEAM_WIDE_TYPES) — за результат учасника таблиці: уся команда.
  const mine = participantRows(game, who).filter(answerRow);
  /** Межа «половини часу»: базовий ліміт запитання (без «+15 с» ведучого й сімейної надбавки), мс. */
  const halfOf = (r: AchievementRow): number | null => {
    const question = mainOf(r)?.question;
    return question === undefined ? null : question.timeLimit * 1000 * L.halfTime;
  };

  // «Список закрито»: знайдено всі пункти.
  if (mine.some((r) => r.payload?.type === 'timedlist' && r.payload.total > 0 && r.payload.found.length === r.payload.total)) got.add('full_list');

  // «Найдовше слово»: слово довжини найдовшого можливого (ref.letterwords.best); стара гра без best — ні.
  if (
    mine.some((r) => {
      const best = questions.get(r.questionIndex)?.ref.letterwords?.best ?? [];
      return r.payload?.type === 'letterwords' && best.length > 0 && r.payload.longest >= Math.max(...best.map((w) => Array.from(w).length));
    })
  )
    got.add('longest_word');

  // «Шедевр» і «Сучасне мистецтво» — художнику: соло — гравцю з рядком drew; командна гра — людині, чий нік дорівнює ref.drawing.drawer.
  const player = game.players.find((p) => p.participantId === who.participantId);
  for (const r of mine) {
    if (r.payload?.type !== 'drawing' || r.payload.drew === null || r.payload.drew.could < L.drawingGuessers) continue;
    if (who.personId !== null) {
      const drawer = questions.get(r.questionIndex)?.ref.drawing?.drawer ?? '';
      const person = drawer === '' ? undefined : player?.members.find((m) => m.nickname === drawer);
      if (person?.participantId !== who.personId) continue;
    }
    if (r.payload.drew.guessed === r.payload.drew.could) got.add('masterpiece');
    if (r.payload.drew.guessed === 0) got.add('modern_art');
  }

  // «Вгадано з півштриха»: перша прийнята відгадка (найменший timeMs; нічия — усім), коли вгадували щонайменше троє.
  for (const q of game.questions) {
    if (q.question.type !== 'drawing') continue;
    const guesses = game.rows.filter((r) => r.questionIndex === q.index && answerRow(r) && r.payload?.type === 'drawing' && r.payload.guess !== null);
    if (new Set(guesses.map((r) => r.participantId)).size < L.sketchGuessers) continue;
    const right = guesses.filter((r) => r.accepted);
    if (right.length === 0) continue;
    const first = Math.min(...right.map((r) => r.timeMs));
    if (right.some((r) => r.participantId === who.participantId && r.timeMs === first)) {
      got.add('quick_sketch');
      break;
    }
  }

  // «Судоку на швидкість»: розв'язати раніше за всіх, коли запис мають щонайменше двоє.
  // timeMs запису «Головоломок» пише рушій (puzzleFinish): мить «Готово» від відкриття запитання; сітку без «Готово» фіксує кінець часу — тоді timeMs = ліміт.
  for (const q of game.questions) {
    if (q.question.type !== 'sudoku') continue;
    const records = game.rows.filter((r) => r.questionIndex === q.index && answerRow(r) && r.payload?.type === 'puzzle');
    if (new Set(records.map((r) => r.participantId)).size < L.sudokuPlayers) continue;
    const solved = records.filter((r) => r.payload?.type === 'puzzle' && r.payload.solved);
    if (solved.length === 0) continue;
    const first = Math.min(...solved.map((r) => r.timeMs));
    if (solved.some((r) => r.participantId === who.participantId && r.timeMs <= first)) {
      got.add('sudoku_first');
      break;
    }
  }

  if (mine.some((r) => r.payload?.type === 'puzzle' && r.payload.kind === 'crossword' && r.payload.solved)) got.add('crossword_full');

  for (const r of mine) {
    const half = halfOf(r);
    // «Пазл зійшовся» і «Жодна не сховалася»: усе швидше, ніж за половину базового часу.
    if (r.payload?.type === 'jigsaw' && r.payload.done && r.payload.timeMs !== null && half !== null && r.payload.timeMs <= half) got.add('jigsaw_first');
    if (r.payload?.type === 'spotdiff' && r.payload.done && r.payload.timeMs !== null && half !== null && r.payload.timeMs <= half) got.add('spotdiff_all');
    // «Останній шматочок»: час скінчився, а бракувало одного шматочка (пазл щонайменше на 4).
    if (r.payload?.type === 'jigsaw' && !r.payload.done && r.payload.total >= L.jigsawMinPieces && r.payload.placed === r.payload.total - 1) got.add('last_piece');
    // «Пам'ять як у слона»: усі пари не більше ніж за півтора ходи на пару.
    if (r.payload?.type === 'memory' && r.payload.done && r.payload.moves <= L.memoryMovesPerPair * r.payload.total) got.add('elephant_memory');
  }

  // «З першої ноти»: прийнято, коли відкрито лише перший шматок; старий запис без heard — ні.
  if (mine.some((r) => r.accepted && mainOf(r)?.question.type === 'melody' && melodyHeardOf(r.payload) === 1)) got.add('first_note');

  return got;
}
