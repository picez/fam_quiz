import type { Question } from './quiz';

export type GameStatus = 'running' | 'finished' | 'aborted';

/** Рядок у списку ігор ведучого. */
export interface GameSummary {
  id: string;
  title: string;
  code: string;
  status: GameStatus;
  startedAt: string;
  finishedAt: string | null;
  playerCount: number;
  questionsPlayed: number;
  questionCount: number;
}

export interface GameStanding {
  participantId: string;
  nickname: string;
  score: number;
  rank: number | null;
  /** Скільки відповідей зараховано. */
  correct: number;
}

export interface GameQuestionResult {
  index: number;
  text: string;
  type: Question['type'];
  answered: number;
  accepted: number;
}

/** Зіграна гра очима ведучого. */
export interface GameDetail extends Omit<GameSummary, 'playerCount'> {
  standings: GameStanding[];
  questions: GameQuestionResult[];
}

/** Гра в історії гравця з акаунтом. */
export interface PlayedGame {
  gameId: string;
  title: string;
  status: GameStatus;
  startedAt: string;
  nickname: string;
  score: number;
  rank: number | null;
  playerCount: number;
  correct: number;
  answered: number;
  questionsPlayed: number;
}
