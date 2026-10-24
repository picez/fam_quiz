import type { Question } from '@quiz/shared';

/** Правильні групи стіни: рядок на групу — назва й плитки, кольори .wall-color-N за порядком груп. */
export function WallReveal({
  question,
  big = false,
  colors,
}: {
  question: Extract<Question, { type: 'wall' }>;
  big?: boolean;
  /** Колір кожної групи за її порядком у запитанні; null — нейтральна (телефон: група, якої гравець не знайшов). Без colors — за порядком груп. */
  colors?: (number | null)[];
}) {
  return (
    <ul className={big ? 'wall-reveal is-big' : 'wall-reveal'}>
      {question.groups.map((group, index) => {
        const color = colors === undefined ? index % 4 : colors[index];
        return (
        <li key={group.id} className={color === null || color === undefined ? 'wall-group is-neutral' : `wall-group wall-color-${color % 4}`}>
          <strong>{group.name}</strong>
          <span>{group.tiles.map((tile) => tile.text).join(', ')}</span>
        </li>
        );
      })}
    </ul>
  );
}
