import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { BOARD } from './big1/board';
import type { Slot } from './big1/kit';
import { GAMES, WARMUP } from './big1/open';
import { FINAL, LADDER, PUZZLES, SPARES, THINK, TRUTH_FAKES, WIPEOUT } from './big1/rest';
import { WORDS } from './big1/words';

/**
 * «Велика гра І: дзвоник, детектив і дурнички» — перша з трьох великих сімейних вікторин (big1–big3), що разом покривають
 * усі типи раундів і запитань (матриця — .superpowers/quizzes/coverage.md). Теми власника: шкільна програма, логіка й загадки,
 * детективи, «дибільні» запитання, кіно й музика 1990–2000. Гратиме автопілот без ведучого: перевірка за ключем,
 * «Мільйонер» вибирає учасника з найменшими балами, у «Думай інакше» слова ведучого заготовлено.
 * Інтерактивне: шпигун, «Думай як усі», малюнок, «Думай інакше», «Правда про гравця», «Вгадай слово», ланцюжки й драбини, пам'ять.
 * Навчальне: шкільна програма, логіка, детективна дедукція. Таймери — від 25 секунд. Без опитувань гравців і без «100 до 1».
 * «Шпигун» не працює в командній грі, тож команд немає. Жодного запитання, пов'язаного з росією.
 */
export const big1Quiz = (): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `b1-${theme}-${++k}` });

  const category = (key: keyof typeof BOARD, title: string) => {
    const slot: Slot = BOARD[key];
    const t = tag(key);
    return {
      id: `b1c-${key}`,
      title,
      cells: scatter(`big1-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
      spares: [t(slot.spare)],
    };
  };

  return {
    title: 'Велика гра І: дзвоник, детектив і дурнички',
    description:
      'Шкільна програма, логіка, детективні справи, дибільні запитання й найвідоміші фільми та хіти 1990–2000 — і ігри: шпигун, «Думай як усі», малюнок, «Думай інакше», правда про гравця й «Мільйонер».',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      family: true,
      buffs: BUFF_KINDS.filter((b) => b !== 'hint'),
      debuffs: [...DEBUFF_KINDS],
      debuffPrices: { shake: 150, fog: 250, freeze: 400, mirror: 300, guests: 250, mud: 200, flip: 300, torch: 250, sticky: 200, noclock: 350, bubbles: 200 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 'b1-warmup',
        type: 'classic',
        title: 'Перший дзвоник: розминка',
        description:
          'Тринадцять запитань усіх простих видів: школа, логіка, детективи, кіно 1990-х і трохи дибільного. Є «Хто я?», де підказки відкриваєте самі, сортування й точка на мапі. Швидкі правильні відповіді дають бонус; за частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: WARMUP.map(tag('warm')),
      },
      {
        id: 'b1-games',
        type: 'classic',
        title: 'Велика перерва: шпигун, «як усі» й малюнок',
        description:
          'У «Шпигуні» всі бачать одне слово, а шпигун — лише підказку: напишіть асоціацію й голосуйте, хто шпигун. У «Думай як усі» бали отримує найбільша група однакових відповідей. У «Малюнку» один малює, решта вгадує.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: GAMES.map(tag('play')),
      },
      {
        id: 'b1-board',
        type: 'board',
        title: 'Велике поле',
        description:
          'П’ять тем по п’ять клітинок від 100 до 500: що дорожча — то складніше. Десь сховалися клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('school', 'Шкільна програма'),
          category('logic', 'Логіка й загадки'),
          category('detect', 'Детективи'),
          category('silly', 'Дибільні запитання'),
          category('screen', 'Кіно й музика 90-х'),
        ],
      },
      {
        id: 'b1-words',
        type: 'classic',
        title: 'Слова й числа',
        description:
          'Ланцюжки асоціацій, словесні драбини, «Вгадай слово» за шість спроб, «Більше чи менше» з кроком балів, «Не перебільш» — більше за правильне дає нуль, — «Слова з літер» і список планет на час. Швидкість тут не рахується, рахується точність.',
        speedBonus: false,
        shuffleOptions: false,
        rules: rules({ partial: 50 }),
        questions: WORDS.map(tag('word')),
      },
      {
        id: 'b1-puzzles',
        type: 'puzzles',
        title: 'Головоломки: судоку, кросворд і пам’ять',
        description:
          'Три головоломки по черзі: судоку 6×6, детективний кросворд із ключовим словом у виділених клітинках і «Пам’ять» — пари героїв і фільмів 1990-х. Бали — тим, хто встигне; у «Пам’яті» найшвидший отримує найбільше.',
        questions: PUZZLES.map(tag('puzzle')),
      },
      {
        id: 'b1-think',
        type: 'think',
        title: 'Думай інакше',
        description:
          'У кожного три життя. Ведучий заготовив три найочевидніші слова на тему — не пишіть їх! Збіглися з ведучим, написали не на тему чи не встигли — мінус життя. Хто протримається найдовше, отримає найбільше.',
        lives: 3,
        points: 5000,
        questions: THINK.map(tag('think')),
      },
      {
        id: 'b1-wipeout',
        type: 'wipeout',
        title: 'Ва-банк: логіка й загадки',
        description:
          'Кожна правильна відповідь додає ціну запитання в банк, а помилка спалює все накопичене. Запитання дорожчають від 100 до 1500. Після кожної правильної — «Далі» чи «Забрати».',
        shuffleOptions: true,
        questions: WIPEOUT.map(tag('wipe')),
      },
      {
        id: 'b1-truth',
        type: 'truth',
        title: 'Правда про гравця',
        description:
          'У лобі кожен написав про себе маловідомий факт, а ведучий підмішав кілька вигадок. Вгадайте, хто з гравців це написав — або що це вигадка. Бали отримують ті, хто вгадав, а автор — за кожного, кого факт збив з пантелику.',
        points: 500,
        timeLimit: 30,
        fakes: TRUTH_FAKES,
      },
      {
        id: 'b1-ladder',
        type: 'ladder',
        title: 'Мільйонер: від казки до «Оскара»',
        description:
          'Гравець із найменшими балами проходить десять сходинок від 100 до 10 000. На кожній — чотири варіанти, і що вище, то складніше. Сходинки 750 і 3000 неспалимі, а на допомогу є «50 на 50», зала й підказка ведучого.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 250, 500, 750, 1000, 2000, 3000, 5000, 7500, 10000],
        safe: [3, 6],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: LADDER.map(tag('ladder')),
      },
      {
        id: 'b1-final',
        type: 'final',
        title: 'Фінал: хто винен?',
        description: 'Остання детективна справа для всіх. Спершу таємно ставите частину балів, потім відповідаєте: правильно — ставка додається, помилилися — віднімається.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
    // Запасні для бафу «Заміна запитання»: лише прості типи, без медіа.
    spares: SPARES.map(tag('spare')),
  };
};
