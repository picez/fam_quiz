import type { CloudWord } from '@quiz/shared';

const MIN_REM = 1;
const MAX_REM = 4.5;
/** Після цього числа слів шрифт зменшується, щоб хмара вмістилася на сцені. */
const DENSE_FROM = 25;
const COLORS = 5;

/** Стабільний хеш ключа: однаковий порядок і колір між перемальовуваннями. */
function hashOf(key: string): number {
  let hash = 0;
  for (const char of key) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) >>> 0;
  return hash;
}

/** Найбільші слова — до середини, менші розходяться до країв; рівні за count — за хешем key. */
export function cloudOrder(words: CloudWord[]): CloudWord[] {
  const sorted = [...words].sort((a, b) => b.count - a.count || hashOf(a.key) - hashOf(b.key) || a.key.localeCompare(b.key));
  const line: CloudWord[] = [];
  sorted.forEach((word, index) => {
    if (index === 0) line.push(word);
    else if (index % 2 === 1) line.push(word);
    else line.unshift(word);
  });
  return line;
}

/** Хмара: слова розміром за count (1 rem … 4,5 rem лінійно між найменшим і найбільшим). */
export function WordCloud({ words }: { words: CloudWord[] }) {
  const counts = words.map((word) => word.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const scale = words.length > DENSE_FROM ? 0.7 : 1;
  return (
    <ul className={words.length > DENSE_FROM ? 'word-cloud is-dense' : 'word-cloud'}>
      {cloudOrder(words).map((word) => {
        const share = max === min ? 0.5 : (word.count - min) / (max - min);
        const size = (MIN_REM + share * (MAX_REM - MIN_REM)) * scale;
        return (
          <li key={word.key} className={`word word-color-${hashOf(word.key) % COLORS}`} style={{ fontSize: `${size.toFixed(2)}rem` }}>
            {word.text}
          </li>
        );
      })}
    </ul>
  );
}
