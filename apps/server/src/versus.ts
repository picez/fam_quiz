import { gameStats, type PlayedGame, type Versus } from '@quiz/shared';
import type { Db } from './db/client';
import { playerGames } from './history';

export const VERSUS_RECENT = 5;

const rankValue = (game: PlayedGame): number => game.rank ?? Number.POSITIVE_INFINITY;

/** Найкращий за місцем запис на кожну гру (rank null — найгірший), порядок збережено. */
export function bestPerGame(games: PlayedGame[]): PlayedGame[] {
  const best = new Map<string, PlayedGame>();
  for (const game of games) {
    const current = best.get(game.gameId);
    if (current === undefined || rankValue(game) < rankValue(current)) best.set(game.gameId, game);
  }
  const seen = new Set<string>();
  return games.flatMap((game) => {
    if (seen.has(game.gameId)) return [];
    seen.add(game.gameId);
    return [best.get(game.gameId)!];
  });
}

const finishedGames = async (db: Db, userId: string): Promise<PlayedGame[]> =>
  bestPerGame((await playerGames(db, userId, null)).map((g) => g.played).filter((g) => g.status === 'finished'));

/** Спільні завершені ігри того, хто дивиться, і іншого користувача: лише вони двоє. */
export async function versusOf(db: Db, viewerId: string, otherId: string): Promise<Versus> {
  const theirs = new Map((await finishedGames(db, otherId)).map((g) => [g.gameId, g]));
  const mine: PlayedGame[] = [];
  const other: PlayedGame[] = [];
  for (const game of await finishedGames(db, viewerId)) {
    const their = theirs.get(game.gameId);
    if (their === undefined) continue;
    mine.push(game);
    other.push(their);
  }
  const ahead = (a: PlayedGame, b: PlayedGame): boolean => a.rank !== null && b.rank !== null && a.rank < b.rank;
  return {
    together: mine.length,
    myAhead: mine.filter((g, i) => ahead(g, other[i]!)).length,
    theirAhead: mine.filter((g, i) => ahead(other[i]!, g)).length,
    myAccuracy: gameStats(mine).accuracy,
    theirAccuracy: gameStats(other).accuracy,
    recent: mine.slice(0, VERSUS_RECENT).map((g, i) => ({
      gameId: g.gameId,
      title: g.title,
      startedAt: g.startedAt,
      myRank: g.rank,
      theirRank: other[i]!.rank,
    })),
  };
}
