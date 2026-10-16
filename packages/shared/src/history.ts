import type { Question, Round } from './quiz';

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
  /** Усі запитання вікторини в усіх раундах. */
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
  /** Порядковий номер запитання в грі. */
  index: number;
  roundIndex: number;
  text: string;
  type: Question['type'];
  answered: number;
  accepted: number;
}

/** Зіграна гра очима ведучого. */
export interface GameDetail extends Omit<GameSummary, 'playerCount'> {
  rounds: { title: string; type: Round['type'] }[];
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
