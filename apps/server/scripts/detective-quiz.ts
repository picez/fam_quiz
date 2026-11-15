import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { board as boardSlots } from './detective/board';
import { spotdiff, type Photos } from './detective/kit';
import { open, quest } from './detective/open';
import { bets, blitz, final, interrogation, millionaire, puzzles, spares } from './detective/rest';
import { SPOT_ASPECT, SPOT_SPOTS } from './detective/spot';

/** Власні PNG з detective/img (малює detective/draw.ts); інших картинок у вікторині немає. */
export const DETECTIVE_FILES = ['spot-a', 'spot-b'] as const;

/**
 * «Таємна справа» — вікторина середнього розміру з ведучим про логіку, детективні загадки й головоломки:
 * короткі справи «хто злодій», «хто бреше», знамениті детективи книжок і кіно, послідовності, шифри, анаграми,
 * стіна, ланцюжок, дві словесні драбини, «Пам’ять», дві судоку, два кросворди й «Знайди відмінності» в кабінеті детектива.
 *
 * Дев’ять раундів: дві «справи» (класичні), квест, поле, бліц, «Мільйонер», головоломки, ставки й фінал.
 * «100 до 1» немає: під цю тему немає реального опублікованого опитування. Без опитувань гравців і «хмар слів».
 * Таймери — від 25 секунд. Жодного запитання, пов'язаного з росією.
 * photos — ключ DETECTIVE_FILES → адреса картинки на сайті.
 */
export const detectiveQuiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `${theme}-${++k}` });
  const C1 = tag('case1');
  const Q = tag('quest');
  const B = tag('board');
  const Z = tag('blitz');
  const C2 = tag('case2');
  const L = tag('ladder');
  const P = tag('puzzle');
  const S = tag('bets');
  const F = tag('final');
  const R = tag('spare');
  const pz = puzzles();

  return {
    title: 'Таємна справа: детективи, логіка й головоломки',
    description:
      'Вечір для тих, хто любить думати: короткі справи «хто злодій» і «хто бреше», знамениті детективи книжок і кіно, послідовності, шифри й анаграми, сейфи з кодами, судоку, кросворди й пошук відмінностей у кабінеті детектива. Уважно читайте свідчення — правда завжди ховається в дрібницях.',
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
        id: 'dt-case1',
        type: 'classic',
        title: 'Справа №1: перші сліди',
        description:
          'Детективне агентство відчиняє двері! Розминаємося на всьому потроху: стіна слідчого, підозрілий лист, «Хто я?», числа, що маскуються під прості, слова з літер, словесна драбина, малюнок і силогізм на балу. Швидкі правильні відповіді дають бонус, а за частково правильну стіну, сортування чи вибір кількох — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: open().map(C1),
      },
      {
        id: 'dt-quest',
        type: 'quest',
        title: 'Квест: код від сейфа',
        description:
          'Над раундом висить головна загадка — відповідь на неї і є чотирицифровим кодом сейфа. Кожна правильна відповідь на звичайне запитання відкриває одну цифру коду. Хто перший введе правильний код, отримає бонус; спроб — три, тож не поспішайте.',
        speedBonus: false,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        prompt: quest.prompt,
        code: quest.code,
        order: Array.from(quest.code, (_, i) => i),
        tries: 3,
        bonus: { kind: 'points', points: 1500 },
        questions: quest.questions.map(Q),
      },
      {
        id: 'dt-board',
        type: 'board',
        title: 'Слідче поле',
        description:
          'Шість рубрик слідства по п’ять клітинок від 100 до 500: детективи книжок і кіно, логічні задачі, послідовності, головоломки зі словами, «так чи ні» та справи з місця злочину. Що дорожча клітинка — то хитріша загадка. Десь сховалися клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: boardSlots().map(([key, title, slot]) => ({
          id: `dt-${key}`,
          title,
          cells: scatter(`detective-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: B(c.question) }))),
          spares: [B(slot.spare)],
        })),
      },
      {
        id: 'dt-blitz',
        type: 'blitz',
        title: 'Бліц: правда чи вигадка',
        description:
          'Десять тверджень про знаменитих детективів, їхніх авторів і хитрі числа. Правда це чи вигадка? Тисніть «Відповісти» — і маєте 25 секунд. Дві спроби на твердження. Кожна наступна правильна відповідь поспіль дає на 50 балів більше, а кожна помилка поспіль — на 50 балів більший мінус.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 2,
        check: 'auto',
        rules: { ...rules({ penalty: 'minus' }), partial: null, streakPlus: { step: 50 }, streakMinus: { step: 50 } },
        questions: blitz().map(Z),
      },
      {
        id: 'dt-case2',
        type: 'classic',
        title: 'Справа №2: допит',
        description:
          'Підозрювані сидять у кімнаті для допитів, і хтось із них бреше. Звіряйте свідчення, розплутуйте, хто що вкрав і в якому порядку приходили свідки, рахуйте в голові й пройдіть ще одну драбину — від ножа до суду. Швидкі правильні відповіді дають бонус; за частково правильні порядок, пари й ланцюжок — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: interrogation().map(C2),
      },
      {
        id: 'dt-ladder',
        type: 'ladder',
        title: 'Мільйонер: від стажера до комісара',
        description:
          'Один гравець — той, у кого найменше балів, — проходить десять сходинок кар’єри детектива: від стажера до комісара. На кожній — один варіант із чотирьох, і що вище, то складніше й дорожче. Дві сходинки незгорані, а на допомогу є «50/50», зала й підказка ведучого.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 200, 300, 500, 1000, 1500, 2500, 4000, 6500, 10000],
        safe: [2, 6],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: millionaire().map(L),
      },
      {
        id: 'dt-puzzles',
        type: 'puzzles',
        title: 'Головоломки: детективна майстерня',
        description:
          'Шість головоломок по черзі: знайдіть вісім відмінностей у кабінеті детектива, розв’яжіть дві судоку, відкрийте пари анаграм у «Пам’яті» й розгадайте два кросворди — у першому складіть таємне слово з виділених клітинок, другий розгадайте повністю. У відмінностях і «Пам’яті» найшвидший отримує найбільше.',
        questions: [
          P(
            spotdiff(
              'Знайдіть вісім відмінностей між двома картинками кабінету детектива. Торкайтеся відмінностей на будь-якій із картинок; кілька промахів поспіль ненадовго заморозять екран.',
              photos('spot-a'),
              photos('spot-b'),
              SPOT_ASPECT,
              SPOT_SPOTS,
              800,
              150,
            ),
          ),
          P(pz.sudokus[0]),
          P(pz.keyCrossword),
          P(pz.memory),
          P(pz.sudokus[1]),
          P(pz.fullCrossword),
        ],
      },
      {
        id: 'dt-bets',
        type: 'bets',
        title: 'Ставки: справа на мільйон',
        description:
          'Перед кожним запитанням видно лише його перше слово — тему. Ставте таємно: від 200 балів, і щоразу мінімум росте на 100, найбільша ставка — 1500. Хто відповів правильно, ділить банк пропорційно ставкам; якщо не вгадав ніхто — ставки повертаються.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 1500,
        questions: bets().map(S),
      },
      {
        id: 'dt-final',
        type: 'final',
        title: 'Фінал: останній сейф',
        description: 'Останній сейф агентства і остання задача для всіх — про його код. Ставте частину балів таємно й вирішіть, наскільки ви впевнені у своїй дедукції.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [F(final())],
      },
    ],
    // Запасні для бафу «Заміна запитання»: лише прості типи без медіа.
    spares: spares().map(R),
  };
};
