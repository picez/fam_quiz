import { describe, expect, it } from 'vitest';
import { parseYouTubeLink, videoLink } from './youtube';

describe('parseYouTubeLink', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ&list=PL123&index=2', 0],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=42', 42],
    ['youtu.be/dQw4w9WgXcQ', 0],
    ['https://youtu.be/dQw4w9WgXcQ?t=1m30s', 90],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc&t=90s', 90],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 0],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ?start=75', 75],
    ['https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 0],
    ['http://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1h2m3s', 3723],
    ['  https://youtu.be/dQw4w9WgXcQ?t=2m  ', 120],
  ])('reads %s', (link, start) => {
    expect(parseYouTubeLink(link)).toEqual({ id: 'dQw4w9WgXcQ', start });
  });
  it.each([
    '',
    'не посилання',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=abc',
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=99999',
    'https://www.youtube.com/@NASA',
    'https://www.youtube.com/playlist?list=PL123',
    'javascript:alert(1)',
  ])('refuses %s', (link) => {
    expect(parseYouTubeLink(link)).toBeNull();
  });
});

it('videoLink round-trips through parseYouTubeLink', () => {
  const zero = { id: 'dQw4w9WgXcQ', start: 0 };
  const ninety = { id: 'dQw4w9WgXcQ', start: 90 };
  expect(videoLink(zero)).toBe('https://youtu.be/dQw4w9WgXcQ');
  expect(videoLink(ninety)).toBe('https://youtu.be/dQw4w9WgXcQ?t=90');
  expect(parseYouTubeLink(videoLink(zero))).toEqual(zero);
  expect(parseYouTubeLink(videoLink(ninety))).toEqual(ninety);
});
