import { reactionAllowed, type PlayerView, type Reaction } from '@quiz/shared';

/** Остання реакція кожної людини: та сама by замінює попередню й іде в кінець. */
export function upsertReaction(list: readonly Reaction[], next: Reaction): Reaction[] {
  return [...list.filter((entry) => entry.by !== next.by), next];
}

export function dropReaction(list: readonly Reaction[], seq: number): Reaction[] {
  return list.some((entry) => entry.seq === seq) ? list.filter((entry) => entry.seq !== seq) : [...list];
}

/**
 * Кнопка на телефоні: фаза з REACTION_PHASES і телефон не чекає рішення на час — випробування чи двері «Вибування»
 * (survival canAnswerTrial / canPickDoor), «лишаюсь / забираю» у «Ва-банк» (wipeout.canDecide), «забрати / далі» у «Мільйонері» (ladder.canDecide).
 */
export function canReact(view: PlayerView): boolean {
  const { survival, wipeout, ladder } = view.me;
  return (
    reactionAllowed(view.phase) &&
    survival?.canAnswerTrial !== true &&
    survival?.canPickDoor !== true &&
    wipeout?.canDecide !== true &&
    ladder?.canDecide !== true
  );
}

/** Реакції без рядка на екрані: rowId null або rowId не серед mounted. */
export function strayReactions(list: readonly Reaction[], mounted: ReadonlySet<string>): Reaction[] {
  return list.filter((entry) => entry.rowId === null || !mounted.has(entry.rowId));
}
