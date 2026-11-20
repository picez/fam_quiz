/**
 * «Вгадай слово» (48): одна класика з шести запитань `wordle`. Гравець за шість спроб вгадує слово (4–7 літер): кожна спроба — справжній
 * іменник, клітинки підказують, які літери на місці, а які є в слові деінде. Сід `wordle` — демо запитання `wordle`.
 * Таймер 90–120 с; що довше й рідше слово — то дорожче. Тексту запитання немає (61, 45d): у грі лише сітка й «Вгадайте слово з N літер».
 * Слова є у словнику й не стоять відповіддю в інших сідах (перевіряє й тест).
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';

const wordle = (n: number, word: string, timeLimit: number, points: number): Question => ({
  id: `wd-q${n}`,
  type: 'wordle',
  text: '',
  imageUrl: null,
  video: null,
  timeLimit,
  points,
  word,
});

export const wordleQuiz = (): Quiz => ({
  title: 'Вгадай слово',
  description: 'Шість слів — шість спроб на кожне. Пишіть справжні іменники потрібної довжини, а кольори підкажуть, які літери на місці.',
  settings: { leaderboard: 'end', newcomers: true },
  rounds: [
    {
      id: 'wd-round-1',
      type: 'classic',
      title: 'Вгадай слово',
      description: 'Відомо лише, скільки в слові літер. Кожна спроба має бути справжнім іменником; хибна спроба не з’їдає жодної з шести.',
      speedBonus: false,
      shuffleOptions: false,
      rules: DEFAULT_RULES,
      questions: [
        wordle(1, 'горіх', 90, 500),
        wordle(2, 'жито', 90, 700),
        wordle(3, 'ожина', 100, 600),
        wordle(4, "м'ята", 100, 800),
        wordle(5, 'ґанок', 120, 1000),
        wordle(6, 'черешня', 120, 900),
      ],
    },
  ],
});
