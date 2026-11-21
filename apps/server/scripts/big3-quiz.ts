import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import type { Photos } from './big3/kit';
import { CINEMA, CLOUD, LESSON, VOTES } from './big3/open';
import { FINAL, WIPEOUT, puzzles } from './big3/rest';
import { AUCTION, BLITZ, QUEST, SURVIVAL } from './big3/rounds';

export { BIG3_FILES, BIG3_PHOTOS } from './big3/rest';

/**
 * «Велика гра ІІІ: кінозал і зимова справа» — третя з трьох великих сімейних вікторин (big1–big3), що разом покривають
 * усі типи раундів і запитань (матриця — .superpowers/quizzes/coverage.md). Теми власника: шкільна програма, логіка й загадки,
 * детективи, «дибільні» запитання, кіно й музика 1990–2000 (лише світові хіти).
 * Кожен грає сам за себе (без команд; «Шпигун» — у big1). Раунди: класика ×3, аукціон, бліц із ручною перевіркою,
 * «Вибування» з дверима удачі, квест із бафом у нагороду, головоломки, «Ва-банк», фінал.
 * Інтерактивне: відео за фрагментами, блеф, опитування, «хмара слів» і «100 до 1» з неї (рішення власника 2026-11-19: лише тут, по одному),
 * «Думай як усі», «Більше чи менше», «Вгадай слово», список на час, «Знайди відмінності», «Пам’ять», судоку, кросворд, торг аукціону.
 * Навчальне: шкільна розминка, «Ва-банк» зі шкільної програми, логіка «Вибування», детективні справи аукціону й фіналу.
 * Гратиме автопілот без ведучого: блокувань немає; єдина зміна — бліц із ручною перевіркою, яку автопілот оцінює за ключем
 * (кнопка, черга й спроби лишаються). Бафа «Підказка ведучого» немає. Таймери — від 25 с. Жодного запитання про росію.
 * photos — ключ BIG3_PHOTOS чи BIG3_FILES → адреса картинки на сайті (обидві картинки «Знайди відмінності»).
 */
export const big3Quiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `b3-${theme}-${++k}` });
  // «100 до 1» бере дошку з «хмари слів» цього ж раунду: cloudId — її id після нумерації.
  const votes = VOTES().map(tag('votes'));
  const cloudId = votes.find((q) => q.type === 'wordcloud' && q.text === CLOUD.text)!.id;
  const voteQuestions = votes.map((q) => (q.type === 'survey' ? { ...q, cloudId } : q));

  return {
    title: 'Велика гра ІІІ: кінозал і зимова справа',
    description:
      'Кожен сам за себе: шкільна програма, загадки, детективні справи, дибільні запитання й кіно 1990-х — з відео за фрагментами, опитуванням і хмарою слів, аукціоном, бліцом, дверима удачі, квестом, відмінностями на старовинній картині й фіналом.',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      family: true,
      buffs: BUFF_KINDS.filter((b) => b !== 'hint' && b !== 'swap'),
      debuffs: [...DEBUFF_KINDS],
      debuffPrices: { shake: 250, fog: 200, freeze: 300, mirror: 350, guests: 150, mud: 200, flip: 250, torch: 300, sticky: 200, noclock: 250, bubbles: 200 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 'b3-lesson',
        type: 'classic',
        title: 'Перший урок: розминка',
        description:
          'Чотирнадцять запитань зі шкільної програми, логіки, детективів і кіно 90-х: варіанти, так чи ні, числа, порядок, пари, повзунок і сортування. Швидкі правильні відповіді дають бонус, за частково правильний порядок чи пари — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: LESSON.map(tag('lesson')),
      },
      {
        id: 'b3-cinema',
        type: 'classic',
        title: 'Кінозал 90-х: кадр за кадром',
        description:
          'Шість трейлерів без звуку: відкривайте шматочки по 1, 2, 4, 8 і 16 секунд і впізнавайте фільм якомога раніше — що коротший шматок, то більше балів. Потім два блефи: допишіть вигадку, що обдурить суперників, і знайдіть правду.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: CINEMA.map(tag('cinema')),
      },
      {
        id: 'b3-votes',
        type: 'classic',
        title: 'Голос зали',
        description:
          'Спершу без балів: опитування й хмара слів про шкільні роки. Потім «100 до 1», де дошку складають ваші ж відповіді з хмари, «Думай як усі», «Більше чи менше», «Вгадай слово» і список «Оскарів» на час.',
        speedBonus: false,
        shuffleOptions: false,
        rules: DEFAULT_RULES,
        questions: voteQuestions,
      },
      {
        id: 'b3-auction',
        type: 'auction',
        title: 'Аукціон: детективні справи',
        description:
          'Перед кожною справою видно лише її назву. Торгуйтеся вільною ставкою: хто дав найбільше, той і відповідає. Ставку переможець платить, правильна відповідь приносить ціну запитання, помилка забирає ще й ціну. Якщо ніхто не торгувався — відповідають усі.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'free',
        bidStep: 100,
        loss: 'bid_price',
        questions: AUCTION.map(tag('auction')).map((q, i) => ({ ...q, points: q.type === 'sort' ? 100 : 300 + 100 * i })),
      },
      {
        id: 'b3-blitz',
        type: 'blitz',
        title: 'Бліц: дибільні запитання',
        description:
          'Чотирнадцять запитань із підступом. Тисніть «Відповісти» першими: на відповідь 15 секунд і одна спроба. Відповіді перевіряє ведучий, а без ведучого — автопілот за ключем.',
        shuffleOptions: true,
        answerWindow: 15,
        attempts: 1,
        check: 'manual',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'b3-survival',
        type: 'survival',
        title: 'Вибування: двері удачі',
        description:
          'Дванадцять задач на логіку. Хто помилився, вибирає одні з трьох дверей: за двома — порятунок, за одними — вибування. Раунд скінчиться, коли лишиться двоє; кожен, хто дожив, отримує 800 балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        questions: SURVIVAL.map(tag('surv')),
        trials: [],
        trial: 'luck',
        survivors: 2,
        bonus: 800,
      },
      {
        id: 'b3-quest',
        type: 'quest',
        title: 'Квест: касета з 90-х',
        description:
          'Над раундом висить загадка — відповідь на неї і є кодом із шести літер. Кожна правильна відповідь про кіно й музику 90-х відкриває одну літеру; код можна вводити будь-коли, спроб три. Перші троє, хто відкриє скриню, отримають ще одне «Подвоєння».',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: QUEST.prompt,
        code: QUEST.code,
        order: [3, 0, 5, 1, 4, 2],
        tries: 3,
        bonus: { kind: 'buff', buff: 'double', first: 3 },
        questions: QUEST.questions.map(tag('quest')),
      },
      {
        id: 'b3-puzzles',
        type: 'puzzles',
        title: 'Головоломки: зимова майстерня',
        description:
          'Чотири головоломки: вісім відмінностей на зимовій картині Аверкампа, складна судоку, шкільний кросворд із ключовим словом і «Пам’ять» про вчених та їхні відкриття. Хто швидший, отримує більше.',
        questions: puzzles(photos).map(tag('puzzle')),
      },
      {
        id: 'b3-wipeout',
        type: 'wipeout',
        title: 'Ва-банк: шкільна програма',
        description:
          'Вісім запитань від 100 до 1500 балів. Кожна правильна відповідь додає ціну в банк, помилка спалює весь банк. Після кожної правильної вирішуйте: ризикувати далі чи забрати банк.',
        shuffleOptions: true,
        questions: WIPEOUT.map(tag('wipeout')),
      },
      {
        id: 'b3-final',
        type: 'final',
        title: 'Фінал: різдвяний ранок',
        description: 'Остання справа для всіх. Спершу таємно ставите частину балів, потім відповідаєте: правильно — ставка додається, помилилися — віднімається.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
  };
};
