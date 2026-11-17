/**
 * «Думай як усі» (37): два класичні раунди — шість запитань «Думай як усі» (одне слово на тему, бали отримує найбільша група схожих
 * відповідей), а далі «Не перебільш»: три числові запитання, де перемагає найближче знизу, і «Більше чи менше» з кроком балів 50.
 * Сід `alike` — демо всіх трьох змін плану 37. Усі таймери ≥ 25 с; відповідей у тексті запитань немає.
 *
 * Факти перевірено 2026-11-17: у дитини 20 молочних зубів; на класичному полі судоку 81 клітинка; у грецькому алфавіті 24 літери;
 * Прут 953 км, Тетерів 365 км; Одеса ≈ 1,01 млн жителів, Львів ≈ 0,72 млн (2021); Угорщина 93 030 км², Ісландія 103 000 км²;
 * Рейн 1233 км, Ельба 1094 км. Жодне з цих запитань не повторює інші сіди (grep -rn по scripts порожній; перевіряє й тест).
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
        noOvershoot(1, 'Скільки молочних зубів у дитини, коли всі вони вже виросли? Головне — не перебільшити', 20, 30, 600),
        noOvershoot(2, 'Скільки клітинок на класичному полі судоку? Головне — не перебільшити', 81, 40, 1000),
        noOvershoot(3, 'Скільки літер у грецькому алфавіті? Головне — не перебільшити', 24, 35, 800),
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
            pair(1, 'Яка з українських річок довша?', ['Тетерів', '365 км'], ['Прут', '953 км'], 'b', 100),
            pair(2, 'У якому місті було більше жителів у 2021 році?', ['Одеса', '1,01 млн'], ['Львів', '0,72 млн'], 'a', 150),
            pair(3, 'Яка країна більша за площею?', ['Угорщина', '93 030 км²'], ['Ісландія', '103 000 км²'], 'b', 200),
            pair(4, 'Яка з європейських річок довша?', ['Рейн', '1233 км'], ['Ельба', '1094 км'], 'a', 250),
          ],
        },
      ],
    },
  ],
});
