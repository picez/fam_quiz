import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { CINEMA_IMAGES, cinema as cinemaSlots } from './mega/cinema';
import { HUM_IMAGES, hum as humSlots } from './mega/hum';
import { spotdiff, type MegaSlot, type Photos } from './mega/kit';
import { logic as logicSlots } from './mega/logic';
import { SCI_IMAGES, sci as sciSlots } from './mega/sci';
import { SPOT_ASPECT, SPOT_SPOTS } from './mega/spot';
import { WORLD_IMAGES, world as worldSlots } from './mega/world';

/** Картинки з Вікіпедії/Commons: ключ → стаття або «File:…» (сід вантажить їх на сайт). */
export const MEGA_IMAGES: Record<string, string> = { ...SCI_IMAGES, ...HUM_IMAGES, ...WORLD_IMAGES, ...CINEMA_IMAGES };
/** Власні PNG з mega/img (малює mega/draw.ts). */
export const MEGA_FILES = ['spot-a', 'spot-b'] as const;

/** Почергово бере по одному з кожного списку: теми в раунді чергуються. */
const weave = <T>(...lists: T[][]): T[] => {
  const out: T[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};

/**
 * «Великий шкільний марафон» — величезна вікторина з ведучим: уся шкільна програма (математика, фізика, хімія, біологія,
 * література, мови, історія, географія), найвідоміше кіно 1990–2020 і логічні загадки.
 * Усі типи раундів, що вміщаються в 10, і майже всі типи запитань (без опитувань гравців і без «100 до 1»).
 * Таймери — від 25 секунд. Жодного запитання, пов'язаного з росією.
 */
export const megaQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `${theme}-${++k}` });
  const sci = sciSlots(photos);
  const hum = humSlots(photos);
  const world = worldSlots(photos);
  const cinema = cinemaSlots(photos);
  const logic = logicSlots();
  const S = tag('sci');
  const H = tag('hum');
  const W = tag('world');
  const C = tag('cine');
  const L = tag('logic');

  const category = (key: string, title: string, slot: MegaSlot, t: (q: Question) => Question) => ({
    id: `mg-${key}`,
    title,
    cells: scatter(`mega-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
    spares: [t(slot.spare)],
  });

  return {
    title: 'Великий шкільний марафон',
    description:
      'Уся шкільна програма — від теореми Піфагора до періодичної таблиці, — найвідоміше кіно 1990–2020 і логічні загадки. Картинки в запитаннях і відповідях, мелодії, пазли, кросворди й усі нові раунди.',
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
        id: 'mg-lesson',
        type: 'classic',
        title: 'Урок перший: дзвоник на всі предмети',
        description:
          'Розминка по всій шкільній програмі: точні науки, природа, мови й література, історія й географія — і трохи логіки. Картинки у варіантах, точки на мапі, список на час, слова з літер, стіна й ланцюжок. Швидкі правильні відповіді дають бонус; за частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: weave(sci.lesson.map(S), hum.lesson.map(H), world.lesson.map(W), logic.lesson.map(L)),
      },
      {
        id: 'mg-quest',
        type: 'quest',
        title: 'Квест: шифр від сейфа вчительської',
        description:
          'Над раундом висить головне запитання — відповідь на нього і є кодом сейфа. Кожна правильна відповідь на звичайне запитання відкриває одну цифру коду. Хто перший введе правильний код, отримує бонус; спроб — три.',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: sci.quest.prompt,
        code: sci.quest.code,
        order: Array.from(sci.quest.code, (_, i) => i),
        tries: 3,
        bonus: { kind: 'points', points: 1500 },
        questions: sci.quest.questions.map(S),
      },
      {
        id: 'mg-board',
        type: 'board',
        title: 'Велике шкільне поле',
        description:
          'Вісім предметів по п’ять клітинок від 100 до 500: що дорожча клітинка — то складніше. Десь сховалися клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('math', 'Математика', sci.board.math, S),
          category('phys', 'Фізика', sci.board.phys, S),
          category('chem', 'Хімія', sci.board.chem, S),
          category('bio', 'Біологія', hum.board.bio, H),
          category('lit', 'Література', hum.board.lit, H),
          category('hist', 'Історія', world.board.hist, W),
          category('geo', 'Географія', world.board.geo, W),
          category('logic', 'Логіка', logic.board.logic, L),
        ],
      },
      {
        id: 'mg-cinema',
        type: 'classic',
        title: 'Кінозал: 1990–2020',
        description:
          'Найвідоміше кіно, яке бачив майже кожен. Вгадуйте мелодії — вони грають просто на ваших телефонах, — впізнавайте акторів на фото, малюйте, порівнюйте касові збори й розставляйте фільми за роками. Швидкі правильні відповіді дають бонус; за частково правильні — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: cinema.round.map(C),
      },
      {
        id: 'mg-blitz',
        type: 'blitz',
        title: 'Бліц: правда чи вигадка',
        description:
          'Шістнадцять тверджень з усіх предметів, кіно й логіки — швидко вирішуйте, правда це чи вигадка. Тисніть «Відповісти» — і маєте 25 секунд. Дві спроби на твердження. Кожна наступна правильна відповідь поспіль дає на 50 балів більше, а кожна помилка поспіль — на 50 балів більший мінус.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 2,
        check: 'auto',
        rules: { ...rules({ penalty: 'minus' }), partial: null, streakPlus: { step: 50 }, streakMinus: { step: 50 } },
        questions: weave(sci.blitz.map(S), hum.blitz.map(H), world.blitz.map(W), [...cinema.blitz.map(C), ...logic.blitz.map(L)]),
      },
      {
        id: 'mg-ladder',
        type: 'ladder',
        title: 'Мільйонер: дванадцять класів',
        description:
          'Один гравець проходить дванадцять сходинок — від першого класу до випускного. На кожній — один варіант із чотирьох, і що вище, то складніше й дорожче. Дві сходинки незгорані, а на допомогу є «50/50», зала й підказка ведучого.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7500, 10000],
        safe: [2, 7],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: hum.ladder.map(H),
      },
      {
        id: 'mg-puzzles',
        type: 'puzzles',
        title: 'Головоломки: велика перерва',
        description:
          'Шість головоломок по черзі: знайдіть відмінності в шкільному класі, складіть пазл із фото, відкрийте пари в «Пам’яті», розв’яжіть судоку й два кросворди — у першому шукайте ключове слово з виділених клітинок, другий розгадайте повністю. У пазлі й відмінностях найшвидший отримує найбільше.',
        questions: [
          tag('spot')(
            spotdiff(
              'Знайдіть шість відмінностей між двома картинками шкільного класу. Торкайтеся відмінностей на будь-якій із картинок; кілька промахів поспіль ненадовго заморозять екран.',
              photos('spot-a'),
              photos('spot-b'),
              SPOT_ASPECT,
              SPOT_SPOTS,
              800,
              120,
            ),
          ),
          W(world.jigsaw),
          S(sci.memory),
          L(logic.sudoku),
          W(world.crossword),
          H(hum.crossword),
        ],
      },
      {
        id: 'mg-bets',
        type: 'bets',
        title: 'Ставки: контрольна робота',
        description:
          'Перед кожним запитанням видно лише його перші слова — тему. Ставте таємно: від 200 балів, і щоразу мінімум росте на 100, найбільша ставка — 1500. Хто відповів правильно, ділить банк пропорційно ставкам; якщо не вгадав ніхто — ставки повертаються.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 1500,
        questions: weave(sci.bets.map(S), hum.bets.map(H), world.bets.map(W), [C(cinema.bets), L(logic.bets)]),
      },
      {
        id: 'mg-auction',
        type: 'auction',
        title: 'Аукціон: хто знає більше?',
        description:
          'Перед кожним запитанням видно лише його тему — і починається відкритий торг кроком у 100 балів. Відповідає тільки той, хто дав найбільшу ставку: правильно — отримує ціну запитання, помилився — втрачає ставку. Якщо ніхто не торгувався, запитання грають усі.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'step',
        bidStep: 100,
        loss: 'bid',
        questions: weave(world.auction.map(W), cinema.auction.map(C), hum.auction.map(H), [S(sci.auction), L(logic.auction)]),
      },
      {
        id: 'mg-final',
        type: 'final',
        title: 'Фінал: випускний іспит',
        description: 'Останнє запитання для всіх — з історії України. Ставте частину балів таємно й вирішіть, наскільки ви впевнені.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [W(world.final)],
      },
    ],
    duels: {
      questionsPerDuel: 3,
      timeLimit: 30,
      stake: 300,
      categories: [sci.duel, hum.duel, cinema.duel],
    },
    // Запасні для бафу «Заміна запитання»: лише прості типи, без медіа.
    spares: [S(sci.spare), H(hum.spare), W(world.spare), C(cinema.spare), L(logic.spare)],
  };
};
