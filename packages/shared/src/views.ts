import type { Answer } from './answer';
import type { Phase } from './game';
import type { Question } from './quiz';
import type { Standing } from './standing';

export interface Choice {
  id: string;
  text: string;
}

/** Запитання без правильної відповіді; choices у порядку показу. */
export interface PublicQuestion {
  type: Question['type'];
  text: string;
  imageUrl: string | null;
  timeLimit: number;
  points: number;
  choices: Choice[];
}

export interface RevealStats {
  answered: number;
  accepted: number;
  /** Кількість виборів за id варіанта; для boolean ключі "true" і "false". */
  counts: Record<string, number>;
}

export interface LobbyPlayer {
  id: string;
  nickname: string;
  connected: boolean;
}

interface BaseView {
  phase: Phase;
  paused: boolean;
  questionIndex: number;
  total: number;
  question: PublicQuestion | null;
  endsAt: number | null;
  remainingMs: number | null;
  playerCount: number;
  answeredCount: number;
}

export interface StageView extends BaseView {
  role: 'stage';
  players: LobbyPlayer[];
  reveal: Question | null;
  stats: RevealStats | null;
  standings: Standing[] | null;
}

export interface PlayerResult {
  accepted: boolean;
  accuracy: number;
  points: number;
}

export interface PlayerView extends BaseView {
  role: 'player';
  me: {
    id: string;
    nickname: string;
    score: number;
    rank: number | null;
    answer: Answer | null;
    result: PlayerResult | null;
  };
  reveal: Question | null;
  standings: Standing[] | null;
}

export interface HostResponse {
  playerId: string;
  nickname: string;
  answer: Answer;
  timeMs: number;
  accepted: boolean;
  points: number;
  overridden: boolean;
}

export interface HostView extends BaseView {
  role: 'host';
  players: (LobbyPlayer & { score: number })[];
  correct: Question | null;
  responses: HostResponse[];
  standings: Standing[];
}

export type GameView = StageView | PlayerView | HostView;
