import type { Standing } from '@quiz/shared';

export interface Ranked {
  id: string;
  nickname: string;
  score: number;
  totalTimeMs: number;
}

export function rankPlayers(players: Ranked[]): Standing[] {
  const sorted = [...players].sort(
    (a, b) => b.score - a.score || a.totalTimeMs - b.totalTimeMs || a.nickname.localeCompare(b.nickname),
  );
  const standings: Standing[] = [];
  sorted.forEach((player, index) => {
    const previous = standings[index - 1];
    const tied =
      previous !== undefined && previous.score === player.score && previous.totalTimeMs === player.totalTimeMs;
    standings.push({
      participantId: player.id,
      nickname: player.nickname,
      score: player.score,
      totalTimeMs: player.totalTimeMs,
      rank: tied ? previous.rank : index + 1,
    });
  });
  return standings;
}
