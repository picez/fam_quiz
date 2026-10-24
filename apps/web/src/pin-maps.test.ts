import { describe, expect, it } from 'vitest';
import { pinBaseUrl } from './pin-maps';

describe('pinBaseUrl', () => {
  it('points at the built-in map, the uploaded picture or nothing', () => {
    expect(pinBaseUrl({ map: 'ukraine' }, null)).toBe('/maps/ukraine.svg');
    expect(pinBaseUrl({ map: null }, '/uploads/x.png')).toBe('/uploads/x.png');
    expect(pinBaseUrl({ map: null }, null)).toBeNull();
  });
});
