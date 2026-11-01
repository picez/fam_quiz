import { answeredByOf, appealTally, cluesAnswered, debuffOn, isSilentRisk, memberOf, rankPlayers, recordOf, teamMembers, teamsOn, voteTally, type GameState, type LadderPlay, type SurvivalPlay } from '@quiz/engine';
import { AWAY_MS, isUnscored, type Answer, type BuffKind, type DebuffKind, type Question } from '@quiz/shared';
import { and, eq, gt, gte, inArray, max, notInArray, sql } from 'drizzle-orm';
import { awardGame } from './achievement-store';
import type { Db } from './db/client';
import { answer, appeal, AWAY_ATTEMPT, game, participant, PENALTY_ATTEMPT, savedGame, scoreAdjustment, VOTE_ATTEMPT, type PlayRef } from './db/schema';
import type { SavedGameData } from './rooms/continuation';
import type { Room, RoomManager } from './rooms/manager';

/** Транзакція бази. */
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface Recorder {
  /** Завершується, коли всі поставлені в чергу записи виконано. */
  idle(): Promise<void>;
}

interface Snapshot {
  id: string;
  code: string;
  hostId: string;
  quizId: string | null;
  state: GameState;
  playerUsers: Map<string, string>;
  startedAt: Date;
  /** З якого запитання записувати відповіді: попередні вже збережено. */
  fromQuestion: number;
  /** Дебафи, що спрацювали на запитаннях кімнати: закриття запитання прибирає їх зі стану раніше за запис. */
  debuffs: DebuffsSeen;
  /** Шлях 12r: старий збережений запис, який ця гра замінює; null — немає. */
  replaces: string | null;
  /** Точне продовження (13b): перший запис прибирає рядки після стану (trimToCheckpoint) — їх могло лишити продовження, що впало. */
  trim?: boolean;
}

/** Дебафи, побачені рекордером на відкритих запитаннях (12i): індекс запитання → гравець рушія → вид. */
type DebuffsSeen = Map<number, Map<string, DebuffKind>>;

/** Дебаф учасника на запитанні index: зі стану (запитання ще відкрите) чи побачений, поки воно було відкрите. */
function debuffOf(state: GameState, seen: DebuffsSeen, index: number, playerId: string): DebuffKind | null {
  return debuffOn(state, index, playerId) ?? seen.get(index)?.get(playerId) ?? null;
}

/** Скільки запитань журналу вже закрито: відкрите запитання завжди останнє. */
function closedQuestions(state: GameState): number {
  return state.phase === 'question' ? state.plays.length - 1 : state.plays.length;
}

/** Змінюється лише тоді, коли в грі з'явилося щось варте запису. */
function signature(state: GameState): string {
  // Оцінки останнього закритого запитання входять у підпис: ручне рішення ведучого
  // треба записати, навіть якщо воно не змінило бали.
  const last = closedQuestions(state) - 1;
  const grades = state.players.map((player) => {
    const record = last < 0 ? undefined : recordOf(state, last, player.id);
    return record === undefined ? null : [record.accepted, record.points, record.overridden, record.buff ?? null];
  });
  const scores = state.players.map((p) => [p.id, p.score]);
  // Коригування не змінюють фазу, а рахунок можуть лишити тим самим (+50 і −50): рахуємо їх окремо.
  // Сховані слова хмари останнього закритого запитання теж варті запису.
  const hidden = last < 0 ? null : (state.plays[last].cloudHidden ?? null);
  // Рішення «Ва-банк» не міняють фазу, а рахунок можуть лишити тим самим (банк 0): їх теж записуємо.
  const wipeout = last < 0 ? null : (state.plays[last].wipeout ?? null);
  // Привиди й випробування «Вибування» теж не міняють фазу.
  const survival = last < 0 ? null : (state.plays[last].survival ?? null);
  // Підказки й рішення «Мільйонера» теж не міняють фазу.
  const ladder = last < 0 ? null : (state.plays[last].ladder ?? null);
  // Командна гра: вилучення людини (не останньої в команді) не змінює команд, а її рядок треба прибрати.
  const members = state.teams?.members.map((m) => m.id) ?? null;
  // Вихід із гри (12e) дописується до закритого запитання вже після зміни фази: теж варто запису.
  const away = last < 0 ? null : state.plays[last].away;
  return JSON.stringify([state.phase, state.roundIndex, state.questionIndex, scores, grades, state.adjustments.length, state.adjustmentSeq, hidden, wipeout, survival, ladder, members, away, state.appeals?.map((a) => a.outcome ?? 'open') ?? null]);
}

interface AnswerRow {
  attempt: number;
  payload: Answer | null;
  timeMs: number;
  accepted: boolean;
  points: number;
  streakBonus: number;
  overridden: boolean;
  /** Ставка фіналу; null поза фіналом. */
  wager: number | null;
  /** Баф, узятий на це запитання; null — без бафу. */
  buff: BuffKind | null;
  /** Запасне запитання, на яке дано відповідь; null — основне. */
  spareId: string | null;
  /** Вихід із гри на запитанні, мс (від AWAY_MS.mark); null — без позначки. */
  awayMs: number | null;
  /** Дебаф, що діяв на учасника в цьому запитанні (12i); null — без дебафу. */
  debuff: DebuffKind | null;
  /** «Хто я?»: на якій підказці дано відповідь (12i); null — інший тип чи запасне. */
  clue: number | null;
  /** Командна гра: людина, що відповідала чи натиснула за команду (12i); null — соло й рядки людей. */
  answeredBy: string | null;
}

/** Вихід учасника на запитанні для away_ms (12e): соло — свій; команда — найбільший з людей; людина (голос) — свій; менше AWAY_MS.mark — null. */
function awayMsOf(state: GameState, index: number, participantId: string): number | null {
  const away = state.plays[index].away;
  if (away === undefined) return null;
  const people = teamsOn(state) && memberOf(state, participantId) === undefined ? teamMembers(state, participantId).map((m) => m.id) : [participantId];
  const ms = Math.max(0, ...people.map((id) => away[id]?.ms ?? 0));
  return ms >= AWAY_MS.mark ? ms : null;
}

/**
 * Рядки таблиці answer для гравця на запитання: у бліці по рядку на спробу, інакше один.
 * Учасник рушія без жодного рядка, але з позначкою виходу (не відповів у класиці, не натискав на бліці без штрафу) —
 * один рядок AWAY_ATTEMPT з 0 балів, щоб цікавинки історії бачили ту саму позначку, що й гра. Опитування й хмара — без нього:
 * гра їх у «відволікався» не рахує.
 */
function answerRows(state: GameState, seen: DebuffsSeen, index: number, playerId: string, engineParticipant: boolean): AnswerRow[] {
  // Рядки людей командної гри (голоси) — без дебафу, підказки й відповідача: дебаф діє на команду.
  const debuff = engineParticipant ? debuffOf(state, seen, index, playerId) : null;
  const team = engineParticipant && teamsOn(state);
  const rows = answerRowsOf(state, index, playerId, engineParticipant, team);
  const awayMs = awayMsOf(state, index, playerId);
  if (rows.length > 0) return rows.map((row) => ({ ...row, awayMs, debuff }));
  if (!engineParticipant || awayMs === null || isUnscored(state.plays[index].question)) return [];
  return [
    { attempt: AWAY_ATTEMPT, payload: null, timeMs: 0, accepted: false, points: 0, streakBonus: 0, overridden: false, wager: null, buff: null, spareId: null, awayMs, debuff, clue: null, answeredBy: null },
  ];
}

/** Рядки без away_ms і дебафу (їх дописує answerRows); team — рядок команди (відповідача пишемо лише їй). */
function answerRowsOf(state: GameState, index: number, playerId: string, engineParticipant: boolean, team: boolean): Omit<AnswerRow, 'awayMs' | 'debuff'>[] {
  const record = recordOf(state, index, playerId);
  if (record === undefined) return [];
  const attempts = state.plays[index].blitz?.attempts.filter((a) => a.playerId === playerId);
  if (attempts === undefined) {
    const { answer: payload, timeMs, accepted, points, streakBonus, overridden } = record;
    const play = state.plays[index];
    const { final } = play;
    // Мовчання у фіналі — рядок балів без відповіді, як штраф бліц-клітинки. Ставка йде окремо:
    // у спільному банку бали не дорівнюють ±ставці. Мовчання з «Ризиком» у класиці (12h) — теж штраф, з бафом на рядку.
    const silent = (final !== undefined && payload === null) || isSilentRisk(play, record);
    const wager = final === undefined ? null : Object.hasOwn(final.wagers, playerId) ? final.wagers[playerId] : 0;
    // Голос в опитуванні чи «хмарі» — не відповідь для статистики: свій номер рядка.
    const vote = isUnscored(state.plays[index].question);
    // Підказка — лише відповідь на основне «Хто я?» (стан тримає clueOpens назавжди); штраф мовчання — без підказки й відповідача.
    const clue = engineParticipant && !silent && record.spare === undefined ? cluesAnswered(play, play.question, timeMs, playerId) : null;
    const answeredBy = team && !silent ? answeredByOf(state, index, playerId) : null;
    return [
      {
        attempt: silent ? PENALTY_ATTEMPT : vote ? VOTE_ATTEMPT : 0,
        payload,
        timeMs,
        accepted,
        points,
        streakBonus,
        overridden,
        wager,
        buff: record.buff ?? null,
        spareId: record.spare ?? null,
        clue,
        answeredBy,
      },
    ];
  }
  const buzzer = team ? (state.plays[index].buzzers?.[playerId] ?? null) : null;
  const rows = attempts.map((attempt, number) => {
    // Бонус серії належить виграшній спробі; бали спроби в журналі бліцу його не містять.
    const streakBonus = attempt.grade === 'correct' ? record.streakBonus : 0;
    return {
      attempt: number,
      payload: attempt.answer,
      timeMs: attempt.timeMs,
      accepted: attempt.grade === 'correct',
      points: attempt.points + streakBonus,
      streakBonus,
      overridden: false,
      wager: null,
      buff: null,
      spareId: null,
      clue: null,
      answeredBy: buzzer,
    };
  });
  // Штраф бліц-клітинки не належить жодній спробі (його платить і той, хто не натискав):
  // він іде окремим рядком, щоб бали гравця за рядками збігалися з журналом.
  const penalty = record.basePoints - attempts.reduce((sum, attempt) => sum + attempt.points, 0);
  if (penalty === 0) return rows;
  return [
    ...rows,
    { attempt: PENALTY_ATTEMPT, payload: null, timeMs: 0, accepted: false, points: penalty, streakBonus: 0, overridden: false, wager: null, buff: null, spareId: null, clue: null, answeredBy: null },
  ];
}

/** «Вибування» для PlayRef: лише закрите випробування; відповіді привидів — лише лічильники. */
function survivalRef(survival: SurvivalPlay): NonNullable<PlayRef['survival']> {
  const ghosts = Object.values(survival.ghosts);
  const trial = survival.trial;
  return {
    ...(survival.edge === null ? {} : { edge: survival.edge }),
    ...(ghosts.length === 0 ? {} : { ghosts: { answered: ghosts.length, right: ghosts.filter((g) => g.correct).length } }),
    ...(trial === null || trial.stage !== 'closed'
      ? {}
      : {
          trial: {
            kind: trial.kind,
            ...(trial.fellBack ? { fellBack: true as const } : {}),
            ...(trial.questionId === null ? {} : { questionId: trial.questionId }),
            ...(trial.kind === 'question'
              ? { answers: Object.fromEntries(Object.entries(trial.answers).map(([id, a]) => [id, { answer: a.answer, correct: a.correct }])) }
              : {
                  doors: Object.fromEntries(
                    (survival.edge ?? []).map((id) => [id, { door: trial.doors[id] ?? trial.fallback[id], auto: !(id in trial.doors), trap: trial.traps[id] }]),
                  ),
                }),
            out: trial.out,
          },
        }),
    ...(survival.end ? { end: true as const } : {}),
  };
}

/** «Мільйонер» для PlayRef: голосування залу — лише закрите, у вигляді підсумку. */
function ladderRef(ladder: LadderPlay, question: Question): NonNullable<PlayRef['ladder']> {
  const { fifty, audience, hint } = ladder.lifelines;
  const taken = {
    ...(fifty === undefined ? {} : { fifty: fifty.removed }),
    ...(audience === undefined || !audience.closed
      ? {}
      : (() => {
          const { cast, counts } = voteTally(question, audience.ballots);
          return { audience: { cast, counts } };
        })()),
    ...(hint === undefined ? {} : { hint: { text: hint.text, aloud: hint.aloud } }),
  };
  return {
    contestant: ladder.contestantId,
    step: ladder.step,
    level: ladder.level,
    ...(Object.keys(taken).length === 0 ? {} : { lifelines: taken }),
    ...(ladder.decision === null ? {} : { decision: ladder.decision }),
    ...(ladder.outcome === null ? {} : { outcome: { kind: ladder.outcome.kind, passed: ladder.outcome.passed, points: ladder.outcome.points } }),
  };
}

/** Пише гру в транзакції. saving — запис контрольної точки (13b): статус 'saved', без фінішу. */
async function writeGame(tx: Tx, snapshot: Snapshot, saving: boolean): Promise<void> {
  const { state } = snapshot;
  const finished = !saving && state.phase === 'finished';
  const closed = closedQuestions(state);
  const ranks = new Map(finished ? rankPlayers(state.players).map((row) => [row.participantId, row.rank]) : []);
  const progress = {
    questionsPlayed: closed,
    plays: state.plays.slice(0, closed).map((play) => ({
      roundIndex: play.roundIndex,
      questionId: play.question.id,
      ...(play.board === undefined ? {} : { cell: { cellId: play.board.cellId, chooserId: play.board.chooserId } }),
      ...(play.cloudHidden === undefined || play.cloudHidden.length === 0 ? {} : { cloudHidden: play.cloudHidden }),
      ...(play.survey?.source === 'cloud' && play.question.type === 'survey' ? { surveyRows: play.question.rows } : {}),
      ...(play.bluff?.stage === 'choice'
        ? { bluff: { options: play.bluff.options, picks: Object.fromEntries(Object.entries(play.bluff.picks).map(([id, pick]) => [id, pick.optionId])) } }
        : {}),
      ...(play.wipeout === undefined ? {} : { wipeout: { took: play.wipeout.took, ...(play.wipeout.end ? { end: true as const } : {}) } }),
      ...(play.survival === undefined ? {} : { survival: survivalRef(play.survival) }),
      ...(play.ladder === undefined ? {} : { ladder: ladderRef(play.ladder, play.question) }),
    })),
    finishedAt: finished ? new Date() : null,
  };
  const status = saving ? ('saved' as const) : finished ? ('finished' as const) : ('running' as const);
  // Збережена гра, яку продовжують, лишається «Не завершена», доки не фінішує.
  const nextStatus = saving || finished ? status : sql`case when ${game.status} = 'saved' then 'saved' else 'running' end`;

  await tx
    .insert(game)
    .values({
      id: snapshot.id,
      quizId: snapshot.quizId,
      hostId: snapshot.hostId,
      code: snapshot.code,
      title: state.quiz.title,
      quizSnapshot: state.quiz,
      startedAt: snapshot.startedAt,
      autopilot: state.autopilot !== undefined,
      status,
      ...progress,
    })
    // Кімната, піднята після перезапуску вже завершеною, пише гру ще раз: мить фінішу лишається першою.
    .onConflictDoUpdate({
      target: game.id,
      set: { ...progress, status: nextStatus, finishedAt: finished ? sql`coalesce(${game.finishedAt}, excluded.finished_at)` : null },
    });

  // Командна гра: гравці рушія — команди, люди — окремі рядки з посиланням на свою команду.
  const teamGame = state.teams !== undefined;
  const members = (state.teams?.members ?? []).filter((m) => m.teamId !== null && state.players.some((p) => p.id === m.teamId));
  // Вилучених гравців (команди й людей) прибираємо разом з їхніми відповідями й коригуваннями (каскадом).
  const ids = [...state.players.map((player) => player.id), ...members.map((m) => m.id)];
  const inGame = eq(participant.gameId, snapshot.id);
  await tx.delete(participant).where(ids.length === 0 ? inGame : and(inGame, notInArray(participant.id, ids)));

  const saveAnswers = async (participantId: string, engineParticipant: boolean) => {
    for (let index = snapshot.fromQuestion; index < closed; index++) {
      for (const row of answerRows(state, snapshot.debuffs, index, participantId, engineParticipant)) {
        const { attempt, payload, timeMs, debuff, clue, answeredBy, ...grade } = row;
        await tx
          .insert(answer)
          .values({
            participantId,
            questionIndex: index,
            attempt,
            roundIndex: state.plays[index].roundIndex,
            payload,
            timeMs,
            ...grade,
            debuff,
            clue,
            answeredBy,
          })
          // Дебаф і відповідач видно, лише поки запитання поточне: повторний запис останнього закритого їх не затирає;
          // відповідач — перший записаний (на розкритті той, хто відповідав, міг піти зі зв'язку, і answererOf дав би капітана).
          .onConflictDoUpdate({
            target: [answer.participantId, answer.questionIndex, answer.attempt],
            set: { ...grade, debuff: sql`coalesce(excluded.debuff, ${answer.debuff})`, clue, answeredBy: sql`coalesce(${answer.answeredBy}, excluded.answered_by)` },
          });
      }
    }
  };

  for (const player of state.players) {
    const result = { score: player.score, totalTimeMs: player.totalTimeMs, rank: ranks.get(player.id) ?? null };
    await tx
      .insert(participant)
      .values({
        id: player.id,
        gameId: snapshot.id,
        nickname: player.nickname,
        userId: snapshot.playerUsers.get(player.id) ?? null,
        isTeam: teamGame,
        ...result,
      })
      // Акаунт оновлюється на кожному записі: гостьовий слот, який зайняв акаунт (13b), потрапляє в його профіль.
      .onConflictDoUpdate({ target: participant.id, set: { ...result, userId: sql`excluded.user_id` } });
    await saveAnswers(player.id, true);
  }

  // Рядки людей — після рядків команд (зовнішній ключ): бали, час і місце — копія командних; відповіді — лише власні голоси.
  for (const member of members) {
    const team = state.players.find((p) => p.id === member.teamId);
    if (team === undefined) continue;
    const result = { score: team.score, totalTimeMs: team.totalTimeMs, rank: ranks.get(team.id) ?? null };
    await tx
      .insert(participant)
      .values({
        id: member.id,
        gameId: snapshot.id,
        nickname: member.nickname,
        userId: snapshot.playerUsers.get(member.id) ?? null,
        teamId: team.id,
        ...result,
      })
      .onConflictDoUpdate({ target: participant.id, set: { ...result, userId: sql`excluded.user_id` } });
    await saveAnswers(member.id, false);
  }

  // Коригування незмінні, а seq зростає в межах гри: дописуємо лише новіші за вже збережені, одним запитом.
  // Контрольна точка (13b) пише всі свої: найбільший seq у базі може бути вже після неї, а вилучений після неї
  // учасник повертається без своїх рядків (каскад) — їх треба відновити; наявні лишає onConflictDoNothing.
  const [{ saved }] = saving
    ? [{ saved: null }]
    : await tx
        .select({ saved: max(scoreAdjustment.seq) })
        .from(scoreAdjustment)
        .innerJoin(participant, eq(participant.id, scoreAdjustment.participantId))
        .where(inGame);
  const fresh = state.adjustments
    .filter((adjustment) => adjustment.seq > (saved ?? 0))
    .map(({ playerId, seq, roundIndex, afterQuestion, points, source, debuff, target, undoes }) => ({
      participantId: playerId,
      seq,
      roundIndex,
      afterQuestion,
      points,
      source,
      debuff: debuff ?? null,
      // Ціль могли вилучити до запису: тоді нікнейма вже немає.
      targetNickname: target === undefined ? null : (state.players.find((p) => p.id === target)?.nickname ?? null),
      // batch у базу не пишеться: він потрібен лише живому сповіщенню.
      undoesQuestion: undoes !== undefined && 'question' in undoes ? undoes.question : null,
      undoesSeq: undoes !== undefined && 'seq' in undoes ? undoes.seq : null,
    }));
  if (fresh.length > 0) await tx.insert(scoreAdjustment).values(fresh).onConflictDoNothing();

  // Апеляції (12f): лише закриті й лише учасників, що є в грі (вилучених прибирає каскад); закрита незмінна.
  // Скасованих (кінець раунду чи гри, вилучення) історія не показує й цікавинки не рахують — у базу вони не йдуть.
  const closedAppeals = (state.appeals ?? []).filter((a) => a.outcome !== null && a.outcome !== 'cancelled' && state.players.some((p) => p.id === a.by));
  if (closedAppeals.length > 0) {
    await tx
      .insert(appeal)
      .values(
        closedAppeals.map((a) => ({
          gameId: snapshot.id,
          seq: a.id,
          participantId: a.by,
          questionIndex: a.questionIndex,
          reason: a.reason,
          // Лічильники, збережені на мить рішення (appealTally закритої): вилучення виборця потім їх не змінює, тож база й жива гра однакові.
          ...appealTally(state, a),
          outcome: a.outcome!,
          adjustmentSeq: a.adjustmentSeq ?? null,
        })),
      )
      .onConflictDoNothing();
  }
}

async function save(db: Db, snapshot: Snapshot): Promise<void> {
  const finished = snapshot.state.phase === 'finished';
  await db.transaction(async (tx) => {
    await writeGame(tx, snapshot, false);
    // Точне продовження: рядки після стану (запитання, коригування, апеляції продовження, що впало без live_room) — геть.
    if (snapshot.trim === true) await trimToCheckpoint(tx, snapshot.id, snapshot.state);
    // Фініш: гра більше не «Не завершена».
    if (finished) await tx.delete(savedGame).where(eq(savedGame.gameId, snapshot.id));
    // Шлях 12r: нова гра закрила перше запитання — старий збережений запис геть (одна гра в історії).
    if (snapshot.replaces !== null && closedQuestions(snapshot.state) >= 1) await dropReplaced(tx, snapshot.replaces);
  });
}

/** Видаляє гру, яку замінило продовження шляхом 12r, лише якщо вона ще 'saved' (учасники й відповіді — каскадом). */
async function dropReplaced(tx: Tx, gameId: string): Promise<void> {
  await tx.delete(game).where(and(eq(game.id, gameId), eq(game.status, 'saved')));
}

/** Запис збереженої гри (13b). */
export interface SavedWrite {
  id: string;
  code: string;
  hostId: string;
  quizId: string | null;
  playerUsers: Map<string, string>;
  saved: SavedGameData;
  /** Шлях 12r: старий збережений запис, який ця гра замінює; null — немає. */
  replaces: string | null;
}

/**
 * Одна транзакція: рядки гри за saved.state (fromQuestion 0, дебафи — порожня мапа), status 'saved', finishedAt null;
 * trimToCheckpoint; upsert saved_game (data, stateVersion, savedAt now); replaces → видалити той запис, якщо він 'saved'.
 */
export async function saveSavedGame(db: Db, write: SavedWrite): Promise<void> {
  const { saved } = write;
  const snapshot: Snapshot = {
    id: write.id,
    code: write.code,
    hostId: write.hostId,
    quizId: write.quizId,
    state: saved.state,
    playerUsers: write.playerUsers,
    // Наявний рядок гри мить старту не змінює (її немає в set).
    startedAt: new Date(),
    fromQuestion: 0,
    // Закриті запитання дебафів у стані вже не мають: рядки, відбудовані заново (учасник, вилучений після точки), — з debuff null.
    debuffs: new Map(),
    replaces: write.replaces,
  };
  await db.transaction(async (tx) => {
    await writeGame(tx, snapshot, true);
    await trimToCheckpoint(tx, write.id, saved.state);
    const savedAt = new Date();
    await tx
      .insert(savedGame)
      .values({ gameId: write.id, data: saved, stateVersion: saved.stateVersion, savedAt })
      .onConflictDoUpdate({ target: savedGame.gameId, set: { data: saved, stateVersion: saved.stateVersion, savedAt } });
    if (write.replaces !== null && write.replaces !== write.id) await dropReplaced(tx, write.replaces);
  });
}

/**
 * Видаляє рядки після контрольної точки: answer з question_index ≥ closedQuestions(state),
 * score_adjustment з seq > state.adjustmentSeq, appeal з seq > (state.appeals?.length ?? 0).
 */
export async function trimToCheckpoint(db: Db | Tx, gameId: string, state: GameState): Promise<void> {
  const people = db.select({ id: participant.id }).from(participant).where(eq(participant.gameId, gameId));
  await db.delete(answer).where(and(inArray(answer.participantId, people), gte(answer.questionIndex, closedQuestions(state))));
  await db.delete(scoreAdjustment).where(and(inArray(scoreAdjustment.participantId, people), gt(scoreAdjustment.seq, state.adjustmentSeq)));
  await db.delete(appeal).where(and(eq(appeal.gameId, gameId), gt(appeal.seq, state.appeals?.length ?? 0)));
}

const MAX_RETRY_DELAY_MS = 60_000;

/**
 * Записує хід ігор у базу. Збій бази журналюється й не зачіпає саму гру; невдалий запис
 * повторюється сам (з дедалі довшими паузами), бо після фінішу в кімнаті може більше нічого
 * не статися, а результат має потрапити в історію.
 */
export function attachRecorder(
  manager: RoomManager,
  db: Db,
  onError: (error: unknown) => void = (error) => console.error('Не вдалося зберегти гру:', error),
  retryMs = 5000,
  maxRetries = 30,
): Recorder {
  const queues = new Map<string, Promise<void>>();
  const lastSignature = new Map<string, string>();
  const startedAt = new Map<string, Date>();
  /** Скільки запитань кімнати вже надійно записано. */
  const savedQuestions = new Map<string, number>();
  /** Скільки записів кімнати поспіль не вдалося. */
  const failures = new Map<string, number>();
  const closedRooms = new Set<string>();
  /** Дебафи, що спрацювали на запитаннях кімнати (12i): закриття запитання прибирає їх зі стану раніше, ніж рекордер його запише. */
  const debuffsSeen = new Map<string, DebuffsSeen>();
  /** Кімнати, чию завершену гру вже нагороджено ачівками (12i). */
  const awarded = new Set<string>();
  /** Збережені кімнати (13b): їхній запис робить лише persistSaved; запізнілий повтор record нічого не дописує. */
  const sealed = new WeakSet<Room>();
  /** Кімната, що зараз веде кожен id (13b): точне продовження бере той самий id, що й збережена кімната. */
  const current = new Map<string, Room>();
  /** Кімнати, яких заступила нова кімната з тим самим id: їхні повтори нічого не пишуть. */
  const superseded = new WeakSet<Room>();
  /** Точні продовження, чий перший запис ще має прибрати рядки після стану (trimToCheckpoint). */
  const untrimmed = new Set<string>();

  const forget = (roomId: string) => {
    for (const map of [queues, lastSignature, startedAt, savedQuestions, failures, debuffsSeen, current]) map.delete(roomId);
    closedRooms.delete(roomId);
    awarded.delete(roomId);
    untrimmed.delete(roomId);
  };

  /**
   * Нова кімната під id (точне продовження, кімната, піднята після перезапуску): пам'ять про id — з нуля (крім черги: записи йдуть
   * далі по черзі), стара кімната більше не пише. Точне продовження ще й прибирає рядки після свого стану першим записом.
   */
  const adopt = (room: Room) => {
    const known = current.get(room.id);
    if (known === room) return;
    if (known !== undefined) superseded.add(known);
    current.set(room.id, room);
    for (const map of [lastSignature, savedQuestions, failures, debuffsSeen]) map.delete(room.id);
    closedRooms.delete(room.id);
    awarded.delete(room.id);
    if (room.continued !== null && room.continued.replaces === null) untrimmed.add(room.id);
  };

  /** Запам'ятати дебафи, що діють на відкритому запитанні: після закриття їх у стані вже немає. */
  const seeDebuffs = (room: Room) => {
    const { state } = room;
    if (state.phase !== 'question') return;
    const index = state.questionIndex;
    for (const playerId of Object.keys(state.debuffs)) {
      const kind = debuffOn(state, index, playerId);
      if (kind === null) continue;
      const seen = debuffsSeen.get(room.id) ?? new Map<number, Map<string, DebuffKind>>();
      debuffsSeen.set(room.id, seen);
      const atQuestion = seen.get(index) ?? new Map<string, DebuffKind>();
      seen.set(index, atQuestion);
      atQuestion.set(playerId, kind);
    }
  };

  const record = (room: Room) => {
    const { state } = room;
    const hostId = room.hostUserId;
    if (hostId === null || state.phase === 'lobby' || sealed.has(room) || superseded.has(room)) return;
    seeDebuffs(room);
    const current = signature(state);
    if (lastSignature.get(room.id) === current) return;
    lastSignature.set(room.id, current);
    if (!startedAt.has(room.id)) startedAt.set(room.id, new Date());

    const closed = closedQuestions(state);
    const snapshot = {
      id: room.id,
      code: room.code,
      hostId,
      quizId: room.quizId,
      state,
      playerUsers: new Map(room.playerUsers),
      startedAt: startedAt.get(room.id) ?? new Date(),
      debuffs: debuffsSeen.get(room.id) ?? new Map(),
      replaces: room.continued?.replaces ?? null,
    };

    const job = async () => {
      // Останнє закрите запитання записується повторно: його оцінки могли змінити вручну.
      const fromQuestion = Math.max(0, Math.min(savedQuestions.get(room.id) ?? 0, closed - 1));
      const trim = untrimmed.has(room.id);
      await save(db, { ...snapshot, fromQuestion, trim });
      if (trim) untrimmed.delete(room.id);
      savedQuestions.set(room.id, closed);
      // Гра вже записана; збій нагородження — як збій запису: журнал і повтор (повтор нічого не дублює).
      // Збій одного користувача awardGame сам віддає в журнал і йде далі; його ачівки наздожене наступне читання.
      if (state.phase === 'finished' && !awarded.has(room.id)) {
        await awardGame(db, room.id, onError);
        awarded.add(room.id);
      }
      failures.delete(room.id);
    };

    const queued: Promise<void> = (queues.get(room.id) ?? Promise.resolve())
      .then(job)
      .catch((error) => {
        // Підпис скидається, щоб той самий стан можна було записати ще раз.
        lastSignature.delete(room.id);
        onError(error);
        const attempt = (failures.get(room.id) ?? 0) + 1;
        failures.set(room.id, attempt);
        if (attempt > maxRetries) {
          failures.delete(room.id);
          return;
        }
        const timer = setTimeout(() => record(room), Math.min(retryMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
        timer.unref();
      })
      .then(() => {
        // Кімнату закрито й дописувати більше нічого: звільнити пам'ять.
        if (closedRooms.has(room.id) && queues.get(room.id) === queued && !failures.has(room.id)) forget(room.id);
      });
    queues.set(room.id, queued);
  };

  /** Збереження (13b): та сама черга й ті самі повтори, що в record; запис цілий (fromQuestion 0), тож давніший збій він заступає. */
  const persistSaved = (room: Room, saved: SavedGameData) => {
    const hostId = room.hostUserId;
    // Повтор збереження кімнати, яку вже заступило продовження, переписав би новіші рядки старою точкою.
    if (hostId === null || superseded.has(room)) return;
    const write: SavedWrite = {
      id: room.id,
      code: room.code,
      hostId,
      quizId: room.quizId,
      playerUsers: new Map(saved.playerUsers),
      saved,
      replaces: room.continued?.replaces ?? null,
    };
    const queued: Promise<void> = (queues.get(room.id) ?? Promise.resolve())
      .then(async () => {
        await saveSavedGame(db, write);
        failures.delete(room.id);
      })
      .catch((error) => {
        onError(error);
        const attempt = (failures.get(room.id) ?? 0) + 1;
        failures.set(room.id, attempt);
        if (attempt > maxRetries) {
          failures.delete(room.id);
          return;
        }
        const timer = setTimeout(() => persistSaved(room, saved), Math.min(retryMs * 2 ** (attempt - 1), MAX_RETRY_DELAY_MS));
        timer.unref();
      })
      .then(() => {
        if (closedRooms.has(room.id) && queues.get(room.id) === queued && !failures.has(room.id)) forget(room.id);
      });
    queues.set(room.id, queued);
  };

  manager.onEvent((room, event) => {
    if (event.type === 'changed') {
      // Перехоплена кімната могла повернутися в цей процес: вона знову жива.
      closedRooms.delete(room.id);
      adopt(room);
      record(room);
      return;
    }
    // Кімнату перехопив інший процес — як закриту: дописати почате й забути (повернеться — пишеться з початку).
    if (event.type === 'closed' || event.type === 'moved') {
      closedRooms.add(room.id);
      if (event.type === 'closed' && event.saved !== undefined) {
        sealed.add(room);
        // Збій попереднього запису більше не повторюється (sealed): його рядки пише збереження.
        failures.delete(room.id);
        persistSaved(room, event.saved);
      }
      // Якщо останній запис не вдався, його повтор ще попереду; пам'ять звільнить він.
      if (failures.has(room.id)) return;
      const pending = queues.get(room.id);
      if (pending === undefined) forget(room.id);
      else void pending.then(() => {
        if (queues.get(room.id) === pending && !failures.has(room.id)) forget(room.id);
      });
    }
  });

  return {
    idle: async () => {
      await Promise.all(queues.values());
    },
  };
}

/** Ігри «в процесі» з минулого запуску, крім ігор кімнат, що відновлюються (except — їхні id). */
export async function markInterrupted(db: Db, except: string[] = []): Promise<void> {
  const running = eq(game.status, 'running');
  await db
    .update(game)
    .set({ status: 'aborted', finishedAt: new Date() })
    .where(except.length === 0 ? running : and(running, notInArray(game.id, except)));
}

/** Перервати конкретні ігри, якщо вони ще «в процесі» (кімнати, що не відновлюються). */
export async function markAborted(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(game)
    .set({ status: 'aborted', finishedAt: new Date() })
    .where(and(eq(game.status, 'running'), inArray(game.id, ids)));
}
