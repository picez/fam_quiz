import {
  allSpares,
  isUnscored,
  type Answer,
  type HostLive,
  type LiveAside,
  type LiveProgress,
  type LiveRow,
  type LiveVerdict,
  type Phase,
  type Question,
} from '@quiz/shared';
// views.ts імпортує цей файл; цей файл views.ts не імпортує (без циклу).
import { verdictOf } from './check';
import { cluesAnswered } from './clues';
import { currentRound, recordOf, type GameState, type Play } from './game';
import { buffOf, questionFor } from './buffs';
import { survivalAlive } from './survival';
import { wipeoutIn } from './wipeout';
import { voterList } from './team-act';
import { captainOf, memberOf, teamsOn } from './teams';

/** Етапи, на яких іде відповідь (до розкриття): ведучий бачить, хто що відповів. */
const LIVE_PHASES: Phase[] = ['question', 'locked'];

/** Запасне запитання за id (з правильною відповіддю — лише ведучому); null — основне або немає в пулі. (Переїхало з views.ts.) */
export function spareOf(state: GameState, id: string | undefined): Question | null {
  return id === undefined ? null : (allSpares(state.quiz).find((q) => q.id === id) ?? null);
}

/** Номер підказки «Хто я?», на якій дано відповідь; null — не «Хто я?», бліц і фінал. (Переїхало з views.ts.) */
export function responseClue(state: GameState, playerId: string, timeMs: number): number | null {
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.blitz !== undefined || currentRound(state)?.type === 'final') return null;
  return cluesAnswered(play, questionFor(state, play, playerId), timeMs);
}

/** Попередній вердикт автоперевірки (verdictOf(...).grade). */
export function previewVerdict(question: Question, answer: Answer, timeMs: number): LiveVerdict {
  return verdictOf(question, answer, timeMs).grade;
}

/** Хто відповідає: id, нікнейм, зв'язок; team — рядок команди (для actor). */
interface Answerer {
  id: string;
  nickname: string;
  connected: boolean;
  team: boolean;
}

function playerAnswerer(state: GameState, id: string): Answerer | null {
  const player = state.players.find((p) => p.id === id);
  return player === undefined ? null : { id, nickname: player.nickname, connected: player.connected, team: teamsOn(state) };
}

const answerersOf = (state: GameState, ids: string[]): Answerer[] => ids.flatMap((id) => playerAnswerer(state, id) ?? []);

/** Порожній рядок: ще не відповів. */
function emptyRow(who: Answerer, actor: string | null): LiveRow {
  return {
    id: who.id,
    nickname: who.nickname,
    connected: who.connected,
    answered: false,
    answer: null,
    timeMs: null,
    verdict: null,
    awaiting: false,
    buff: null,
    spare: null,
    clue: null,
    actor,
    draft: null,
    progress: null,
  };
}

/** Командна гра: нікнейм того, хто зараз діє за команду (капітан); соло й люди — null. */
function actingNickname(state: GameState, who: Answerer): string | null {
  if (!who.team) return null;
  const id = captainOf(state, who.id);
  return id === null ? null : (memberOf(state, id)?.nickname ?? null);
}

/** Поступ рядка; задача 1 — ставка фіналу. */
function progressOf(play: Play, id: string): LiveProgress | null {
  if (play.final === undefined) return null;
  const wagers = play.final.wagers;
  return { kind: 'wager', wager: Object.hasOwn(wagers, id) ? wagers[id] : null, allIn: play.final.allIn.includes(id) };
}

/** Рядок гравця (команди, людини в голосі) за записом, відкладеною першою спробою чи відповіддю поля до «Прийняти». */
function answerRow(state: GameState, play: Play, who: Answerer, unscored: boolean): LiveRow {
  const id = who.id;
  const record = recordOf(state, state.questionIndex, id);
  const buff = buffOf(play, id);
  const first = buff?.first ?? null;
  const board = play.board !== undefined && play.board.chooserId === id ? play.board : undefined;
  const voice = record === undefined && board !== undefined && board.answerMode === 'voice';
  const round = state.quiz.rounds[play.roundIndex];
  const manualFinal = round?.type === 'final' && round.check === 'manual';
  const base: LiveRow = {
    ...emptyRow(who, actingNickname(state, who)),
    buff: buff?.kind ?? null,
    spare: spareOf(state, record?.spare ?? buff?.spare?.id),
    progress: progressOf(play, id),
  };
  if (record !== undefined) {
    const answer = record.answer;
    const pending = manualFinal && !(play.final?.graded.includes(id) ?? false) && answer !== null;
    return {
      ...base,
      answered: true,
      answer,
      timeMs: record.timeMs,
      verdict: unscored ? null : pending ? previewVerdict(play.question, answer, record.timeMs) : record.grade,
      awaiting: pending,
      clue: responseClue(state, id, record.timeMs),
    };
  }
  if (first !== null) return { ...base, answered: true, answer: first.answer, timeMs: first.timeMs, verdict: first.grade };
  // Поле до «Прийняти»: відповідь чекає ведучого.
  const held = board?.answer ?? null;
  if (held !== null) return { ...base, answered: true, answer: held, verdict: previewVerdict(questionFor(state, play, id), held, 0), awaiting: true };
  return voice ? { ...base, awaiting: true } : base;
}

/** Рядок привида «Вибування»: відповідь «для себе». */
function ghostRow(play: Play, who: Answerer): LiveRow {
  const ghost = play.survival?.ghosts[who.id];
  const base = emptyRow(who, null);
  if (ghost === undefined) return base;
  return { ...base, answered: true, answer: ghost.answer, timeMs: ghost.timeMs, verdict: ghost.correct ? 'correct' : 'wrong' };
}

function asideOf(kind: LiveAside['kind'], rows: LiveRow[]): LiveAside {
  return { kind, answered: rows.filter((r) => r.answered).length, total: rows.length, rows };
}

/** «Відповіді наживо» для пульта; null поза відповіддю (див. план 11c, «Коли панель є»). Стан не змінює. */
export function hostLive(state: GameState): HostLive | null {
  if (!LIVE_PHASES.includes(state.phase)) return null;
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.roundIndex !== state.roundIndex) return null;
  // Бліц — задача 2.
  if (play.blitz !== undefined) return null;
  const round = state.quiz.rounds[play.roundIndex];
  const unscored = isUnscored(play.question);
  let who: Answerer[];
  let aside: LiveAside | null = null;
  if (unscored && teamsOn(state)) {
    // Опитування й «хмару» в командній грі кожна людина проходить сама.
    who = voterList(state).map(({ id, nickname }) => ({ id, nickname, connected: memberOf(state, id)?.connected ?? false, team: false }));
  } else if (round?.type === 'wipeout') {
    who = answerersOf(state, wipeoutIn(state));
  } else if (round?.type === 'survival') {
    const alive = survivalAlive(state);
    who = answerersOf(state, alive);
    const ghosts = answerersOf(
      state,
      state.players.filter((p) => !alive.includes(p.id)).map((p) => p.id),
    );
    aside = asideOf('ghosts', ghosts.map((g) => ghostRow(play, g)));
  } else if (play.ladder !== undefined) {
    const contestant = play.ladder.contestantId;
    who = answerersOf(state, [contestant]);
    const hall = answerersOf(
      state,
      state.players.filter((p) => p.id !== contestant).map((p) => p.id),
    );
    aside = asideOf('hall', hall.map((h) => answerRow(state, play, h, false)));
  } else if (play.board !== undefined) {
    who = answerersOf(state, [play.board.chooserId]);
  } else {
    who = answerersOf(
      state,
      state.players.map((p) => p.id),
    );
  }
  const rows = who.map((w) => answerRow(state, play, w, unscored));
  return { kind: 'answers', answered: rows.filter((r) => r.answered).length, total: rows.length, rows, aside };
}
