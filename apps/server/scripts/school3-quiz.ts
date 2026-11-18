import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { BOARD } from './school3/board';
import type { Slot } from './school3/kit';
import { ALIKE, PUZZLES, SPIES, THINK } from './school3/play';
import { AUCTION, BETS, DUELS, FINAL, NO_OVERSHOOT, SCREEN, SPARES, WARMUP } from './school3/rounds';

/**
 * «Великий шкільний марафон ІІІ: нові правила гри» — велика вікторина з ведучим: шкільна програма, логіка, найвідоміше кіно
 * й хіти 1990–2000. Нове: «Шпигун», «Думай як усі», «Не перебільш», «Більше чи менше» з кроком балів, «Відео за фрагментами»,
 * раунд «Думай інакше» й ставки на дуелянтів. Плюс поле з ×2/×3 і бліц-клітинками, мелодії, головоломки, ставки, аукціон і фінал.
 * Таймери — від 25 секунд. Без опитувань гравців і без «100 до 1». Жодного запитання, пов'язаного з росією.
 * «Шпигун» потребує щонайменше трьох гравців і не працює в командній грі, тож команд у вікторині немає.
 */
export const school3Quiz = (): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `s3-${theme}-${++k}` });

  const category = (key: keyof typeof BOARD, title: string) => {
    const slot: Slot = BOARD[key];
    const t = tag(key);
    return {
      id: `s3c-${key}`,
      title,
      cells: scatter(`school3-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
      spares: [t(slot.spare)],
    };
  };

  return {
    title: 'Великий шкільний марафон ІІІ: нові правила гри',
    description:
      'Шкільна програма, логіка й найвідоміші фільми та хіти 1990–2000 — і всі новинки гри: шпигун, «Думай як усі», «Не перебільш», відео шматочками, «Думай інакше» й ставки на дуелі.',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      buffs: [...BUFF_KINDS],
      debuffs: [...DEBUFF_KINDS],
      debuffPrices: { shake: 150, fog: 250, freeze: 400, mirror: 300, guests: 250, mud: 200, flip: 300, torch: 250, sticky: 200, noclock: 350, bubbles: 200 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 's3-warmup',
        type: 'classic',
        title: 'Перший урок: розминка',
        description:
          'Дзвоник! Дванадцять запитань з усієї шкільної програми — математика, фізика, біологія, англійська, література — трохи логіки й кіно. Швидкі правильні відповіді дають бонус; за частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: WARMUP.map(tag('warm')),
      },
      {
        id: 's3-spy',
        type: 'classic',
        title: 'Шпигун у класі й «Думай як усі»',
        description:
          'Нові ігри! У «Шпигуні» всі бачать одне шкільне слово, а один гравець — схоже, але інше: напишіть асоціацію, а потім голосуйте, хто шпигун. У «Думай як усі» пишіть те, що напише більшість: бали отримує найбільша група однакових відповідей.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: [...SPIES.map(tag('spy')), ...ALIKE.map(tag('alike'))],
      },
      {
        id: 's3-board',
        type: 'board',
        title: 'Велике шкільне поле',
        description:
          'Вісім предметів по п’ять клітинок від 100 до 500: що дорожча клітинка — то складніше. Десь сховалися клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('math', 'Математика'),
          category('phys', 'Фізика'),
          category('chem', 'Хімія'),
          category('bio', 'Біологія'),
          category('geo', 'Географія'),
          category('lit', 'Українська література'),
          category('hist', 'Історія України'),
          category('logic', 'Логіка'),
        ],
      },
      {
        id: 's3-screen',
        type: 'classic',
        title: 'Кінозал і хіт-парад 1990–2000',
        description:
          'Найвідоміші фільми й хіти 1990-х. Відео відкривається шматочками по 1, 2, 4, 8 і 16 секунд, мелодія — так само: впізнали раніше — отримали більше. Далі «Більше чи менше» (кожне наступне порівняння дорожче на 50), хіти за роками й режисери. За частково правильні порядок і пари — половина балів.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: SCREEN.map(tag('screen')),
      },
      {
        id: 's3-puzzles',
        type: 'puzzles',
        title: 'Велика перерва: головоломки',
        description:
          'Три головоломки по черзі: судоку 6×6, шкільний кросворд із ключовим словом у виділених клітинках і кросворд про кіно й музику, який треба розгадати повністю. Бали — тим, хто встигне до кінця таймера.',
        questions: PUZZLES.map(tag('puzzle')),
      },
      {
        id: 's3-overshoot',
        type: 'classic',
        title: 'Не перебільш',
        description:
          'Числа зі школи, музики й літератури. Відповідь більша за правильну — нуль балів, а повну ціну отримує найближча відповідь знизу. Наостанок «Більше чи менше», де кожне наступне порівняння дорожче на 100.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: NO_OVERSHOOT.map(tag('over')),
      },
      {
        id: 's3-think',
        type: 'think',
        title: 'Думай інакше',
        description:
          'У кожного три життя. Ведучий загадав три найочевидніші слова на тему — не пишіть їх! Збіглися з ведучим чи не встигли — мінус життя. Хто протримається найдовше, отримає найбільше.',
        lives: 3,
        points: 5000,
        questions: THINK.map(tag('think')),
      },
      {
        id: 's3-bets',
        type: 'bets',
        title: 'Ставки: контрольна робота',
        description:
          'Перед кожним запитанням видно лише його тему. Ставте таємно: від 200 балів, і щоразу мінімум росте на 100, найбільша ставка — 1500. Хто відповів правильно, ділить банк пропорційно ставкам; якщо не вгадав ніхто — ставки повертаються.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 1500,
        questions: BETS.map(tag('bets')),
      },
      {
        id: 's3-auction',
        type: 'auction',
        title: 'Аукціон: хто знає більше?',
        description:
          'Перед кожним запитанням видно лише його тему — і починається відкритий торг кроком у 100 балів. Відповідає тільки той, хто дав найбільшу ставку: правильно — отримує ціну запитання, помилився — втрачає ставку. Якщо ніхто не торгувався, запитання грають усі.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'step',
        bidStep: 100,
        loss: 'bid',
        questions: AUCTION.map(tag('auction')),
      },
      {
        id: 's3-final',
        type: 'final',
        title: 'Фінал: випускний іспит',
        description: 'Останнє запитання для всіх — з історії України. Ставте частину балів таємно й вирішіть, наскільки ви впевнені.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
    // Дуелі зі ставками глядачів (39): інші гравці ставлять 150 балів на одного з дуелянтів.
    duels: {
      questionsPerDuel: 3,
      timeLimit: 30,
      stake: 300,
      betStake: 150,
      categories: DUELS,
    },
    // Запасні для бафу «Заміна запитання»: лише прості типи, без медіа.
    spares: SPARES.map(tag('spare')),
  };
};
