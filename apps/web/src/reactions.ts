import { reactionAllowed, type PlayerView, type Reaction } from '@quiz/shared';

/** Остання реакція кожної людини: та сама by замінює попередню й іде в кінець. */
export function upsertReaction(list: readonly Reaction[], next: Reaction): Reaction[] {
  return [...list.filter((entry) => entry.by !== next.by), next];
}

export function dropReaction(list: readonly Reaction[], seq: number): Reaction[] {
  return list.some((entry) => entry.seq === seq) ? list.filter((entry) => entry.seq !== seq) : [...list];
}

/** Кнопка на телефоні: фаза з REACTION_PHASES і на телефоні немає поля випробування (survival canAnswerTrial / canPickDoor). */
export function canReact(view: PlayerView): boolean {
  const own = view.me.survival;
  return reactionAllowed(view.phase) && own?.canAnswerTrial !== true && own?.canPickDoor !== true;
}

/** Реакції без рядка на екрані: rowId null або rowId не серед mounted. */
export function strayReactions(list: readonly Reaction[], mounted: ReadonlySet<string>): Reaction[] {
  return list.filter((entry) => entry.rowId === null || !mounted.has(entry.rowId));
}
