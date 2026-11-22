import {
  BOT_USER_ID,
  categorySparesOf,
  QUESTION_TYPES,
  ROUND_TYPES,
  isBotUser,
  metricBucket,
  quizSchema,
  roundQuestions,
  roundTrials,
  upgradeQuiz,
  type AdminMetricBucket,
  type AdminMetricPeriod,
  type AdminMetrics,
  type AdminMetricsSummary,
  type AdminMetricsTopEditor,
  type AdminMetricsTopQuiz,
  type QuestionType,
  type RoundType,
} from '@quiz/shared';
import { sql } from 'drizzle-orm';
import { kyivDayList, shiftDay, weeklyReturns } from './admin-charts';
import { kyivMidnight } from './admin-store';
import type { Db } from './db/client';
import type { PlayRef } from './db/schema';

/** Скільки днів назад від першого дня потрібні гравці: тиждень для D−13…D−7 від D (як у графіку повернень). */
const RETURN_LOOKBACK = 13;
/** Тривалість однієї гри в метриках — не більше 4 год: забута відкрита гра не роздуває години. */
const GAME_MAX_MIN = 240;
/** Типи запитань — з не більше ніж стількох найновіших дограних ігор періоду, пачками. */
const QUESTION_TYPES_GAMES = 1000;
const QUESTION_TYPES_BATCH = 100;
const TOP = 10;

/** Київський день мітки часу, як у наявних графіках. */
const dayOf = (column: ReturnType<typeof sql>) => sql`to_char(${column} at time zone 'Europe/Kyiv', 'YYYY-MM-DD')`;

const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (part: number, whole: number): number | null => (whole === 0 ? null : Math.round((100 * part) / whole));
const avg = (values: readonly number[]): number | null => (values.length === 0 ? null : round1(values.reduce((sum, v) => sum + v, 0) / values.length));
const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return round1(sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2);
};
const rowsOf = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;

interface GameRow {
  id: string;
  quiz_id: string | null;
  title: string;
  day: string;
  hour: number;
  status: string;
  /** status = 'finished'. */
  finished: boolean;
  bot: boolean;
  autopilot: boolean;
  /** Хвилини дограної гри (≤ 240); null — не догра́на. */
  minutes: number | null;
  people: number;
}
interface ActivityRow {
  user_id: string;
  day: string;
  editor_sec: number;
  editor_sessions: number;
}
interface NewUserRow {
  day: string;
  played: boolean;
}

/** Дні одного вікна (поточний чи попередній період) і все, що з них рахується. */
interface Window {
  days: readonly string[];
  first: string;
  last: string;
}
const windowOf = (days: readonly string[]): Window => ({ days, first: days[0]!, last: days[days.length - 1]! });
const inWindow = (w: Window, day: string) => day >= w.first && day <= w.last;

/**
 * 71: метрики адміна за період (7/30/90 днів по днях, рік — 52 тижні). Один запит ігор (рядок на гру) з попереднім
 * рівним періодом, далі все — у JS. Сімейний масштаб — тисячі рядків на рік; якщо стане більше — переносити агрегати в SQL.
 */
export async function adminMetrics(db: Db, period: AdminMetricPeriod, now: Date): Promise<AdminMetrics> {
  const bucket = metricBucket(period);
  const length = period === 365 ? 364 : period;
  const days = kyivDayList(now, length);
  const current = windowOf(days);
  const previous = windowOf(days.map((day) => shiftDay(day, -length)));
  const at = (day: string) => kyivMidnight(new Date(`${day}T12:00:00Z`)).toISOString();
  const fromPrev = at(previous.first);
  const from = at(current.first);

  const games = rowsOf<GameRow>(
    await db.execute(sql`select g.id, g.quiz_id, g.title, ${dayOf(sql`g.started_at`)} as day,
        extract(hour from g.started_at at time zone 'Europe/Kyiv')::int as hour, g.status,
        (g.host_id = ${BOT_USER_ID}) as bot, g.autopilot,
        case when g.status = 'finished' and g.finished_at is not null
          then greatest(0, least(extract(epoch from (g.finished_at - g.started_at)) / 60, ${GAME_MAX_MIN}))::float8 end as minutes,
        (select count(*)::int from "participant" p where p.game_id = g.id and not p.is_team) as people
      from "game" g where g.started_at >= ${fromPrev}`),
  ).map((row) => ({ ...row, hour: Number(row.hour), people: Number(row.people), minutes: row.minutes === null ? null : Number(row.minutes), finished: row.status === 'finished' }));

  // Пари (день, акаунт) гравців — для «Активні гравці» і повернень; бот і гості — не люди.
  const pairs = rowsOf<{ day: string; user_id: string }>(
    await db.execute(sql`select distinct ${dayOf(sql`g.started_at`)} as day, p.user_id from "participant" p
      join "game" g on g.id = p.game_id
      where g.started_at >= ${at(shiftDay(current.first, -RETURN_LOOKBACK))} and p.user_id is not null and p.user_id <> ${BOT_USER_ID}`),
  );
  const playersByDay = new Map<string, Set<string>>();
  for (const { day, user_id: userId } of pairs) {
    const set = playersByDay.get(day) ?? new Set<string>();
    set.add(userId);
    playersByDay.set(day, set);
  }

  // Активність — з запасом 29 днів до попереднього періоду: mau попереднього періоду.
  const activity = rowsOf<ActivityRow>(
    await db.execute(sql`select user_id, day, editor_sec, editor_sessions from "activity_day"
      where day >= ${shiftDay(previous.first, -29)} and user_id <> ${BOT_USER_ID}`),
  ).map((row) => ({ ...row, editor_sec: Number(row.editor_sec), editor_sessions: Number(row.editor_sessions) }));
  const [tracked] = rowsOf<{ day: string | null }>(await db.execute(sql`select min(day) as day from "activity_day"`));

  // Нові акаунти (без бота) і чи зіграли вони гру протягом 7 днів після реєстрації.
  const newUsers = rowsOf<NewUserRow>(
    await db.execute(sql`select ${dayOf(sql`u.created_at`)} as day,
        exists (select 1 from "participant" p join "game" g on g.id = p.game_id
          where p.user_id = u.id and g.started_at >= u.created_at and g.started_at < u.created_at + interval '7 days') as played
      from "user" u where u.created_at >= ${fromPrev} and u.id <> ${BOT_USER_ID}`),
  );
  const newQuizzes = rowsOf<{ day: string }>(
    await db.execute(sql`select ${dayOf(sql`q.created_at`)} as day from "quiz" q where q.created_at >= ${fromPrev} and q.owner_id <> ${BOT_USER_ID}`),
  );

  const summarize = (w: Window): AdminMetricsSummary => {
    const own = games.filter((g) => inWindow(w, g.day));
    const finished = own.filter((g) => g.finished);
    const minutes = timed(finished).map((g) => g.minutes!);
    const gameMin = minutes.reduce((sum, m) => sum + m, 0);
    const playerMin = timed(finished).reduce((sum, g) => sum + g.minutes! * g.people, 0);
    const users = newUsers.filter((u) => inWindow(w, u.day));
    const acts = activity.filter((a) => inWindow(w, a.day));
    const activeDays = new Map<string, Set<string>>();
    for (const a of acts) activeDays.set(a.day, (activeDays.get(a.day) ?? new Set()).add(a.user_id));
    const distinctSince = (firstDay: string) => new Set(activity.filter((a) => a.day >= firstDay && a.day <= w.last).map((a) => a.user_id)).size;
    const dau = round1([...activeDays.values()].reduce((sum, set) => sum + set.size, 0) / w.days.length);
    const mau = distinctSince(shiftDay(w.last, -29));
    const editorSec = acts.reduce((sum, a) => sum + a.editor_sec, 0);
    const editorSessions = acts.reduce((sum, a) => sum + a.editor_sessions, 0);
    return {
      games: own.length,
      finished: finished.length,
      completion: pct(finished.length, own.length),
      avgPlayers: avg(finished.map((g) => g.people)),
      medianGameMin: median(minutes),
      avgGameMin: avg(minutes),
      gameHours: round1(gameMin / 60),
      playerHours: round1(playerMin / 60),
      ...hostSplit(own),
      newUsers: users.length,
      activation: pct(users.filter((u) => u.played).length, users.length),
      dau,
      wau: distinctSince(shiftDay(w.last, -6)),
      mau,
      stickiness: mau === 0 ? null : Math.round((100 * dau) / mau),
      editorHours: round1(editorSec / 3600),
      editorSessions,
      editorSessionMin: editorSessions === 0 ? null : round1(editorSec / 60 / editorSessions),
      editors: new Set(acts.filter((a) => a.editor_sec > 0).map((a) => a.user_id)).size,
      newQuizzes: newQuizzes.filter((q) => inWindow(w, q.day)).length,
    };
  };

  const size = bucket === 'week' ? 7 : 1;
  const buckets: AdminMetricBucket[] = [];
  for (let i = 0; i < days.length; i += size) {
    const w = windowOf(days.slice(i, i + size));
    const own = games.filter((g) => inWindow(w, g.day));
    const finished = own.filter((g) => g.finished);
    const players = new Set<string>();
    for (const day of w.days) for (const id of playersByDay.get(day) ?? []) players.add(id);
    const acts = activity.filter((a) => inWindow(w, a.day));
    buckets.push({
      start: w.first,
      days: w.days.length,
      active: new Set(acts.map((a) => a.user_id)).size,
      players: players.size,
      games: own.length,
      finished: finished.length,
      aborted: own.filter((g) => g.status === 'aborted').length,
      ...hostSplit(own),
      completion: pct(finished.length, own.length),
      returns: weeklyReturns(playersByDay, w.last),
      avgPlayers: avg(finished.map((g) => g.people)),
      gameMin: Math.round(timed(finished).reduce((sum, g) => sum + g.minutes!, 0)),
      playerMin: Math.round(timed(finished).reduce((sum, g) => sum + g.minutes! * g.people, 0)),
      newUsers: newUsers.filter((u) => inWindow(w, u.day)).length,
      newQuizzes: newQuizzes.filter((q) => inWindow(w, q.day)).length,
      editorMin: Math.round(acts.reduce((sum, a) => sum + a.editor_sec, 0) / 60),
    });
  }

  const hasPrevious = games.some((g) => inWindow(previous, g.day)) || activity.some((a) => inWindow(previous, a.day));
  const hours = Array.from({ length: 24 }, () => 0);
  for (const g of games) if (inWindow(current, g.day) && g.hour >= 0 && g.hour < 24) hours[g.hour]! += 1;

  return {
    period,
    bucket,
    buckets,
    summary: summarize(current),
    previous: hasPrevious ? summarize(previous) : null,
    trackedSince: tracked?.day ?? null,
    topQuizzes: await topQuizzes(db, games.filter((g) => inWindow(current, g.day))),
    roundTypes: await roundTypes(db, from),
    ...(await questionTypes(db, from)),
    hours,
    topEditors: await topEditors(db, activity.filter((a) => inWindow(current, a.day))),
    computedAt: now.toISOString(),
  };
}

/** Дограні ігри з відомою тривалістю (finished_at є). */
const timed = (games: readonly GameRow[]) => games.filter((g) => g.minutes !== null);

/** Ігри за ведучим: бот (host_id = BOT_USER_ID), автопілот людини, людина сама. */
function hostSplit(games: readonly GameRow[]): { hosted: number; autopilot: number; bot: number } {
  let hosted = 0;
  let autopilot = 0;
  let bot = 0;
  for (const g of games) {
    if (g.bot) bot += 1;
    else if (g.autopilot) autopilot += 1;
    else hosted += 1;
  }
  return { hosted, autopilot, bot };
}

/** Топ-10 вікторин за дограними іграми періоду; автор — нік власника, видалена вікторина — назва гри й порожній автор. */
async function topQuizzes(db: Db, games: readonly GameRow[]): Promise<AdminMetricsTopQuiz[]> {
  const byQuiz = new Map<string, GameRow[]>();
  for (const g of games) {
    if (g.quiz_id === null || !g.finished) continue;
    byQuiz.set(g.quiz_id, [...(byQuiz.get(g.quiz_id) ?? []), g]);
  }
  const top = [...byQuiz.entries()].sort((x, y) => y[1].length - x[1].length || x[0].localeCompare(y[0])).slice(0, TOP);
  if (top.length === 0) return [];
  const ids = top.map(([id]) => id);
  const known = rowsOf<{ id: string; title: string; nickname: string | null }>(
    await db.execute(sql`select q.id, q.title, pr.nickname from "quiz" q left join "profile" pr on pr.user_id = q.owner_id
      where q.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`),
  );
  const info = new Map(known.map((row) => [row.id, row]));
  return top
    .map(([id, list]) => ({
      id,
      title: info.get(id)?.title ?? list[0]!.title,
      author: info.get(id)?.nickname ?? '',
      games: list.length,
      avgPlayers: avg(list.map((g) => g.people)),
      avgMin: avg(timed(list).map((g) => g.minutes!)),
    }))
    .sort((x, y) => y.games - x.games || x.title.localeCompare(y.title));
}

/** У скількох дограних іграх періоду був раунд кожного типу; старі ігри без раундів — пропуск, невідомі типи — геть. */
async function roundTypes(db: Db, from: string): Promise<AdminMetrics['roundTypes']> {
  const rows = rowsOf<{ type: string; games: number }>(
    await db.execute(sql`select r.type, count(distinct g.id)::int as games from "game" g,
        jsonb_array_elements(case when jsonb_typeof(g.quiz_snapshot->'rounds') = 'array' then g.quiz_snapshot->'rounds' else '[]'::jsonb end) as e,
        lateral (select e->>'type' as type) r
      where g.status = 'finished' and g.started_at >= ${from} and r.type is not null
      group by r.type`),
  );
  return rows
    .filter((row): row is { type: RoundType; games: number } => (ROUND_TYPES as readonly string[]).includes(row.type))
    .map((row) => ({ type: row.type, games: Number(row.games) }))
    .sort((x, y) => y.games - x.games || x.type.localeCompare(y.type));
}

/** Зіграні запитання за типом — з не більше 1000 найновіших дограних ігор періоду (знімок + plays гри). */
async function questionTypes(db: Db, from: string): Promise<{ questionTypes: AdminMetrics['questionTypes']; questionTypesGames: number }> {
  const counts = new Map<QuestionType, number>();
  let counted = 0;
  for (let offset = 0; offset < QUESTION_TYPES_GAMES; offset += QUESTION_TYPES_BATCH) {
    const batch = rowsOf<{ quiz_snapshot: unknown; plays: PlayRef[] | null }>(
      await db.execute(sql`select quiz_snapshot, plays from "game" where status = 'finished' and started_at >= ${from}
        order by started_at desc, id limit ${QUESTION_TYPES_BATCH} offset ${offset}`),
    );
    for (const row of batch) {
      const parsed = quizSchema.safeParse(upgradeQuiz(row.quiz_snapshot));
      if (!parsed.success) continue;
      counted += 1;
      const typeOf = new Map<string, string>();
      for (const round of parsed.data.rounds) for (const q of [...roundQuestions(round), ...roundTrials(round)]) typeOf.set(q.id, q.type);
      // Запасні запитання (вікторини й категорій поля) теж можуть зіграти замість основних.
      for (const q of [...(parsed.data.spares ?? []), ...categorySparesOf(parsed.data)]) typeOf.set(q.id, q.type);
      for (const play of row.plays ?? []) {
        const type = typeOf.get(play.questionId);
        if (type === undefined || !(QUESTION_TYPES as readonly string[]).includes(type)) continue;
        counts.set(type as QuestionType, (counts.get(type as QuestionType) ?? 0) + 1);
      }
    }
    if (batch.length < QUESTION_TYPES_BATCH) break;
  }
  const list = [...counts.entries()].map(([type, plays]) => ({ type, plays })).sort((x, y) => y.plays - x.plays || x.type.localeCompare(y.type));
  return { questionTypes: list, questionTypesGames: counted };
}

/** Топ-10 людей за часом у редакторі періоду — лише ніки. */
async function topEditors(db: Db, activity: readonly ActivityRow[]): Promise<AdminMetricsTopEditor[]> {
  const byUser = new Map<string, { sec: number; sessions: number }>();
  for (const a of activity) {
    if (isBotUser(a.user_id) || (a.editor_sec === 0 && a.editor_sessions === 0)) continue;
    const entry = byUser.get(a.user_id) ?? { sec: 0, sessions: 0 };
    entry.sec += a.editor_sec;
    entry.sessions += a.editor_sessions;
    byUser.set(a.user_id, entry);
  }
  const top = [...byUser.entries()].filter(([, e]) => e.sec > 0).sort((x, y) => y[1].sec - x[1].sec || x[0].localeCompare(y[0])).slice(0, TOP);
  if (top.length === 0) return [];
  const names = rowsOf<{ user_id: string; nickname: string | null }>(
    await db.execute(sql`select user_id, nickname from "profile" where user_id in (${sql.join(top.map(([id]) => sql`${id}`), sql`, `)})`),
  );
  const nick = new Map(names.map((row) => [row.user_id, row.nickname ?? '']));
  return top.map(([userId, e]) => ({ userId, nickname: nick.get(userId) ?? '', minutes: Math.round(e.sec / 60), sessions: e.sessions }));
}
