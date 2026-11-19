import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import type { Photos } from './big2/kit';
import { DISCO, LESSON } from './big2/open';
import { DUELS, FINAL, LADDER, puzzles } from './big2/rest';
import { BETS, BLITZ, QUEST, SURVIVAL, TRIALS } from './big2/rounds';

export { BIG2_PHOTOS } from './big2/rest';

/**
 * «Велика гра ІІ: перерва, слідство й диско 90-х» — друга з трьох великих сімейних вікторин (big1–big3), що разом покривають
 * усі типи раундів і запитань (матриця — .superpowers/quizzes/coverage.md). Теми власника: шкільна програма, логіка й загадки,
 * детективи й «знайди вбивцю», «дибільні» запитання, кіно й музика 1990–2000 (лише світові хіти).
 * Раунди: класика ×2, бліц, ставки, «Вибування», квест, головоломки, «Мільйонер», фінал; на рівні вікторини — дуелі зі ставками глядачів.
 * Інтерактивне: мелодії за нотами, дві стіни, блеф, «100 до 1» (реальне опитування Gallup), пазли, «Пам’ять» з картинами, кросворд, судоку, дуелі, квест.
 * Навчальне: шкільна програма в ставках і розминці, логіка квесту, детективна дедукція у «Вибуванні» й фіналі.
 * Гратиме автопілот без ведучого: перевірка за ключем, «Мільйонер» вибирає учасника жеребом і йде без таймера (автопілот лише позначає untimed),
 * бафа «Підказка ведучого» немає. Без опитувань гравців і «хмар слів» (чекають рішення власника). Таймери — від 25 с. Жодного запитання про росію.
 * photos — ключ BIG2_PHOTOS → адреса картинки на сайті (пазли й «Пам’ять»).
 */
export const big2Quiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `b2-${theme}-${++k}` });
  let d = 0;
  const duels = DUELS().map((c) => ({ ...c, id: `b2d-${++d}`, questions: c.questions.map((q) => ({ ...q, id: `b2dq-${++d}` })) }));

  return {
    title: 'Велика гра ІІ: перерва, слідство й диско 90-х',
    description:
      'Шкільна програма, загадки, детективні справи «знайди вбивцю», дибільні запитання й найбільші хіти та фільми 1990–2000 — з мелодіями, стінами, блефом, «100 до 1», пазлами, ставками, квестом, «Мільйонером» і дуелями.',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      family: true,
      buffs: BUFF_KINDS.filter((b) => b !== 'hint' && b !== 'swap'),
      debuffs: [...DEBUFF_KINDS],
      debuffPrices: { shake: 200, fog: 250, freeze: 350, mirror: 300, guests: 200, mud: 250, flip: 300, torch: 200, sticky: 250, noclock: 300, bubbles: 150 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 'b2-lesson',
        type: 'classic',
        title: 'Перший урок: школа, загадки й слідство',
        description:
          'Розминка на чотирнадцять запитань: два «Хто я?», де підказки відкриваються самі за таймером, стіна шкільної програми, «100 до 1» з реального опитування Gallup, задачі, загадки й детективи 90-х. Швидкі правильні відповіді дають бонус, за частково правильний порядок чи пари — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: LESSON.map(tag('lesson')),
      },
      {
        id: 'b2-disco',
        type: 'classic',
        title: 'Диско й кіно 90-х',
        description:
          'П’ять мелодій за нотами — шматочки по 1, 2, 4, 8 і 16 секунд: що раніше впізнаєте, то більше балів. Потім стіна кіно й музики та три блефи: допишіть вигадку, яка обдурить інших, і знайдіть правду серед вигадок.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: DISCO.map(tag('disco')),
      },
      {
        id: 'b2-blitz',
        type: 'blitz',
        title: 'Бліц: дибільні запитання',
        description:
          'Чотирнадцять запитань із підступом. Тисніть «Відповісти» першими: на відповідь 20 секунд і дві спроби на запитання. Серія правильних відповідей щоразу додає ще 50 балів, серія помилок — стільки ж віднімає.',
        shuffleOptions: true,
        answerWindow: 20,
        attempts: 2,
        check: 'auto',
        rules: { ...rules({ penalty: 'minus' }), partial: null, streakPlus: { step: 50 }, streakMinus: { step: 50 } },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'b2-bets',
        type: 'bets',
        title: 'Ставки: вісім уроків',
        description:
          'Перед кожним запитанням видно лише назву уроку. Ставте таємно від 200 балів, і щоразу мінімум росте на 100; найбільша ставка — 2000. Правильна відповідь додає ставку, помилка віднімає.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 2000,
        questions: BETS.map(tag('bets')),
      },
      {
        id: 'b2-survival',
        type: 'survival',
        title: 'Вибування: детективні справи',
        description:
          'Десять справ: хто бреше, хто видав себе, що кажуть сліди. Хто помилився — проходить випробування окремим запитанням; не пройшов — стає привидом і далі лише вболіває. Раунд скінчиться, коли лишиться двоє; кожен, хто дожив, отримує 1000 балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        questions: SURVIVAL.map(tag('surv')),
        trials: TRIALS.map(tag('trial')),
        trial: 'question',
        survivors: 2,
        bonus: 1000,
      },
      {
        id: 'b2-quest',
        type: 'quest',
        title: 'Квест: шифр зі шкільного зошита',
        description:
          'Над раундом висить загадка — відповідь на неї і є кодом із шести літер. Кожна правильна відповідь на звичайне запитання відкриває вам одну літеру, а код можна вводити будь-коли: три спроби. Що менше літер знадобилося, то більший бонус — до 1500 балів.',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: QUEST.prompt,
        code: QUEST.code,
        order: [2, 0, 4, 1, 5, 3],
        tries: 3,
        bonus: { kind: 'points', points: 1500 },
        questions: QUEST.questions.map(tag('quest')),
      },
      {
        id: 'b2-puzzles',
        type: 'puzzles',
        title: 'Головоломки: шкільна майстерня',
        description:
          'П’ять головоломок: судоку від ведучого з дванадцятьма підказками, кросворд, де бали дають лише за весь розв’язок, «Пам’ять» зі знаменитими картинами та два пазли — детективний і кіношний.',
        questions: puzzles(photos).map(tag('puzzle')),
      },
      {
        id: 'b2-ladder',
        type: 'ladder',
        title: 'Мільйонер: кіно й музика 90-х',
        description:
          'Учасника вибирає жереб. Дванадцять сходинок від 100 до 10 000 — і без таймера: думайте скільки треба. Сходинки 750 і 3500 неспалимі, на допомогу — «50 на 50» і підказка зали.',
        shuffleOptions: true,
        pick: 'random',
        timer: false,
        levels: [100, 200, 300, 500, 750, 1000, 1500, 2500, 3500, 5000, 7500, 10000],
        safe: [4, 8],
        lifelines: ['fifty', 'audience'],
        questions: LADDER.map(tag('ladder')),
      },
      {
        id: 'b2-final',
        type: 'final',
        title: 'Фінал: дощова ніч',
        description:
          'Остання справа «знайди вбивцю». Спершу таємна ставка. Хто помилився чи не відповів, віддає ставку в спільний банк; хто відповів правильно, зберігає свою й ділить банк пропорційно ставкам.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'bank',
        questions: [tag('final')(FINAL)],
      },
    ],
    duels: { categories: duels, questionsPerDuel: 3, timeLimit: 30, stake: 300, betStake: 200 },
  };
};
