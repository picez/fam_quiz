import { z } from 'zod';

/** Як продовжити збережену гру (13b): exact — зі знімка стану; restart — лобі «Продовжити гру» (12r); blocked — не можна. */
export type SavedMode = 'exact' | 'restart' | 'blocked';

/** Збережена гра в історії ведучого. open — продовження вже відкрите; savedAt — ISO-мить збереження. */
export interface SavedInfo {
  mode: SavedMode;
  open: boolean;
  /** Код відкритої кімнати продовження (лише коли open); null — коду немає. */
  openCode: string | null;
  savedAt: string;
}

/** Слот у панелі ведучого/автора. */
export interface SavedSlot {
  id: string;
  nickname: string;
  team: string | null;
  taken: boolean;
  account: boolean;
}

/** Слот у формі входу. */
export interface SlotOption {
  id: string;
  nickname: string;
  team: string | null;
}

/** GET …/slots: вільні гостьові слоти й слот акаунта того, хто питає (null — немає чи гість). */
export interface SlotsResponse {
  slots: SlotOption[];
  mine: SlotOption | null;
}

/** Кімната продовження в зрізі пульта й автора. carryRound — 0-базовий стартовий раунд шляху 12r; null — точне продовження. */
export interface ContinuedView {
  slots: SavedSlot[];
  carryRound: number | null;
}

/** «Продовжити»: ведучий отримує пульт і сцену; автор автопілота — сцену й свій токен гравця. */
export type ContinueResponse =
  | { gameId: string; code: string; hostToken: string; stageToken: string }
  | { gameId: string; code: string; stageToken: string; token: string; playerId: string };

/** POST …/claim: зайняти слот збереженої гри. */
export const claimSchema = z.object({ slotId: z.string().uuid() }).strict();
