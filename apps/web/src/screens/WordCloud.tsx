import type { CloudWord } from '@quiz/shared';

/** Найменше слово читається з кінця зали: нижче цього шрифт не опускається. */
const MIN_REM = 1.25;
const MAX_REM = 4.5;
/** Коли слів багато, найбільше слово менше, а найменше лишається читабельним. */
const DENSE_FROM = 25;
const DENSE_MAX_REM = 3;
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

/** Хмара: слова розміром за count (1,25 rem … 4,5 rem лінійно; при щільній хмарі до 3 rem). */
export function WordCloud({ words }: { words: CloudWord[] }) {
  const counts = words.map((word) => word.count);
  const min = Math.min(...counts);
  const max = Math.max(...counts);
  const top = words.length > DENSE_FROM ? DENSE_MAX_REM : MAX_REM;
  return (
    <ul className={words.length > DENSE_FROM ? 'word-cloud is-dense' : 'word-cloud'}>
      {cloudOrder(words).map((word) => {
        const share = max === min ? 0.5 : (word.count - min) / (max - min);
        const size = MIN_REM + share * (top - MIN_REM);
        return (
          <li key={word.key} className={`word word-color-${hashOf(word.key) % COLORS}`} style={{ fontSize: `${size.toFixed(2)}rem` }}>
            {word.text}
          </li>
        );
      })}
    </ul>
  );
}
