import type { Answer } from "@quiz/shared";
import type { Room, RoomManager } from "../rooms/manager";

/** Правильна й неправильна відповідь на кожну сходинку w1…w5 (`wipeoutLadder`). */
export const WIPEOUT_RIGHT: Answer[] = [
  { type: "single", optionId: "b" },
  { type: "boolean", value: true },
  { type: "numeric", value: 2100 },
  { type: "text", value: "Одеса" },
  { type: "slider", value: 52 },
];
export const WIPEOUT_WRONG: Answer[] = [
  { type: "single", optionId: "a" },
  { type: "boolean", value: false },
  { type: "numeric", value: 3000 },
  { type: "text", value: "Львів" },
  { type: "slider", value: 53 },
];

/**
 * Проходить раунд «Ва-банк» до `round_end` і зупиняється: `right[id]` — на які сходинки (з нуля) гравець відповідає правильно
 * (решта — неправильно; null — гравець мовчить; відповідає лише той, хто ще в грі), `takes[id]` — після якої сходинки забирає банк (решта вибирають «Далі»).
 */
export function playWipeout(
  manager: RoomManager,
  room: Room,
  right: Record<string, number[] | null>,
  takes: Record<string, number>,
  stopAfter = 5,
): void {
  const ids = Object.keys(right);
  const phase = (): string => room.state.phase;
  manager.host(room, { type: "start" });
  for (let step = 0; step < stopAfter; step++) {
    for (let guard = 0; guard < 6 && phase() !== "question"; guard++)
      manager.host(room, { type: "next" });
    for (const id of ids) {
      const mine = right[id];
      if (mine !== null)
        manager.answer(
          room,
          id,
          mine.includes(step) ? WIPEOUT_RIGHT[step] : WIPEOUT_WRONG[step],
        );
    }
    if (phase() === "question") manager.host(room, { type: "lock" });
    manager.host(room, { type: "next" });
    if (phase() !== "reveal")
      throw new Error(`expected reveal, got ${phase()}`);
    manager.host(room, { type: "next" });
    if (phase() === "leaderboard") {
      for (const id of ids) manager.wipeout(room, id, takes[id] === step);
      // Вікно закрите вирішеними (або таймером у тесті): далі ведучий.
    }
  }
}
