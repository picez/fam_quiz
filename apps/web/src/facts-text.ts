import { factPercent, type FactCard, type GameCard, type OwnRevealFact, type RevealFacts, type RoundCard } from '@quiz/shared';
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

/** Порядковий числівник цифрами за правописом 2019: f — «2-а», «3-я»; n — «2-е», «3-є» (але «13-а», «13-е»). */
export function ordinal(n: number, gender: 'f' | 'n'): string {
  const third = n % 10 === 3 && n % 100 !== 13;
  return `${n}-${gender === 'f' ? (third ? 'я' : 'а') : third ? 'є' : 'е'}`;
}

/** Заголовок картки: «⚡ Блискавка». */
export function factTitle(card: FactCard): string {
  return t(`fact_${card.kind}` as TextKey);
}

/** Тіло картки; withRound — назвати раунд запитання (нагороди гри з кількох раундів; після раунду — ні). */
export function factBody(card: FactCard, withRound: boolean): string {
  if (card.kind === 'hardest') return t('factHardest', { text: card.question.text, accepted: card.accepted, answered: card.answered });
  const names = namesText(card.names);
  switch (card.kind) {
    case 'lightning': {
      const vars = { names, time: secondsText(card.timeMs), number: card.question.number, round: card.question.roundIndex + 1 };
      return t(withRound ? 'factLightningRound' : 'factLightning', vars);
    }
    case 'sniper': {
      const percent = factPercent(card.correct, card.answered);
      return card.names.length === 1 ? t('factSniperOne', { names, percent, correct: card.correct, answered: card.answered }) : t('factSniper', { names, percent });
    }
    case 'streak':
      return t('factStreak', { names, count: card.length });
    case 'comeback':
      return t('factComeback', { names, from: card.from, to: ordinal(card.to, 'n') });
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

/** «Правильно 4 з 7 · найшвидше — Оля, 2,1 с» чи «Найбільше голосів: вигадка від Петро — 3 голоси». */
export function revealFactsText(facts: RevealFacts): string {
  if (facts.bluff !== null) return countText('revealBluffTop', facts.bluff.votes, { names: namesText(facts.bluff.names), count: facts.bluff.votes });
  const head = t('revealCorrectOf', { accepted: facts.accepted, answered: facts.answered });
  if (facts.fastest === null) return head;
  const fastest = t('revealFastest', { names: namesText(facts.fastest.names), time: secondsText(facts.fastest.timeMs) });
  return `${head} · ${fastest}`;
}

/** «Твоя правильна відповідь — 2-а за швидкістю» / «Правильно відповіли 57 %». */
export function ownRevealText(fact: OwnRevealFact, team = false): string {
  if (fact.kind === 'share') return t('ownShare', { percent: fact.percent });
  if (fact.place === 1) return t(team ? 'ownFastestFirstTeam' : 'ownFastestFirst');
  return t(team ? 'ownFastestPlaceTeam' : 'ownFastestPlace', { place: ordinal(fact.place, 'f') });
}

/** Частини «Твого раунду» через « · »: правильно, середній час (є), найшвидша (є), серія (не нуль), місце до → після (з другого раунду), обдурили (є блеф). team — «вас». */
export function roundCardParts(card: RoundCard, team: boolean): string[] {
  const parts = [t('roundCardCorrect', { correct: card.correct, answered: card.answered })];
  if (card.avgMs !== null) parts.push(t('roundCardAvg', { time: secondsText(card.avgMs) }));
  if (card.fastestMs !== null) parts.push(t('roundCardFastest', { time: secondsText(card.fastestMs) }));
  if (card.streak > 0) parts.push(t('roundCardStreak', { count: card.streak }));
  // Саме місце вже є над карткою («Ваше місце: N з M»): тут лише зміна за раунд.
  if (card.place !== null && card.place.before !== null) parts.push(t('roundCardPlace', { before: card.place.before, now: card.place.now }));
  if (card.fooledBy !== null) parts.push(countText(team ? 'roundCardFooledTeam' : 'roundCardFooled', card.fooledBy, { count: card.fooledBy }));
  return parts;
}

/** Рядки «Твоєї гри» без стовпчиків: точність, серія, найшвидша (є); бафи, дебафи й блеф — лише не нульові. */
export function gameCardLines(card: GameCard, team: boolean): string[] {
  const lines = [
    card.answered === 0 ? t('gameCardAccuracyNone') : t('gameCardAccuracy', { percent: factPercent(card.correct, card.answered), correct: card.correct, answered: card.answered }),
    t('gameCardStreak', { count: card.bestStreak }),
  ];
  if (card.fastestMs !== null) lines.push(t('gameCardFastest', { time: secondsText(card.fastestMs) }));
  if (card.buffs > 0) lines.push(t('gameCardBuffs', { count: card.buffs }));
  if (card.debuffs.sent + card.debuffs.got > 0) lines.push(t(team ? 'gameCardDebuffsTeam' : 'gameCardDebuffs', { sent: card.debuffs.sent, got: card.debuffs.got }));
  if (card.bluff !== null) {
    const parts: string[] = [];
    if (card.bluff.fooled > 0) parts.push(countText(team ? 'gameCardBluffFooledTeam' : 'gameCardBluffFooled', card.bluff.fooled, { count: card.bluff.fooled }));
    if (card.bluff.fooledBy > 0) parts.push(countText(team ? 'roundCardFooledTeam' : 'roundCardFooled', card.bluff.fooledBy, { count: card.bluff.fooledBy }));
    if (parts.length > 0) lines.push(t('gameCardBluff', { parts: parts.join(' · ') }));
  }
  return lines;
}
