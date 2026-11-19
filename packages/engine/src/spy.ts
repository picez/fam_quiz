import { familyExtraMs, familyOn, LIMITS, rulesOf, thinkKey, thinkStem, type HostSpy, type PlayerSpy, type Question, type SpyAnswer, type SpyInfo, type SpyRow } from '@quiz/shared';
import { textAccepts } from './check';
// game.ts викликає цей файл, а цей файл — game.ts; обидва звертаються одне до одного лише під час виклику.
import {
  fail,
  lockNow,
  ok,
  recordOf,
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

/** Учасники «Шпигуна»: присутні без автора автопілота (він писав вікторину й знає загальне слово), у порядку state.players. */
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
  const spy = cast[index];
  return { stage: 'words', spyId: spy?.id ?? '', ...(spy === undefined ? {} : { spyName: spy.nickname }), words: {}, votes: {}, guess: null };
}

/** Слово, яке бачить гравець (50): шпигун — жодного (null), решта — загальне accepted[0]. Застаріле spyWord не читається. */
function ownWord(question: SpyQuestion, spy: SpyPlay, playerId: string): string | null {
  return playerId === spy.spyId ? null : question.accepted[0];
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
 * у не-шпигуна близька до власного слова (thinkClose стебел) — spy_word. Асоціацію шпигуна (50) на близькість не перевіряють:
 * відмова «надто близько до слова» підказала б йому загальне слово. Глядач — spy_spectator. Усі учасники написали — голосування від now.
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
  const own = ownWord(play.question, play.spy, playerId);
  if (own !== null && thinkClose(thinkStem(value), thinkStem(own))) return fail('spy_word');
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

/**
 * Чи викрито шпигуна запитання index: строго найбільше голосів (> 0) за нього. Вилучення на відкритому запитанні знімає голоси за нього,
 * тож вилучений до закриття не викритий; вилучений після закриття лишається викритим, як і було при підрахунку балів.
 */
export function spyCaught(state: GameState, index: number): boolean {
  const spy = state.plays[index]?.spy;
  if (spy === undefined) return false;
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
  const guessed = guessedOf(state, play);
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

/** Зріз «Шпигуна» лише на поточному запитанні spy у фазах question, locked і reveal; інакше null. */
function viewPlay(state: GameState): (Play & { spy: SpyPlay; question: SpyQuestion }) | null {
  if (state.phase !== 'question' && state.phase !== 'locked' && state.phase !== 'reveal') return null;
  return spyPlayOf(state);
}

/** Чи вгадав шпигун слово гравців: викрито, є здогадка, і її приймає textAccepts. */
function guessedOf(state: GameState, play: Play & { spy: SpyPlay; question: SpyQuestion }): boolean {
  return spyCaught(state, state.questionIndex) && play.spy.guess !== null && textAccepts(play.question.accepted, play.spy.guess.text);
}

/** Повний зріз (пульт і reveal): рядки всіх гравців, крім глядача, у порядку state.players. */
function fullInfo(state: GameState, play: Play & { spy: SpyPlay; question: SpyQuestion }): HostSpy {
  const { question, spy } = play;
  const revealed = state.phase === 'reveal';
  const rows: SpyRow[] = state.players
    .filter((p) => !spectator(state, p.id))
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      word: Object.hasOwn(spy.words, p.id) ? spy.words[p.id].text : null,
      voters: state.players.filter((v) => Object.hasOwn(spy.votes, v.id) && spy.votes[v.id].target === p.id).map((v) => v.nickname),
      spy: p.id === spy.spyId,
      points: state.phase === 'question' ? null : (recordOf(state, state.questionIndex, p.id)?.points ?? 0),
    }));
  return {
    stage: revealed ? 'reveal' : spy.stage,
    written: state.players.filter((p) => Object.hasOwn(spy.words, p.id)).length,
    voted: state.players.filter((p) => Object.hasOwn(spy.votes, p.id)).length,
    total: spyCast(state).length,
    rows,
    spyId: spy.spyId,
    playersWord: question.accepted[0],
    spyHint: question.spyHint ?? null,
    // Вилучений після закриття — нікнейм з відкриття; до закриття вилучення прибирає spyName.
    spyName: state.players.find((p) => p.id === spy.spyId)?.nickname ?? spy.spyName ?? null,
    caught: spyCaught(state, state.questionIndex),
    guess: spy.guess?.text ?? null,
    guessed: guessedOf(state, play),
  };
}

/**
 * Сцена й телефони: words — лише лічильники; vote і guess (і locked) — рядки «ім'я — асоціація» без голосів, позначки шпигуна й балів;
 * reveal — усе: шпигун, загальне слово, підказка шпигунові, голоси, здогадка, бали. Шпигуна вилучено — spyName null, caught false. Поза запитанням spy — undefined.
 */
export function spyInfo(state: GameState): SpyInfo | undefined {
  const play = viewPlay(state);
  if (play === null) return undefined;
  const { spyId: _spyId, ...full } = fullInfo(state, play);
  if (state.phase === 'reveal') return full;
  const rows = play.spy.stage === 'words' ? null : full.rows.map((r) => ({ ...r, voters: null, spy: null, points: null }));
  return { ...full, rows, playersWord: null, spyHint: null, spyName: null, caught: null, guess: null, guessed: null };
}

/** Пульт: усе з відкриття — шпигун, загальне слово, підказка шпигунові, асоціації й голоси наживо, здогадка; бали — з locked. */
export function hostSpy(state: GameState): HostSpy | undefined {
  const play = viewPlay(state);
  return play === null ? undefined : fullInfo(state, play);
}

/**
 * Власний бік гравця (50): шпигун знає, що він шпигун (spy з відкриття), слова не бачить (word null), лише підказку ведучого (hint);
 * решта — загальне слово, hint null, spy false. Свої асоціація й голос (id цілі); guessing — лише шпигунові на етапі guess.
 * Поза запитанням spy чи для невідомого гравця — undefined.
 */
export function playerSpy(state: GameState, playerId: string): PlayerSpy | undefined {
  const play = viewPlay(state);
  if (play === null || !state.players.some((p) => p.id === playerId)) return undefined;
  const { spy } = play;
  const isSpy = playerId === spy.spyId;
  return {
    word: ownWord(play.question, spy, playerId),
    hint: isSpy ? (play.question.spyHint ?? null) : null,
    wrote: Object.hasOwn(spy.words, playerId) ? spy.words[playerId].text : null,
    vote: Object.hasOwn(spy.votes, playerId) ? spy.votes[playerId].target : null,
    spectator: spectator(state, playerId),
    guessing: isSpy && state.phase === 'question' && spy.stage === 'guess',
    guess: isSpy ? (spy.guess?.text ?? null) : null,
    spy: isSpy,
  };
}
