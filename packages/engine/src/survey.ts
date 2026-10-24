import { LIMITS, type Phase, type Question, type SurveyAnswer, type SurveyRow } from '@quiz/shared';
import { surveyHits } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import { currentRound, fail, ok, withCurrentPlay, type GameState, type Play, type Result, type SurveyPlay } from './game';
import { normalizeText } from './normalize';
import { cloudTally, cloudVoters } from './votes';

type SurveyQuestion = Extract<Question, { type: 'survey' }>;

/**
 * Чистить відповідь «100 до 1»: обрізано, пробіли зведено, без порожніх і повторів за normalizeText, не більше question.answers;
 * rows — surveyHits. Нічого не лишилося — values [].
 */
export function scoreSurvey(question: SurveyQuestion, answer: { values: readonly string[] }): SurveyAnswer {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const raw of answer.values) {
    if (values.length >= question.answers) break;
    const value = raw.trim().replace(/\s+/g, ' ');
    const key = normalizeText(value);
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    values.push(value);
  }
  return { type: 'survey', values, rows: surveyHits(question.rows, values) };
}

/** Останній запис журналу із запитанням id; немає — undefined. */
function lastPlayOf(state: GameState, id: string): { play: Play; index: number } | undefined {
  for (let index = state.plays.length - 1; index >= 0; index -= 1) {
    if (state.plays[index].question.id === id) return { play: state.plays[index], index };
  }
  return undefined;
}

/**
 * Дошка для відкриття: з хмари cloudId (без схованих слів і повторів за normalizeText, до LIMITS.maxSurveyRows, популярність max(1, round(100 × count / voters)),
 * id 'cloud-1'…); хмари немає в журналі чи вона порожня — рядки ведучого, якщо їх ≥ minSurveyRows; інакше null (запитання пропускається).
 * Без cloudId — рядки ведучого. Для інших типів — null.
 */
export function surveyBoard(state: GameState, question: Question): { rows: SurveyRow[]; source: 'host' | 'cloud' } | null {
  if (question.type !== 'survey') return null;
  const host = { rows: question.rows, source: 'host' as const };
  if (question.cloudId === undefined) return host;
  const cloud = lastPlayOf(state, question.cloudId)?.play;
  // Гравці — з state.players: вилучені не рахуються ні в словах, ні серед тих, хто писав.
  // Відповіді рушій звіряє за normalizeText (answerKey): слова, що збігаються за ним (напр. «…» і “…”), — один рядок, перше з них.
  const keys = new Set<string>();
  const entries =
    cloud === undefined
      ? []
      : cloudTally(cloud, state.players)
          .filter((e) => !e.hidden)
          .filter((e) => {
            const key = normalizeText(e.text);
            if (keys.has(key)) return false;
            keys.add(key);
            return true;
          })
          .slice(0, LIMITS.maxSurveyRows);
  if (cloud === undefined || entries.length === 0) return question.rows.length >= LIMITS.minSurveyRows ? host : null;
  const voters = cloudVoters(cloud, state.players);
  const rows = entries.map((entry, index) => ({
    id: `cloud-${index + 1}`,
    text: entry.text,
    // Сума може перевищити 100 (кожен писав кілька слів): бали однаково не більші за ціну.
    popularity: Math.max(1, Math.round((100 * entry.count) / voters)),
    accepted: [],
  }));
  return { rows, source: 'cloud' };
}

/** Поточне запитання «100 до 1» з його грою; null поза ним. */
export function surveyPlayOf(state: GameState): (Play & { survey: SurveyPlay; question: SurveyQuestion }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.survey === undefined || play.question.type !== 'survey') return null;
  return play as Play & { survey: SurveyPlay; question: SurveyQuestion };
}

/** Відкриває ще один рядок знизу (етап reveal). */
export function stepSurvey(state: GameState): GameState {
  const play = surveyPlayOf(state);
  if (play === null) return state;
  return withCurrentPlay(state, { ...play, survey: { ...play.survey, shown: Math.min(play.question.rows.length, play.survey.shown + 1) } });
}

/** «Відкрити всі»: усі рядки на етапі reveal. Помилки: wrong_phase — не reveal або не «100 до 1»; paused. */
export function revealSurveyAll(state: GameState): Result {
  if (state.paused) return fail('paused');
  const play = surveyPlayOf(state);
  if (state.phase !== 'reveal' || play === null) return fail('wrong_phase');
  return ok(withCurrentPlay(state, { ...play, survey: { ...play.survey, shown: play.question.rows.length } }));
}

/** Етапи, на яких хмара ще може змінитися (hideCloudWord). */
const CLOUD_LIVE: Phase[] = ['question', 'locked', 'reveal'];

/**
 * «100 до 1» поточного класичного раунду, які пропущено або буде пропущено: незіграні, surveyBoard === null,
 * а хмара вже усталена (її запис не поточний, або етап не question/locked/reveal, або її раунд минув). Порядок раунду.
 */
export function skippedSurveys(state: GameState): Question[] {
  const round = currentRound(state);
  // Лише класика: «100 до 1» поза SURVIVAL_TYPES, тож у «Вибуванні» його не буває.
  if (round?.type !== 'classic') return [];
  const played = new Set(state.plays.filter((p) => p.roundIndex === state.roundIndex).map((p) => p.question.id));
  return round.questions.filter((question) => {
    if (question.type !== 'survey' || question.cloudId === undefined || played.has(question.id)) return false;
    const cloud = lastPlayOf(state, question.cloudId);
    // Незіграна хмара цього ж раунду ще попереду (вона стоїть раніше); хмара минулого раунду вже не зіграється.
    const settled =
      cloud === undefined
        ? !round.questions.some((q) => q.id === question.cloudId)
        : cloud.index !== state.questionIndex || !CLOUD_LIVE.includes(state.phase);
    return settled && surveyBoard(state, question) === null;
  });
}

/** Скільки рядків видно на сцені: на reveal — shown, після reveal (leaderboard, round_end, finished) — усі. */
export function surveyShown(state: GameState, play: Play): number {
  if (play.question.type !== 'survey') return 0;
  const total = play.question.rows.length;
  if (play !== state.plays[state.questionIndex]) return total;
  if (state.phase === 'question' || state.phase === 'locked') return 0;
  if (state.phase === 'reveal') return Math.min(total, play.survey?.shown ?? 0);
  return total;
}
