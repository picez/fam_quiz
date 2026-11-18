import { ACHIEVEMENTS, ACHIEVEMENT_INFO, isAnti, type AchievementId, type GameDetail, type HostView, type PlayerView, type PrizePlace, type TrophyKind, type TrophyMaterial } from '@quiz/shared';

/** Дані картинки підсумку гри (38c): лише нікнейми (назви команд) і бали, без пошт, аватарів і id. */
export interface ResultImageData {
  quizTitle: string; // '' — рядка немає
  date: Date;
  podium: { place: number; name: string; score: number }[];
  me: { place: number; total: number; score: number } | null;
  prizes: { place: PrizePlace; trophy: { kind: TrophyKind; material: TrophyMaterial } | null; winners: string[] }[];
  achievements: { id: AchievementId; nickname: string | null }[]; // уже вибрані, ≤ 4
  moreAchievements: number;
  site: string;
}

const PODIUM_MAX = 5;
const ACHIEVEMENT_MAX = 4;

type Row = { nickname: string; score: number; rank: number | null };

function podiumRows<T extends Row>(rows: T[]): T[] {
  return rows.filter((row) => row.rank !== null && row.rank <= 3).slice(0, PODIUM_MAX);
}

/** Рядки з місцями 1…3 у порядку таблиці (нічия ділить місце), не більше 5. */
export function podiumOf(rows: Row[]): ResultImageData['podium'] {
  return podiumRows(rows).map((row) => ({ place: row.rank as number, name: row.nickname, score: row.score }));
}

/** Спершу звичайні, потім анти; серед звичайних разові перед лічильними; в кожній групі — по колу між людьми, за рівності — порядок каталогу. */
export function pickHighlights(people: { nickname: string; ids: AchievementId[] }[], max: number): { picked: { id: AchievementId; nickname: string }[]; more: number } {
  const order = (id: AchievementId): number => ACHIEVEMENTS.indexOf(id);
  const tiers: ((id: AchievementId) => boolean)[] = [
    (id) => !isAnti(id) && ACHIEVEMENT_INFO[id].goal === null,
    (id) => !isAnti(id) && ACHIEVEMENT_INFO[id].goal !== null,
    (id) => isAnti(id),
  ];
  const all: { id: AchievementId; nickname: string }[] = [];
  for (const inTier of tiers) {
    const queues = people.map((person) => ({ nickname: person.nickname, ids: person.ids.filter(inTier).sort((a, b) => order(a) - order(b)) }));
    for (let round = 0; queues.some((queue) => round < queue.ids.length); round++) {
      for (const queue of queues) if (round < queue.ids.length) all.push({ id: queue.ids[round]!, nickname: queue.nickname });
    }
  }
  return { picked: all.slice(0, max), more: Math.max(0, all.length - max) };
}

function prizesOf(view: PlayerView | HostView): ResultImageData['prizes'] {
  return (view.prizes?.places ?? [])
    .filter((prize) => prize.winner !== null)
    .map((prize) => ({ place: prize.place, trophy: prize.content.trophy ? { kind: prize.content.trophy.kind, material: prize.content.trophy.material } : null, winners: [prize.winner!.name] }));
}

export function resultFromPlayer(view: PlayerView, quizTitle: string, now: Date, site: string): ResultImageData {
  const standings = view.standings ?? [];
  const shown = podiumRows(standings);
  const mine = standings.find((row) => row.participantId === view.me.id);
  const me = mine && mine.rank !== null && !shown.includes(mine) ? { place: mine.rank, total: standings.length, score: mine.score } : null;
  const own = view.newAchievements?.account ? view.newAchievements.ids : [];
  return {
    quizTitle,
    date: now,
    podium: podiumOf(standings),
    me,
    prizes: prizesOf(view),
    achievements: own.slice(0, ACHIEVEMENT_MAX).map((id) => ({ id, nickname: null })),
    moreAchievements: Math.max(0, own.length - ACHIEVEMENT_MAX),
    site,
  };
}

export function resultFromHost(view: HostView, quizTitle: string, now: Date, site: string): ResultImageData {
  const { picked, more } = pickHighlights(view.newAchievements?.people ?? [], ACHIEVEMENT_MAX);
  return { quizTitle, date: now, podium: podiumOf(view.standings), me: null, prizes: prizesOf(view), achievements: picked, moreAchievements: more, site };
}

export function resultFromHistory(game: GameDetail, site: string): ResultImageData {
  const { picked, more } = pickHighlights(game.result?.achievements ?? [], ACHIEVEMENT_MAX);
  return {
    quizTitle: game.title,
    date: new Date(game.finishedAt ?? game.startedAt),
    podium: podiumOf(game.standings),
    me: null,
    prizes: (game.result?.prizes ?? []).map((prize) => ({ place: prize.place, trophy: prize.trophy ? { kind: prize.trophy.kind, material: prize.trophy.material } : null, winners: prize.winners })),
    achievements: picked,
    moreAchievements: more,
    site,
  };
}
