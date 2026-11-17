/**
 * «Думай як усі» (37): два класичні раунди — шість запитань «Думай як усі» (одне слово на тему, бали отримує найбільша група схожих
 * відповідей), а далі «Не перебільш»: три числові запитання, де перемагає найближче знизу, і «Більше чи менше» з кроком балів 50.
 * Сід `alike` — демо всіх трьох змін плану 37. Усі таймери ≥ 25 с; відповідей у тексті запитань немає.
 *
 * Факти перевірено 2026-11-17: на фортепіано 88 клавіш (52 білі й 36 чорних); у дорослої людини 206 кісток;
 * Ейфелева вежа з антенами — 330 м (з 2022 року); Дунай 2850 км, Дніпро 2201 км; Кіліманджаро 5895 м, Монблан 4806 м;
 * Україна ≈ 603,6 тис. км², Мадагаскар ≈ 587 тис. км²; годинна вежа Біг-Бена добудована 1859, Ейфелева — 1889.
 * Теми «Думай як усі» не повторюють жоден інший сід (grep -rn по scripts порожній).
 */
import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';

const alike = (n: number, text: string, timeLimit: number, points: number): Question => ({
  id: `al-q${n}`,
  type: 'thinkalike',
  text,
  imageUrl: null,
  video: null,
  timeLimit,
  points,
});

const noOvershoot = (n: number, text: string, correct: number, timeLimit: number, points: number): Question => ({
  id: `al-n${n}`,
  type: 'numeric',
  text,
  imageUrl: null,
  video: null,
  timeLimit,
  points,
  correct,
  tolerance: 0,
  noOvershoot: true,
});

type Side = readonly [text: string, value: string];
const pair = (n: number, prompt: string, a: Side, b: Side, correct: 'a' | 'b', points: number) => ({
  id: `al-m${n}`,
  prompt,
  a: { text: a[0], value: a[1] },
  b: { text: b[0], value: b[1] },
  correct,
  points,
});

export const alikeQuiz = (): Quiz => ({
  title: 'Думай як усі',
  description: 'Пишіть те, що напише більшість: бали отримує найбільша група однакових відповідей. А потім — числа, де не можна перебільшити.',
  settings: { leaderboard: 'end', newcomers: true },
  rounds: [
    {
      id: 'al-round-1',
      type: 'classic',
      title: 'Думай як усі',
      description: 'Одне слово на тему. Збіглися з якомога більшою кількістю людей — отримуєте бали. Хто написав щось своє — нічого.',
      speedBonus: false,
      shuffleOptions: false,
      rules: DEFAULT_RULES,
      questions: [
        alike(1, 'Назвіть напій, який найчастіше п’ють уранці', 30, 300),
        alike(2, 'Тварина, яку діти найчастіше малюють', 30, 500),
        alike(3, 'Колір літа', 25, 400),
        alike(4, 'Страва, без якої немає святкового столу', 40, 700),
        alike(5, 'Місто України, куди їдуть до моря', 35, 600),
        alike(6, 'Що беруть із собою в похід', 30, 800),
      ],
    },
    {
      id: 'al-round-2',
      type: 'classic',
      title: 'Не перебільш',
      description: 'Відповідь більша за правильну — нуль балів. Найближче знизу — повна ціна. Крок у «Більше чи менше» — 50 балів.',
      speedBonus: false,
      shuffleOptions: false,
      rules: DEFAULT_RULES,
      questions: [
        noOvershoot(1, 'Скільки клавіш має стандартне фортепіано? Головне — не перебільшити', 88, 30, 600),
        noOvershoot(2, 'Скільки кісток у скелеті дорослої людини? Головне — не перебільшити', 206, 40, 1000),
        noOvershoot(3, 'Яка висота Ейфелевої вежі разом з антенами, у метрах? Головне — не перебільшити', 330, 35, 800),
        {
          id: 'al-more',
          type: 'moreless',
          text: 'Більше чи менше: географія й архітектура',
          imageUrl: null,
          video: null,
          timeLimit: 60,
          points: 700,
          step: 50,
          pairs: [
            pair(1, 'Яка річка довша?', ['Дніпро', '2201 км'], ['Дунай', '2850 км'], 'b', 100),
            pair(2, 'Яка гора вища?', ['Монблан', '4806 м'], ['Кіліманджаро', '5895 м'], 'b', 150),
            pair(3, 'Яка країна більша за площею?', ['Україна', '603 628 км²'], ['Мадагаскар', '587 041 км²'], 'a', 200),
            pair(4, 'Що збудовано раніше?', ['Годинна вежа Біг-Бена', '1859'], ['Ейфелева вежа', '1889'], 'a', 250),
          ],
        },
      ],
    },
  ],
});
