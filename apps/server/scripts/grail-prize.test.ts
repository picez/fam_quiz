import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prizeContentSchema, trophyDecorSchema, type PrizeContent } from '@quiz/shared';
import { describe, expect, it } from 'vitest';
import { GRAIL_PLAQUE, GRAIL_RIM, grailContent, grailDecor } from './grail-prize';
import { localPhotos } from './site-uploads';

const fakeUrls = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => `/uploads/${i.toString(16).padStart(2, '0')}${'ab'.repeat(15)}.jpg`);

/** Ясин нинішній зміст (до 25a): грааль без decor, напис у engraving. */
const CURRENT: PrizeContent = {
  name: 'Сімейний Ґрааль',
  trophy: { kind: 'grail', material: 'gold' },
  engraving: "Сімейний Ґрааль сім'ї комендантів — для найрозумнішого Індіани Джонса",
  real: null,
  title: null,
  diploma: false,
};

describe('grail prize', () => {
  it('the family decor', () => {
    const urls = fakeUrls(13);
    expect(urls.every((u) => /^\/uploads\/[0-9a-f]{32}\.jpg$/.test(u))).toBe(true);
    const decor = grailDecor(urls);
    expect(trophyDecorSchema.parse(decor)).toEqual(decor);
    expect(decor).toEqual({
      photos: urls.map((url) => ({ url, crop: { x: 0.5, y: 0.5, scale: 1 } })),
      photoPlace: 'ring',
      frame: 'none',
      photoStyle: 'normal',
      inscriptions: [
        { place: 'rim', text: "Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса", font: null, look: 'engraved', color: '#3a2a0e' },
        { place: 'plaque', text: 'Хочеш я тобі Ді…\nҐрааль покажу?', font: null, look: 'engraved', color: '#3a2a0e' },
      ],
      effect: { kind: 'none' },
      appearance: 'spin',
      stickers: [],
    });
    expect(GRAIL_RIM).toBe("Сімейний Ґрааль сім'ї комендантів · для найрозумнішого Індіани Джонса");
    expect(GRAIL_PLAQUE).toBe('Хочеш я тобі Ді…\nҐрааль покажу?');
  });

  it('content', () => {
    const content = grailContent(CURRENT, fakeUrls(13));
    expect(prizeContentSchema.parse(content)).toEqual(content);
    expect(content.engraving).toBeNull();
    expect(content.name).toBe('Сімейний Ґрааль');
    expect(content.diploma).toBe(false);
    expect(content.real).toBeNull();
    expect(content.title).toBeNull();
    expect(content.trophy?.kind).toBe('grail');
    expect(content.trophy?.material).toBe('gold');
    expect(content.trophy?.decor?.photos).toHaveLength(13);
  });

  it('limits', () => {
    expect(() => grailDecor([])).toThrow();
    expect(() => grailDecor(fakeUrls(17))).toThrow();
    expect(() => grailDecor(fakeUrls(16))).not.toThrow();
  });

  it('localPhotos', () => {
    const dir = mkdtempSync(join(tmpdir(), 'grail-photos-'));
    try {
      for (const name of ['b.jpg', 'A.png', 'notes.txt', 'c.webp']) writeFileSync(join(dir, name), 'x');
      expect(localPhotos(dir)).toEqual(['A.png', 'b.jpg', 'c.webp'].map((name) => join(dir, name)));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
