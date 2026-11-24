import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { board, type BoardKey } from './screen/board';
import type { Photos, Slot } from './screen/kit';
import { cinema, warmup } from './screen/open';
import { AUCTION, BLITZ, FINAL, LADDER, QUEST, SPARES, WIPEOUT, puzzles } from './screen/rounds';

/**
 * Картинки сіда `screen`: ключ → «File:…» з Wikimedia Commons (сід вантажить мініатюри 1280 px через wideSources, потрібен SITE_URL).
 * Кожен файл перевірено через API Commons 2026-11-24 (існує, вільна ліцензія — у коментарі). Кадрів і постерів із фільмів немає.
 */
export const SCREEN_PHOTOS: Record<string, string> = {
  // Будинок «Сам удома», 671 Lincoln Avenue, Віннетка, Іллінойс (CC BY-SA 2.0).
  homealone: 'File:Home Alone house -01- (9807303934).jpg',
  // Кетрін О’Гара на Венеційському кінофестивалі (CC BY-SA 4.0).
  ohara: "File:Catherine O'Hara-63919 (cropped 2).jpg",
  // Деніел Стерн, 2014 (CC BY 2.0).
  stern: 'File:Daniel Stern July 9, 2014 (cropped).jpg',
  // Готель The Plaza, Нью-Йорк, січень 2016 (CC BY-SA 4.0).
  plaza: 'File:Plaza Hotel New York January 2016.jpg',
  // Замок Закрайсвіття з атракціоном Shrek 4-D Adventure, Universal Studios Сінгапур (CC0).
  shrekcastle: 'File:Shrek castle.jpg',
  // Ліза Кудроу на TIFF 2009 (CC BY-SA 2.0).
  kudrow: 'File:Lisa Kudrow at TIFF 2009.jpg',
  // Будинок «Друзів» на розі Бедфорд-стрит і Ґров-стрит, Нью-Йорк (CC BY 2.0).
  friendsbldg: 'File:NYC Friends Apartment Building (22499701821).jpg',
  // Г’ю Лорі, Роберт Шон Леонард і Ліза Едельштейн на заході серіалу в Paley Center, 2009 (CC BY-SA 2.0).
  laurie: 'File:Hugh Laurie 2009 crop.jpg',
  leonard: 'File:Robert Sean Leonard 2009.jpg',
  edelstein: 'File:Lisa Edelstein 2009.jpg',
  // Frist Campus Center, Принстонський університет — зовнішні кадри лікарні Принстон-Плейнсборо (CC BY 4.0).
  frist: 'File:Frist Campus Center - Princeton University (55144842279).jpg',
  // 4354 Wisteria Lane — дім Брі на Colonial Street, Universal Studios Hollywood (CC BY-SA 4.0).
  bree: 'File:Universal Studios Hollywood 4354 Wisteria Lane - Bree Van de Kamp.jpg',
  // Сквер з альтанками на Вістерія-лейн, Universal Studios Hollywood, 2008 (CC BY 2.0).
  wisteria: 'File:Wisteria Lane (2562051552).jpg',
  // Акторки-варіанти «Хто зіграв Лінетт Скаво?»: Фелісіті Гаффман (CC BY 2.0), Марсія Кросс (CC BY 3.0), Тері Гетчер (CC BY-SA 3.0), Єва Лонгорія (CC BY-SA 3.0).
  huffman: 'File:Felicity Huffman (3537158531).jpg',
  cross: 'File:MarciaCrossApr08.jpg',
  hatcher: 'File:Teri Hatcher by Gage Skidmore.jpg',
  longoria: 'File:Eva Longoria Cannes 2015.jpg',
};

/**
 * «Болото, Мангеттен і Вістерія-лейн: велика вікторина кіно й серіалів» (сід `screen`): усі фільми «Шрека» (і трохи «Кота в чоботях»),
 * усі фільми «Сам удома» (1990–2021), серіали «Друзі», «Доктор Хаус» і «Відчайдушні домогосподарки» — приблизно порівну.
 * Десять раундів (ліміт LIMITS.maxRounds): розминка, поле 8×5, кінозал, «Мільйонер», бліц, «Ва-банк», аукціон, квест,
 * головоломки й фінал. Кожен грає сам за себе. Складність — від розминки до найважчого; ціни ростуть зі складністю.
 * Таймери — від 25 с. Без опитувань гравців, хмар слів і «100 до 1». Жодного запитання, пов'язаного з росією.
 * Імена — як в українському дубляжі й звичному українському вжитку (Віслюк, Закрайсвіття, Прекрасний Принц), з англійськими варіантами відповіді.
 * photos — ключ SCREEN_PHOTOS → адреса картинки на сайті.
 */
export const screenQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `sc-${theme}-${++k}` });

  const slots = board(photos);
  const category = (key: BoardKey, title: string) => {
    const slot: Slot = slots[key];
    const t = tag(key);
    return {
      id: `scc-${key}`,
      title,
      cells: scatter(`screen-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
      spares: [t(slot.spare)],
    };
  };

  return {
    title: 'Болото, Мангеттен і Вістерія-лейн: велика вікторина кіно й серіалів',
    description: '«Шрек», «Сам удома», «Друзі», «Доктор Хаус» і «Відчайдушні домогосподарки»: від простих розминок до найважчих загадок, з трейлерами, піснями й картинками.',
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
        id: 'sc-warmup',
        type: 'classic',
        title: 'Перша серія: розминка',
        description:
          'Сімнадцять запитань для розгону — від простих до середніх, з усіх п’яти історій. Варіанти, так чи ні, числа, порядок прем’єр, пари «персонаж — актор», сортування героїв, повзунок, точка на мапі, ланцюжок, слова з літер і «Вгадай слово». Швидкі правильні відповіді дають бонус, за частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: warmup(photos).map(tag('warm')),
      },
      {
        id: 'sc-board',
        type: 'board',
        title: 'Велике поле: п’ять екранів',
        description:
          'Вісім тем по п’ять клітинок від 100 до 500: що дорожча клітинка — то складніше. Серед звичайних запитань ховаються «Хто я?», стіна з чотирьох груп прізвищ, список лікарів на час і «Більше чи менше». Десь є клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('swamp', 'Болото й Дюлок'),
          category('faraway', 'Шрек: продовження'),
          category('mccallister', 'Сам удома'),
          category('perk', 'Шестеро друзів'),
          category('episodes', 'Друзі: та серія, де…'),
          category('ppth', 'Принстон-Плейнсборо'),
          category('wisteria', 'Вістерія-лейн'),
          category('backstage', 'За кадром'),
        ],
      },
      {
        id: 'sc-cinema',
        type: 'classic',
        title: 'Кінозал і звукова доріжка',
        description:
          'Чотири трейлери без звуку відкриваються шматочками по 1, 2, 4, 8 і 16 секунд — впізнайте фільм якомога раніше. Дві мелодії так само звучать шматочками, ще шість пісень і заставок звучать уривками. Далі картинки, що поступово проявляються, обличчя акторів, малюнок і два блефи: допишіть вигадку, що обдурить суперників, і знайдіть правду. За частково правильну відповідь — половина балів.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        // Ціни ростуть зі складністю: від найлегшого до найважчого.
        questions: [...cinema(photos)].sort((a, b) => a.points - b.points).map(tag('cinema')),
      },
      {
        id: 'sc-ladder',
        type: 'ladder',
        title: 'Мільйонер: дванадцять сходинок',
        description:
          'Гравець із найменшими балами проходить дванадцять сходинок від 100 до 10 000. На кожній — чотири варіанти, і що вище, то складніше: від прохання Кевіна до Санти до назви містечка з Вістерія-лейн. Сходинки 1000 і 4000 неспалимі, а на допомогу є «50 на 50», зала й підказка.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 200, 300, 500, 1000, 1500, 2000, 3000, 4000, 5000, 7500, 10000],
        safe: [4, 8],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: LADDER.map(tag('ladder')),
      },
      {
        id: 'sc-blitz',
        type: 'blitz',
        title: 'Бліц: хто швидший',
        description:
          'Дванадцять коротких запитань про всі п’ять історій. Тисніть «Відповісти» першими: на відповідь 25 секунд і одна спроба. Бали отримує перший, хто відповів правильно.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 1,
        check: 'auto',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'sc-wipeout',
        type: 'wipeout',
        title: 'Ва-банк: від 100 до 1500',
        description:
          'Вісім запитань, і кожне дорожче й складніше за попереднє: від 100 до 1500 балів. Правильна відповідь додає ціну в банк, помилка спалює весь банк. Після кожної правильної вирішуйте: ризикувати далі чи забрати банк.',
        shuffleOptions: true,
        questions: WIPEOUT.map(tag('wipeout')),
      },
      {
        id: 'sc-auction',
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
        id: 'sc-quest',
        type: 'quest',
        title: 'Квест: загадковий діагноз',
        description:
          'Над раундом висить загадка, і відповідь на неї — код із шести літер. Кожна правильна відповідь відкриває одну літеру коду; ввести код можна будь-коли, спроб три. Перші троє, хто розгадає діагноз, отримають ще одне «Подвоєння».',
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
        id: 'sc-puzzles',
        type: 'puzzles',
        title: 'Головоломки: перерва на каву',
        description:
          'Чотири головоломки по черзі: кросворд п’яти екранів із ключовим словом, «Пам’ять» про акторів, пазл із Вістерія-лейн і складна судоку. Хто швидше розв’яже, отримає більше.',
        questions: puzzles(photos).map(tag('puzzle')),
      },
      {
        id: 'sc-final',
        type: 'final',
        title: 'Фінал: остання серія',
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
