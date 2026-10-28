import {
  allSpares,
  isUnscored,
  surveyHitsOf,
  surveyOrder,
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
import { blitzRulesOf, isInstant } from './blitz';
import { bluffShownText } from './bluff';
import { verdictOf } from './check';
import { chainOf } from './chain';
import { cluesAnswered, cluesBySelf, cluesOpenBy, cluesPaid } from './clues';
import { currentRound, recordOf, type AnswerRecord, type BlitzPlay, type GameState, type Play } from './game';
import { buffOf, questionFor } from './buffs';
import { sortOf, sortSeq } from './sort';
import { survivalAlive, survivalPlayOf, trialOpen } from './survival';
import { wallOf } from './wall';
import { wipeoutIn } from './wipeout';
import { voterList } from './team-act';
import { captainOf, duelistOf, memberOf, teamsOn } from './teams';

/** Етапи, на яких іде відповідь (до розкриття): ведучий бачить, хто що відповів. */
const LIVE_PHASES: Phase[] = ['question', 'locked'];

/** Типи з поступом: зміст рядка — у progress, а не в answer; вердикту наживо немає (бали — при закритті), у блефі — за вибором. */
const PROGRESS_TYPES: Question['type'][] = ['chain', 'sort', 'wall', 'bluff'];

/** Типи, яких ведучий не оцінює вручну (override відмовляє): ручний фінал на них не чекає рішення. */
const UNGRADABLE: Question['type'][] = ['chain', 'sort', 'wall', 'survey', 'bluff'];

/** Запасне запитання за id (з правильною відповіддю — лише ведучому); null — основне або немає в пулі. (Переїхало з views.ts.) */
export function spareOf(state: GameState, id: string | undefined): Question | null {
  return id === undefined ? null : (allSpares(state.quiz).find((q) => q.id === id) ?? null);
}

/** Номер підказки «Хто я?», на якій дано відповідь; null — не «Хто я?», бліц і фінал. (Переїхало з views.ts.) */
export function responseClue(state: GameState, playerId: string, timeMs: number): number | null {
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.blitz !== undefined || currentRound(state)?.type === 'final') return null;
  return cluesAnswered(play, questionFor(state, play, playerId), timeMs, playerId);
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
    progress: null,
    wager: null,
  };
}

/** Командна гра: нікнейм того, хто зараз діє за команду (типово капітан; у дуелі — дуелянт); соло й люди — null. */
function actingNickname(
  state: GameState,
  who: Answerer,
  actorOf: (teamId: string) => string | null = (teamId) => captainOf(state, teamId),
): string | null {
  if (!who.team) return null;
  const id = actorOf(who.id);
  return id === null ? null : (memberOf(state, id)?.nickname ?? null);
}

/** Місця влучених рядків «100 до 1» для кожного значення — як SurveyRowView.rank (порядок surveyOrder від 1); null — мимо. */
function surveyRanks(question: Extract<Question, { type: 'survey' }>, answer: Answer): (number | null)[] | null {
  if (answer.type !== 'survey') return null;
  const order = surveyOrder(question.rows);
  const hits = surveyHitsOf(answer) ?? [];
  return answer.values.map((_, i) => {
    const place = order.findIndex((row) => row.id === hits[i]);
    return place < 0 ? null : place + 1;
  });
}

/** Ставка фіналу й ва-банк; поза фіналом — null. Окремо від поступу: у фіналі з ланцюжком чи сортуванням видно обидва. */
function wagerOf(play: Play, id: string): LiveRow['wager'] {
  if (play.final === undefined) return null;
  const wagers = play.final.wagers;
  return { wager: Object.hasOwn(wagers, id) ? wagers[id] : null, allIn: play.final.allIn.includes(id) };
}

/** Поступ рядка за типом запитання (ланцюжок, сортування, стіна, блеф, «100 до 1»); інакше null. answer — запис чи відповідь поля до «Прийняти». */
function progressOf(state: GameState, play: Play, id: string, answer: Answer | null): LiveProgress | null {
  const question = play.question;
  // «Хто я?» у власному темпі (12c): скільки відкрито — біля кожного рядка (з відповіддю теж, номер підказки — у clue).
  if (question.type === 'clues' && cluesBySelf(play) && questionFor(state, play, id) === question) {
    return { kind: 'clues', opened: cluesOpenBy(play, id), total: question.clues.length };
  }
  if (question.type === 'chain') {
    const { solved, hints } = chainOf(state, id);
    return { kind: 'chain', solved, total: question.words.length - 1, word: question.words[solved + 1] ?? null, hints };
  }
  if (question.type === 'sort') {
    const progress = sortOf(state, id);
    const head = progress.queue[0];
    const card = head === undefined ? null : (question.words.find((w) => w.id === head)?.text ?? null);
    return {
      kind: 'sort',
      card,
      cardId: card === null ? null : (head ?? null),
      seq: sortSeq(progress),
      sorted: progress.sorted.length,
      total: question.words.length,
      misses: progress.misses,
    };
  }
  if (question.type === 'wall') {
    // Ті самі числа, що WallRow у wallInfo.
    const progress = wallOf(state, id);
    const groups = question.groups.length;
    const solved = progress.found.length === groups;
    const locked = !solved && progress.mistakes >= question.mistakes;
    return { kind: 'wall', found: progress.found.length, groups, mistakes: progress.mistakes, locked, solved };
  }
  if (question.type === 'bluff' && play.bluff !== undefined) {
    const bluff = play.bluff;
    const picked = Object.hasOwn(bluff.picks, id) ? bluff.picks[id].optionId : null;
    const pickText = picked === null ? undefined : bluff.options.find((o) => o.id === picked)?.text;
    return {
      kind: 'bluff',
      stage: state.phase === 'question' ? bluff.stage : 'choice',
      lie: Object.hasOwn(bluff.lies, id) ? bluff.lies[id].text : null,
      // Вибраний варіант — так, як його бачать екрани.
      pick: pickText === undefined ? null : bluffShownText(pickText),
    };
  }
  if (question.type === 'survey') {
    const ranks = answer === null ? null : surveyRanks(question, answer);
    return ranks === null ? null : { kind: 'survey', ranks };
  }
  return null;
}

/**
 * Рядок типу з поступом (ланцюжок, сортування, стіна, блеф): answer — null, зміст у progress.
 * Ланцюжок, сортування, стіна — відповів, коли є запис, без вердикту. Блеф: фаза вигадок — хто написав;
 * фаза вибору (і після закриття) — хто вибрав, з вердиктом за правдою й часом вибору.
 */
function progressRow(state: GameState, play: Play, base: LiveRow, record: AnswerRecord | undefined): LiveRow {
  const bluff = play.bluff;
  if (play.question.type !== 'bluff' || bluff === undefined) {
    if (record !== undefined) return { ...base, answered: true, timeMs: record.timeMs };
    // Фінал сортування: відповів, хто зробив хоч один хід, — як answeredCount у views.ts.
    const finalSort = play.question.type === 'sort' && state.quiz.rounds[play.roundIndex]?.type === 'final';
    return finalSort && Object.hasOwn(play.sort ?? {}, base.id) ? { ...base, answered: true } : base;
  }
  if (state.phase === 'question' && bluff.stage === 'lies') return { ...base, answered: Object.hasOwn(bluff.lies, base.id) };
  if (!Object.hasOwn(bluff.picks, base.id)) return base;
  const pick = bluff.picks[base.id];
  const truth = bluff.options.find((o) => o.id === pick.optionId)?.kind === 'truth';
  return { ...base, answered: true, timeMs: pick.timeMs, verdict: truth ? 'correct' : 'wrong' };
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
    progress: progressOf(state, play, id, record?.answer ?? board?.answer ?? null),
    wager: wagerOf(play, id),
  };
  if (PROGRESS_TYPES.includes(play.question.type)) return progressRow(state, play, base, record);
  if (record !== undefined) {
    const answer = record.answer;
    // Як hostFinal: типи, яких ведучий не оцінює, рішення не чекають (інакше awaiting не знявся б ніколи).
    const gradable = !UNGRADABLE.includes(play.question.type);
    const pending = manualFinal && gradable && !(play.final?.graded.includes(id) ?? false) && answer !== null;
    return {
      ...base,
      answered: true,
      answer,
      timeMs: record.timeMs,
      verdict: unscored ? null : pending ? previewVerdict(questionFor(state, play, id), answer, record.timeMs) : record.grade,
      awaiting: pending,
      clue: responseClue(state, id, record.timeMs),
    };
  }
  if (first !== null) return { ...base, answered: true, answer: first.answer, timeMs: first.timeMs, verdict: first.grade };
  // Поле до «Прийняти»: відповідь чекає ведучого.
  const held = board?.answer ?? null;
  if (held !== null) {
    const shown = questionFor(state, play, id);
    // Власний темп і усна клітинка знають підказку й до «Прийняти»; за часом — ні (часу відповіді ще немає).
    const clue = shown.type === 'clues' && shown === play.question ? (cluesPaid(play, id) ?? null) : null;
    return { ...base, answered: true, answer: held, verdict: previewVerdict(shown, held, 0), awaiting: true, clue };
  }
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

function liveOf(kind: HostLive['kind'], rows: LiveRow[], aside: LiveAside | null): HostLive {
  return { kind, answered: rows.filter((r) => r.answered).length, total: rows.length, rows, aside };
}

/** Командний бліц: той, хто натиснув (досі в команді й на зв'язку), інакше капітан. */
function blitzActor(state: GameState, play: Play, who: Answerer): string | null {
  if (!who.team) return null;
  const buzzer = play.buzzers?.[who.id];
  const member = buzzer === undefined ? undefined : memberOf(state, buzzer);
  return member !== undefined && member.teamId === who.id && member.connected ? member.nickname : actingNickname(state, who);
}

/**
 * Рядок бліцу. У черзі: голова з відповіддю чекає «Прийняти» чи оцінки (з кнопкою — з попереднім вердиктом,
 * у миттєвому — без: BlitzRow.grade ще null); усна голова чекає ведучого без відповіді. Далі — не перевірена
 * відповідь (dropped), остання розглянута спроба з її оцінкою, скинуте натискання без відповіді.
 */
function blitzRow(state: GameState, play: Play & { blitz: BlitzPlay }, who: Answerer, instant: boolean, voice: boolean): LiveRow {
  const { blitz } = play;
  const id = who.id;
  const base: LiveRow = { ...emptyRow(who, blitzActor(state, play, who)), buff: buffOf(play, id)?.kind ?? null };
  const index = blitz.queue.findIndex((e) => e.playerId === id);
  if (index >= 0) {
    const entry = blitz.queue[index];
    const head = index === 0;
    const queued: LiveRow = { ...base, answered: true, answer: entry.answer, timeMs: entry.timeMs };
    if (entry.answer === null) return { ...queued, awaiting: head && voice };
    const verdict = head && !instant ? previewVerdict(questionFor(state, play, id), entry.answer, entry.timeMs) : null;
    return { ...queued, verdict, awaiting: head };
  }
  const dropped = blitz.dropped.find((e) => e.playerId === id);
  if (dropped !== undefined && dropped.answer !== null) return { ...base, answered: true, answer: dropped.answer, timeMs: dropped.timeMs };
  const attempt = blitz.attempts.filter((a) => a.playerId === id).at(-1);
  if (attempt !== undefined) return { ...base, answered: true, answer: attempt.answer, timeMs: attempt.timeMs, verdict: attempt.grade };
  return dropped === undefined ? base : { ...base, answered: true, timeMs: dropped.timeMs };
}

/** Бліц-раунд чи бліц-клітинка: усі гравці (команди) у порядку гравців. */
function blitzLive(state: GameState, play: Play & { blitz: BlitzPlay }): HostLive | null {
  const rules = blitzRulesOf(state, play);
  if (rules === null) return null;
  const instant = isInstant(rules);
  const voice = rules.check === 'voice';
  const who = answerersOf(
    state,
    state.players.map((p) => p.id),
  );
  return liveOf(
    'blitz',
    who.map((w) => blitzRow(state, play, w, instant, voice)),
    null,
  );
}

/** Відкрите випробування «Вибування»: ті, хто «на межі»; питання — відповідь з вердиктом, удача — вибрані двері (без пасток). */
function trialLive(state: GameState): HostLive | null {
  const play = survivalPlayOf(state);
  const trial = play?.survival.trial ?? null;
  if (play === null || trial === null) return null;
  // edge, зафіксований на «Далі», — саме ті, кому випробування дозволяє відповідати (edgeNow на цей момент той самий).
  const edge = play.survival.edge ?? [];
  const who = answerersOf(
    state,
    state.players.filter((p) => edge.includes(p.id)).map((p) => p.id),
  );
  const rows = who.map((w): LiveRow => {
    const base = emptyRow(w, actingNickname(state, w));
    if (trial.kind === 'luck') {
      const picked = Object.hasOwn(trial.doors, w.id) ? trial.doors[w.id] : null;
      return { ...base, answered: picked !== null, progress: { kind: 'door', picked } };
    }
    if (!Object.hasOwn(trial.answers, w.id)) return base;
    const given = trial.answers[w.id];
    return { ...base, answered: true, answer: given.answer, timeMs: given.timeMs, verdict: given.correct ? 'correct' : 'wrong' };
  });
  return liveOf('trial', rows, null);
}

/** Дуель на етапах question і answer: два дуелянти з неправильними спробами; той, хто виграв, — з відповіддю й часом. */
function duelLive(state: GameState): HostLive | null {
  const duel = state.duel;
  if (duel === null || (duel.stage !== 'question' && duel.stage !== 'answer')) return null;
  const play = duel.questions.at(-1);
  if (play === undefined) return null;
  const rows = answerersOf(state, [duel.challengerId, duel.opponentId]).map((w): LiveRow => {
    const won = play.winnerId === w.id;
    return {
      ...emptyRow(w, actingNickname(state, w, (teamId) => duelistOf(state, teamId))),
      answered: won,
      timeMs: won ? play.timeMs : null,
      verdict: won ? 'correct' : null,
      progress: { kind: 'duel', tries: Object.hasOwn(play.tries, w.id) ? play.tries[w.id] : [], won: won ? play.answer : null },
    };
  });
  return liveOf('duel', rows, null);
}

/** «Відповіді наживо» для пульта; null поза відповіддю (див. план 11c, «Коли панель є»). Стан не змінює. */
export function hostLive(state: GameState): HostLive | null {
  if (state.phase === 'duel') return duelLive(state);
  if (trialOpen(state)) return trialLive(state);
  if (!LIVE_PHASES.includes(state.phase)) return null;
  const play = state.plays[state.questionIndex];
  if (play === undefined || play.roundIndex !== state.roundIndex) return null;
  if (play.blitz !== undefined) return blitzLive(state, { ...play, blitz: play.blitz });
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
  return liveOf('answers', rows, aside);
}
