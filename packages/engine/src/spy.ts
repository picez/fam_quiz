import { familyExtraMs, familyOn, LIMITS, rulesOf, thinkKey, thinkStem, type Question, type SpyAnswer } from '@quiz/shared';
import { textAccepts } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  fail,
  lockNow,
  ok,
  withCurrentPlay,
  withRecord,
  type AnswerRecord,
  type GameState,
  type Play,
  type PlayerState,
  type Result,
  type Rng,
  type SpyPlay,
} from './game';
import { presentPlayers } from './present';
import { notStarted } from './splash';
import { thinkClose } from './think';
import { closesAt, timeOver } from './timing';

// «Шпигун» (38): шпигуна вибирає rng гри при відкритті (Play.spy.spyId); етапи words → vote → guess — усі у фазі question.
// Бали ставить scoreSpy при закритті (lockNow, endNow) за голосами й здогадкою.

type SpyQuestion = Extract<Question, { type: 'spy' }>;

/** Поточне запитання spy з його грою; null поза ним. */
export function spyPlayOf(state: GameState): (Play & { spy: SpyPlay; question: SpyQuestion }) | null {
  const play = state.plays[state.questionIndex];
  if (play?.spy === undefined || play.question.type !== 'spy') return null;
  return play as Play & { spy: SpyPlay; question: SpyQuestion };
}

/** Учасники «Шпигуна»: присутні без автора автопілота (він писав вікторину й знає обидва слова), у порядку state.players. */
export function spyCast(state: GameState): PlayerState[] {
  const authorId = state.autopilot?.authorId;
  return presentPlayers(state).filter((p) => p.id !== authorId);
}

/** Глядач «Шпигуна»: автор автопілота. */
function spectator(state: GameState, playerId: string): boolean {
  return state.autopilot?.authorId === playerId;
}

/** SpyPlay нового запитання: шпигун — cast[⌊rng() · n⌋], один виклик rng. Порожній склад сюди не потрапляє (playable). */
export function openSpy(state: GameState, rng: Rng): SpyPlay {
  const cast = spyCast(state);
  const index = Math.min(cast.length - 1, Math.floor(rng() * cast.length));
  return { stage: 'words', spyId: cast[index]?.id ?? '', words: {}, votes: {}, guess: null };
}

/** Слово, яке бачить гравець: шпигун — spyWord, решта — accepted[0]. */
function ownWord(question: SpyQuestion, spy: SpyPlay, playerId: string): string {
  return playerId === spy.spyId ? question.spyWord : question.accepted[0];
}

/** Текст гравця: пробіли зведено, обрізано; порожній за thinkKey чи задовгий — null. */
function cleanWord(text: string): string | null {
  const value = text.replace(/\s+/g, ' ').trim();
  return value === '' || value.length > LIMITS.thinkWord || thinkKey(value) === '' ? null : value;
}

/** Спільні перевірки дії етапу stage; null — можна. */
function refusal(state: GameState, stage: SpyPlay['stage'], playerId: string, now: number): Result | null {
  if (state.phase !== 'question') return fail('wrong_phase');
  const play = spyPlayOf(state);
  if (play === null || play.spy.stage !== stage) return fail('wrong_phase');
  if (state.paused) return fail('paused');
  if (notStarted(state, now)) return fail('not_started');
  if (!state.players.some((p) => p.id === playerId)) return fail('not_found');
  return null;
}

/**
 * Асоціація (етап words): одна на гравця; зведена й обрізана, ≤ LIMITS.thinkWord, хоч одна літера чи цифра (think_word);
 * близька до власного слова (thinkClose стебел) — spy_word. Глядач — spy_spectator. Усі учасники написали — голосування від now.
 */
export function writeSpyWord(state: GameState, playerId: string, text: string, now: number): Result {
  const refused = refusal(state, 'words', playerId, now);
  if (refused !== null) return refused;
  const play = spyPlayOf(state)!;
  if (spectator(state, playerId)) return fail('spy_spectator');
  if (Object.hasOwn(play.spy.words, playerId)) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  const value = cleanWord(text);
  if (value === null) return fail('think_word');
  if (thinkClose(thinkStem(value), thinkStem(ownWord(play.question, play.spy, playerId)))) return fail('spy_word');
  const written = withCurrentPlay(state, { ...play, spy: { ...play.spy, words: { ...play.spy.words, [playerId]: { text: value, at: now } } } });
  return ok(spyAuto(written, now));
}

/**
 * Голос (етап vote): один на гравця, без асоціації теж можна; за себе — spy_self; ціль — гравець, не глядач (not_found).
 * Глядач — spy_spectator. Усі учасники проголосували — closeVote.
 */
export function voteSpy(state: GameState, playerId: string, target: string, now: number): Result {
  const refused = refusal(state, 'vote', playerId, now);
  if (refused !== null) return refused;
  const play = spyPlayOf(state)!;
  if (spectator(state, playerId)) return fail('spy_spectator');
  if (Object.hasOwn(play.spy.votes, playerId)) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  if (target === playerId) return fail('spy_self');
  if (!state.players.some((p) => p.id === target) || spectator(state, target)) return fail('not_found');
  const cast = { target, timeMs: Math.max(0, now - state.startedAt) };
  const voted = withCurrentPlay(state, { ...play, spy: { ...play.spy, votes: { ...play.spy.votes, [playerId]: cast } } });
  return ok(spyAuto(voted, now));
}

/** Останній шанс (етап guess): лише шпигун (not_allowed), одне слово (already_answered), порожнє — think_word; слово закриває запитання. */
export function guessSpy(state: GameState, playerId: string, text: string, now: number): Result {
  const refused = refusal(state, 'guess', playerId, now);
  if (refused !== null) return refused;
  const play = spyPlayOf(state)!;
  if (playerId !== play.spy.spyId) return fail('not_allowed');
  if (play.spy.guess !== null) return fail('already_answered');
  if (state.startedAt === null || timeOver(state, play, now)) return fail('time_over');
  const value = cleanWord(text);
  if (value === null) return fail('think_word');
  return ok(lockNow(withCurrentPlay(state, { ...play, spy: { ...play.spy, guess: { text: value, at: now } } })));
}

/**
 * Новий етап stage з таймером ms від now (посеред заставки — після неї; на паузі — remainingMs). Зміни ведучого «±15 с» і особистий
 * додатковий час попереднього етапу не переходять; сімейна надбавка — у extraMs, як у startChoice блефу.
 */
function withStage(state: GameState, play: Play & { spy: SpyPlay }, stage: SpyPlay['stage'], ms: number, now: number): GameState {
  const { overtime: _overtime, ...kept } = play;
  const extra = familyOn(state.quiz) ? familyExtraMs(ms) : 0;
  const staged = withCurrentPlay(state, { ...kept, extraMs: extra, spy: { ...play.spy, stage } });
  if (state.paused) return { ...staged, remainingMs: ms + extra, startedAt: null, endsAt: null };
  const from = Math.max(now, state.startedAt ?? now);
  return { ...staged, startedAt: from, endsAt: from + ms + extra, remainingMs: null };
}

/** Голосування: таймер voteTime від now. Поза етапом words — той самий стан. */
export function startVote(state: GameState, now: number): GameState {
  const play = spyPlayOf(state);
  if (play === null || play.spy.stage !== 'words') return state;
  return withStage(state, play, 'vote', play.question.voteTime * 1000, now);
}

/**
 * Кінець голосування: викрито й шпигун присутній — останній шанс (LIMITS.spyGuessTime від now); інакше lockNow.
 * Без now (вилучення гравця) останній шанс не стартує — етап лишається, його перемкне tick чи ведучий. Поза vote — той самий стан.
 */
export function closeVote(state: GameState, now: number | null): GameState {
  const play = spyPlayOf(state);
  if (play === null || play.spy.stage !== 'vote') return state;
  const spyId = play.spy.spyId;
  const chance = spyCaught(state, state.questionIndex) && presentPlayers(state).some((p) => p.id === spyId);
  if (!chance) return lockNow(state);
  return now === null ? state : withStage(state, play, 'guess', LIMITS.spyGuessTime * 1000, now);
}

/**
 * autoLock для «Шпигуна» (строго «>», як у timeOver: рівно на кінці ще можна): words — час сплив або всі учасники написали
 * (лише з now) → startVote; vote — час сплив або всі учасники проголосували → closeVote; guess — час сплив або шпигуна вже немає → lockNow.
 */
export function spyAuto(state: GameState, now: number | null): GameState {
  if (state.phase !== 'question' || state.paused) return state;
  const play = spyPlayOf(state);
  if (play === null) return state;
  const cast = spyCast(state);
  const closes = closesAt(state);
  const expired = now !== null && closes !== null && state.heldAt === null && now > closes;
  if (play.spy.stage === 'words') {
    if (now === null) return state;
    const everyoneWrote = cast.length > 0 && cast.every((p) => Object.hasOwn(play.spy.words, p.id));
    return expired || everyoneWrote ? startVote(state, now) : state;
  }
  if (play.spy.stage === 'vote') {
    const everyoneVoted = cast.length > 0 && cast.every((p) => Object.hasOwn(play.spy.votes, p.id));
    return expired || everyoneVoted ? closeVote(state, now) : state;
  }
  const spyGone = !state.players.some((p) => p.id === play.spy.spyId);
  return expired || spyGone || play.spy.guess !== null ? lockNow(state) : state;
}

/** Чи викрито шпигуна запитання index: він ще в грі й має строго найбільше голосів (> 0). */
export function spyCaught(state: GameState, index: number): boolean {
  const spy = state.plays[index]?.spy;
  if (spy === undefined || !state.players.some((p) => p.id === spy.spyId)) return false;
  const counts = new Map<string, number>();
  for (const { target } of Object.values(spy.votes)) counts.set(target, (counts.get(target) ?? 0) + 1);
  const against = counts.get(spy.spyId) ?? 0;
  return against > 0 && [...counts].every(([id, n]) => id === spy.spyId || n < against);
}

/**
 * На етапі question у етапах vote/guess: записи всім, хто писав чи голосував, і шпигунові. price = ціна × множник раунду;
 * без швидкості й без мінуса. Викрито: голос за шпигуна — price, шпигун зі здогадкою (textAccepts) — price / 2, решта 0.
 * Не викрито: шпигун — price × 2, решта 0. Шпигуна вилучено — усім 0. Інакше — той самий стан.
 */
export function scoreSpy(state: GameState): GameState {
  if (state.phase !== 'question') return state;
  const play = spyPlayOf(state);
  if (play === null || play.spy.stage === 'words') return state;
  const { question, spy } = play;
  const price = Math.round(question.points * rulesOf(state.quiz.rounds[play.roundIndex]).multiplier);
  const spyIn = state.players.some((p) => p.id === spy.spyId);
  const caught = spyCaught(state, state.questionIndex);
  const guessed = caught && spy.guess !== null && textAccepts(question.accepted, spy.guess.text);
  const voteMs = question.voteTime * 1000 + (spy.stage === 'vote' ? play.extraMs : 0);
  const nickname = (id: string) => state.players.find((p) => p.id === id)?.nickname ?? null;
  let scored = state;
  for (const player of state.players) {
    const id = player.id;
    const isSpy = id === spy.spyId;
    const written = Object.hasOwn(spy.words, id) ? spy.words[id] : undefined;
    const cast = Object.hasOwn(spy.votes, id) ? spy.votes[id] : undefined;
    if ((written === undefined && cast === undefined && !isSpy) || Object.hasOwn(play.answers, id)) continue;
    const points = !spyIn ? 0 : isSpy ? (caught ? (guessed ? Math.round(price / 2) : 0) : price * 2) : caught && cast?.target === spy.spyId ? price : 0;
    const won = spyIn && (isSpy ? !caught || guessed : caught && cast?.target === spy.spyId);
    const answer: SpyAnswer = {
      type: 'spy',
      word: written?.text ?? null,
      vote: cast === undefined ? null : nickname(cast.target),
      spy: isSpy,
      caught,
      guess: isSpy ? (spy.guess?.text ?? null) : null,
      guessed: isSpy && guessed,
    };
    const record: AnswerRecord = {
      answer,
      timeMs: cast?.timeMs ?? voteMs,
      accepted: won,
      accuracy: won ? 1 : 0,
      grade: won ? 'correct' : 'wrong',
      basePoints: points,
      streakBonus: 0,
      points,
      overridden: false,
    };
    scored = withRecord(scored, id, record);
  }
  return scored;
}
