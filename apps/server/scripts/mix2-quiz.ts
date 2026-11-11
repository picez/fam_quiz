import { DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { MIX_THEMES, scatter, type Cell, type MixTheme } from './mix-quiz';
import { DETECT } from './mix2/detect';
import { ERA } from './mix2/era';
import { GEO_PHOTOS, geo as geoSlots } from './mix2/geo';
import { HIST_PHOTOS, hist as histSlots } from './mix2/hist';
import type { BoardSlot, Photos } from './mix2/kit';
import { LOGIC } from './mix2/logic';
import { PSY } from './mix2/psy';
import { TF } from './mix2/tf';

export { MIX_THEMES as MIX2_THEMES };

/** Фото пазлів: ключ → стаття англійської Вікіпедії або «File:…» з Commons (сід вантажить їх на сайт). */
export const MIX2_PHOTOS: Record<string, string> = { ...GEO_PHOTOS, ...HIST_PHOTOS };

/** Почергово бере по одному з кожного списку: теми в раунді чергуються. */
const weave = <T>(...lists: T[][]): T[] => {
  const out: T[] = [];
  for (let i = 0; i < Math.max(...lists.map((l) => l.length)); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};

/**
 * «Сім доріг ІІ» — велика вікторина з ведучим на ті самі сім тем, що й «Сім доріг», з новими запитаннями.
 * Нове: «Пазл» (фото з Вікіпедії), раунд «Мапа й час», більше поле (6 клітинок у категорії).
 * Таймери — від 25 секунд. Без опитувань гравців і без «100 до 1». Жодного запитання, пов'язаного з росією.
 * photos — ключ MIX2_PHOTOS → адреса фото на сайті.
 */
export const mix2Quiz = (photos: Photos): Quiz => {
  let k = 0;
  const tag =
    (theme: MixTheme) =>
    (question: Question): Question => ({ ...question, id: `${theme}-${++k}` });
  const tagCell =
    (theme: MixTheme) =>
    (c: Cell): Cell => ({ ...c, question: tag(theme)(c.question) });
  const geo = geoSlots(photos);
  const hist = histSlots(photos);
  const era = tag('era');
  const tf = tag('tf');
  const logic = tag('logic');
  const detect = tag('detect');
  const psy = tag('psy');
  const g = tag('geo');
  const h = tag('hist');

  const category = (theme: MixTheme, title: string, slot: BoardSlot) => ({
    id: `m2c-${theme}`,
    title,
    cells: scatter(`2-${theme}`, slot.cells.map(tagCell(theme))),
    spares: [tag(theme)(slot.spare)],
  });

  return {
    title: 'Сім доріг ІІ',
    description:
      'Велике продовження «Сім доріг»: ті самі сім тем — 90-ті й 2000-ні, правда чи брехня, логіка, детективні загадки, психологія, географія та історія — і жодного вчорашнього запитання. Нове: пазли з фото, мапа для всіх і більше поле.',
    settings: {
      leaderboard: 'each',
      newcomers: true,
      buffs: ['fifty', 'double', 'retry', 'time', 'shield', 'audience', 'hint', 'swap'],
      debuffs: ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'],
      debuffPrices: { shake: 150, fog: 250, freeze: 400, mirror: 300, guests: 250, mud: 200 },
      debuffShop: true,
    },
    rounds: [
      {
        id: 'm2-warmup',
        type: 'classic',
        title: 'Розминка: сім доріг знову',
        description:
          'По два свіжі запитання з кожної з семи тем, а наприкінці — перший пазл: складіть фото зі шматочків, перетягуючи й повертаючи їх. Найшвидший отримує повні бали, решта — менше пропорційно до часу. Швидкі правильні відповіді дають невеликий бонус, штрафів поки немає.',
        speedBonus: true,
        shuffleOptions: true,
        rules: DEFAULT_RULES,
        questions: [
          ...weave(ERA.warmup.map(era), TF.warmup.map(tf), LOGIC.warmup.map(logic), DETECT.warmup.map(detect), PSY.warmup.map(psy), geo.warmup.map(g), hist.warmup.map(h)),
          g(geo.warmupJigsaw),
        ],
      },
      {
        id: 'm2-mind',
        type: 'classic',
        title: 'Голова: логіка, слідство й психологія',
        description:
          'Раунд для тих, хто любить подумати: словесна драбина, слова з літер, задачі, розслідування й таємниці людської психіки. За частково правильні порядок, пари чи сортування — половина балів.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: weave(LOGIC.mind.map(logic), DETECT.mind.map(detect), PSY.mind.map(psy)),
      },
      {
        id: 'm2-blitz',
        type: 'blitz',
        title: 'Бліц: правда чи брехня',
        description:
          'Чотирнадцять тверджень з усіх доріг — швидко вирішуйте, правда це чи вигадка. Тисніть «Відповісти» — і маєте 25 секунд. Дві спроби на твердження. Кожна наступна правильна відповідь поспіль дає на 50 балів більше, а кожна помилка поспіль — на 50 балів більший мінус.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 2,
        check: 'auto',
        rules: { ...rules({ penalty: 'minus' }), partial: null, streakPlus: { step: 50 }, streakMinus: { step: 50 } },
        questions: weave(TF.blitz.map(tf), [...ERA.blitz.map(era), ...LOGIC.blitz.map(logic), ...DETECT.blitz.map(detect), ...PSY.blitz.map(psy), ...geo.blitz.map(g), ...hist.blitz.map(h)]),
      },
      {
        id: 'm2-board',
        type: 'board',
        title: 'Велике поле семи доріг',
        description:
          'Сім тем по шість клітинок від 100 до 600: чим дорожча клітинка — тим складніше. Десь сховалися клітинки ×2 і ×3, а бліц-клітинка дістається найшвидшому. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('era', '90-ті й 2000-ні', ERA.board),
          category('tf', 'Правда чи брехня', TF.board),
          category('logic', 'Логіка', LOGIC.board),
          category('detect', 'Детективні загадки', DETECT.board),
          category('psy', 'Психологія', PSY.board),
          category('geo', 'Географія й прапори', geo.board),
          category('hist', 'Історія', hist.board),
        ],
      },
      {
        id: 'm2-retro',
        type: 'classic',
        title: 'Ретро-вечірка ІІ: намалюй, почуй, згадай',
        description:
          'Знову 90-ті й 2000-ні. Один гравець малює річ тих років, решта вгадують, — що швидше, то більше балів. Впізнавайте хіти на слух, пригадуйте на час і розставляйте за роками. За частково правильні відповіді — половина балів.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: ERA.retro.map(era),
      },
      {
        id: 'm2-maptime',
        type: 'classic',
        title: 'Мапа й час',
        description:
          'Географія та історія разом: ставте точки на мапі — після відповіді всі побачать, хто куди поцілив, — розставляйте події за часом і вгадуйте роки. Що ближче до правди, то більше балів; за частково правильні порядок і пари — половина.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: weave(geo.world.map(g), hist.world.map(h)),
      },
      {
        id: 'm2-bets',
        type: 'bets',
        title: 'Ставки: сім доріг',
        description:
          'Перед кожним запитанням видно лише його перші слова — тему. Ставте таємно: від 200 балів, і щоразу мінімум росте на 100, найбільша ставка — 1500. Хто відповів правильно, ділить банк пропорційно ставкам; якщо не вгадав ніхто — ставки повертаються.',
        shuffleOptions: true,
        check: 'auto',
        betStart: 200,
        betStep: 100,
        betMax: 1500,
        questions: [h(hist.bets[0]), g(geo.bets), tf(TF.bets), h(hist.bets[1]), logic(LOGIC.bets), psy(PSY.bets), era(ERA.bets), h(hist.bets[2])],
      },
      {
        id: 'm2-auction',
        type: 'auction',
        title: 'Аукціон: хто більше?',
        description:
          'Перед кожним запитанням видно лише його тему — і починається відкритий торг кроком у 100 балів. Відповідає тільки той, хто дав найбільшу ставку: правильно — отримує ціну запитання, помилився — втрачає ставку. Якщо ніхто не торгувався, запитання грають усі.',
        shuffleOptions: true,
        check: 'auto',
        bidMode: 'step',
        bidStep: 100,
        loss: 'bid',
        questions: [detect(DETECT.auction[0]), g(geo.auction), psy(PSY.auction), era(ERA.auction), tf(TF.auction), logic(LOGIC.auction), h(hist.auction), detect(DETECT.auction[1])],
      },
      {
        id: 'm2-puzzles',
        type: 'puzzles',
        title: 'Головоломки: цифри, слова й пазли',
        description:
          'Шість головоломок по черзі: два судоку 6×6, два пазли з фото й два кросворди — у першому шукайте ключове слово з виділених клітинок, другий розгадайте повністю. Бали — тим, хто встигне до кінця таймера; у пазлі найшвидший отримує найбільше.',
        questions: [logic(LOGIC.puzzles[0]), g(geo.puzzles[1]), g(geo.puzzles[0]), logic(LOGIC.puzzles[1]), h(hist.puzzles[1]), h(hist.puzzles[0])],
      },
      {
        id: 'm2-final',
        type: 'final',
        title: 'Фінал: сторінка нашої історії',
        description: 'Останнє запитання для всіх — з історії України. Ставте частину балів таємно й вирішіть, наскільки ви впевнені.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [h(hist.final)],
      },
    ],
    duels: {
      questionsPerDuel: 3,
      timeLimit: 30,
      stake: 300,
      categories: [PSY.duel, geo.duel, hist.duel],
    },
    // Запасні для бафу «Заміна запитання»: лише прості типи, без медіа.
    spares: [era(ERA.spare), tf(TF.spare), logic(LOGIC.spare), detect(DETECT.spare), psy(PSY.spare), g(geo.spare), h(hist.spare)],
  };
};
