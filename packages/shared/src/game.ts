/** intro — заставка раунду, round_end — підсумки раунду. */
export type Phase = 'lobby' | 'intro' | 'question' | 'locked' | 'reveal' | 'leaderboard' | 'round_end' | 'finished';

export type Grade = 'correct' | 'partial' | 'wrong';

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
  | 'not_in_queue'
  | 'already_queued'
  | 'no_attempts';
