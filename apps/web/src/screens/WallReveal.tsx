import type { Question } from '@quiz/shared';

/** Правильні групи стіни: рядок на групу — назва й плитки, кольори .wall-color-N за порядком груп. */
export function WallReveal({ question, big = false }: { question: Extract<Question, { type: 'wall' }>; big?: boolean }) {
  return (
    <ul className={big ? 'wall-reveal is-big' : 'wall-reveal'}>
      {question.groups.map((group, index) => (
        <li key={group.id} className={`wall-group wall-color-${index % 4}`}>
          <strong>{group.name}</strong>
          <span>{group.tiles.map((tile) => tile.text).join(', ')}</span>
        </li>
      ))}
    </ul>
  );
}
