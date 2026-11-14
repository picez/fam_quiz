import { questPoints, undoLedger, type AchievementId } from '@quiz/shared';
import type { AchievementAdjustment, AchievementGame } from './achievement-games';
import { answerRow, groupRounds, participantRows } from './achievement-rows';
import type { AchievementWho } from './game-achievements';
import { kyivDay } from './xp-rules';

/** Пороги досягнень за раунди й додаткових (план 33). */
export const ROUND_LIMITS = {
  classicQuestions: 5,
  betsQuestions: 3,
  truthQuestions: 3,
  truthAnswers: 3,
  roundTypes: 5,
  teamSoul: 5,
  teamPeople: 2,
} as const;

/**
 * Скасовані коригування гри (12a): seq тих, на які діє нескасоване «undo». «Повернути» (undo, що вказує на undo) знімає
 * скасування — ланцюжок розбирає undoLedger від найменшого seq. seq унікальний у межах гри.
 */
export function cancelledSeqs(adjustments: readonly AchievementAdjustment[]): Set<number> {
  const ledger = undoLedger(
    adjustments.map((a) => ({ seq: a.seq, who: a.participantId, source: a.source, ...(a.undoesSeq === null ? {} : { undoes: { seq: a.undoesSeq } }) })),
  );
  return new Set(ledger.adjustments.keys());
}

/**
 * Досягнення за раунди й додаткові досягнення завершеної гри (план 33, «Рішення»); незавершена — порожньо.
 * За результат учасника таблиці (уся команда): класика, «Ставки», «Аукціон», «Правда про гравця», квест, шведський стіл.
 * «Темна конячка» — автору факту, «Душа команди» — людині з answeredBy, свято — кожному учаснику.
 */
export function roundAchievements(game: AchievementGame, who: AchievementWho): Set<AchievementId> {
  const got = new Set<AchievementId>();
  if (game.status !== 'finished') return got;
  const L = ROUND_LIMITS;
  const mine = participantRows(game, who).filter(answerRow);
  const rounds = groupRounds(game.questions);
  /** Виграна апеляція прийнятою відповідь не робить: умови «усі правильно» рахують лише accepted. */
  const acceptedOn = (index: number, firstOnly = false) => mine.some((r) => r.questionIndex === index && r.accepted && (!firstOnly || r.attempt === 0));

  // «Класика жанру»: у класичному раунді щонайменше 5 запитань з балами, на кожному прийнята відповідь (запасне теж закриває).
  for (const round of rounds) {
    if (round[0]!.roundType !== 'classic') continue;
    const scored = round.filter((q) => q.scored);
    if (scored.length >= L.classicQuestions && scored.every((q) => acceptedOn(q.index))) {
      got.add('classic_clean');
      break;
    }
  }

  // «Холодний розрахунок»: у «Ставках» щонайменше 3 запитання, на кожному перша спроба зі ставкою > 0 і прийнята.
  for (const round of rounds) {
    if (round[0]!.roundType !== 'bets' || round.length < L.betsQuestions) continue;
    if (round.every((q) => mine.some((r) => r.questionIndex === q.index && r.attempt === 0 && (r.wager ?? 0) > 0 && r.accepted))) {
      got.add('cold_bets');
      break;
    }
  }

  // «Продано!»: ставку на «Аукціоні» має лише переможець торгу; непродане (wager null) не дає.
  const auction = new Set(game.questions.filter((q) => q.roundType === 'auction').map((q) => q.index));
  if (mine.some((r) => auction.has(r.questionIndex) && (r.wager ?? 0) > 0 && r.accepted)) got.add('sold');

  // «Знаю вас як облуплених»: усі чужі факти «Правди про гравця» (щонайменше 3) — прийнята перша спроба.
  const others = game.questions.filter((q) => q.ref.truth !== undefined && q.ref.truth.actor !== who.participantId);
  if (others.length >= L.truthQuestions && others.every((q) => acceptedOn(q.index, true))) got.add('mind_reader');

  // «Темна конячка»: свій факт (автор — людина), щонайменше 3 перші спроби інших учасників, жодна не прийнята.
  const self = who.personId ?? who.participantId;
  if (
    game.questions.some((q) => {
      const truth = q.ref.truth;
      if (truth === undefined || truth.author !== self) return false;
      const tries = game.rows.filter((r) => r.questionIndex === q.index && r.attempt === 0 && r.participantId !== truth.actor);
      return tries.length >= L.truthAnswers && tries.every((r) => !r.accepted);
    })
  )
    got.add('dark_horse');

  // «Код зламано»: бонус квесту більший, ніж за код після всіх запитань раунду (questPoints спадає за after, тож код відкрито раніше).
  // За збігу після округлення — «ні». Скасований бонус не дає; квест із бонусом-бафом історія не зберігає (план 33, «Далі»).
  const cancelled = cancelledSeqs(game.adjustments);
  if (
    game.adjustments.some((a) => {
      if (a.participantId !== who.participantId || a.source !== 'quest' || cancelled.has(a.seq)) return false;
      const round = game.questRounds.find((r) => r.roundIndex === a.roundIndex);
      return round !== undefined && round.bonusPoints !== null && a.points > questPoints(round.bonusPoints, round.questions, round.questions);
    })
  )
    got.add('code_breaker');

  // «Шведський стіл»: рядки-відповіді учасника в раундах щонайменше 5 різних типів; штрафи й позначки виходу — не відповідь.
  const questions = new Map(game.questions.map((q) => [q.index, q]));
  const types = new Set(mine.flatMap((r) => questions.get(r.questionIndex)?.roundType ?? []));
  if (types.size >= L.roundTypes) got.add('buffet');

  // «Душа команди»: найбільше прийнятих відповідей серед людей своєї команди (щонайменше 5, строго більше за кожного).
  const player = game.players.find((p) => p.participantId === who.participantId);
  if (game.teams && who.personId !== null && player !== undefined && player.members.length >= L.teamPeople) {
    const counts = new Map(player.members.map((m) => [m.participantId, 0]));
    for (const r of mine) {
      if (r.accepted && r.answeredBy !== null && counts.has(r.answeredBy)) counts.set(r.answeredBy, counts.get(r.answeredBy)! + 1);
    }
    const own = counts.get(who.personId) ?? 0;
    if (own >= L.teamSoul && [...counts].every(([id, n]) => id === who.personId || n < own)) got.add('team_soul');
  }

  // «Святковий настрій»: гра почалася 31 грудня чи 1 січня за київським часом.
  const day = kyivDay(game.startedAt);
  if (day.endsWith('-12-31') || day.endsWith('-01-01')) got.add('holiday');

  return got;
}
