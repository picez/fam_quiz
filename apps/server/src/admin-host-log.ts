import { memberOf, type GameState } from '@quiz/engine';
import type { AdminActionKind, Grade } from '@quiz/shared';
import type { HostAction } from './rooms/manager';

/** Дія з пульта адміна в кімнаті бота (68): дія ведучого, підказка й рішення «Мільйонера» за учасника. */
export type AdminHostAction = HostAction | { type: 'hint'; playerId: string } | { type: 'ladder-decide' };

/** Види журналу дій з пульта адміна (68); кроків темпу й показу тут немає — вони не пишуться. */
const KINDS: Partial<Record<AdminHostAction['type'], AdminActionKind>> = {
  start: 'bot_room_start',
  pause: 'bot_room_pause',
  resume: 'bot_room_resume',
  end: 'bot_room_end',
  'end-round': 'bot_room_end_round',
  kick: 'bot_room_kick',
  release: 'bot_room_release',
  'team-form': 'bot_room_teams',
  adjust: 'bot_room_adjust',
  override: 'bot_room_grade',
  judge: 'bot_room_grade',
  accept: 'bot_room_grade',
  repick: 'bot_room_grade',
  name: 'bot_room_grade',
  'alike-join': 'bot_room_grade',
  'alike-split': 'bot_room_grade',
  'ladder-decide': 'bot_room_grade',
  undo: 'bot_room_undo',
  debuff: 'bot_room_debuff',
  undebuff: 'bot_room_debuff',
  hint: 'bot_room_hint',
};

const GRADE_MARK: Record<Grade, string> = { correct: '✓', partial: '½', wrong: '✗' };

/** Нік людини, назва команди-гравця чи команди лобі; невідомий id — undefined. */
function nameOf(state: GameState, id: string): string | undefined {
  return memberOf(state, id)?.nickname ?? state.players.find((p) => p.id === id)?.nickname ?? state.teams?.list.find((t) => t.id === id)?.name;
}

/** Текст рядка журналу: нік (з позначкою оцінки чи балами), як у маршруті 62; без ніку — undefined. */
function textOf(state: GameState, action: AdminHostAction): string | undefined {
  const named = (id: string, suffix = '') => {
    const name = nameOf(state, id);
    return name === undefined ? undefined : name + suffix;
  };
  switch (action.type) {
    case 'override':
      return named(action.playerId, ' ' + GRADE_MARK[action.grade]);
    case 'judge':
      return named(action.playerId, action.correct ? ' ✓' : ' ✗');
    case 'accept':
      return named(action.playerId, ' ✓');
    case 'repick':
      return named(action.playerId, ' ↻');
    case 'adjust':
      return named(action.playerId, ': ' + (action.points > 0 ? '+' : '') + action.points);
    case 'kick':
    case 'release':
    case 'debuff':
    case 'undebuff':
    case 'hint':
      return named(action.playerId);
    default:
      return undefined;
  }
}

/**
 * Рядок журналу для дії з пульта адміна в кімнаті бота (68) або null — дія не пишеться (кроки темпу й показу).
 * Рахувати до дії: після вилучення людини в стані вже немає.
 */
export function adminHostLog(state: GameState, action: AdminHostAction): { kind: AdminActionKind; text?: string } | null {
  const kind = KINDS[action.type];
  if (kind === undefined) return null;
  const text = textOf(state, action);
  return text === undefined ? { kind } : { kind, text };
}
