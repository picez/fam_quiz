/** intro — заставка раунду, round_end — підсумки раунду. */
export type Phase = 'lobby' | 'intro' | 'wager' | 'question' | 'locked' | 'reveal' | 'board' | 'leaderboard' | 'round_end' | 'finished';

export type Grade = 'correct' | 'partial' | 'wrong';

/** Звідки коригування рахунку поза відповідями: бали від ведучого або дуель. */
export const ADJUSTMENT_SOURCES = ['host', 'duel'] as const;
export type AdjustmentSource = (typeof ADJUSTMENT_SOURCES)[number];

export type ErrorCode =
  | 'wrong_phase'
  | 'paused'
  | 'not_found'
  | 'no_players'
  | 'room_full'
  | 'nickname_invalid'
  | 'nickname_taken'
  | 'already_answered'
  | 'time_over'
  | 'type_mismatch'
  | 'partial_disabled'
  | 'wager_invalid'
  | 'not_in_queue'
  | 'already_queued'
  | 'no_attempts'
  | 'not_your_turn'
  | 'cell_closed'
  | 'time_limit'
  | 'wrong_word'
  | 'no_hint'
  | 'hint_late'
  | 'dice_pending'
  | 'points_invalid';
