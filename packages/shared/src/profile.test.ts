import { describe, expect, it } from 'vitest';
import { gameStats, profileUpdateSchema } from './profile';
import type { PlayedGame } from './history';

function game(over: Partial<PlayedGame> = {}) {
  return { status: 'finished', rank: 1, score: 100, playerCount: 2, correct: 3, questionsPlayed: 4, ...over } as PlayedGame;
}

describe('profileUpdateSchema', () => {
  it('tidies a nickname and keeps a valid avatar', () => {
    expect(profileUpdateSchema.parse({ nickname: '  Оля   К ', avatar: '/uploads/0123456789abcdef.png' })).toEqual({
      nickname: 'Оля К',
      avatar: '/uploads/0123456789abcdef.png',
    });
    expect(profileUpdateSchema.parse({ nickname: 'Оля 🙂', avatar: null }).avatar).toBeNull();
  });
  it.each(['О', ' О ', 'а'.repeat(21), 'a\u0000b'])('refuses the nickname %j', (nickname) => {
    const result = profileUpdateSchema.safeParse({ nickname, avatar: null });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path[0]).toBe('nickname');
  });
  it.each(['https://evil.example/x.png', '/uploads/../secret.png', 'javascript:alert(1)', '/uploads/0123456789abcdef.svg', '/uploads/SHORT.png'])(
    'refuses the avatar %s',
    (avatar) => {
      expect(profileUpdateSchema.safeParse({ nickname: 'Оля', avatar }).success).toBe(false);
    },
  );
  it('refuses unknown fields', () => {
    expect(profileUpdateSchema.safeParse({ nickname: 'Оля', avatar: null, email: 'x@y.z' }).success).toBe(false);
  });
});

describe('gameStats', () => {
  it('counts a win only for a finished first place with a rival and points', () => {
    const games = [game(), game({ status: 'aborted' }), game({ playerCount: 1 }), game({ score: 0 }), game({ rank: 2 })];
    expect(gameStats(games)).toEqual({ games: 5, wins: 1, accuracy: 75 });
  });
  it('has no accuracy without played questions', () => {
    expect(gameStats([])).toEqual({ games: 0, wins: 0, accuracy: null });
    expect(gameStats([game({ questionsPlayed: 0, correct: 0 })]).accuracy).toBeNull();
  });
});
