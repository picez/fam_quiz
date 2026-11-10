import { AUCTION_BID_MS, AUCTION_OPEN_MS, auctionBidFits, auctionNextBid, type AuctionRound } from '@quiz/shared';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику (як bets.ts).
import { betsIndex, wagerLimitOf } from './bets';
import { currentRound, fail, ok, openQuestion, withCurrentPlay, type GameState, type Result, type Rng } from './game';

// «Аукціон» (27b): перед кожним запитанням відкритий торг. final.wagers на торгу — лише поточна найбільша ставка;
// годинник — startedAt/endsAt етапу wager. Продаж відкриває запитання: з лідером — play.final лише переможця, без — для всіх.

/** Поточний раунд, якщо це «Аукціон». */
export function auctionRoundOf(state: GameState): AuctionRound | null {
  const round = currentRound(state);
  return round?.type === 'auction' ? round : null;
}

/** Лідер торгу (лише wager): єдиний запис final.wagers; null — ставок немає. */
export function auctionLeader(state: GameState): { playerId: string; bid: number } | null {
  if (state.phase !== 'wager' || state.final === null || auctionRoundOf(state) === null) return null;
  const entry = Object.entries(state.final.wagers)[0];
  return entry === undefined ? null : { playerId: entry[0], bid: entry[1] };
}

/** Найменша наступна ставка зараз (лише wager раунду auction); інакше null. */
export function auctionNextNow(state: GameState): number | null {
  const round = auctionRoundOf(state);
  if (round === null || state.phase !== 'wager') return null;
  return auctionNextBid(round, auctionLeader(state)?.bid ?? 0);
}

/** Торг запитання k: межі max(0, рахунок), ставок немає, годинник AUCTION_OPEN_MS від now. */
export function enterAuctionBidding(state: GameState, now: number): GameState {
  const limits = Object.fromEntries(state.players.map((p) => [p.id, Math.max(0, p.score)]));
  return {
    ...state,
    phase: 'wager',
    startedAt: now,
    endsAt: now + AUCTION_OPEN_MS,
    remainingMs: null,
    final: { limits, wagers: {}, allIn: [], order: [], shown: 0, split: false },
  };
}

/**
 * Ставка; етап, пауза й гравець уже перевірені в placeWager. Перевірки по черзі:
 * торг уже сплив (tick ще не продав) — time_over; 0 балів — bid_none; лідер — bid_leader; не та сума — bid_low; понад бали — bid_over.
 * Прийнята ставка стає єдиним записом final.wagers, годинник — AUCTION_BID_MS від now.
 */
export function placeBid(state: GameState, playerId: string, amount: number, now: number): Result {
  const round = auctionRoundOf(state);
  if (round === null || state.final === null) return fail('wrong_phase');
  if (state.endsAt !== null && now >= state.endsAt) return fail('time_over');
  const limit = wagerLimitOf(state, playerId);
  if (limit <= 0) return fail('bid_none');
  const leader = auctionLeader(state);
  if (leader?.playerId === playerId) return fail('bid_leader');
  if (!auctionBidFits(round, leader?.bid ?? 0, amount)) return fail('bid_low');
  if (amount > limit) return fail('bid_over');
  return ok({ ...state, startedAt: now, endsAt: now + AUCTION_BID_MS, remainingMs: null, final: { ...state.final, wagers: { [playerId]: amount } } });
}

/** Закриває торг і відкриває запитання k: з лідером — play.final { wagers: { лідер: ставка } }, без — без play.final. */
export function sellAuction(state: GameState, now: number, rng: Rng): GameState {
  const round = auctionRoundOf(state);
  const question = round?.questions[betsIndex(state)];
  if (round === null || question === undefined || state.phase !== 'wager' || state.final === null) return state;
  const leader = auctionLeader(state);
  const opened = openQuestion(state, question, now, rng);
  if (leader === null) return opened;
  return withCurrentPlay(opened, { ...opened.plays[opened.questionIndex], final: { wagers: { [leader.playerId]: leader.bid }, allIn: [], graded: [] } });
}
