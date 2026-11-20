import {
  allSpares,
  isUnscored,
  questionPrice,
  replayVerdict,
  type GameAppeal,
  type GameEventDetails,
  type GameReplay,
  type Question,
  type ReplayEvent,
  type ReplayRow,
  type ReplayScore,
  type ReplayStep,
  type ReplayVerdict,
} from '@quiz/shared';
import { asc, eq, inArray } from 'drizzle-orm';
import type { Db } from './db/client';
import { answer, appeal, AWAY_ATTEMPT, game, gameEvent, participant, PENALTY_ATTEMPT, scoreAdjustment, VOTE_ATTEMPT, type PlayRef } from './db/schema';
import { cellPriceOf, playedQuestions, snapshotOf } from './history';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type StoredEvent = typeof gameEvent.$inferSelect;

/** Події підряд, однакові з точністю до id і миті (повтор після збою на місці відпочинку), — одна. */
function withoutRepeats(events: StoredEvent[]): StoredEvent[] {
  const key = (e: StoredEvent) => JSON.stringify([e.kind, e.participantId, e.questionIndex, e.details ?? null]);
  return events.filter((event, i) => i === 0 || key(event) !== key(events[i - 1]));
}

/**
 * Повтор гри для адміна (65) зі збережених рядків: кроки — закриті запитання з рядками відповідей, рахунком після кроку й подіями.
 * Гра, що йде, — 'running' (запис неповний); не uuid чи немає гри — null. Шість запитів, без N+1.
 */
export async function gameReplay(db: Db, id: string): Promise<GameReplay | 'running' | null> {
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(game).where(eq(game.id, id));
  if (row === undefined) return null;
  if (row.status === 'running') return 'running';

  const participants = await db.select().from(participant).where(eq(participant.gameId, id));
  const ids = participants.map((p) => p.id);
  const answers =
    ids.length === 0
      ? []
      : await db
          .select({
            participantId: answer.participantId,
            questionIndex: answer.questionIndex,
            attempt: answer.attempt,
            payload: answer.payload,
            accepted: answer.accepted,
            points: answer.points,
            timeMs: answer.timeMs,
            overridden: answer.overridden,
            wager: answer.wager,
            buff: answer.buff,
            spareId: answer.spareId,
            awayMs: answer.awayMs,
            debuff: answer.debuff,
            answeredBy: answer.answeredBy,
          })
          .from(answer)
          .where(inArray(answer.participantId, ids));
  const adjustments = ids.length === 0 ? [] : await db.select().from(scoreAdjustment).where(inArray(scoreAdjustment.participantId, ids)).orderBy(asc(scoreAdjustment.seq));
  const appeals = await db.select().from(appeal).where(eq(appeal.gameId, id)).orderBy(asc(appeal.seq));
  const stored = await db.select().from(gameEvent).where(eq(gameEvent.gameId, id)).orderBy(asc(gameEvent.at), asc(gameEvent.id));

  const nicknames = new Map(participants.map((p) => [p.id, p.nickname]));
  const nameOf = (participantId: string) => nicknames.get(participantId) ?? '';
  const teams = participants.some((p) => p.isTeam);
  // Учасники рушія (соло-гравці чи команди) в порядку місць; до фінішу місць немає — за балами.
  const standings = participants
    .filter((p) => p.teamId === null)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity) || b.score - a.score || a.nickname.localeCompare(b.nickname));
  // Голоси опитувань і хмари в командній грі подають люди: їхні рядки йдуть командами за таблицею.
  const voters = teams
    ? standings.flatMap((s) => participants.filter((p) => p.teamId === s.id).sort((a, b) => a.nickname.localeCompare(b.nickname)))
    : standings;

  const quiz = snapshotOf(row.quizSnapshot);
  const spares = quiz === null ? [] : allSpares(quiz);
  const played = quiz === null ? [] : playedQuestions(quiz, row.plays, row.questionsPlayed);
  const total = row.questionsPlayed;
  // Крок рядка: −1 — перед першим запитанням; пізніші за останній закритий (дописані на фініші) — на останньому кроці.
  const stepOf = (index: number) => Math.min(Math.max(index, -1), total - 1);
  // Коригування з afterQuestion = k зроблено після закриття запитання k − 1.
  const adjustmentStep = (afterQuestion: number) => stepOf(afterQuestion - 1);

  const events = withoutRepeats(stored.filter((e) => e.kind !== 'start'));
  const timeline = new Map<number, ReplayEvent[]>();
  const later = (step: number, event: ReplayEvent) => timeline.set(step, [...(timeline.get(step) ?? []), event]);
  // Пауза — пара pause + resume; зняття без пари (продовження відкривається на паузі) і повторна пауза без зняття — пропускаємо.
  let open: { step: number; event: { kind: 'pause'; at: string; ms: number | null }; at: Date } | null = null;
  for (const e of events) {
    const step = stepOf(e.questionIndex);
    const details: GameEventDetails = e.details ?? {};
    if (e.kind === 'pause') {
      if (open !== null) continue;
      const event = { kind: 'pause' as const, at: e.at.toISOString(), ms: null };
      open = { step, event, at: e.at };
      later(step, event);
    } else if (e.kind === 'resume') {
      if (open === null) continue;
      open.event.ms = e.at.getTime() - open.at.getTime();
      open = null;
    } else if (e.kind === 'join' || e.kind === 'leave') {
      const nickname = e.participantId === null ? e.nickname : (nicknames.get(e.participantId) ?? e.nickname);
      later(step, {
        kind: e.kind,
        nickname,
        at: e.at.toISOString(),
        ...(details.team === undefined ? {} : { team: details.team }),
        ...(e.kind === 'leave' && details.score !== undefined ? { score: details.score } : {}),
      });
    }
  }
  /** Оцінка до останнього ручного рішення ведучого з подій; немає події (стара гра) — null, запису не було — 'none'. */
  const verdictBefore = (participantId: string, step: number): ReplayVerdict | null => {
    const found = events.filter((e) => e.kind === 'verdict' && e.participantId === participantId && stepOf(e.questionIndex) === step).at(-1);
    if (found === undefined) return null;
    return found.details?.from ?? 'none';
  };

  const adjustmentEvent = (a: (typeof adjustments)[number]): ReplayEvent => ({
    kind: 'adjustment',
    nickname: nameOf(a.participantId),
    source: a.source,
    points: a.points,
    ...(a.source === 'debuff' ? { debuff: a.debuff ?? undefined, target: a.targetNickname } : {}),
    ...(a.source === 'duelbet' ? { target: a.targetNickname } : {}),
    ...(a.source === 'undo' && a.undoesQuestion !== null ? { undoes: { question: a.undoesQuestion } } : {}),
    ...(a.source === 'undo' && a.undoesQuestion === null && a.undoesSeq !== null ? { undoes: { seq: a.undoesSeq } } : {}),
  });

  // Рахунок: старт — коригування до першого запитання, далі кожен крок додає бали своїх рядків і коригування після нього.
  const running = new Map(standings.map((p) => [p.id, 0]));
  const add = (participantId: string, points: number) => {
    const current = running.get(participantId);
    if (current !== undefined) running.set(participantId, current + points);
  };
  const scores = (): ReplayScore[] => standings.map((p) => ({ nickname: p.nickname, score: running.get(p.id) ?? 0 }));
  for (const a of adjustments) if (adjustmentStep(a.afterQuestion) === -1) add(a.participantId, a.points);
  const start = {
    scores: scores(),
    events: [...adjustments.filter((a) => adjustmentStep(a.afterQuestion) === -1).map(adjustmentEvent), ...(timeline.get(-1) ?? [])],
  };

  const steps: ReplayStep[] = [];
  for (let index = 0; index < total; index++) {
    const entry = played[index];
    const ref: PlayRef | undefined = entry?.ref ?? row.plays[index];
    const question: Question | null = entry?.question ?? null;
    const roundIndex = entry?.roundIndex ?? ref?.roundIndex ?? 0;
    const given = answers.filter((a) => stepOf(a.questionIndex) === index);
    const unscored = question === null ? given.some((a) => a.attempt === VOTE_ATTEMPT) : isUnscored(question);
    const cell = quiz === null || question === null ? null : cellPriceOf(quiz, ref);
    const priced = cell ?? (question === null ? { price: 0, multiplier: 1 } : { price: questionPrice(question), multiplier: 1 });

    const rows: ReplayRow[] = (unscored ? voters : standings).flatMap((p): ReplayRow[] => {
      const own = given.filter((a) => a.participantId === p.id);
      const shown = own.filter((a) => a.attempt !== AWAY_ATTEMPT).sort((a, b) => a.attempt - b.attempt);
      if (shown.length === 0) {
        const mark = own.find((a) => a.attempt === AWAY_ATTEMPT)?.awayMs ?? null;
        return [{ nickname: p.nickname, answeredBy: null, attempt: 0, answer: null, spare: null, timeMs: null, verdict: 'none', manual: false, points: 0, wager: null, awayMs: mark }];
      }
      return shown.map((a) => ({
        nickname: p.nickname,
        answeredBy: a.answeredBy === null ? null : (nicknames.get(a.answeredBy) ?? null),
        attempt: a.attempt,
        answer: a.payload,
        spare: a.spareId === null ? null : (spares.find((q) => q.id === a.spareId) ?? null),
        timeMs: a.payload === null || a.attempt === PENALTY_ATTEMPT ? null : a.timeMs,
        verdict: replayVerdict(a, unscored),
        manual: a.overridden,
        points: a.points,
        wager: a.wager,
        awayMs: a.awayMs,
      }));
    });

    for (const a of given) add(a.participantId, a.points);
    const after = adjustments.filter((a) => adjustmentStep(a.afterQuestion) === index);
    for (const a of after) add(a.participantId, a.points);

    const ownRows = (participantId: string) => given.filter((a) => a.participantId === participantId).sort((a, b) => a.attempt - b.attempt);
    const manual = standings.flatMap((p): ReplayEvent[] => {
      const decided = ownRows(p.id).filter((a) => a.overridden).at(-1);
      return decided === undefined ? [] : [{ kind: 'manual', nickname: p.nickname, from: verdictBefore(p.id, index), to: replayVerdict(decided, unscored) }];
    });
    const buffs = standings.flatMap((p): ReplayEvent[] => {
      const buff = ownRows(p.id).find((a) => a.buff !== null)?.buff;
      return buff === undefined || buff === null ? [] : [{ kind: 'buff', nickname: p.nickname, buff }];
    });
    const debuffs = standings.flatMap((p): ReplayEvent[] => {
      const debuff = ownRows(p.id).find((a) => a.debuff !== null)?.debuff;
      return debuff === undefined || debuff === null ? [] : [{ kind: 'debuff', nickname: p.nickname, debuff }];
    });
    const appealEvents = appeals
      .filter((a) => stepOf(a.questionIndex) === index && a.outcome !== 'cancelled')
      .map((a): ReplayEvent => ({ kind: 'appeal', nickname: nameOf(a.participantId), appeal: { reason: a.reason, yes: a.yes, no: a.no, outcome: a.outcome as GameAppeal['outcome'] } }));

    steps.push({
      index,
      roundIndex,
      question,
      ...priced,
      rows,
      scores: scores(),
      events: [...manual, ...buffs, ...debuffs, ...appealEvents, ...after.map(adjustmentEvent), ...(timeline.get(index) ?? [])],
    });
  }

  return {
    id: row.id,
    title: row.title,
    code: row.code,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    autopilot: row.autopilot,
    teams,
    rounds: (quiz?.rounds ?? []).map((round) => ({ title: round.title, type: round.type })),
    recorded: stored.some((e) => e.kind === 'start'),
    start,
    steps,
  };
}
