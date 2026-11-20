import type { Answer } from './answer';
import type { AdjustmentSource, BuffKind, DebuffKind, Grade } from './game';
import type { GameAppeal, GameStatus } from './history';
import type { Question, RoundType } from './quiz';
import type { UndoTarget } from './undo';

/**
 * 65: види подій гри, які рекордер пише в game_event. start — позначка «ця гра записує події»;
 * save — «Зберегти»: пауза, не знята до збереження, далі має невідому тривалість.
 */
export const GAME_EVENT_KINDS = ['start', 'join', 'leave', 'pause', 'resume', 'verdict', 'save'] as const;
export type GameEventKind = (typeof GAME_EVENT_KINDS)[number];

/** Подробиці події: verdict — оцінка до й після рішення ведучого; leave — рахунок і команда на мить вилучення. */
export interface GameEventDetails {
  from?: Grade | null;
  to?: Grade;
  score?: number;
  team?: string;
}

/** Номер спроби голосу (VOTE_ATTEMPT у схемі сервера). */
export const REPLAY_VOTE_ATTEMPT = -3;

export type ReplayVerdict = 'correct' | 'partial' | 'wrong' | 'none';

/** Рішення за збереженим рядком відповіді: опитування й голоси — без рішення; не відповів — 'none'. */
export function replayVerdict(
  row: { accepted: boolean; points: number; payload: Answer | null; attempt: number },
  unscored: boolean,
): ReplayVerdict {
  if (unscored || row.attempt === REPLAY_VOTE_ATTEMPT) return 'none';
  if (row.accepted) return 'correct';
  if (row.points > 0) return 'partial';
  if (row.payload === null && row.points === 0) return 'none';
  return 'wrong';
}

export interface ReplayRow {
  /** Ключ учасника в межах повтору (p1, p2, …): не id акаунта; той самий у ReplayScore. */
  key: string;
  nickname: string;
  /** Нікнейм людини, що відповідала за команду; null — соло чи невідомо. */
  answeredBy: string | null;
  attempt: number;
  answer: Answer | null;
  spare: Question | null;
  /** null — немає відповіді чи службова спроба («—»). */
  timeMs: number | null;
  verdict: ReplayVerdict;
  manual: boolean;
  points: number;
  wager: number | null;
  awayMs: number | null;
}

export interface ReplayScore {
  key: string;
  nickname: string;
  score: number;
}

export type ReplayEvent =
  /** from: null — стара гра, оцінка до рішення не збереглася. */
  | { kind: 'manual'; nickname: string; from: ReplayVerdict | null; to: ReplayVerdict }
  | { kind: 'adjustment'; nickname: string; source: AdjustmentSource; points: number; target?: string | null; debuff?: DebuffKind; undoes?: UndoTarget }
  | { kind: 'appeal'; nickname: string; appeal: GameAppeal }
  | { kind: 'buff'; nickname: string; buff: BuffKind }
  | { kind: 'debuff'; nickname: string; debuff: DebuffKind }
  | { kind: 'join' | 'leave'; nickname: string; at: string; team?: string; score?: number }
  /** ended: resume — знята (ms — тривалість); game — не знята до кінця гри; unknown — гру збережено на паузі, тривалість невідома. ms: null — не resume. */
  | { kind: 'pause'; at: string; ms: number | null; ended: 'resume' | 'game' | 'unknown' };

export interface ReplayStep {
  index: number;
  roundIndex: number;
  /** null — знімок гри зіпсований. */
  question: Question | null;
  price: number;
  multiplier: number;
  rows: ReplayRow[];
  /** Рахунок після кроку. */
  scores: ReplayScore[];
  events: ReplayEvent[];
}

export interface GameReplay {
  id: string;
  title: string;
  code: string;
  status: GameStatus;
  startedAt: string;
  finishedAt: string | null;
  autopilot: boolean;
  teams: boolean;
  rounds: { title: string; type: RoundType }[];
  /** Є подія start: гра записувала події (65). */
  recorded: boolean;
  /** Найменший question_index події start (−1 — з початку); кроки з меншим index записано без подій. null — подій немає. */
  recordedFrom: number | null;
  start: { scores: ReplayScore[]; events: ReplayEvent[] };
  steps: ReplayStep[];
}
