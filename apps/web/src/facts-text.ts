import type { FactCard, GameCard, OwnRevealFact, RevealFacts, RoundCard } from '@quiz/shared';
import { num, secondsText } from './format';
import { countText, t, type TextKey } from './i18n';

const VOWEL_END = /[аеєиіїоуюяaeiouy]$/i;
const SOFT_START = /^[іїйєюя]/i;

/** Імена через кому, останнє — через «і» чи «й» за милозвучністю: «Оля, Петро й Тарас», «Тарас і Оля». */
export function namesText(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  const rest = names.slice(0, -1).join(', ');
  const last = names[names.length - 1];
  const short = VOWEL_END.test(rest.trim()) && !SOFT_START.test(last.trim());
  return t(short ? 'factNamesAndShort' : 'factNamesAnd', { rest, last });
}

const percentOf = (part: number, whole: number) => (whole <= 0 ? 0 : Math.round((part / whole) * 100));

/** Заголовок картки: «⚡ Блискавка». */
export function factTitle(card: FactCard): string {
  return t(`fact_${card.kind}` as TextKey);
}

/** Тіло картки; rounds — кількість раундів у грі (номер раунду в нагородах, коли їх більше одного). */
export function factBody(card: FactCard, rounds: number): string {
  if (card.kind === 'hardest') return t('factHardest', { text: card.question.text, accepted: card.accepted, answered: card.answered });
  const names = namesText(card.names);
  switch (card.kind) {
    case 'lightning': {
      const vars = { names, time: secondsText(card.timeMs), number: card.question.number, round: card.question.roundIndex + 1 };
      return t(rounds > 1 ? 'factLightningRound' : 'factLightning', vars);
    }
    case 'sniper': {
      const percent = percentOf(card.correct, card.answered);
      return card.names.length === 1 ? t('factSniperOne', { names, percent, correct: card.correct, answered: card.answered }) : t('factSniper', { names, percent });
    }
    case 'streak':
      return t('factStreak', { names, count: card.length });
    case 'comeback':
      return t('factComeback', { names, from: card.from, to: card.to });
    case 'bluffer':
      return countText('factBluffer', card.fooled, { names, count: card.fooled });
    case 'nerves':
      return countText('factNerves', card.count, { names, count: card.count });
    case 'risk':
      return card.wager !== null ? t('factRiskWager', { names, wager: num(card.wager) }) : countText('factRiskBuffs', card.buffs ?? 0, { names, count: card.buffs ?? 0 });
    case 'gullible':
      return countText('factGullible', card.picks, { names, count: card.picks });
    case 'genius':
      return card.question !== null && card.count === 1 ? t('factGenius', { names, number: card.question.number }) : countText('factGeniusMany', card.count, { names, count: card.count });
  }
}

/** «Правильно 4 з 7 · найшвидша Оля, 2,1 с» чи «Обдурила всіх: вигадка від Петро — 3 голоси». */
export function revealFactsText(facts: RevealFacts): string {
  if (facts.bluff !== null) return countText('revealBluffTop', facts.bluff.votes, { names: namesText(facts.bluff.names), count: facts.bluff.votes });
  const head = t('revealCorrectOf', { accepted: facts.accepted, answered: facts.answered });
  if (facts.fastest === null) return head;
  const fastest = t(facts.fastest.names.length === 1 ? 'revealFastest_one' : 'revealFastest_other', { names: namesText(facts.fastest.names), time: secondsText(facts.fastest.timeMs) });
  return `${head} · ${fastest}`;
}

/** «Твоя правильна відповідь — 2-а за швидкістю» / «Правильно відповіли 57 %». */
export function ownRevealText(fact: OwnRevealFact): string {
  if (fact.kind === 'share') return t('ownShare', { percent: fact.percent });
  return fact.place === 1 ? t('ownFastestFirst') : t('ownFastestPlace', { place: fact.place });
}

/** Частини «Твого раунду» через « · »: правильно, середній час (є), найшвидша (є), серія, місце (є), обдурили (є блеф). team — «вас». */
export function roundCardParts(card: RoundCard, team: boolean): string[] {
  const parts = [t('roundCardCorrect', { correct: card.correct, answered: card.answered })];
  if (card.avgMs !== null) parts.push(t('roundCardAvg', { time: secondsText(card.avgMs) }));
  if (card.fastestMs !== null) parts.push(t('roundCardFastest', { time: secondsText(card.fastestMs) }));
  parts.push(t('roundCardStreak', { count: card.streak }));
  if (card.place !== null) parts.push(card.place.before === null ? t('roundCardPlaceNow', { now: card.place.now }) : t('roundCardPlace', { before: card.place.before, now: card.place.now }));
  if (card.fooledBy !== null) parts.push(countText(team ? 'roundCardFooledTeam' : 'roundCardFooled', card.fooledBy, { count: card.fooledBy }));
  return parts;
}

/** Рядки «Твоєї гри» без стовпчиків: точність, серія, найшвидша (є), бафи, дебафи, блеф (є). */
export function gameCardLines(card: GameCard, team: boolean): string[] {
  const lines = [
    card.answered === 0 ? t('gameCardAccuracyNone') : t('gameCardAccuracy', { percent: percentOf(card.correct, card.answered), correct: card.correct, answered: card.answered }),
    t('gameCardStreak', { count: card.bestStreak }),
  ];
  if (card.fastestMs !== null) lines.push(t('gameCardFastest', { time: secondsText(card.fastestMs) }));
  lines.push(t('gameCardBuffs', { count: card.buffs }));
  lines.push(t(team ? 'gameCardDebuffsTeam' : 'gameCardDebuffs', { sent: card.debuffs.sent, got: card.debuffs.got }));
  if (card.bluff !== null) lines.push(t(team ? 'gameCardBluffTeam' : 'gameCardBluff', { fooled: card.bluff.fooled, by: card.bluff.fooledBy }));
  return lines;
}
