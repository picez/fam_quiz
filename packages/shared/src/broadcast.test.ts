import { describe, expect, expectTypeOf, it } from 'vitest';
import { broadcastInputSchema, broadcastPreviewSchema, type BroadcastRecipients } from './broadcast';
import type { BotPlanRecipients } from './bot-schedule';

const ok = { title: 'Нова вікторина', text: 'У бібліотеці з\'явилась «Карпатські озера».', url: null, recipients: { kind: 'all' } };
const groupId = '3f2b8c1e-5d4a-4e6f-9a7b-1c2d3e4f5a6b';
const parses = (v: unknown) => broadcastInputSchema.safeParse(v).success;

describe('broadcastInputSchema', () => {
  it('a broadcast: a title up to 60, a text up to 160, an optional https or site link, recipients', () => {
    expect(broadcastInputSchema.parse(ok)).toEqual(ok);
    expect(broadcastInputSchema.parse({ ...ok, url: 'https://example.com/a' }).url).toBe('https://example.com/a');
    expect(broadcastInputSchema.parse({ ...ok, url: '/library' }).url).toBe('/library');
    expect(broadcastInputSchema.parse({ ...ok, url: '' }).url).toBeNull();
    const { url: _url, ...noUrl } = ok;
    expect(broadcastInputSchema.parse(noUrl).url).toBeNull();
    expect(parses({ ...ok, recipients: { kind: 'group', groupId } })).toBe(true);
    expect(parses({ ...ok, recipients: { kind: 'people', userIds: ['a1', 'b2'] } })).toBe(true);
    expect(broadcastInputSchema.parse({ ...ok, title: '  Нова вікторина  ' }).title).toBe('Нова вікторина');
    expect(parses({ ...ok, title: 'а'.repeat(60), text: 'а'.repeat(160) })).toBe(true);

    expect(parses({ ...ok, title: 'а'.repeat(61) })).toBe(false);
    expect(parses({ ...ok, text: 'а'.repeat(161) })).toBe(false);
    expect(parses({ ...ok, title: '' })).toBe(false);
    expect(parses({ ...ok, title: '   ' })).toBe(false);
    expect(parses({ ...ok, url: 'http://example.com' })).toBe(false);
    expect(parses({ ...ok, url: 'javascript:alert(1)' })).toBe(false);
    expect(parses({ ...ok, url: '//evil.example' })).toBe(false);
    expect(parses({ ...ok, url: '/\\evil' })).toBe(false);
    expect(parses({ ...ok, recipients: { kind: 'none' } })).toBe(false);
    expect(parses({ ...ok, recipients: { kind: 'people', userIds: [] } })).toBe(false);
    expect(parses({ ...ok, recipients: { kind: 'people', userIds: Array.from({ length: 51 }, (_, i) => `u${i}`) } })).toBe(false);
    expect(parses({ ...ok, recipients: { kind: 'people', userIds: Array.from({ length: 50 }, (_, i) => `u${i}`) } })).toBe(true);
    expect(parses({ ...ok, recipients: { kind: 'people', userIds: ['a1', 'a1'] } })).toBe(false);
    expect(parses({ ...ok, extra: 1 })).toBe(false);
  });

  it('the preview takes recipients only', () => {
    expect(broadcastPreviewSchema.safeParse({ recipients: { kind: 'all' } }).success).toBe(true);
    expect(broadcastPreviewSchema.safeParse({ recipients: { kind: 'all' }, title: 'x' }).success).toBe(false);
  });

  it('broadcast recipients fit bot plan recipients', () => {
    const to: BotPlanRecipients = {} as BroadcastRecipients;
    expect(to).toBeDefined();
    expectTypeOf<BroadcastRecipients>().toMatchTypeOf<BotPlanRecipients>();
  });
});
