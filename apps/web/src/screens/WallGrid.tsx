import type { PublicWall } from '@quiz/shared';

/** Клас розміру шрифту за найдовшим словом: слово не має ламатися посеред літер у вузькій плитці. */
function sizeClass(text: string): string | false {
  const longest = Math.max(0, ...text.split(/\s+/u).map((word) => [...word].length));
  return longest >= 13 ? 'is-long' : longest >= 10 ? 'is-mid' : longest >= 8 ? 'is-semi' : false;
}

/** Довге слово (10+ літер) з м'якими переносами приблизно кожні 5–6 літер, щоб у вузькій плитці воно ламалося на два рядки й лишалося читабельним. */
export function softWord(word: string): string {
  const letters = [...word];
  if (letters.length < 10) return word;
  const parts = Math.ceil(letters.length / 6);
  const size = Math.ceil(letters.length / parts);
  const chunks: string[] = [];
  for (let at = 0; at < letters.length; at += size) chunks.push(letters.slice(at, at + size).join(''));
  return chunks.join('\u00AD');
}

/** Текст плитки для телефона: довгі слова з м'якими переносами. */
function softText(text: string): string {
  return text.split(/(\s+)/u).map(softWord).join('');
}

/**
 * Сітка стіни: спершу знайдені групи рядами (кольори .wall-color-0…3), далі решта плиток у порядку показу.
 * selected — позиції, вибрані гравцем; onToggle — дотик (немає — лише перегляд); shake — позиції для трусіння.
 */
export function WallGrid({
  wall,
  found,
  selected = [],
  onToggle,
  shake = [],
  disabled = false,
  big = false,
}: {
  wall: PublicWall;
  found: { tiles: number[]; color: number }[];
  selected?: number[];
  onToggle?: (position: number) => void;
  shake?: number[];
  /** Дотики вимкнені (пауза, замкнено), але плитки лишаються кнопками. */
  disabled?: boolean;
  big?: boolean;
}) {
  const colorOf = new Map<number, number>();
  for (const group of found) for (const position of group.tiles) colorOf.set(position, group.color);
  const order = [
    ...found.flatMap((group) => group.tiles),
    ...wall.tiles.map((_, position) => position).filter((position) => !colorOf.has(position)),
  ];
  const className = ['wall-grid', big && 'is-big'].filter(Boolean).join(' ');
  return (
    <div className={className} lang="uk" style={{ gridTemplateColumns: `repeat(${wall.size}, 1fr)` }}>
      {order.map((position) => {
        const text = wall.tiles[position] ?? '';
        const shown = big ? text : softText(text);
        const color = colorOf.get(position);
        const isFound = color !== undefined;
        const tileClass = [
          'wall-tile',
          sizeClass(text),
          isFound && `is-found wall-color-${color % 4}`,
          !isFound && selected.includes(position) && 'is-selected',
          shake.includes(position) && 'wall-shake',
        ]
          .filter(Boolean)
          .join(' ');
        return onToggle === undefined || isFound ? (
          <div key={position} className={tileClass} aria-label={text}>
            {shown}
          </div>
        ) : (
          <button
            type="button"
            key={position}
            className={tileClass}
            aria-label={text}
            aria-pressed={selected.includes(position)}
            disabled={disabled}
            onClick={() => onToggle(position)}
          >
            {shown}
          </button>
        );
      })}
    </div>
  );
}
