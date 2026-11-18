import { GROUP_CODE_ALPHABET } from './groups';
import type { BuffKind } from './game';
import { allowedBuffs, allowedDebuffs, LIMITS, type Question, type Quiz, type Round, type RoundType } from './quiz';

/** Скільки діб діє виклик (44). */
export const CHALLENGE_DAYS = 7;
export const CHALLENGE_CODE_LENGTH = 12;
/** Код виклику: 12 символів алфавіту груп (без 0, 1, i, l, o). */
export const CHALLENGE_CODE = new RegExp(`^[${GROUP_CODE_ALPHABET}]{${CHALLENGE_CODE_LENGTH}}$`);

/** Раунди, що потребують інших гравців, і запитання, що їх потребують (лише класика), і налаштування проти інших. */
export const CHALLENGE_SKIP_ROUNDS = ['truth', 'think', 'auction'] as const;
export const CHALLENGE_SKIP_TYPES = ['poll', 'wordcloud', 'thinkalike', 'spy', 'bluff', 'drawing'] as const;
export const CHALLENGE_SKIP_SETTINGS = ['teams', 'duels', 'debuffShop'] as const;
/** Бонуси, що наодинці не мають сенсу: «Запитання в залі» (ніхто не голосує), «Підглянути» (нема чиїх відповідей), «Запобіжник» і «Прихований напад» (нема суперників). */
export const CHALLENGE_SKIP_BUFFS = ['audience', 'peek', 'guard', 'stealth'] as const satisfies readonly BuffKind[];
export type ChallengeSkipSetting = (typeof CHALLENGE_SKIP_SETTINGS)[number] | (typeof CHALLENGE_SKIP_BUFFS)[number];

export interface ChallengeSkip {
  /** 0-базові індекси вихідної вікторини. */
  rounds: { index: number; type: RoundType; reason: 'type' | 'empty' }[];
  /** Пропущені запитання за раундом, що лишився (індекс вихідної вікторини). */
  questions: { index: number; count: number }[];
  /** Налаштування проти інших і бонуси з CHALLENGE_SKIP_BUFFS, що були ввімкнені, — у порядку цих списків. */
  settings: ChallengeSkipSetting[];
}

const skipRoundTypes: readonly string[] = CHALLENGE_SKIP_ROUNDS;
const skipQuestionTypes: readonly string[] = CHALLENGE_SKIP_TYPES;
const skipBuffs: readonly BuffKind[] = CHALLENGE_SKIP_BUFFS;

/** Запитання без «хмари» опитування; null — пропустити (власних рядків замало). */
function soloQuestion(q: Question): Question | null {
  if (skipQuestionTypes.includes(q.type)) return null;
  if (q.type === 'survey') {
    if (q.rows.length < LIMITS.minSurveyRows) return null;
    if (q.cloudId !== undefined) {
      const { cloudId: _cloud, ...rest } = q;
      return rest;
    }
  }
  return q;
}

/**
 * Знімок вікторини для виклику (44): без раундів і запитань, що потребують інших гравців, без команд, дуелей, крамниці дебафів і бонусів, яким потрібні інші гравці.
 * Новий об'єкт, вхід не змінюється; quiz: null — гратись самому нічим.
 */
export function challengeQuiz(quiz: Quiz): { quiz: Quiz | null; skipped: ChallengeSkip } {
  const skipped: ChallengeSkip = { rounds: [], questions: [], settings: [] };
  const rounds: Round[] = [];
  quiz.rounds.forEach((round, index) => {
    if (skipRoundTypes.includes(round.type)) {
      skipped.rounds.push({ index, type: round.type, reason: 'type' });
      return;
    }
    if (round.type !== 'classic') {
      rounds.push(round);
      return;
    }
    const questions = round.questions.flatMap((q) => {
      const kept = soloQuestion(q);
      return kept ? [kept] : [];
    });
    if (questions.length === 0) {
      skipped.rounds.push({ index, type: round.type, reason: 'empty' });
      return;
    }
    const dropped = round.questions.length - questions.length;
    if (dropped > 0) skipped.questions.push({ index, count: dropped });
    rounds.push({ ...round, questions });
  });

  const { teams: _teams, ...settingsRest } = quiz.settings;
  const { duels: _duels, ...quizRest } = quiz;
  const settings = { ...settingsRest };
  if (quiz.settings.teams !== undefined) skipped.settings.push('teams');
  if (quiz.duels !== undefined) skipped.settings.push('duels');
  if (allowedDebuffs(quiz).length > 0 && quiz.settings.debuffShop !== false) {
    settings.debuffShop = false;
    skipped.settings.push('debuffShop');
  }
  const buffs = allowedBuffs(quiz);
  const dead = buffs.filter((kind) => skipBuffs.includes(kind));
  if (dead.length > 0) {
    settings.buffs = (quiz.settings.buffs ?? []).filter((kind) => !skipBuffs.includes(kind));
    for (const kind of CHALLENGE_SKIP_BUFFS) if (dead.includes(kind)) skipped.settings.push(kind);
  }
  if (rounds.length === 0) return { quiz: null, skipped };
  return { quiz: { ...quizRest, settings, rounds }, skipped };
}

export interface ChallengeMine {
  quizId: string;
  code: string;
  expiresAt: string;
  played: number;
}
export interface ChallengeCheck {
  skipped: ChallengeSkip;
  empty: boolean;
  active: ChallengeMine | null;
}
export interface ChallengePreview {
  title: string;
  author: { id: string; nickname: string } | null;
  expiresAt: string;
  endedAt: string | null;
  active: boolean;
  played: number;
  isAuthor: boolean;
  mine: 'none' | 'playing' | 'done';
  canSeeResults: boolean;
}
export interface ChallengeResultRow {
  place: number;
  nickname: string;
  score: number;
  timeMs: number;
  at: string;
  done: boolean;
  author: boolean;
  me: boolean;
}
export interface ChallengeAttemptStart {
  code: string;
  token: string;
  playerId: string;
  stageToken: string;
}

const DAY_MS = 86_400_000;
/** Скільки діб лишилось: вгору до цілої, не менше 0. */
export function challengeDaysLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / DAY_MS));
}
