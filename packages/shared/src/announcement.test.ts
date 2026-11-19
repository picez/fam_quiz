import { describe, expect, it } from 'vitest';
import { announcementInputSchema, isAnnouncementUrl } from './announcement';

describe('announcementInputSchema', () => {
  it('an announcement takes up to 200 characters, an optional site or web link and an optional time limit', () => {
    const text = 'Субота — сімейна гра о 19:00';
    expect(announcementInputSchema.parse({ text })).toEqual({ text, url: null, expiresAt: null });
    expect(announcementInputSchema.safeParse({ text: 'а'.repeat(200) }).success).toBe(true);
    expect(announcementInputSchema.safeParse({ text: 'а'.repeat(201) }).success).toBe(false);
    expect(announcementInputSchema.safeParse({ text: '   ' }).success).toBe(false);
    expect(announcementInputSchema.parse({ text, url: '' }).url).toBeNull();
    expect(announcementInputSchema.parse({ text, url: 'https://example.com/a?b=1' }).url).toBe('https://example.com/a?b=1');
    expect(announcementInputSchema.parse({ text, url: '/library' }).url).toBe('/library');
    for (const url of ['//evil.example', 'javascript:alert(1)', 'ftp://x', 'https://a b']) {
      expect(announcementInputSchema.safeParse({ text, url }).success).toBe(false);
      expect(isAnnouncementUrl(url)).toBe(false);
    }
    expect(announcementInputSchema.parse({ text, expiresAt: '2026-11-20T18:00:00+02:00' }).expiresAt).toBe('2026-11-20T18:00:00+02:00');
    expect(announcementInputSchema.safeParse({ text, expiresAt: '2026-11-20 18:00' }).success).toBe(false);
    expect(announcementInputSchema.safeParse({ text, extra: 1 }).success).toBe(false);
  });
});
