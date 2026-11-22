import { describe, expect, it } from 'vitest';
import {
  QUIZ_FOLDER_LIMITS,
  QUIZ_SORTS,
  compareQuizTitles,
  parseQuizSort,
  quizFolderInputSchema,
  quizFolderMoveSchema,
  quizFolderNameSchema,
  quizFolderOrderSchema,
  sortQuizzes,
} from './quiz-folders';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('quizFolderNameSchema (73)', () => {
  it('trims and collapses spaces', () => {
    expect(quizFolderNameSchema.parse('  Для   Асі ')).toBe('Для Асі');
    expect(quizFolderNameSchema.parse('a'.repeat(40))).toBe('a'.repeat(40));
  });
  it('rejects empty, too long and control characters', () => {
    expect(quizFolderNameSchema.safeParse('').success).toBe(false);
    expect(quizFolderNameSchema.safeParse('   ').success).toBe(false);
    expect(quizFolderNameSchema.safeParse('a'.repeat(41)).success).toBe(false);
    expect(quizFolderNameSchema.safeParse('Кі\nно').success).toBe(false);
    expect(quizFolderNameSchema.safeParse('Кі\u0000но').success).toBe(false);
    expect(quizFolderNameSchema.safeParse(5).success).toBe(false);
  });
});

describe('quiz folder payloads (73)', () => {
  it('input is strict', () => {
    expect(quizFolderInputSchema.parse({ name: ' Кіно ' })).toEqual({ name: 'Кіно' });
    expect(quizFolderInputSchema.safeParse({ name: 'Кіно', extra: 1 }).success).toBe(false);
    expect(quizFolderInputSchema.safeParse({}).success).toBe(false);
  });
  it('order takes unique uuids, up to the limit', () => {
    expect(quizFolderOrderSchema.parse({ ids: [uuid(1), uuid(2)] })).toEqual({ ids: [uuid(1), uuid(2)] });
    expect(quizFolderOrderSchema.parse({ ids: [] })).toEqual({ ids: [] });
    expect(quizFolderOrderSchema.safeParse({ ids: [uuid(1), uuid(1)] }).success).toBe(false);
    expect(quizFolderOrderSchema.safeParse({ ids: Array.from({ length: 31 }, (_, i) => uuid(i)) }).success).toBe(false);
    expect(quizFolderOrderSchema.safeParse({ ids: ['x'] }).success).toBe(false);
    expect(quizFolderOrderSchema.safeParse({ ids: [], extra: 1 }).success).toBe(false);
  });
  it('move takes a uuid or null', () => {
    expect(quizFolderMoveSchema.parse({ folderId: null })).toEqual({ folderId: null });
    expect(quizFolderMoveSchema.parse({ folderId: uuid(3) })).toEqual({ folderId: uuid(3) });
    expect(quizFolderMoveSchema.safeParse({ folderId: '' }).success).toBe(false);
    expect(quizFolderMoveSchema.safeParse({}).success).toBe(false);
    expect(quizFolderMoveSchema.safeParse({ folderId: null, extra: 1 }).success).toBe(false);
  });
});

describe('quiz sorts (73)', () => {
  it('constants', () => {
    expect(QUIZ_SORTS).toEqual(['new', 'old', 'name', 'changed']);
    expect(QUIZ_FOLDER_LIMITS).toEqual({ perOwner: 30, nameMax: 40 });
  });
  it('parseQuizSort falls back to changed', () => {
    expect(parseQuizSort('x')).toBe('changed');
    expect(parseQuizSort(null)).toBe('changed');
    expect(parseQuizSort(undefined)).toBe('changed');
    expect(parseQuizSort('old')).toBe('old');
    expect(parseQuizSort('name')).toBe('name');
  });

  const a = { id: 'a', title: 'Дім', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-03-01T00:00:00.000Z' };
  const b = { id: 'b', title: 'Гора', createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-15T00:00:00.000Z' };
  const c = { id: 'c', title: 'Ґанок', createdAt: '2026-03-01T00:00:00.000Z', updatedAt: '2026-03-02T00:00:00.000Z' };
  const list = [a, b, c];
  const ids = (xs: readonly { id: string }[]) => xs.map((x) => x.id);

  it('new, old and changed', () => {
    expect(ids(sortQuizzes(list, 'new'))).toEqual(['c', 'b', 'a']);
    expect(ids(sortQuizzes(list, 'old'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortQuizzes(list, 'changed'))).toEqual(['c', 'a', 'b']);
  });
  it('name follows the Ukrainian alphabet and numbers', () => {
    expect(ids(sortQuizzes(list, 'name'))).toEqual(['b', 'c', 'a']);
    const more = [
      { ...a, id: '1', title: 'Їжа' },
      { ...a, id: '2', title: 'Іспит' },
      { ...a, id: '3', title: 'Квіз 10' },
      { ...a, id: '4', title: 'Квіз 2' },
      { ...a, id: '5', title: 'яблуко' },
      { ...a, id: '6', title: 'Єнот' },
    ];
    expect(sortQuizzes(more, 'name').map((x) => x.title)).toEqual(['Єнот', 'Іспит', 'Їжа', 'Квіз 2', 'Квіз 10', 'яблуко']);
  });
  it('equal keys go by id', () => {
    const same = [
      { ...a, id: 'z', title: 'Кіно' },
      { ...a, id: 'm', title: 'кіно' },
      { ...a, id: 'q', title: 'Кіно' },
    ];
    for (const sort of QUIZ_SORTS) expect(ids(sortQuizzes(same, sort))).toEqual(['m', 'q', 'z']);
    expect(compareQuizTitles({ id: 'm', title: 'кіно' }, { id: 'z', title: 'Кіно' })).toBeLessThan(0);
  });
  it('does not change the input', () => {
    const copy = [...list];
    sortQuizzes(list, 'name');
    sortQuizzes(list, 'new');
    expect(list).toEqual(copy);
  });
});
