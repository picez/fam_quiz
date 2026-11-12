import { APPEAL_MS, APPEALS_PER_GAME, AUDIO_LIMITS, AUTOPILOT_MS, AWAY_MS, DEFAULT_ANSWER_WINDOW, LIMITS, PACE_MS, REVEAL_MIN_SHARE, SUDOKU_GIVENS, type Locale } from '@quiz/shared';
import { currentLocale } from '../locales/current';
import { decimalText } from '../locales/grammar';

/** Ключі LIMITS, що стоять у тексті довідки: {ключ} = LIMITS[ключ]. */
const LIMIT_KEYS = [
  'bluffLie',
  'bluffOptions',
  'cloudShown',
  'cloudWord',
  'clueTailSeconds',
  'clueText',
  'defaultDebuffPrice',
  'defaultSurveyAnswers',
  'defaultWallMistakes',
  'defaultCrosswordTime',
  'defaultJigsawTime',
  'defaultMemoryTime',
  'defaultSpotdiffTime',
  'defaultSudokuTime',
  'drawGuess',
  'ladderOptions',
  'maxAccepted',
  'maxAudioSeconds',
  'maxBet',
  'maxBluffSpares',
  'maxCategories',
  'maxCategoryQuestions',
  'maxCategorySpares',
  'maxChainWords',
  'maxCloudWords',
  'maxCrosswordKey',
  'maxCrosswordSide',
  'maxCrosswordWord',
  'maxCrosswordWords',
  'maxJigsawPieces',
  'maxClueSeconds',
  'maxClues',
  'maxDebuffPrice',
  'maxDuelTries',
  'maxLadderLevel',
  'maxLadderQuestions',
  'maxLetterSet',
  'maxListItems',
  'maxMoreLessPairs',
  'maxPuzzleTime',
  'maxPuzzles',
  'maxOptions',
  'maxOrderItems',
  'maxPairs',
  'maxPoints',
  'maxSliderSteps',
  'maxSortCategories',
  'maxSortWords',
  'maxSpares',
  'maxStrokes',
  'maxSurveyAnswers',
  'maxSurveyRows',
  'maxSurvivalQuestions',
  'maxSurvivalTrials',
  'maxSurvivors',
  'maxTeams',
  'maxWallMistakes',
  'maxWipeoutQuestions',
  'maxWordLadderLetters',
  'maxWordLadderSteps',
  'minAudioSeconds',
  'minBluffSpares',
  'minCategories',
  'minCategoryQuestions',
  'minChainWords',
  'minClueSeconds',
  'minClues',
  'minCrosswordKey',
  'minCrosswordWord',
  'minCrosswordWords',
  'minJigsawPieces',
  'minJigsawTime',
  'minMemoryTime',
  'minSpotdiffTime',
  'minDebuffPrice',
  'minLadderQuestions',
  'minLetterSet',
  'minLetterWord',
  'minListItems',
  'minMoreLessPairs',
  'minOptions',
  'minOrderItems',
  'minPairs',
  'minSortCategories',
  'minSortWords',
  'minSurveyRows',
  'minSurvivalQuestions',
  'minTeams',
  'minWallMistakes',
  'minWipeoutQuestions',
  'minWordLadderLetters',
  'pinMaxAspect',
  'pinMaxFullRadius',
  'pinMaxZeroRadius',
  'roundDescription',
  'selfCluesMinTime',
  'surveyAnswer',
  'surveyRowText',
  'surveyTotal',
  'survivalLuckSeconds',
  'teamName',
  'wallGroupName',
  'wallTile',
  'wipeoutDecideSeconds',
] as const satisfies readonly (keyof typeof LIMITS)[];

/** Секунди з мс без одиниці (одиницю «с» пише текст): десятковий знак мови — «1,5» (uk) / «1.5» (en). */
const seconds = (ms: number, locale: Locale) => decimalText(ms / 1000, Number.isInteger(ms / 1000) ? 0 : 1, locale);

const cache = new Map<Locale, Record<string, string>>();

/** Значення плейсхолдерів довідки: усе з констант shared, секунди — десятковим числом мови без одиниці. */
export function helpVars(locale?: Locale): Record<string, string> {
  const key = locale ?? currentLocale();
  const hit = cache.get(key);
  if (hit) return hit;
  const vars: Record<string, string> = {};
  for (const name of LIMIT_KEYS) vars[name] = String(LIMITS[name]);
  const ms = (prefix: string, table: Readonly<Record<string, number>>, names: readonly string[]) => {
    for (const name of names) vars[prefix + name.charAt(0).toUpperCase() + name.slice(1)] = seconds(table[name]!, key);
  };
  ms('pace', PACE_MS, ['step', 'row', 'intro', 'lock', 'decisions']);
  ms('away', AWAY_MS, ['mark', 'penalty', 'preGrace']);
  ms('appeal', APPEAL_MS, ['vote']);
  ms('autopilot', AUTOPILOT_MS, ['guide', 'intro', 'introPerChars', 'introMax', 'locked', 'reveal', 'row', 'rowsTail', 'finalRow', 'leaderboard', 'decisions', 'roundEnd', 'boardDice', 'teamDice', 'ladderDecision', 'resume', 'appealWindow', 'appealShown']);
  vars.awayAlarm = seconds(AWAY_MS.alarm, key);
  vars.autopilotIntroChars = String(AUTOPILOT_MS.introChars);
  vars.appealsPerGame = String(APPEALS_PER_GAME);
  vars.audioMaxMb = String(AUDIO_LIMITS.maxBytes / 1024 / 1024);
  vars.defaultAnswerWindow = String(DEFAULT_ANSWER_WINDOW);
  vars.maxBoardCells = String(LIMITS.maxCategories * LIMITS.maxCategoryQuestions);
  vars.revealMinShare = String(Math.round(REVEAL_MIN_SHARE * 100));
  // «Головоломки» (28d): скільки цифр задає генератор судоку за складністю.
  vars.sudokuEasy = String(SUDOKU_GIVENS.easy);
  vars.sudokuMedium = String(SUDOKU_GIVENS.medium);
  vars.sudokuHard = String(SUDOKU_GIVENS.hard);
  cache.set(key, vars);
  return vars;
}
