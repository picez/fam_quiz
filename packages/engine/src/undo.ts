import {
  isUnscored,
  undoAnswerKey,
  undoLedger,
  UNDOABLE_ROUNDS,
  UNDOABLE_SOURCES,
  type AdjustmentNotice,
  type ErrorCode,
  type HostUndoTarget,
  type UndoLedger,
  type UndoPanel,
  type UndoQuestion,
  type UndoRow,
  type UndoTarget,
} from '@quiz/shared';
import { addAdjustment, afterQuestionNow } from './adjust';
import { fail, ok, recordOf, type GameState, type Result, type ScoreAdjustment } from './game';

/** Рядок панелі разом із тим, що піде в коригування 'undo'. */
interface Line {
  row: UndoRow;
  /** Раунд того, що скасовується: туди стане й скасування. */
  round: number;
  /** Запитання (індекс у plays), під яким стоїть рядок; null — поза запитаннями раунду. */
  question: number | null;
  /** ScoreAdjustment.undoes скасування цього рядка. */
  undoes: UndoTarget;
}

/** Поточне запитання, поки воно на locked чи reveal (у дуелі — етап, куди гра повернеться); інакше null. */
function hiddenQuestion(state: GameState): number | null {
  const phase = state.phase === 'duel' ? state.duel?.returnPhase : state.phase;
  return phase === 'locked' || phase === 'reveal' ? state.questionIndex : null;
}

/** Запитання закрите й розкриття скінчилося: його бали можна скасовувати. */
function visible(state: GameState, q: number): boolean {
  return q < afterQuestionNow(state) && q !== hiddenQuestion(state);
}

/** Запитання, під яким стоять бали ведучого: останнє закрите в мить коригування, якщо воно з того самого раунду; інакше null. */
function hostGroup(state: GameState, adjustment: ScoreAdjustment): number | null {
  const q = adjustment.afterQuestion - 1;
  return q >= 0 && state.plays[q]?.roundIndex === adjustment.roundIndex ? q : null;
}

function ledgerOf(state: GameState): UndoLedger {
  return undoLedger(state.adjustments.map((a) => ({ seq: a.seq, who: a.playerId, source: a.source, undoes: a.undoes })));
}

/** Чи скасовуються відповіді цього запитання: раунд з UNDOABLE_ROUNDS, не опитування й не хмара. */
function answersUndoable(state: GameState, q: number): boolean {
  const play = state.plays[q];
  const round = state.quiz.rounds[play.roundIndex];
  return round !== undefined && UNDOABLE_ROUNDS.includes(round.type) && !isUnscored(play.question);
}

/**
 * Після кінця гри (12e) скасовується лише штраф за вихід: його могли дописати на останньому переході гри.
 * Бали апеляції (12f) після кінця не скасовуються: це рішення залу, і end закриває відкриту апеляцію раніше, ніж гра скінчиться.
 */
function finishedLock(state: GameState): boolean {
  return state.phase === 'finished';
}

/** Коригування, з якого почався ланцюжок «скасування → Повернути»: саме воно, якщо це не 'undo'; null — скасування відповіді. */
function rootOf(state: GameState, adjustment: ScoreAdjustment): ScoreAdjustment | null {
  let current: ScoreAdjustment | undefined = adjustment;
  while (current !== undefined && current.source === 'undo') {
    const undoes: UndoTarget | undefined = current.undoes;
    if (undoes === undefined || 'question' in undoes) return null;
    current = state.adjustments.find((a) => a.seq === undoes.seq);
  }
  return current ?? null;
}

/** Джерела, що йдуть разом із відповіддю учасника на запитання: штраф за вихід (12e) і бали апеляції (12f). */
const RIDER_SOURCES: readonly ScoreAdjustment['source'][] = ['away', 'appeal'];

/** Нескасовані штрафи 'away' і бали 'appeal' учасника під запитанням q: скасування його відповіді знімає й їх (разом 0 за запитання). */
function openRiders(state: GameState, ledger: UndoLedger, playerId: string, q: number): Undo[] {
  return state.adjustments
    .filter((a) => RIDER_SOURCES.includes(a.source) && a.playerId === playerId && hostGroup(state, a) === q && !ledger.adjustments.has(a.seq))
    .map((a) => ({ playerId, points: -a.points, undoes: { seq: a.seq }, roundIndex: a.roundIndex }));
}

/**
 * Усі рядки панелі з undoneBy, у порядку масової дії: запитання за зростанням індексу (у запитанні — відповіді
 * в порядку state.players, потім бали ведучого за seq), бали поза запитаннями — останніми, за seq.
 * Після кінця гри — лише рядки штрафу за вихід.
 */
function rowsOf(state: GameState): Line[] {
  const all = allRowsOf(state);
  return finishedLock(state) ? all.filter((l) => l.row.kind === 'away') : all;
}

function allRowsOf(state: GameState): Line[] {
  const ledger = ledgerOf(state);
  const nickname = (id: string) => state.players.find((p) => p.id === id)?.nickname;
  const hostLines = new Map<number, Line[]>();
  const loose: Line[] = [];
  for (const adjustment of state.adjustments) {
    if (!UNDOABLE_SOURCES.includes(adjustment.source)) continue;
    const name = nickname(adjustment.playerId);
    if (name === undefined || state.quiz.rounds[adjustment.roundIndex] === undefined) continue;
    const question = hostGroup(state, adjustment);
    if (question !== null && !visible(state, question)) continue;
    const line: Line = {
      row: {
        // Штраф за вихід (12e) — окремий рядок «(вихід із гри)», бали апеляції (12f) — «(апеляція)»; решта як у балів ведучого.
        kind: adjustment.source === 'away' ? 'away' : adjustment.source === 'appeal' ? 'appeal' : 'host',
        playerId: adjustment.playerId,
        nickname: name,
        points: adjustment.points,
        target: { seq: adjustment.seq },
        undoneBy: ledger.adjustments.get(adjustment.seq) ?? null,
      },
      round: adjustment.roundIndex,
      question,
      undoes: { seq: adjustment.seq },
    };
    if (question === null) loose.push(line);
    else hostLines.set(question, [...(hostLines.get(question) ?? []), line]);
  }
  const lines: Line[] = [];
  state.plays.forEach((play, q) => {
    if (!visible(state, q)) return;
    if (answersUndoable(state, q)) {
      for (const player of state.players) {
        const record = recordOf(state, q, player.id);
        if (record === undefined || record.points === 0) continue;
        lines.push({
          row: {
            kind: 'answer',
            playerId: player.id,
            nickname: player.nickname,
            points: record.points,
            target: { question: q, playerId: player.id },
            undoneBy: ledger.answers.get(undoAnswerKey(player.id, q)) ?? null,
          },
          round: play.roundIndex,
          question: q,
          undoes: { question: q },
        });
      }
    }
    lines.push(...(hostLines.get(q) ?? []));
  });
  return [...lines, ...loose];
}

/** Текст запитання в панелі: до 80 символів, довший обрізається з «…». */
function shortText(text: string): string {
  const chars = [...text];
  return chars.length <= 80 ? text : `${chars.slice(0, 79).join('').trimEnd()}…`;
}

/** 1-базовий номер запитання plays[index] серед записів його раунду. */
export function questionNumber(state: GameState, index: number): number {
  const round = state.plays[index]?.roundIndex;
  return state.plays.slice(0, index + 1).filter((play) => play.roundIndex === round).length;
}

/**
 * Рядки аркуша «Скасування балів» (12a); null у лобі й в автопілоті. Правила — план 12a, «Що потрапляє в панель».
 * Після кінця гри — лише штрафи за вихід (12e); без них — null.
 */
export function undoPanel(state: GameState): UndoPanel | null {
  if (state.phase === 'lobby' || state.autopilot !== undefined) return null;
  const lines = rowsOf(state);
  if (finishedLock(state) && lines.length === 0) return null;
  const rounds = [...new Set(lines.map((l) => l.round))].sort((a, b) => b - a);
  return {
    rounds: rounds.map((index) => {
      const own = lines.filter((l) => l.round === index);
      const questions = [...new Set(own.flatMap((l) => (l.question === null ? [] : [l.question])))].sort((a, b) => b - a);
      const round = state.quiz.rounds[index];
      return {
        index,
        title: round.title,
        type: round.type,
        questions: questions.map(
          (q): UndoQuestion => ({
            index: q,
            number: questionNumber(state, q),
            text: shortText(state.plays[q].question.text),
            rows: own.filter((l) => l.question === q).map((l) => l.row),
          }),
        ),
        loose: own.filter((l) => l.question === null).map((l) => l.row),
      };
    }),
  };
}

/** Що дописати в журнал: коригування 'undo' одного рядка. */
interface Undo {
  playerId: string;
  points: number;
  undoes: UndoTarget;
  roundIndex: number;
}

const undoOf = (line: Line): Undo => ({ playerId: line.row.playerId, points: -line.row.points, undoes: line.undoes, roundIndex: line.round });

/** Масова дія: нескасовані рядки групи; без рядків — not_allowed, усі скасовані — already_undone. */
function massOf(lines: Line[]): Undo[] | 'not_allowed' | 'already_undone' {
  if (lines.length === 0) return 'not_allowed';
  const open = lines.filter((l) => l.row.undoneBy === null);
  return open.length === 0 ? 'already_undone' : open.map(undoOf);
}

/** Ціль у коригування 'undo' або код відмови. */
function undosOf(state: GameState, target: HostUndoTarget): Undo[] | ErrorCode {
  if ('playerId' in target) {
    // Хто має право на скасування, тут вирішують ті самі правила, що й у rowsOf: міняти їх треба разом.
    const { question: q, playerId } = target;
    if (q < 0 || q >= state.plays.length) return 'not_found';
    if (!visible(state, q) || finishedLock(state)) return 'wrong_phase';
    if (!state.players.some((p) => p.id === playerId)) return 'not_found';
    if (!answersUndoable(state, q)) return 'not_allowed';
    const record = recordOf(state, q, playerId);
    if (record === undefined || record.points === 0) return 'not_allowed';
    const ledger = ledgerOf(state);
    if (ledger.answers.has(undoAnswerKey(playerId, q))) return 'already_undone';
    return [{ playerId, points: -record.points, undoes: { question: q }, roundIndex: state.plays[q].roundIndex }, ...openRiders(state, ledger, playerId, q)];
  }
  if ('seq' in target) {
    const adjustment = state.adjustments.find((a) => a.seq === target.seq);
    if (adjustment === undefined || !state.players.some((p) => p.id === adjustment.playerId)) return 'not_found';
    if (finishedLock(state) && rootOf(state, adjustment)?.source !== 'away') return 'wrong_phase';
    const ledger = ledgerOf(state);
    if (adjustment.source === 'undo') {
      // «Повернути» саме не скасовується: повернений рядок знову скасовують через його власну ціль.
      const undone = adjustment.undoes;
      if (undone !== undefined && 'seq' in undone && state.adjustments.find((a) => a.seq === undone.seq)?.source === 'undo') return 'not_allowed';
      if (ledger.redone.has(adjustment.seq)) return 'already_undone';
      const root = rootOf(state, adjustment);
      if (root !== null && root.source === 'away' && penaltyExceeds(state, ledger, root)) return 'not_allowed';
      const redo: Undo = { playerId: adjustment.playerId, points: -adjustment.points, undoes: { seq: adjustment.seq }, roundIndex: adjustment.roundIndex };
      return [redo, ...penaltyRedos(state, ledger, adjustment)];
    }
    if (!UNDOABLE_SOURCES.includes(adjustment.source)) return 'not_allowed';
    const question = hostGroup(state, adjustment);
    if (question !== null && !visible(state, question)) return 'wrong_phase';
    if (ledger.adjustments.has(adjustment.seq)) return 'already_undone';
    // Бали апеляції (12f), які вже забрав штраф за вихід, скасовуються лише після штрафу: інакше за запитання вийшов би мінус.
    const penalized = (a: ScoreAdjustment) =>
      a.source === 'away' && a.playerId === adjustment.playerId && hostGroup(state, a) === question && !ledger.adjustments.has(a.seq);
    if (adjustment.source === 'appeal' && question !== null && state.adjustments.some(penalized)) return 'not_allowed';
    return [{ playerId: adjustment.playerId, points: -adjustment.points, undoes: { seq: adjustment.seq }, roundIndex: adjustment.roundIndex }];
  }
  if ('round' in target) {
    if (target.round < 0 || target.round >= state.quiz.rounds.length) return 'not_found';
    return massOf(rowsOf(state).filter((l) => l.round === target.round));
  }
  if (target.question < 0 || target.question >= state.plays.length) return 'not_found';
  if (!visible(state, target.question)) return 'wrong_phase';
  return massOf(rowsOf(state).filter((l) => l.question === target.question));
}

/**
 * Повернений штраф за вихід (12e) узяв би більше, ніж учасник зараз має за запитання: бали запису (0, якщо відповідь скасовано)
 * плюс нескасовані бали апеляції (12f). Тоді «Повернути» відмовляє — інакше за запитання вийшов би мінус.
 */
function penaltyExceeds(state: GameState, ledger: UndoLedger, penalty: ScoreAdjustment): boolean {
  const q = hostGroup(state, penalty);
  if (q === null) return false;
  const who = penalty.playerId;
  const record = ledger.answers.has(undoAnswerKey(who, q)) ? 0 : (recordOf(state, q, who)?.points ?? 0);
  const appeals = state.adjustments
    .filter((a) => a.source === 'appeal' && a.playerId === who && hostGroup(state, a) === q && !ledger.adjustments.has(a.seq))
    .reduce((sum, a) => sum + a.points, 0);
  return -penalty.points > record + appeals;
}

/**
 * «Повернути» скасування відповіді повертає й штраф за вихід і бали апеляції, зняті тією самою дією (той самий batch):
 * інакше учасник отримав би бали запитання, з якого виходив, чи втратив би бали, які зал зарахував.
 */
function penaltyRedos(state: GameState, ledger: UndoLedger, undo: ScoreAdjustment): Undo[] {
  const undone = undo.undoes;
  if (undone === undefined || !('question' in undone) || undo.batch === undefined) return [];
  return state.adjustments
    .filter((a) => {
      if (a.source !== 'undo' || a.batch !== undo.batch || a.playerId !== undo.playerId || ledger.redone.has(a.seq)) return false;
      const u = a.undoes;
      const target = u !== undefined && 'seq' in u ? state.adjustments.find((t) => t.seq === u.seq) : undefined;
      return target !== undefined && RIDER_SOURCES.includes(target.source) && hostGroup(state, target) === undone.question;
    })
    .map((a) => ({ playerId: a.playerId, points: -a.points, undoes: { seq: a.seq }, roundIndex: a.roundIndex }));
}

/** Скасувати чи «Повернути» (12a): кілька коригувань 'undo' з одним batch. Коди відмов — план 12a, «Коди відмов». */
export function undoScore(state: GameState, target: HostUndoTarget, now: number): Result {
  // Після кінця гри — лише штраф за вихід (12e): решту стереже undosOf.
  if (state.phase === 'lobby') return fail('wrong_phase');
  if (state.autopilot !== undefined) return fail('not_allowed');
  const undos = undosOf(state, target);
  if (typeof undos === 'string') return fail(undos);
  // Журнал лише вперед: записи відповідей не змінюються, дописуються тільки коригування.
  const batch = state.adjustmentSeq + 1;
  return ok(
    undos.reduce(
      (s, { playerId, points, undoes, roundIndex }) => addAdjustment(s, playerId, points, now, 'undo', { undoes, batch, roundIndex }),
      state,
    ),
  );
}

/** Група рядка скасування: раунд і запитання (null — поза запитаннями); для «Повернути» — група скасованого рядка. */
function groupOf(state: GameState, adjustment: ScoreAdjustment): { round: number; question: number | null } {
  const undoes = adjustment.undoes;
  if (adjustment.source === 'undo' && undoes !== undefined) {
    if ('question' in undoes) return { round: state.plays[undoes.question]?.roundIndex ?? adjustment.roundIndex, question: undoes.question };
    const target = state.adjustments.find((a) => a.seq === undoes.seq);
    return target === undefined ? { round: adjustment.roundIndex, question: null } : groupOf(state, target);
  }
  return { round: adjustment.roundIndex, question: hostGroup(state, adjustment) };
}

/** Сповіщення про дію, до якої належить коригування 'undo' last; null — у дії не лишилося гравців у грі. */
export function undoNotice(state: GameState, last: ScoreAdjustment): AdjustmentNotice | null {
  const action = state.adjustments.filter((a) => a.source === 'undo' && (last.batch === undefined ? a.seq === last.seq : a.batch === last.batch));
  const rows = action.filter((a) => state.players.some((p) => p.id === a.playerId));
  const final = rows[rows.length - 1];
  if (final === undefined) return null;
  const player = state.players.find((p) => p.id === final.playerId)!; // rows — лише гравці, що є в грі
  const groups = rows.map((a) => groupOf(state, a));
  const q = groups[0].question;
  const undone = final.undoes;
  const target = undone !== undefined && 'seq' in undone ? state.adjustments.find((a) => a.seq === undone.seq) : undefined;
  return {
    seq: Math.max(...action.map((a) => a.seq)),
    at: final.at,
    nickname: player.nickname,
    points: rows.filter((a) => a.playerId === final.playerId).reduce((sum, a) => sum + a.points, 0),
    undo: {
      redo: target?.source === 'undo',
      players: new Set(rows.map((a) => a.playerId)).size,
      round: groupOf(state, final).round + 1,
      question: q !== null && groups.every((g) => g.question === q) ? questionNumber(state, q) : null,
    },
  };
}
