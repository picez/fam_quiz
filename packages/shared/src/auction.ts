import type { AuctionRound } from './quiz';

/** Торг відкрито: скільки мілісекунд до першої ставки (на вході в торг). */
export const AUCTION_OPEN_MS = 15_000;
/** Після кожної прийнятої ставки відлік починається заново. */
export const AUCTION_BID_MS = 5_000;

type BidRules = Pick<AuctionRound, 'bidMode' | 'bidStep'>;

/** Найменша допустима наступна ставка: step — bid + bidStep, free — bid + 1 (bid — поточна найбільша, 0 — ставок немає). */
export function auctionNextBid(round: BidRules, bid: number): number {
  return round.bidMode === 'step' ? bid + round.bidStep : bid + 1;
}

/** Чи прийнятна сума за режимом (без межі балів): step — рівно наступна, free — ціле не менше за наступну. */
export function auctionBidFits(round: BidRules, bid: number, amount: number): boolean {
  if (!Number.isInteger(amount)) return false;
  const next = auctionNextBid(round, bid);
  return round.bidMode === 'step' ? amount === next : amount >= next;
}

/** Бали переможця торгу: правильно — ціна + ставка; помилка — мінус ставка (або мінус ставка й ціна). */
export function auctionPoints(round: Pick<AuctionRound, 'loss'>, price: number, bid: number, correct: boolean): number {
  if (correct) return price + bid;
  return round.loss === 'bid_price' ? -bid - price : -bid;
}
