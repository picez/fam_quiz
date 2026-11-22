import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { board, type BoardKey } from './fantasy/board';
import type { Photos, Slot } from './fantasy/kit';
import { cinema, warmup } from './fantasy/open';
import { AUCTION, BLITZ, FINAL, LADDER, QUEST, SPARES, WIPEOUT, puzzles } from './fantasy/rounds';

/**
 * Картинки сіда `fantasy`: ключ → «File:…» з Wikimedia Commons (сід вантажить мініатюри 1280 px через wideSources, потрібен SITE_URL).
 * Кожен файл перевірено через API Commons 2026-11-22 (існує, вільна ліцензія).
 */
export const FANTASY_PHOTOS: Record<string, string> = {
  // Віадук Ґленфіннан із паротягом «Jacobite» (CC BY-SA 4.0).
  glenfinnan: 'File:Glenfinnan Viaduct - Jacobite Express.jpg',
  // Мандрагора з «Tacuinum Sanitatis», XIV ст. (суспільне надбання).
  mandrake: 'File:Mandragora Tacuinum Sanitatis.jpg',
  // Leadenhall Market, Лондон (CC BY 2.5).
  leadenhall: 'File:Leadenhall_Market_In_London_-_Feb_2006_rotated.jpg',
  // Дж. Р. Р. Толкін, близько 1925 (суспільне надбання).
  tolkien: 'File:J._R._R._Tolkien,_ca._1925.jpg',
  // Актори-варіанти «Хто зіграв Сіріуса Блека?»: Ґері Олдман, Девід Тьюліс, Джейсон Айзекс, Рейф Файнс.
  oldman: 'File:Gary_Oldman_(13925515511)_(cropped).jpg',
  thewlis: 'File:David_Thewlis_at_Avatar_fire_and_ash_premiere_London_2025.jpg',
  isaacs: 'File:Jason_Isaacs-45_(cropped).jpg',
  fiennes: 'File:ConclaveBFILFF101024_(16_of_44)_(54062064271)_(cropped).jpg',
  // Алан Рікман (CC BY 2.0).
  rickman: 'File:Alan_Rickman_after_Seminar_(3).jpg',
  // Нґауруґое й Руапегу з вершини Тонґаріро (CC BY 3.0).
  ngauruhoe: 'File:Le_Ngauruhoe_et_le_Ruapehu_vus_du_sommet_du_Tongariro.jpg',
  // Нора Більбо на знімальному майданчику Гобітона, Матамата (CC BY-SA 2.0).
  bagend: 'File:Bag End -- Hobbiton Movie Set, Matamata, New Zealand 2016 (50797313181).jpg',
};

/**
 * «Гоґвортс і Середзем’я: велика фентезі-вікторина» (сід `fantasy`): книжки й фільми про Гаррі Поттера, кінотрилогії
 * «Володар перснів» і «Гобіт» (книжкові факти Середзем’я — там, де їх показано в кіно чи прямо сказано в книжках).
 * Десять раундів (ліміт LIMITS.maxRounds): розминка, поле 8×5, кінозал, «Мільйонер», бліц, «Ва-банк», аукціон, квест,
 * головоломки й фінал. Кожен грає сам за себе. Складність — від розминки до найважчого; ціни ростуть зі складністю.
 * Таймери — від 25 с. Без опитувань гравців, хмар слів і «100 до 1». Жодного запитання, пов'язаного з росією.
 * Назви й імена — як в українських перекладах (Гаррі Поттер — «А-ба-ба-га-ла-ма-га», переклад Віктора Морозова), з англійськими варіантами відповіді.
 * photos — ключ FANTASY_PHOTOS → адреса картинки на сайті.
 */
export const fantasyQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `fy-${theme}-${++k}` });

  const slots = board(photos);
  const category = (key: BoardKey, title: string) => {
    const slot: Slot = slots[key];
    const t = tag(key);
    return {
      id: `fyc-${key}`,
      title,
      cells: scatter(`fantasy-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
      spares: [t(slot.spare)],
    };
  };

  return {
    title: 'Гоґвортс і Середзем’я: велика фентезі-вікторина',
    description: 'Гаррі Поттер, «Володар перснів» і «Гобіт» — книжки й фільми: від першого курсу до найважчих загадок, з трейлерами, піснями й картинками.',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      buffs: [...BUFF_KINDS],
      debuffs: [...DEBUFF_KINDS],
      debuffPrices: { shake: 200, fog: 250, freeze: 350, mirror: 300, guests: 200, mud: 200, flip: 250, torch: 300, sticky: 200, noclock: 300, bubbles: 200 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 'fy-warmup',
        type: 'classic',
        title: 'Перший курс: розминка',
        description:
          'Шістнадцять запитань для розгону — від простих до середніх. Варіанти, так чи ні, числа, порядок фільмів, пари «персонаж — актор», сортування місць, повзунок, точка на мапі, ланцюжок, слова з літер і «Вгадай слово». Швидкі правильні відповіді дають бонус, за частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: warmup(photos).map(tag('warm')),
      },
      {
        id: 'fy-board',
        type: 'board',
        title: 'Велике поле: Гоґвортс і Середзем’я',
        description:
          'Вісім тем по п’ять клітинок від 100 до 500: що дорожча клітинка — то складніше. Серед звичайних запитань ховаються «Хто я?», стіна з чотирьох груп, список гномів на час і «Більше чи менше». Десь є клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('hogwarts', 'Гоґвортс'),
          category('spells', 'Закляття й зілля'),
          category('beasts', 'Магічні істоти'),
          category('people', 'Герої Поттеріани'),
          category('fellowship', 'Братство Персня'),
          category('hobbit', '«Гобіт»'),
          category('middle', 'Середзем’я'),
          category('screen', 'За кадром'),
        ],
      },
      {
        id: 'fy-cinema',
        type: 'classic',
        title: 'Кінозал і звукова доріжка',
        description:
          'Шість трейлерів без звуку відкриваються шматочками по 1, 2, 4, 8 і 16 секунд — впізнайте фільм якомога раніше. Дві мелодії так само звучать шматочками, ще чотири пісні з титрів звучать уривками. Далі картинки, що поступово проявляються, обличчя акторів, малюнок і два блефи: допишіть вигадку, що обдурить суперників, і знайдіть правду. За частково правильну відповідь — половина балів.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        // Ціни ростуть зі складністю: від найлегшого до найважчого.
        questions: [...cinema(photos)].sort((a, b) => a.points - b.points).map(tag('cinema')),
      },
      {
        id: 'fy-ladder',
        type: 'ladder',
        title: 'Мільйонер: дванадцять сходинок',
        description:
          'Гравець із найменшими балами проходить дванадцять сходинок від 100 до 10 000. На кожній — чотири варіанти, і що вище, то складніше: від квідичу до міста, де народився Толкін. Сходинки 1000 і 4000 неспалимі, а на допомогу є «50 на 50», зала й підказка.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 200, 300, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000],
        safe: [4, 8],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: LADDER.map(tag('ladder')),
      },
      {
        id: 'fy-blitz',
        type: 'blitz',
        title: 'Бліц: хто швидший',
        description:
          'Дванадцять коротких запитань про Гоґвортс і Середзем’я. Тисніть «Відповісти» першими: на відповідь 15 секунд і одна спроба. Бали отримує перший, хто відповів правильно.',
        shuffleOptions: true,
        answerWindow: 15,
        attempts: 1,
        check: 'auto',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'fy-wipeout',
        type: 'wipeout',
        title: 'Ва-банк: від 100 до 1500',
        description:
          'Вісім запитань, і кожне дорожче й складніше за попереднє: від 100 до 1500 балів. Правильна відповідь додає ціну в банк, помилка спалює весь банк. Після кожної правильної вирішуйте: ризикувати далі чи забрати банк.',
        shuffleOptions: true,
        questions: WIPEOUT.map(tag('wipeout')),
      },
      {
        id: 'fy-auction',
        type: 'auction',
        title: 'Аукціон: для справжніх знавців',
        description:
          'Найскладніші запитання вікторини. Перед торгом видно лише тему, і торг іде кроком у 100 балів. Відповідає тільки той, хто дав найбільшу ставку: правильно — повертає ставку й отримує ціну запитання, помилився — втрачає ставку. Якщо ніхто не торгувався, запитання грають усі.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'step',
        bidStep: 100,
        loss: 'bid',
        questions: AUCTION.map(tag('auction')),
      },
      {
        id: 'fy-quest',
        type: 'quest',
        title: 'Квест: скарб Самотньої гори',
        description:
          'Над раундом висить загадка, і відповідь на неї — код із шести літер. Кожна правильна відповідь відкриває одну літеру коду; ввести код можна будь-коли, спроб три. Перші троє, хто відкриє скриню, отримають ще одне «Подвоєння».',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: QUEST.prompt,
        code: QUEST.code,
        order: [2, 5, 0, 3, 1, 4],
        tries: 3,
        bonus: { kind: 'buff', buff: 'double', first: 3 },
        questions: QUEST.questions.map(tag('quest')),
      },
      {
        id: 'fy-puzzles',
        type: 'puzzles',
        title: 'Головоломки: вітальня Рейвенкло',
        description:
          'Чотири головоломки по черзі: чарівний кросворд із ключовим словом, «Пам’ять» про патронусів, пазл із гобітськими норами й складна судоку. Хто швидше розв’яже, отримає більше.',
        questions: puzzles(photos).map(tag('puzzle')),
      },
      {
        id: 'fy-final',
        type: 'final',
        title: 'Фінал: Бузинова паличка',
        description: 'Останнє запитання для всіх. Спершу таємно поставте частину своїх балів, потім відповідайте: правильно — ставка додається, помилилися — віднімається.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
    spares: SPARES.map(tag('spare')),
  };
};
