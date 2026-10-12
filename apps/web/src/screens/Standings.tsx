import type { Standing } from '@quiz/shared';

interface Props {
  standings: Standing[];
  highlightId?: string;
  limit?: number;
}

export function Standings({ standings, highlightId, limit }: Props) {
  const shown = limit === undefined ? standings : standings.slice(0, limit);
  return (
    <ol className="standings">
      {shown.map((row) => (
        <li key={row.participantId} className={row.participantId === highlightId ? 'is-me' : undefined}>
          <span className="rank">{row.rank}</span>
          <span className="name">{row.nickname}</span>
          <span className="score">{row.score}</span>
        </li>
      ))}
    </ol>
  );
}
