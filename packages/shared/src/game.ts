/** intro — заставка раунду, round_end — підсумки раунду. */
export type Phase = 'lobby' | 'intro' | 'wager' | 'question' | 'locked' | 'reveal' | 'board' | 'leaderboard' | 'round_end' | 'finished' | 'duel';

/** declared — оголошена, чекає кінця поточного запитання; далі етапи самої дуелі. */
export type DuelStage = 'declared' | 'category' | 'question' | 'answer' | 'result';

export type Grade = 'correct' | 'partial' | 'wrong';

/** Звідки коригування рахунку поза відповідями: бали від ведучого або дуель. */
export type AdjustmentSource = 'host' | 'duel';

/** Дебафи від ведучого: діють на телефоні цілі в наступному запитанні, у якому вона відповідає. */
export const DEBUFF_KINDS = ['shake', 'fog', 'freeze', 'mirror', 'guests', 'mud'] as const;
export type DebuffKind = (typeof DEBUFF_KINDS)[number];

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
  | 'points_invalid'
  | 'debuff_busy'
  | 'sort_locked'
  | 'sort_stale'
  | 'duel_used'
  | 'duel_busy'
  | 'duel_empty';
