import { describe, expect, it } from 'vitest';
import { auctionBidFits, auctionNextBid, auctionPoints, auctionPrice } from './auction';

const step50 = { bidMode: 'step', bidStep: 50 } as const;
const free = { bidMode: 'free', bidStep: 50 } as const;

describe('auction rules (27b)', () => {
  it('the next bid follows the mode', () => {
    expect(auctionNextBid(step50, 0)).toBe(50);
    expect(auctionNextBid(step50, 150)).toBe(200);
    expect(auctionNextBid(free, 0)).toBe(1);
    expect(auctionNextBid(free, 150)).toBe(151);
  });

  it('step takes only the exact next bid, free takes any higher whole number', () => {
    expect(auctionBidFits(step50, 100, 150)).toBe(true);
    expect(auctionBidFits(step50, 100, 200)).toBe(false);
    expect(auctionBidFits(step50, 100, 100)).toBe(false);
    expect(auctionBidFits(free, 100, 101)).toBe(true);
    expect(auctionBidFits(free, 100, 5000)).toBe(true);
    expect(auctionBidFits(free, 100, 100)).toBe(false);
    expect(auctionBidFits(free, 100, 150.5)).toBe(false);
  });

  it('points by the loss mode', () => {
    expect(auctionPoints({ loss: 'bid' }, 200, 400, true)).toBe(600);
    expect(auctionPoints({ loss: 'bid' }, 200, 400, false)).toBe(-400);
    expect(auctionPoints({ loss: 'bid_price' }, 200, 400, false)).toBe(-600);
    expect(auctionPoints({ loss: 'bid_price' }, 200, 400, true)).toBe(600);
  });

  it('the price of a sort question is per word times words', () => {
    expect(auctionPrice({ type: 'single', points: 200 })).toBe(200);
    expect(auctionPrice({ type: 'sort', points: 10, words: [{}, {}, {}] })).toBe(30);
  });
});
