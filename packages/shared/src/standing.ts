export interface Standing {
  participantId: string;
  nickname: string;
  score: number;
  totalTimeMs: number;
  rank: number;
  /** Бали за раундами від першого до поточного (11f); немає — не надіслано (rankPlayers, старі фікстури). */
  rounds?: number[];
}
