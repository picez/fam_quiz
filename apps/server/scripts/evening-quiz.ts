import { BUFF_KINDS, DEBUFF_KINDS, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { POLLS } from './evening/polls';
import { EVENING_THEMES, type EveningPart, type EveningTheme, type Img } from './evening/kit';
import * as science from './evening/science';
import * as world from './evening/world';
import * as culture from './evening/culture';
import * as secret from './evening/secret';

export { EVENING_THEMES };
const MODULES = [science, world, culture, secret];

/** Усі картинки вечора: ключ → стаття Вікіпедії чи File: з Commons. Ключі авторів не перетинаються (перевіряє тест). */
export const EVENING_IMAGES: Record<string, string> = Object.assign({}, ...MODULES.map((m) => m.IMAGES));

/** Тема запитання за його id; null — опитування чи «хмара». */
export const eveningThemeOf = (id: string): EveningTheme | null => {
  const code = id.split('-')[0];
  return code in EVENING_THEMES ? (code as EveningTheme) : null;
};

/** Перемішує запитання різних авторів по черзі, щоб теми не йшли блоками. */
const interleave = (lists: Question[][]): Question[] => {
  const out: Question[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
};

/**
 * «Вечір тринадцяти тем» — велика вікторина з ведучим на вечір 1 листопада 2026:
 * «100 до 1» — лише за справжніми опублікованими опитуваннями (джерело й рік у тексті).
 * 11 відкритих тем і дві таємні категорії, усі типи запитань, картинки, відео й аудіо, таймер від 20 секунд.
 * img — ключ картинки → адреса /uploads/…; без картинки збирання падає (картинки обов’язкові).
 * Жодного запитання, пов’язаного з росією чи радянським періодом.
 */
export const eveningQuiz = (img: Img): Quiz => {
  const parts: EveningPart[] = MODULES.map((m) => m.part(img));
  const wld = parts[1];

  let k = 0;
  /** Остаточні id: «тема-номер». */
  const reid = (q: Question): Question => ({ ...q, id: `${q.id.split('-')[0]}-${++k}` });
  const all = (xs: Question[], f: (x: Question) => Question) => xs.map(f);

  const warmup = all(interleave(parts.map((p) => p.warmup)), reid);
  const main = all(interleave(parts.map((p) => p.main)), reid);
  const media = all(interleave(parts.map((p) => p.media)), reid);
  const blitz = all(interleave(parts.map((p) => p.blitz)), reid);

  const board = (themes: EveningTheme[]) =>
    themes.map((theme) => {
      const source = parts.find((p) => p.board[theme])?.board[theme];
      if (!source) throw new Error(`No board category for ${theme}`);
      return {
        id: `ev-cat-${theme}`,
        title: EVENING_THEMES[theme],
        cells: source.cells.map((c) => ({ ...c, question: reid(c.question) })),
        spares: [reid(source.spare)],
      };
    });

  // «Ва-банк»: від найлегшого до найважчого, ціни зростають рівно.
  const wipeoutPrices = [100, 150, 200, 300, 400, 500, 600, 800, 1000, 1200];
  const wipeout = interleave(parts.map((p) => p.wipeout))
    .map((q, i) => ({ q, i }))
    .sort((a, b) => a.q.points - b.q.points || a.i - b.i)
    .map(({ q }, i) => reid({ ...q, points: wipeoutPrices[Math.min(i, wipeoutPrices.length - 1)] }));

  const ladderLevels = [100, 200, 300, 500, 700, 1000, 1500, 2000, 3000, 5000, 7500, 10000];
  const steps = Object.assign({}, ...parts.map((p) => p.ladder)) as Record<number, Question>;
  const ladder = ladderLevels.map((_, i) => {
    const q = steps[i + 1];
    if (!q) throw new Error(`No ladder step ${i + 1}`);
    return reid({ ...q, points: 0 });
  });

  if (!wld.final || !wld.duels) throw new Error('The world part must carry the final and the duels');

  return {
    title: 'Вечір тринадцяти тем',
    description:
      'Одинадцять тем — від біології, хімії й фізики до коміксів, спорту й сучасної української прози — і дві таємні категорії, які ви впізнаєте самі. Картинки, відео, звук і всі формати. Гра з ведучим.',
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
        id: 'ev-warmup',
        type: 'classic',
        title: 'Розминка: тринадцять дверей',
        description:
          'По одному легкому запитанню з кожної теми вечора, і з двох таємних теж: спробуйте вгадати, про що вони. Швидші правильні відповіді дають бонус.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({}),
        questions: warmup,
      },
      {
        id: 'ev-main',
        type: 'classic',
        title: 'Усі формати',
        description:
          'Пари, порядок, сортування, повзунок, точка на мапі, стіна зв’язків, «Хто я?», ланцюжок і блеф — тут кожне запитання по-своєму. Бали залежать від складності. Частково правильна відповідь приносить половину, а за три правильні поспіль — бонус 50 %. У кінці — «100 до 1» за справжніми опитуваннями: вгадайте найпопулярніші відповіді.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50, streak: { length: 3, bonus: { kind: 'percent', value: 50 } } }),
        questions: [...main, ...all(POLLS, reid)],
      },
      {
        id: 'ev-media',
        type: 'classic',
        title: 'Дивись і слухай',
        description:
          'Раунд картинок, відео й звуку: щось проявляється з пікселів, щось треба почути чи побачити. Дивіться на екран, слухайте уважно й відповідайте з телефона. Частково правильна відповідь приносить половину балів.',
        speedBonus: false,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: media,
      },
      {
        id: 'ev-blitz',
        type: 'blitz',
        title: 'Бліц: по одному на тему',
        description:
          'Тринадцять швидких запитань, по одному з кожної теми. Тиснете «Відповісти» й маєте 20 секунд. На кожне запитання дві спроби, але помилка коштує балів. За три правильні відповіді поспіль — плюс 200.',
        shuffleOptions: true,
        answerWindow: 20,
        attempts: 2,
        check: 'auto',
        rules: { ...rules({ penalty: 'minus', streak: { length: 3, bonus: { kind: 'fixed', value: 200 } } }), partial: null },
        questions: blitz,
      },
      {
        id: 'ev-board-1',
        type: 'board',
        title: 'Своя гра: природа й наука',
        description:
          'Шість тем: біологія, хімія, фізика, географія, садівництво й рукоділля, у кожній клітинки від 100 до 400. Обираєте клітинку по черзі. Є клітинки ×2 і ×3, бліц-клітинки для найшвидших і кілька відповідей уголос, які судить ведучий. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: board(['bio', 'chem', 'phys', 'geo', 'garden', 'craft']),
      },
      {
        id: 'ev-board-2',
        type: 'board',
        title: 'Своя гра: сторінки, поле й таємниці',
        description:
          'Сім тем: комікси й аніме, література, спорт, сучасна українська проза, спортивні романи й дві таємниці, які ви вже, мабуть, розгадали. Клітинки від 100 до 400, ×2 і ×3, бліц і відповіді вголос. За помилку бали віднімаються.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: board(['comics', 'lit', 'sport', 'modlit', 'romance', 'silly', 'riddle']),
      },
      {
        id: 'ev-wipeout',
        type: 'wipeout',
        title: 'Ва-банк',
        description:
          'Кожна правильна відповідь додає ціну запитання в банк, а помилка спалює все накопичене. Запитання дорожчають від 100 до 1200. Після кожної правильної відповіді вирішуєте: йти «Далі» чи «Забрати» банк.',
        shuffleOptions: true,
        questions: wipeout,
      },
      {
        id: 'ev-survival',
        type: 'survival',
        title: 'Вибування',
        description:
          'Хто помилився, отримує рятівне запитання, а хто не впорався — стає привидом і далі вболіває. Раунд триває, доки не лишиться троє, і кожен, хто дожив до кінця, отримує 500 балів. Усі бали тут потроєні.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ multiplier: 3 }),
        trial: 'question',
        survivors: 3,
        bonus: 500,
        questions: all(interleave(parts.map((p) => p.survival)), reid),
        trials: all(interleave(parts.map((p) => p.trials)), reid),
      },
      {
        id: 'ev-ladder',
        type: 'ladder',
        title: 'Мільйонер: дванадцять сходинок',
        description:
          'Ведучий кличе одного гравця на драбину з дванадцяти сходинок — від 100 до 10 000 балів. На кожне запитання 30 секунд і чотири варіанти. Є три підказки: 50 на 50, допомога залу й підказка ведучого. Сходинки 1000 і 5000 неспалимі.',
        shuffleOptions: false,
        levels: ladderLevels,
        safe: [5, 9],
        pick: 'host',
        lifelines: ['fifty', 'audience', 'hint'],
        timer: true,
        questions: ladder,
      },
      {
        id: 'ev-final',
        type: 'final',
        title: 'Фінал',
        description: 'Одне запитання для всіх. Спершу таємно ставите частину своїх балів, потім відповідаєте: за правильну відповідь ставка додається, за помилку — віднімається.',
        shuffleOptions: false,
        check: 'auto',
        wagerMode: 'classic',
        questions: [reid(wld.final)],
      },
    ],
    spares: all(interleave(parts.map((p) => p.spares)), reid),
    duels: { categories: wld.duels, questionsPerDuel: 3, timeLimit: 20, stake: 300 },
  };
};
