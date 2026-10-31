export interface Standing {
  participantId: string;
  nickname: string;
  score: number;
  totalTimeMs: number;
  rank: number;
  /** Бали за раундами від першого до поточного (11f); немає — не надіслано (rankPlayers, старі фікстури). */
  rounds?: number[];
  /** Бали за щойно закрите запитання (беклог 13): лише в таблиці між запитаннями; немає — інша фаза чи старий сервер. */
  question?: number;
}
