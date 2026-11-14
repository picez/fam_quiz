// Типів node у вебі немає, тож fs описано тут вручну.
// @ts-expect-error node:fs без @types/node
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = ['apps/web/src', 'src'].find((path) => existsSync(path) as boolean)!;

/** Усі теги <img …> файла (до першого «/>» чи «>», що закриває тег). */
function imgTags(file: string): string[] {
  const text = readFileSync(`${src}/${file}`, 'utf8') as string;
  return [...text.matchAll(/<img\s[\s\S]*?\/>/g)].map((match) => match[0]);
}

describe('image attributes (32)', () => {
  it('the question picture decodes off the main thread with high priority and is never lazy', () => {
    for (const file of ['screens/QuestionImage.tsx', 'screens/RevealImage.tsx']) {
      const tags = imgTags(file);
      expect(tags.length, file).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, file).toContain('decoding="async"');
        expect(tag, file).toContain('fetchPriority="high"');
        expect(tag, file).not.toContain('loading="lazy"');
      }
    }
  });

  it('pictures in lists load lazily and decode asynchronously', () => {
    for (const file of ['profile/Avatar.tsx', 'profile/Showcase.tsx', 'editor/OptionImage.tsx', 'groups/ItemForm.tsx', 'screens/MyPrize.tsx', 'prizes/tools/PhotoTool.tsx']) {
      const tags = imgTags(file);
      expect(tags.length, file).toBeGreaterThan(0);
      for (const tag of tags) {
        expect(tag, file).toContain('loading="lazy"');
        expect(tag, file).toContain('decoding="async"');
      }
    }
  });

  it('answer options decode asynchronously but are not lazy', () => {
    for (const tag of imgTags('screens/ChoiceFace.tsx')) {
      expect(tag).toContain('decoding="async"');
      expect(tag).not.toContain('loading="lazy"');
    }
  });
});
