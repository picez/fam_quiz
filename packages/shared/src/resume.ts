import type { GameStatus } from './history';
import type { RoundType } from './quiz';

/** Продовжити гру (12r): найбільші перенесені бали за модулем. */
export const RESUME_POINTS_MAX = 9_999_999;
/** Скільки попередніх ігор цієї вікторини пропонує «Підставити з попередньої гри». */
export const RESUME_OPTIONS = 5;

/** Дані «Продовжити гру» в host:start: стартовий раунд (0-базовий) і бали учасників рушія (соло — гравець, командна гра — команда). */
export interface ResumeSetup {
  roundIndex: number;
  points: Record<string, number>;
}

/** Лобі «Продовжити гру» на пульті й у автора: раунди вікторини й учасники, яким можна перенести бали. */
export interface ResumeLobby {
  rounds: { title: string; type: RoundType }[];
  participants: { id: string; nickname: string }[];
}

/** Попередня гра цієї вікторини для «Підставити з попередньої гри». */
export interface ResumeOption {
  gameId: string;
  startedAt: string;
  status: GameStatus;
  questionsPlayed: number;
  /** Усі запитання знімка тієї гри. */
  questionCount: number;
  autopilot: boolean;
  /** Раунд, з якого продовжити (resumeRound), 0-базовий. */
  roundIndex: number;
  /** Рядки таблиці тієї гри: соло-гравці чи команди. */
  scores: { nickname: string; score: number }[];
}
