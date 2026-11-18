import { describe, expect, it } from 'vitest';
import { mediaKind, mediaType, mediaUrls, quizFileName, replaceMedia } from './media';

const a = '/uploads/aaaaaaaaaaaaaaaa.png';
const b = '/uploads/bbbbbbbbbbbbbbbb.jpg';
const c = '/uploads/cccccccccccccccc.mp3';
const d = '/uploads/dddddddddddddddd.webp';
const e = '/uploads/eeeeeeeeeeeeeeee.png';

const content = {
  rounds: [
    {
      questions: [
        {
          text: 'q',
          imageUrl: a,
          video: { source: 'youtube', id: 'dQw4w9WgXcQ' },
          options: [{ text: 'x', imageUrl: b }, { text: 'y' }],
          audio: { source: 'file', url: c },
        },
        { jigsaw: { photo: d }, spotdiff: { original: e, changed: a } },
      ],
    },
  ],
};

describe('mediaUrls', () => {
  it('finds every upload in any field', () => {
    expect(mediaUrls(content)).toEqual([a, b, c, d, e]);
  });

  it('does not take short names or foreign hosts for uploads', () => {
    expect(mediaUrls(['/uploads/x.png', `https://a${a}`, `${a}?v=1`, '/uploads/ABCDEFGHIJKLMNOP.png'])).toEqual([]);
  });
});

describe('replaceMedia', () => {
  it('swaps whole strings and keeps the original', () => {
    const before = structuredClone(content);
    const text = { text: `see ${a} here`, imageUrl: a, list: [a, b] };
    const next = replaceMedia(text, new Map([[a, '/uploads/zzzzzzzzzzzzzzzz.png']]));
    expect(next).toEqual({ text: `see ${a} here`, imageUrl: '/uploads/zzzzzzzzzzzzzzzz.png', list: ['/uploads/zzzzzzzzzzzzzzzz.png', b] });
    expect(replaceMedia(content, new Map([[a, e]]))).not.toBe(content);
    expect(content).toEqual(before);
    expect(text.imageUrl).toBe(a);
  });
});

describe('mediaType', () => {
  it('maps by extension', () => {
    expect(mediaType('x.jpg')).toBe('image/jpeg');
    expect(mediaType('x.png')).toBe('image/png');
    expect(mediaType('x.webp')).toBe('image/webp');
    expect(mediaType('x.mp3')).toBe('audio/mpeg');
    expect(mediaType('x.ogg')).toBe('audio/ogg');
    expect(mediaType('x.m4a')).toBe('audio/mp4');
    expect(mediaKind('a.ogg')).toBe('audio');
    expect(mediaKind('a.png')).toBe('image');
  });
});

describe('quizFileName', () => {
  it('builds a safe file name', () => {
    expect(quizFileName('Зимова вікторина!', 'quiz')).toBe('Зимова-вікторина.quiz');
    expect(quizFileName(' ?! ', 'xlsx')).toBe('quiz.xlsx');
  });
});
