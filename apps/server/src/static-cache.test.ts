import { describe, expect, it } from 'vitest';
import { cacheControlFor, isMissingFile } from './static-cache';

describe('cacheControlFor', () => {
  it('keeps hashed assets for a year', () => {
    expect(cacheControlFor('/assets/index-DHpzUdG4.js')).toBe('public, max-age=31536000, immutable');
    expect(cacheControlFor('assets/index-DHpzUdG4.js.br')).toBe('public, max-age=31536000, immutable');
  });

  it('revalidates the page, the service worker and the manifest', () => {
    expect(cacheControlFor('index.html')).toBe('no-cache');
    expect(cacheControlFor('/sw.js')).toBe('no-cache');
    expect(cacheControlFor('/manifest.webmanifest')).toBe('no-cache');
  });

  it('keeps maps, models and icons for a day', () => {
    expect(cacheControlFor('/maps/world.svg')).toBe('public, max-age=86400');
    expect(cacheControlFor('maps/world.svg.gz')).toBe('public, max-age=86400');
    expect(cacheControlFor('/models/cup.glb')).toBe('public, max-age=86400');
    expect(cacheControlFor('/icon-192.png')).toBe('public, max-age=86400');
  });

  it('reads Windows separators too', () => {
    expect(cacheControlFor('assets\\index-abc.js')).toBe('public, max-age=31536000, immutable');
  });
});

describe('isMissingFile', () => {
  it('treats unknown files under /assets, /maps and /models as missing', () => {
    expect(isMissingFile('/assets/old-abc.js')).toBe(true);
    expect(isMissingFile('/maps/x.svg')).toBe(true);
    expect(isMissingFile('/models/x.glb')).toBe(true);
    expect(isMissingFile('/assets/old-abc.js?v=1')).toBe(true);
  });

  it('leaves page routes to the client', () => {
    expect(isMissingFile('/play/123456')).toBe(false);
    expect(isMissingFile('/profile/groups/abc')).toBe(false);
    expect(isMissingFile('/')).toBe(false);
  });
});
