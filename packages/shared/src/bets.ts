import type { BetsRound } from './quiz';

/** Мінімальна ставка запитання index (від 0): betStart + index × betStep. */
export function betMinimum(round: Pick<BetsRound, 'betStart' | 'betStep'>, index: number): number {
  return round.betStart + index * round.betStep;
}

/** Мінімуми перших count запитань. */
export function betsMinimums(round: Pick<BetsRound, 'betStart' | 'betStep'>, count: number): number[] {
  return Array.from({ length: count }, (_, i) => betMinimum(round, i));
}

/** Слова тексту: непорожні шматки між пробільними символами. */
export function betsWords(text: string): string[] {
  return text.match(/\S+/gu) ?? [];
}

/** Початок оригінального тексту до кінця cut-го слова (пробіли всередині зберігаються, кінцевий відкидається). */
export function betsTeaser(text: string, cut: number): string {
  if (cut <= 0) return '';
  let seen = 0;
  for (const match of text.matchAll(/\S+/gu)) {
    seen += 1;
    if (seen === cut) return text.slice(0, match.index + match[0].length).trimStart();
  }
  return text.trim();
}

/** 'bets_max', якщо мінімум останнього запитання більший за найбільшу ставку; інакше null. */
export function betsRoundIssue(round: Pick<BetsRound, 'betStart' | 'betStep' | 'betMax'>, count: number): 'bets_max' | null {
  if (round.betMax === null || count < 1) return null;
  return betMinimum(round, count - 1) > round.betMax ? 'bets_max' : null;
}
