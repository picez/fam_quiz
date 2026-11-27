import { BUFF_KINDS, DEBUFF_KINDS, DEFAULT_RULES, type Question, type Quiz } from '@quiz/shared';
import { rules } from './demo-quiz';
import { scatter, type Cell } from './mix-quiz';
import { board, type BoardKey } from './party-en/board';
import { BLITZ, BRIEFING, FINAL, LADDER, PUZZLES, SPARES, WARMUP, WIPEOUT } from './party-en/rounds';

/**
 * “Party Night: Last War, Hogwarts & Party Games” (сід `party-en`) — англомовна весела вікторина для всієї родини:
 * мобільна стратегія Last War: Survival, Гаррі Поттер (книжки й фільми) і вечірки (ігри, традиції світу, пісні) — приблизно порівну.
 * Вісім раундів: розминка, поле 4×5, брифінг Last War, “Мільйонер”, бліц, “Ва-банк” Гоґвортсу, головоломки й фінал.
 * Складність переважно легка й середня, кілька важчих запитань на більші бали. Таймери — від 25 с. Без опитувань гравців,
 * без “100 до 1”, без українських словесних ігор (драбина, слова з літер, “Вгадай слово”). Без картинок і медіа. Нічого, пов'язаного з росією.
 */
export const partyEnQuiz = (): Quiz => {
  let k = 0;
  const tag =
    (theme: string) =>
    (question: Question): Question => ({ ...question, id: `pe-${theme}-${++k}` });

  const category = (key: BoardKey, title: string) => {
    const slot = board[key];
    const t = tag(key);
    return {
      id: `pec-${key}`,
      title,
      cells: scatter(`party-en-${key}`, slot.cells.map((c: Cell) => ({ ...c, question: t(c.question) }))),
      spares: [t(slot.spare)],
    };
  };

  return {
    title: 'Party Night: Last War, Hogwarts & Party Games',
    description: 'A fun English quiz for the whole family: Last War: Survival, Harry Potter and parties around the world — party games, songs and traditions.',
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
        id: 'pe-warmup',
        type: 'classic',
        title: 'Let’s Get This Party Started',
        description:
          'Twelve warm-up questions from all three worlds — Last War, Hogwarts and the party floor. Options, true or false, numbers, order, pairs, sorting, a slider, a map pin and a word chain. Fast right answers earn a bonus; partly right order, pairs or sorting earn half.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: WARMUP.map(tag('warm')),
      },
      {
        id: 'pe-board',
        type: 'board',
        title: 'The Party Board',
        description:
          'Four topics with five cells from 100 to 500: the pricier the cell, the trickier the question. A “Who am I?” hides among them, some cells are worth ×2 or ×3, and a blitz cell goes to the fastest player. Wrong answers cost points.',
        shuffleOptions: true,
        answerMode: 'phone',
        check: 'auto',
        rules: rules({ penalty: 'minus' }),
        categories: [
          category('hq', 'Last War HQ'),
          category('hogwarts', 'Hogwarts After Hours'),
          category('world', 'Parties Around the World'),
          category('playlist', 'Party Playlist'),
        ],
      },
      {
        id: 'pe-briefing',
        type: 'classic',
        title: 'Commander’s Briefing: Last War',
        description:
          'Ten questions for Last War: Survival commanders — heroes, squads, alliances, the Capitol and the seasons. From easy recruit questions to veteran ones; the later questions are worth more. Partly right pairs or order earn half.',
        speedBonus: true,
        shuffleOptions: true,
        rules: rules({ partial: 50 }),
        questions: BRIEFING.map(tag('lw')),
      },
      {
        id: 'pe-ladder',
        type: 'ladder',
        title: 'Who Wants to Be a Party Millionaire?',
        description:
          'The player with the fewest points climbs ten steps from 100 to 10 000. Every step has four options and gets a little harder. Steps 1000 and 5000 are safe, and the lifelines 50:50, Ask the Audience and a Hint are there to help.',
        shuffleOptions: true,
        pick: 'lowest',
        timer: true,
        levels: [100, 200, 300, 500, 1000, 2000, 3000, 5000, 7500, 10000],
        safe: [4, 7],
        lifelines: ['fifty', 'audience', 'hint'],
        questions: LADDER.map(tag('ladder')),
      },
      {
        id: 'pe-blitz',
        type: 'blitz',
        title: 'Party Poppers: Quick-Fire',
        description:
          'Eight short questions from all three worlds. Press “Answer” first: you get 25 seconds and one try. Only the first player with the right answer scores the points.',
        shuffleOptions: true,
        answerWindow: 25,
        attempts: 1,
        check: 'auto',
        rules: { ...DEFAULT_RULES, partial: null },
        questions: BLITZ.map(tag('blitz')),
      },
      {
        id: 'pe-wipeout',
        type: 'wipeout',
        title: 'Hogwarts All-or-Nothing',
        description:
          'Six Harry Potter questions, each one pricier and harder than the last: from 100 to 1500 points. A right answer adds its price to your bank, a wrong one burns the whole bank. After each right answer, decide: keep going or bank it.',
        shuffleOptions: true,
        questions: WIPEOUT.map(tag('wipeout')),
      },
      {
        id: 'pe-puzzles',
        type: 'puzzles',
        title: 'Puzzle Break',
        description:
          'Three puzzles in a row: a party crossword with a hidden key word, a memory game of Harry Potter actors and their roles, and an easy sudoku. The faster you solve them, the more you score.',
        questions: PUZZLES.map(tag('puzzle')),
      },
      {
        id: 'pe-final',
        type: 'final',
        title: 'The Last Dance',
        description: 'One last question for everyone. First secretly bet part of your points, then answer: right and the bet is added, wrong and it is taken away.',
        shuffleOptions: true,
        check: 'auto',
        wagerMode: 'classic',
        questions: [tag('final')(FINAL)],
      },
    ],
    spares: SPARES.map(tag('spare')),
  };
};
