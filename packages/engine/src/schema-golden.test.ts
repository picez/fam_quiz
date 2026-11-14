import { describe, expect, it } from 'vitest';
import { ANSWER_MODES, CELL_KINDS, QUESTION_TYPES, quizSchema, type Question, type QuestionType, type Quiz } from '@quiz/shared';
import {
  auctionRound,
  betsRound,
  blitzRound,
  bluff,
  bool,
  boardRound,
  chain,
  classicRound,
  cloud,
  clues,
  crosswordFull,
  crosswordKey,
  drawing,
  finalRound,
  jigsaw,
  ladderQuestions,
  ladderRound,
  letterwords,
  makeRoundsQuiz,
  match,
  melody,
  memory,
  moreless,
  multi,
  numeric,
  order,
  pin,
  poll,
  puzzlesRound,
  questQuestions,
  questRound,
  single,
  single4,
  slider,
  sortQ,
  spotdiff,
  sudoku,
  survey,
  survivalQuestions,
  survivalRound,
  survivalTrials,
  text,
  timedlist,
  wall,
  wipeoutLadder,
  wipeoutRound,
  withReveal,
  wordladder,
} from './testing/fixtures';

/** По одному запитанню кожного типу, усі з id 'x'; single — на 4 варіанти, щоб «Мільйонер» міряв тип, а не кількість варіантів; новий тип ламає компіляцію тесту. */
const BY_TYPE = {
  single: single4,
  multi,
  boolean: bool,
  text,
  numeric,
  order,
  match,
  chain,
  wordladder,
  sort: sortQ,
  slider,
  clues,
  pin,
  wall,
  poll,
  wordcloud: cloud,
  survey,
  timedlist,
  letterwords,
  moreless,
  drawing,
  sudoku,
  crossword: crosswordFull,
  jigsaw,
  spotdiff,
  memory,
  melody,
  bluff,
} satisfies Record<QuestionType, Question>;

const ofType = (type: QuestionType): Question => ({ ...BY_TYPE[type], id: 'x' }) as Question;

/** Заміна першого запитання списку на q. */
const first = (list: Question[], q: Question): Question[] => [q, ...list.slice(1)];

const filler = (id: string): Question => ({ ...single, id });

/** Поле 3×3 із single; перша клітинка — q з kind, раунд — answerMode mode. */
const boardWith = (q: Question, kind: (typeof CELL_KINDS)[number], mode: (typeof ANSWER_MODES)[number]): Quiz => {
  const categories = ['c1', 'c2', 'c3'].map((c) => ({
    title: `Категорія ${c}`,
    cells: [0, 1, 2].map((i) => ({ ...single, id: `q-${c}-${i}`, points: 100 * (i + 1) }) as Question),
  }));
  const cells: (Question | { question: Question; kind: (typeof CELL_KINDS)[number] })[] = [...categories[0]!.cells];
  cells[0] = { question: { ...q, points: 100 }, kind };
  return makeRoundsQuiz([boardRound('b1', [{ ...categories[0]!, cells }, categories[1]!, categories[2]!], { answerMode: mode })]);
};

/** Місце → вікторина з q у ньому; поряд — заповнювач, яким місце валідне. */
const PLACES: Record<string, { put: (q: Question) => Quiz; base: Question }> = {
  classic: { put: (q) => makeRoundsQuiz([classicRound('r1', [q, filler('f1')])]), base: single },
  blitz: { put: (q) => makeRoundsQuiz([blitzRound('r1', [q, filler('f1')])]), base: single },
  ...Object.fromEntries(
    CELL_KINDS.flatMap((kind) => ANSWER_MODES.map((mode) => [`board:${kind}:${mode}`, { put: (q: Question) => boardWith(q, kind, mode), base: single }])),
  ),
  final: { put: (q) => makeRoundsQuiz([finalRound('r1', q)]), base: single },
  bets: { put: (q) => makeRoundsQuiz([betsRound('r1', [q, filler('f1')])]), base: single },
  auction: { put: (q) => makeRoundsQuiz([auctionRound('r1', [q, filler('f1')])]), base: single },
  puzzles: { put: (q) => makeRoundsQuiz([puzzlesRound('pz', [q, crosswordFull, crosswordKey])]), base: sudoku },
  wipeout: { put: (q) => makeRoundsQuiz([wipeoutRound('w', first(wipeoutLadder, q))]), base: single },
  survival: { put: (q) => makeRoundsQuiz([survivalRound('s', first(survivalQuestions, q), survivalTrials)]), base: single },
  'survival-trial': { put: (q) => makeRoundsQuiz([survivalRound('s', survivalQuestions, first(survivalTrials, q), { trial: 'question' })]), base: single },
  ladder: { put: (q) => makeRoundsQuiz([ladderRound('l', first(ladderQuestions, q))]), base: ladderQuestions[0]! },
  quest: { put: (q) => makeRoundsQuiz([questRound('rq', first(questQuestions, q))]), base: single },
  spare: { put: (q) => ({ ...makeRoundsQuiz([classicRound('r1', [filler('f1')])]), spares: [q] }), base: single },
  reveal: { put: (q) => makeRoundsQuiz([classicRound('r1', [withReveal(q), filler('f1')])]), base: single },
};

const verdict = (quiz: Quiz): string => {
  const result = quizSchema.safeParse(quiz);
  if (result.success) return 'ok';
  return [...new Set(result.error.issues.map((i) => i.message))].sort().join('+');
};

describe('quizSchema golden matrix (30e)', () => {
  it('every place is valid with its base question', () => {
    for (const [place, { put, base }] of Object.entries(PLACES)) {
      expect([place, verdict(put({ ...base, id: 'x' } as Question))]).toEqual([place, 'ok']);
    }
  });

  it('quizSchema verdict per type and place (30e golden)', () => {
    const matrix = Object.fromEntries(
      Object.entries(PLACES).map(([place, { put }]) => [place, QUESTION_TYPES.map((type) => `${type}=${verdict(put(ofType(type)))}`).join(' ')]),
    );
    expect(matrix).toMatchInlineSnapshot(`
      {
        "auction": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=ok wordladder=ok sort=ok slider=ok clues=clues_place pin=pin_place wall=wall_place poll=vote_place wordcloud=vote_place survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "bets": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=ok wordladder=ok sort=ok slider=ok clues=clues_place pin=pin_place wall=wall_place poll=vote_place wordcloud=vote_place survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "blitz": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=chain_round wordladder=wordladder_place sort=ok slider=ok clues=clues_place pin=pin_place wall=wall_place poll=vote_place wordcloud=vote_place survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "board:blitz:phone": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=chain_round wordladder=wordladder_place sort=sort_cell slider=ok clues=clues_place pin=pin_place wall=wall_place poll=vote_place+vote_points wordcloud=vote_place+vote_points survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place+moreless_sum drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "board:blitz:voice": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=chain_round wordladder=wordladder_place sort=sort_cell slider=ok clues=clues_place pin=pin_place wall=wall_place poll=vote_place+vote_points wordcloud=vote_place+vote_points survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place+moreless_sum drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "board:normal:phone": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=chain_round wordladder=wordladder_place sort=ok slider=ok clues=ok pin=ok wall=ok poll=vote_place+vote_points wordcloud=vote_place+vote_points survey=ok timedlist=ok letterwords=ok moreless=moreless_sum drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "board:normal:voice": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=chain_round wordladder=wordladder_place sort=sort_cell slider=ok clues=ok pin=pin_place wall=wall_place poll=vote_place+vote_points wordcloud=vote_place+vote_points survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place+moreless_sum drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "classic": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=ok wordladder=ok sort=ok slider=ok clues=ok pin=ok wall=ok poll=ok wordcloud=ok survey=ok timedlist=ok letterwords=ok moreless=ok drawing=ok sudoku=puzzle_place crossword=puzzle_place jigsaw=ok spotdiff=ok memory=ok melody=ok bluff=ok",
        "final": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=ok wordladder=ok sort=ok slider=ok clues=clues_place pin=pin_place wall=wall_place poll=vote_place wordcloud=vote_place survey=survey_place timedlist=timedlist_place letterwords=letterwords_place moreless=moreless_place drawing=drawing_place sudoku=puzzle_place crossword=puzzle_place jigsaw=jigsaw_place spotdiff=spotdiff_place memory=memory_place melody=melody_place bluff=bluff_place",
        "ladder": "single=ok multi=ladder_type boolean=ladder_type text=ladder_type numeric=ladder_type order=ladder_type match=ladder_type chain=ladder_type wordladder=ladder_type+wordladder_place sort=ladder_type slider=ladder_type clues=clues_place+ladder_type pin=ladder_type+pin_place wall=ladder_type+wall_place poll=ladder_type+vote_place wordcloud=ladder_type+vote_place survey=ladder_type+survey_place timedlist=ladder_type+timedlist_place letterwords=ladder_type+letterwords_place moreless=ladder_type+moreless_place drawing=drawing_place+ladder_type sudoku=ladder_type+puzzle_place crossword=ladder_type+puzzle_place jigsaw=jigsaw_place+ladder_type spotdiff=ladder_type+spotdiff_place memory=ladder_type+memory_place melody=ladder_type+melody_place bluff=bluff_place+ladder_type",
        "puzzles": "single=puzzles_type multi=puzzles_type boolean=puzzles_type text=puzzles_type numeric=puzzles_type order=puzzles_type match=puzzles_type chain=puzzles_type wordladder=puzzles_type+wordladder_place sort=puzzles_type slider=puzzles_type clues=clues_place+puzzles_type pin=pin_place+puzzles_type wall=puzzles_type+wall_place poll=puzzles_type+vote_place wordcloud=puzzles_type+vote_place survey=puzzles_type+survey_place timedlist=puzzles_type+timedlist_place letterwords=letterwords_place+puzzles_type moreless=moreless_place+puzzles_type drawing=drawing_place+puzzles_type sudoku=ok crossword=ok jigsaw=ok spotdiff=ok memory=ok melody=melody_place+puzzles_type bluff=bluff_place+puzzles_type",
        "quest": "single=ok multi=ok boolean=ok text=ok numeric=ok order=ok match=ok chain=quest_type wordladder=quest_type+wordladder_place sort=quest_type slider=ok clues=clues_place+quest_type pin=pin_place+quest_type wall=quest_type+wall_place poll=quest_type+vote_place wordcloud=quest_type+vote_place survey=quest_type+survey_place timedlist=quest_type+timedlist_place letterwords=letterwords_place+quest_type moreless=moreless_place+quest_type drawing=drawing_place+quest_type sudoku=puzzle_place+quest_type crossword=puzzle_place+quest_type jigsaw=jigsaw_place+quest_type spotdiff=quest_type+spotdiff_place memory=memory_place+quest_type melody=melody_place+quest_type bluff=bluff_place+quest_type",
        "reveal": "single=ok multi=reveal_type boolean=reveal_type text=ok numeric=ok order=reveal_type match=reveal_type chain=reveal_type wordladder=reveal_type sort=reveal_type slider=reveal_type clues=reveal_type pin=pin_base+reveal_type wall=reveal_type poll=reveal_type wordcloud=reveal_type survey=reveal_type timedlist=reveal_type letterwords=reveal_type moreless=reveal_type drawing=drawing_video+reveal_type sudoku=puzzle_place+puzzle_video+reveal_type crossword=puzzle_place+puzzle_video+reveal_type jigsaw=jigsaw_image+jigsaw_video+reveal_type spotdiff=reveal_type+spotdiff_image+spotdiff_video memory=memory_image+memory_video+reveal_type melody=melody_video+reveal_type bluff=reveal_type",
        "spare": "single=ok multi=ok boolean=ok text=ok numeric=ok order=spare_type match=spare_type chain=spare_type wordladder=spare_type sort=spare_type slider=ok clues=spare_type pin=spare_type wall=spare_type poll=spare_type wordcloud=spare_type survey=spare_type timedlist=spare_type letterwords=spare_type moreless=spare_type drawing=spare_type sudoku=spare_type crossword=spare_type jigsaw=spare_type spotdiff=spare_type memory=spare_type melody=spare_type bluff=spare_type",
        "survival": "single=ok multi=survival_type boolean=ok text=ok numeric=ok order=survival_type match=survival_type chain=survival_type wordladder=survival_type+wordladder_place sort=survival_type slider=ok clues=clues_place+survival_type pin=pin_place+survival_type wall=survival_type+wall_place poll=survival_type+vote_place wordcloud=survival_type+vote_place survey=survey_place+survival_type timedlist=survival_type+timedlist_place letterwords=letterwords_place+survival_type moreless=moreless_place+survival_type drawing=drawing_place+survival_type sudoku=puzzle_place+survival_type crossword=puzzle_place+survival_type jigsaw=jigsaw_place+survival_type spotdiff=spotdiff_place+survival_type memory=memory_place+survival_type melody=melody_place+survival_type bluff=bluff_place+survival_type",
        "survival-trial": "single=ok multi=survival_type boolean=ok text=ok numeric=ok order=survival_type match=survival_type chain=survival_type wordladder=survival_type sort=survival_type slider=ok clues=survival_type pin=survival_type wall=survival_type poll=survival_type wordcloud=survival_type survey=survival_type timedlist=survival_type letterwords=survival_type moreless=survival_type drawing=survival_type sudoku=puzzle_place+survival_type crossword=puzzle_place+survival_type jigsaw=jigsaw_place+survival_type spotdiff=spotdiff_place+survival_type memory=memory_place+survival_type melody=melody_place+survival_type bluff=survival_type",
        "wipeout": "single=ok multi=wipeout_type boolean=ok text=ok numeric=ok order=wipeout_type match=wipeout_type chain=wipeout_type wordladder=wipeout_type+wordladder_place sort=wipeout_type slider=ok clues=clues_place+wipeout_type pin=pin_place+wipeout_type wall=wall_place+wipeout_type poll=vote_place+wipeout_type wordcloud=vote_place+wipeout_type survey=survey_place+wipeout_type timedlist=timedlist_place+wipeout_type letterwords=letterwords_place+wipeout_type moreless=moreless_place+wipeout_type drawing=drawing_place+wipeout_type sudoku=puzzle_place+wipeout_type crossword=puzzle_place+wipeout_type jigsaw=jigsaw_place+wipeout_type spotdiff=spotdiff_place+wipeout_type memory=memory_place+wipeout_type melody=melody_place+wipeout_type bluff=bluff_place+wipeout_type",
      }
    `);
  });
});
