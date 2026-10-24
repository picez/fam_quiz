import type { Answer } from "@quiz/shared";
import type { Room, RoomManager } from "../rooms/manager";

/** Правильна й неправильна відповідь на кожне запитання s1…s5 (`survivalQuestions`). */
export const SURVIVAL_RIGHT: Answer[] = [
  { type: "single", optionId: "b" },
  { type: "boolean", value: true },
  { type: "numeric", value: 2061 },
  { type: "text", value: "Одеса" },
  { type: "slider", value: 50 },
];
export const SURVIVAL_WRONG: Answer[] = [
  { type: "single", optionId: "a" },
  { type: "boolean", value: false },
  { type: "numeric", value: 3000 },
  { type: "text", value: "Львів" },
  { type: "slider", value: 90 },
];
/** Правильна й неправильна відповідь на питання на виживання t1, t2 (`survivalTrials`). */
export const TRIAL_RIGHT: Answer[] = [
  { type: "boolean", value: true },
  { type: "single", optionId: "b" },
];
export const TRIAL_WRONG: Answer[] = [
  { type: "boolean", value: false },
  { type: "single", optionId: "a" },
];

/**
 * Грає одне запитання «Вибування» до кінця випробування: right — хто з живих відповідає правильно (решта живих неправильно),
 * silent — хто мовчить, ghosts — відповіді привидів (true — правильно), trial — хто проходить питання на виживання
 * (решта «на межі» відповідає неправильно), doors — які двері вибирає хто (число, або "trap" — двері з пасткою, "safe" — без неї;
 * пастка з rng гри, тож тест не покладається на її місце; решта «на межі» не вибирає).
 * Зупиняється на leaderboard: з закритим випробуванням або з вердиктом без нього.
 */
export function playSurvivalQuestion(
  manager: RoomManager,
  room: Room,
  plan: { right: string[]; silent?: string[]; ghosts?: Record<string, boolean>; trial?: string[]; doors?: Record<string, number | "trap" | "safe"> },
): void {
  const phase = (): string => room.state.phase;
  if (phase() === "lobby") manager.host(room, { type: "start" });
  // Після попереднього запитання ведучий тисне «Далі»: випробування вже закрите, тож це перехід.
  if (phase() === "leaderboard") manager.host(room, { type: "next" });
  for (let guard = 0; guard < 6 && phase() !== "question"; guard++) manager.host(room, { type: "next" });
  if (phase() !== "question") throw new Error(`expected question, got ${phase()}`);
  const index = Number(room.state.plays[room.state.questionIndex].question.id.slice(1)) - 1;
  const ghosts = plan.ghosts ?? {};
  for (const { id } of room.state.players) {
    if (id in ghosts) {
      manager.answer(room, id, ghosts[id] ? SURVIVAL_RIGHT[index] : SURVIVAL_WRONG[index]);
    } else if (!(plan.silent ?? []).includes(id)) {
      manager.answer(room, id, plan.right.includes(id) ? SURVIVAL_RIGHT[index] : SURVIVAL_WRONG[index]);
    }
  }
  if (phase() === "question") manager.host(room, { type: "lock" });
  manager.host(room, { type: "next" });
  if (phase() !== "reveal") throw new Error(`expected reveal, got ${phase()}`);
  manager.host(room, { type: "next" });
  if (phase() !== "leaderboard") throw new Error(`expected leaderboard, got ${phase()}`);
  const trial = room.state.plays[room.state.questionIndex].survival?.trial;
  if (trial === null || trial === undefined || trial.stage !== "open") return;
  const edge = room.state.plays[room.state.questionIndex].survival?.edge ?? [];
  if (trial.kind === "question") {
    const at = Number(trial.questionId?.slice(1)) - 1;
    for (const id of edge) manager.trial(room, id, (plan.trial ?? []).includes(id) ? TRIAL_RIGHT[at] : TRIAL_WRONG[at]);
  } else {
    for (const [id, door] of Object.entries(plan.doors ?? {})) {
      const trap = trial.traps[id];
      manager.door(room, id, door === "trap" ? trap : door === "safe" ? (trap + 1) % 3 : door);
    }
  }
}
