import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { HOL_IMAGES, holidays as holidaySlots } from './fest/holidays';
import { spotdiff, type MegaSlot, type Photos, type ThemeSlots } from './fest/kit';
import { logic as logicSlots } from './fest/logic';
import { MON_IMAGES, money as moneySlots } from './fest/money';
import { MYT_IMAGES, myths as mythSlots } from './fest/myths';
import { PPL_IMAGES, people as peopleSlots } from './fest/people';
import { SPOT_ASPECT, SPOT_SPOTS } from './fest/spot';

/** Картинки з Вікіпедії/Commons: ключ → стаття або «File:…» (сід вантажить їх на сайт). */
export const FEST_IMAGES: Record<string, string> = { ...HOL_IMAGES, ...MON_IMAGES, ...PPL_IMAGES, ...MYT_IMAGES };
/** Власні PNG з fest/img (малює fest/draw.ts). */
export const FEST_FILES = ['spot-a', 'spot-b'] as const;

/** Почергово бере по одному з кожного списку: теми в раунді чергуються. */
const weave = <T>(...lists: T[][]): T[] => {
  const out: T[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};

/** Розсипає extra рівномірно між елементами main (не на початку): логічні задачі між темами. */
const sprinkle = <T>(main: T[], extra: T[]): T[] => {
  const out = [...main];
  extra.forEach((q, i) => out.splice(Math.round(((i + 1) * main.length) / (extra.length + 1)) + i, 0, q));
  return out;
};

/**
 * Бліц без довгих серій: бере твердження в порядку тем, але пропускає те, що дало б четверту однакову відповідь поспіль
 * (тоді береться наступне). Так «правда» й «вигадка» не йдуть шаблоном.
 */
const noRuns = (list: Question[]): Question[] => {
  const left = [...list];
  const out: Question[] = [];
  const value = (q: Question) => (q.type === 'boolean' ? q.correct : null);
  while (left.length > 0) {
    const tail = out.slice(-3).map(value);
    const same = tail.length === 3 && tail.every((v) => v !== null && v === tail[0]);
    const i = same ? left.findIndex((q) => value(q) !== tail[0]) : 0;
    out.push(...left.splice(i === -1 ? 0 : i, 1));
  }
  return out;
};

/**
 * «Великий святковий фестиваль» — величезна вікторина з ведучим на вісім тем власника: свята й традиції світу, гроші,
 * рекорди світу, відомі люди, міфологія, найвідоміші фільми й серіали 1900–2000, уся шкільна програма й традиції України, —
 * і дев'ята, наскрізна: логіка й головоломки (загадки, стіна, ланцюжок, драбини, слова з літер, дві судоку, фінал).
 *
 * Десять раундів (межа LIMITS.maxRounds): два класичні, квест, поле, бліц, «Мільйонер», головоломки, ставки, аукціон і фінал.
 * «Правда про гравця», «Ва-банк» і «Вибування» не вмістилися: кожен із них забрав би або другий класичний раунд (лише там
 * можуть бути мелодії, малюнки, блеф і проявлення картинок — без нього половина типів запитань випала б), або один із раундів,
 * які власник назвав прямо (квест, поле, бліц, «Мільйонер», головоломки, ставки, аукціон, фінал). До того ж «Правда про гравця»
 * будується з фактів самих гравців, а не з запитань автора, тож для готового сіда вона нічого не додає.
 * «100 до 1» немає: лише з реального опублікованого опитування, яке можна перевірити, — такого під ці теми не взято.
 * Без опитувань гравців і «хмар слів». Таймери — від 25 секунд. Жодного запитання, пов'язаного з росією чи радянською добою.
 */
export const festQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `${theme}-${++k}` });
  const hol = holidaySlots(photos);
  const mon = moneySlots(photos);
  const ppl = peopleSlots(photos);
  const myt = mythSlots(photos);
  const lgc = logicSlots();
  const themes: [string, string, ThemeSlots][] = [
    ['world', 'Свята світу', hol.world],
    ['money', 'Гроші', mon.money],
    ['records', 'Рекорди', mon.records],
    ['people', 'Відомі люди', ppl.people],
    ['myths', 'Міфологія', myt.myths],
    ['cinema', 'Кіно до 2000', ppl.cinema],
    ['school', 'Шкільна програма', myt.school],
    ['ukr', 'Традиції України', hol.ukr],
  ];
  const T = Object.fromEntries(themes.map(([key]) => [key, tag(key)])) as Record<string, (q: Question) => Question>;
  const slots = Object.fromEntries(themes.map(([key, , s]) => [key, s])) as Record<string, ThemeSlots>;
  const L = tag('logic');
  const P = tag('puzzle');
  const pick = (key: string, part: 'classic' | 'blitz') => slots[key][part].map(T[key]);

  const category = (key: string, title: string, slot: MegaSlot, t: (q: Question) => Question) => ({
    id: `fs-${key}`,
    title,
    cells: scatter(`fest-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
    spares: [t(slot.spare)],
  });

  // «Мільйонер»: сходинки 1…12 зібрано з усіх тем; кожна — рівно одна.
  const steps = themes.flatMap(([key, , s]) => Object.entries(s.ladder).map(([n, q]) => [Number(n), T[key](q)] as const));
  const ladder = Array.from({ length: 12 }, (_, i) => {
    const found = steps.filter(([n]) => n === i + 1);
    if (found.length !== 1) throw new Error(`fest ladder step ${i + 1}: ${found.length}`);
    return found[0][1];
  });

  return {
    title: 'Великий святковий фестиваль',
    description:
      'Свята й традиції світу та України, гроші, рекорди, відомі люди, міфи, найвідоміше кіно ХХ століття й уся шкільна програма — а між ними загадки й головоломки. Картинки в запитаннях і відповідях, мелодії, малюнки, пазли, судоку, кросворди й усі нові раунди.',
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
        id: 'fs-opening',
        type: 'classic',
        title: 'Відкриття фестивалю: свята, гроші, рекорди й люди',
        description:
          'Розминка на чотири теми — свята світу, гроші, рекорди й відомих людей — і загадки між ними. Картинки у варіантах, точка на мапі, стіна, слова з літер і «Хто я?». Швидкі правильні відповіді дають бонус; за частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: weave(pick('world', 'classic'), pick('money', 'classic'), pick('records', 'classic'), pick('people', 'classic'), lgc.classic1.map(L)),
      },
      {
        id: 'fs-quest',
        type: 'quest',
        title: 'Квест: код від скарбнички',
        description:
          'Над раундом висить головне запитання — відповідь на нього і є кодом скарбнички. Кожна правильна відповідь на звичайне запитання відкриває одну позицію коду. Хто перший введе правильний код, отримує бонус; спроб — три.',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: mon.quest.prompt,
        code: mon.quest.code,
        order: Array.from(mon.quest.code, (_, i) => i),
        tries: 3,
        bonus: { kind: 'points', points: 1500 },
        questions: mon.quest.questions.map(T.money),
      },
      {
        id: 'fs-board',
        type: 'board',
        title: 'Святкове поле',
        description:
          'Вісім тем фестивалю по п’ять клітинок від 100 до 500: що дорожча клітинка — то складніше. Десь сховалися клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: themes.map(([key, title, s]) => category(key, title, s.board, T[key])),
      },
      {
        id: 'fs-stage',
        type: 'classic',
        title: 'Головна сцена: міфи, кіно, школа й Україна',
        description:
          'Друга половина свята: міфи, найвідоміше кіно до 2000 року, шкільна програма й українські традиції — і знову загадки. Мелодії грають просто на ваших телефонах, картинки проявляються, художник малює, а в блефі треба відрізнити правду від вигадок. Швидкі правильні відповіді дають бонус; за частково правильні — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: weave(pick('myths', 'classic'), pick('cinema', 'classic'), pick('school', 'classic'), pick('ukr', 'classic'), lgc.classic2.map(L)),
      },
      {
        id: 'fs-blitz',
        type: 'blitz',
        title: 'Бліц: правда чи вигадка',
        description:
          'Твердження з усіх тем фестивалю — швидко вирішуйте, правда це чи вигадка. Тисніть «Відповісти» — і маєте 25 секунд. Дві спроби на твердження. Кожна наступна правильна відповідь поспіль дає на 50 балів більше, а кожна помилка поспіль — на 50 балів більший мінус.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 2,
        check: 'auto',
        rules: { ...rules({ penalty: 'minus' }), partial: null, streakPlus: { step: 50 }, streakMinus: { step: 50 } },
        questions: noRuns(weave(...themes.map(([key]) => pick(key, 'blitz')), lgc.blitz.map(L))),
      },
      {
        id: 'fs-ladder',
        type: 'ladder',
        title: 'Мільйонер: святкова драбина',
        description:
          'Один гравець проходить дванадцять сходинок через усі теми фестивалю. На кожній — один варіант із чотирьох, і що вище, то складніше й дорожче. Дві сходинки незгорані, а на допомогу є «50/50», зала й підказка ведучого.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7500, 10000],
        safe: [2, 7],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: ladder,
      },
      {
        id: 'fs-puzzles',
        type: 'puzzles',
        title: 'Головоломки: святкова майстерня',
        description:
          'Дев’ять головоломок по черзі: знайдіть відмінності у святковій хаті, складіть два пазли, відкрийте пари в двох «Пам’ятях», розв’яжіть дві судоку й два кросворди — у першому шукайте ключове слово з виділених клітинок, другий розгадайте повністю. У пазлах і відмінностях найшвидший отримує найбільше.',
        questions: [
          P(
            spotdiff(
              'Знайдіть вісім відмінностей між двома картинками святкової хати. Торкайтеся відмінностей на будь-якій із картинок; кілька промахів поспіль ненадовго заморозять екран.',
              photos('spot-a'),
              photos('spot-b'),
              SPOT_ASPECT,
              SPOT_SPOTS,
              800,
              150,
            ),
          ),
          P(hol.jigsaw),
          P(ppl.memory),
          P(lgc.sudokus[0]),
          P(hol.crossword),
          P(mon.jigsaw),
          P(myt.memory),
          P(lgc.sudokus[1]),
          P(myt.crossword),
        ],
      },
      {
        id: 'fs-bets',
        type: 'bets',
        title: 'Ставки: святковий банк',
        description:
          'Перед кожним запитанням видно лише його перші слова — тему. Ставте таємно: від 200 балів, і щоразу мінімум росте на 100, найбільша ставка — 1500. Хто відповів правильно, ділить банк пропорційно ставкам; якщо не вгадав ніхто — ставки повертаються.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 1500,
        questions: sprinkle(themes.map(([key, , s]) => T[key](s.bets)), lgc.bets.map(L)),
      },
      {
        id: 'fs-auction',
        type: 'auction',
        title: 'Аукціон: ярмарок знань',
        description:
          'Перед кожним запитанням видно лише його тему — і починається відкритий торг кроком у 100 балів. Відповідає тільки той, хто дав найбільшу ставку: правильно — отримує ціну запитання, помилився — втрачає ставку. Якщо ніхто не торгувався, запитання грають усі.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'step',
        bidStep: 100,
        loss: 'bid',
        questions: sprinkle(themes.map(([key, , s]) => T[key](s.auction)), lgc.auction.map(L)),
      },
      {
        id: 'fs-final',
        type: 'final',
        title: 'Фінал: остання загадка свята',
        description: 'Останнє запитання для всіх — логічна задача. Ставте частину балів таємно й вирішіть, наскільки ви впевнені.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [L(lgc.final)],
      },
    ],
    duels: {
      questionsPerDuel: 3,
      timeLimit: 30,
      stake: 300,
      categories: [mon.duel, ppl.duel, myt.duel],
    },
    // Запасні для бафу «Заміна запитання»: по одному на тему, лише прості типи, без медіа.
    spares: [...themes.map(([key, , s]) => T[key](s.spare)), L(lgc.spare)],
  };
};
