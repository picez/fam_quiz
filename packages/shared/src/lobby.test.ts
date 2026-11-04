import { describe, expect, it } from 'vitest';
import { claimSchema, joinSchema, lobbySettingsSchema } from './index';

describe('lobbySettingsSchema', () => {
  it('accepts open and password settings, trimming the password', () => {
    expect(lobbySettingsSchema.parse({ visibility: 'all', password: null })).toEqual({ visibility: 'all', password: null });
    expect(lobbySettingsSchema.parse({ visibility: 'hidden', password: '  сова42 ' })).toEqual({ visibility: 'hidden', password: 'сова42' });
  });

  it('rejects bad passwords, visibility and extra fields', () => {
    expect(lobbySettingsSchema.safeParse({ visibility: 'all', password: 'abc' }).success).toBe(false);
    expect(lobbySettingsSchema.safeParse({ visibility: 'all', password: 'a'.repeat(33) }).success).toBe(false);
    expect(lobbySettingsSchema.safeParse({ visibility: 'all', password: '    ' }).success).toBe(false);
    expect(lobbySettingsSchema.safeParse({ visibility: 'public', password: null }).success).toBe(false);
    expect(lobbySettingsSchema.safeParse({ visibility: 'all', password: null, extra: 1 }).success).toBe(false);
  });

  it('counts code points, not UTF-16 units', () => {
    expect(lobbySettingsSchema.safeParse({ visibility: 'all', password: '😀'.repeat(32) }).success).toBe(true);
    expect(lobbySettingsSchema.safeParse({ visibility: 'all', password: '😀'.repeat(33) }).success).toBe(false);
  });
});

describe('entry bodies', () => {
  it('joinSchema keeps password and device', () => {
    expect(joinSchema.parse({ nickname: 'Оля', password: 'x', device: 'd' })).toEqual({ nickname: 'Оля', password: 'x', device: 'd' });
  });

  it('claimSchema accepts password but stays strict', () => {
    const slotId = '11111111-1111-4111-8111-111111111111';
    expect(claimSchema.safeParse({ slotId, password: 'x' }).success).toBe(true);
    expect(claimSchema.safeParse({ slotId, foo: 1 }).success).toBe(false);
  });
});
