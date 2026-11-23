import { LIMITS, REVEAL_TYPES, isPuzzle, type Question } from '@quiz/shared';
import { t } from '../i18n';
import { maxTimeOf, type QuestionType } from './draft';

/**
 * Які поля показує редактор запитання (74). Умови — дослівно ті, що стояли в JSX QuestionEditor:
 * картки лише групують поля, видимість не змінюється (охорона — знімок QuestionEditor.fields.test.tsx).
 */
export interface LayoutFlags {
  showPoints: boolean;
  showHint: boolean;
  showTime: boolean;
  showVideo: boolean;
  showAudio: boolean;
  showReveal: boolean;
}

export interface MediaFields {
  image: boolean;
  reveal: boolean;
  video: boolean;
  audio: boolean;
}

/** Картка редактора запитання (без React: її беруть і draft.ts, і problem-cards.ts). */
export type QuestionCard = 'type' | 'question' | 'media' | 'answers' | 'time';

/** Нижче цього таймера — сіре нагадування (зберегти можна). */
export const REMINDER_MIN_TIME = 25;

/** Типи, у яких медіа — суть: картки «Медіа» немає, їхні поля QuestionEditor — на початку «Відповідей». */
export const MEDIA_NATIVE: ReadonlySet<QuestionType> = new Set<QuestionType>(['melody', 'videoclip', 'jigsaw', 'spotdiff', 'memory', 'pin']);

/** Типи, у яких основу картинки веде власний редактор. */
const OWN_PICTURE: ReadonlySet<QuestionType> = new Set<QuestionType>(['pin', 'jigsaw', 'spotdiff', 'memory']);

/** Типи без відео до запитання. */
const NO_VIDEO: ReadonlySet<QuestionType> = new Set<QuestionType>(['chain', 'wordladder', 'wordle', 'sort', 'clues', 'pin', 'wall', 'bluff', 'spy', 'timedlist', 'letterwords', 'moreless', 'drawing', 'melody', 'videoclip', 'jigsaw', 'spotdiff', 'memory', 'think']);

/** У малюнку звуку немає: він видав би слово. У головоломках теж: сітці він ні до чого. */
const NO_AUDIO: ReadonlySet<QuestionType> = new Set<QuestionType>(['think', 'spy', 'drawing', 'melody', 'videoclip', 'jigsaw', 'spotdiff', 'memory']);

/** Підказка — для бафів; у «Більше чи менше», «Малюнку» й головоломках бафів немає. */
const NO_HINT: ReadonlySet<QuestionType> = new Set<QuestionType>(['think', 'thinkalike', 'spy', 'wordle', 'moreless', 'drawing', 'melody', 'videoclip', 'jigsaw', 'spotdiff', 'memory']);

/** Таймер пазла, різниць і пам'яті живе у їхньому редакторі. */
const OWN_TIME: ReadonlySet<QuestionType> = new Set<QuestionType>(['jigsaw', 'spotdiff', 'memory']);

/** Ціна за запитання не потрібна: бали рахує сам тип. */
const OWN_POINTS: ReadonlySet<QuestionType> = new Set<QuestionType>(['sort', 'timedlist', 'letterwords', 'moreless']);

/** Опитування й хмара без балів: поля ціни немає, замість нього — пояснення. */
export function isVote(question: Question): boolean {
  return question.type === 'poll' || question.type === 'wordcloud';
}

/** Чи час у межах (у головоломок — власна межа); поки ні, поле часу видно й для запитання з відео, щоб автор міг його виправити. */
function timeInLimits(question: Question): boolean {
  const { timeLimit } = question;
  return Number.isInteger(timeLimit) && timeLimit >= LIMITS.minTime && timeLimit <= maxTimeOf(question);
}

export function mediaFields(question: Question, flags: LayoutFlags): MediaFields {
  const { type } = question;
  return {
    image: !OWN_PICTURE.has(type),
    reveal: flags.showReveal && type !== 'thinkalike' && type !== 'spy' && question.imageUrl !== null && question.video === null && (REVEAL_TYPES as readonly string[]).includes(type),
    video: flags.showVideo && question.audio === undefined && !NO_VIDEO.has(type) && !isPuzzle(question),
    audio: flags.showAudio && question.video === null && !NO_AUDIO.has(type) && !isPuzzle(question),
  };
}

export function hintShown(question: Question, flags: LayoutFlags): boolean {
  return flags.showHint && !NO_HINT.has(question.type) && !isPuzzle(question);
}

/** Чи є в редакторі місце для часу (поле таймера або пояснення «без таймера»). */
function timeSlot(question: Question, flags: LayoutFlags): boolean {
  return flags.showTime && !OWN_TIME.has(question.type);
}

/** NumberField таймера (не noTimerHint). */
export function timeFieldShown(question: Question, flags: LayoutFlags): boolean {
  return timeSlot(question, flags) && (question.video === null || !timeInLimits(question));
}

export function noTimerHintShown(question: Question, flags: LayoutFlags): boolean {
  return timeSlot(question, flags) && question.video !== null && timeInLimits(question);
}

export function pointsFieldShown(question: Question, flags: LayoutFlags): boolean {
  return flags.showPoints && !OWN_POINTS.has(question.type) && !isVote(question);
}

export function hasMedia(question: Question): boolean {
  return question.imageUrl !== null || question.video !== null || question.audio !== undefined;
}

/** Початок відео як «0:42». */
function clock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** «картинка, відео з 0:42, звук»; null — медіа немає. */
export function mediaSummary(question: Question): string | null {
  const parts: string[] = [];
  if (question.imageUrl !== null) parts.push(t('cardMediaImage'));
  if (question.video !== null) {
    const start = question.video.start;
    parts.push(Number.isFinite(start) && start > 0 ? t('cardMediaVideoFrom', { time: clock(start) }) : t('cardMediaVideo'));
  }
  if (question.audio !== undefined) parts.push(t('cardMediaAudio'));
  return parts.length === 0 ? null : parts.join(', ');
}
