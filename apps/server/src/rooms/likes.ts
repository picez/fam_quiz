import { memberOf, questionFor, teamOf, teamsOn, type GameState } from '@quiz/engine';
import type { LikePerson, LikesView } from '@quiz/shared';
import type { LikeKey } from '../like-store';
import type { Room } from './manager';

/** Лайки кімнати (17a): лише в пам'яті; заповнює attachLikes. */
export interface RoomLikes {
  /** quiz.owner_id; undefined — ще не прочитано; null — вікторини немає. */
  author?: string | null;
  /** Прочитані акаунти: userId → LikeKey. Немає ключа — ще не прочитано (серця немає). */
  mine: Map<string, Set<LikeKey>>;
}

/** Людина стану: соло — гравець, команда — учасник (людина, не команда). */
export function personOf(state: GameState, id: string): { id: string; nickname: string } | undefined {
  return teamsOn(state) ? memberOf(state, id) : state.players.find((p) => p.id === id);
}

/** Запитання, яке бачить людина на поточному розкритті: запасне після «Заміни» (9d), у команді — запитання її команди. */
export function likedQuestionId(state: GameState, personId: string): string | undefined {
  const play = state.plays[state.questionIndex];
  // Запитання «Правди про гравця» (28b) — чийсь факт, а не запитання автора вікторини: серця немає.
  if (play === undefined || play.truth !== undefined) return undefined;
  return questionFor(state, play, teamOf(state, personId) ?? personId).id;
}

/** Люди стану з акаунтом, крім акаунта me, по одному на акаунт (перше місце в порядку стану). */
function likeablePeople(room: Room, me: string): { id: string; nickname: string; userId: string }[] {
  const { state } = room;
  const people = teamsOn(state) ? state.teams.members : state.players;
  const seen = new Set<string>([me]);
  const result: { id: string; nickname: string; userId: string }[] = [];
  for (const person of people) {
    const userId = room.playerUsers.get(person.id);
    if (userId === undefined || seen.has(userId)) continue;
    seen.add(userId);
    result.push({ id: person.id, nickname: person.nickname, userId });
  }
  return result;
}

/** Що бачить людина personId; undefined — гість, не прочитано, без quizId/hostUserId або нічого не можна. */
export function likesView(room: Room, personId: string): LikesView | undefined {
  const { state } = room;
  if (room.quizId === null || room.hostUserId === null) return undefined;
  if (personOf(state, personId) === undefined) return undefined;
  const me = room.playerUsers.get(personId);
  const mine = me === undefined ? undefined : room.likes.mine.get(me);
  if (me === undefined || mine === undefined) return undefined;
  const author = room.likes.author;
  const ownQuiz = author === undefined || author === null || author === me;
  if (state.phase === 'reveal') {
    const questionId = ownQuiz ? undefined : likedQuestionId(state, personId);
    return questionId === undefined ? undefined : { question: mine.has(`q:${questionId}`) };
  }
  if (state.phase !== 'finished') return undefined;
  const view: LikesView = {};
  if (!ownQuiz) view.quiz = mine.has('quiz');
  if (state.autopilot === undefined && room.hostUserId !== me) view.host = mine.has('host');
  const people: LikePerson[] = likeablePeople(room, me).map((p) => ({ id: p.id, nickname: p.nickname, liked: mine.has(`p:${p.userId}`) }));
  if (people.length > 0) view.people = people;
  return Object.keys(view).length === 0 ? undefined : view;
}
