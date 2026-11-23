import type { Question } from '@quiz/shared';
import type { TextKey } from '../i18n';
import { MEDIA_NATIVE, type QuestionCard } from './question-layout';

/** Порожній текст запитання й незадана межа ставок — у картці «Запитання». */
const QUESTION_KEYS: ReadonlySet<TextKey> = new Set<TextKey>(['problemNoText', 'problemBetsCut', 'problemAuctionCut']);

/** Тип, якому не місце в цьому раунді (чи серед запасних), — у виборі типу. */
const TYPE_KEYS: ReadonlySet<TextKey> = new Set<TextKey>([
  'problemPuzzlePlace',
  'problemJigsawPlace',
  'problemSpotdiffPlace',
  'problemMemoryPlace',
  'problemMelodyPlace',
  'problemVideoclipPlace',
  'problemWordlePlace',
  'problemVotePlace',
  'problemBluffPlace',
  'problemSurveyPlace',
  'problemRevealPlace',
  'problemCluesPlace',
  'problemSortPlace',
  'problemChainPlace',
  'problemWordLadderPlace',
  'problemListPlace',
  'problemLettersPlace',
  'problemMoreLessPlace',
  'problemDrawingPlace',
  'problemPinPlace',
  'problemWallPlace',
  'problemOvershootPlace',
  'problemAlikePlace',
  'problemSpyPlace',
  'problemPuzzlesType',
  'problemSpareType',
]);

/** Зайве чи зламане медіа — у картці «Медіа» (у типів, де медіа — суть, картки «Медіа» немає). */
const MEDIA_KEYS: ReadonlySet<TextKey> = new Set<TextKey>(['problemAudio', 'problemWordleVideo', 'problemSpyMedia']);

/** Час і бали поза межами — у картці «Час і бали». */
const TIME_KEYS: ReadonlySet<TextKey> = new Set<TextKey>(['problemLimits', 'problemLettersLimits', 'problemPuzzleLimits', 'problemMelodyLimits', 'problemVideoclipLimits']);

/** У якій картці редактора запитання видно проблему з ключем key (решта — «Відповіді»). */
export function cardOfProblem(key: TextKey, question: Question): QuestionCard {
  if (QUESTION_KEYS.has(key)) return 'question';
  if (TYPE_KEYS.has(key)) return 'type';
  if (MEDIA_KEYS.has(key)) return MEDIA_NATIVE.has(question.type) ? 'answers' : 'media';
  // Таймер пазла, різниць і пам'яті — у їхньому власному редакторі, тобто у «Відповідях»; цих ключів тут немає.
  if (TIME_KEYS.has(key)) return 'time';
  return 'answers';
}
