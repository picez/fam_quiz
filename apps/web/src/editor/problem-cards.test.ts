import { describe, expect, it } from 'vitest';
import { newQuestion } from './draft';
import { cardOfProblem } from './problem-cards';

describe('cardOfProblem (74)', () => {
  it('sends a missing text to the question card', () => {
    expect(cardOfProblem('problemNoText', newQuestion('single'))).toBe('question');
    expect(cardOfProblem('problemBetsCut', newQuestion('text'))).toBe('question');
    expect(cardOfProblem('problemAuctionCut', newQuestion('text'))).toBe('question');
  });

  it('sends a type that does not belong to the round to the type picker', () => {
    expect(cardOfProblem('problemDrawingPlace', newQuestion('drawing'))).toBe('type');
    expect(cardOfProblem('problemPuzzlesType', newQuestion('single'))).toBe('type');
    expect(cardOfProblem('problemSpyPlace', newQuestion('spy'))).toBe('type');
  });

  it('sends a broken timer to the time card, but a jigsaw timer to its answers', () => {
    expect(cardOfProblem('problemLimits', newQuestion('single'))).toBe('time');
    expect(cardOfProblem('problemMelodyLimits', newQuestion('melody'))).toBe('time');
    expect(cardOfProblem('problemPuzzleLimits', newQuestion('sudoku'))).toBe('time');
    expect(cardOfProblem('problemJigsawLimits', newQuestion('jigsaw'))).toBe('answers');
    expect(cardOfProblem('problemSpotdiffLimits', newQuestion('spotdiff'))).toBe('answers');
    expect(cardOfProblem('problemMemoryLimits', newQuestion('memory'))).toBe('answers');
  });

  it('sends a broken sound to the media card, but a melody to its answers', () => {
    expect(cardOfProblem('problemAudio', newQuestion('single'))).toBe('media');
    expect(cardOfProblem('problemSpyMedia', newQuestion('spy'))).toBe('media');
    expect(cardOfProblem('problemAudio', newQuestion('melody'))).toBe('answers');
    expect(cardOfProblem('problemAudio', newQuestion('pin'))).toBe('answers');
  });

  it('sends anything unknown to the answers', () => {
    expect(cardOfProblem('problemGeneric', newQuestion('single'))).toBe('answers');
    expect(cardOfProblem('problemTitle', newQuestion('text'))).toBe('answers');
  });
});
