import { describe, expect, it } from 'vitest';
import {
  GROUP_CODE,
  GROUP_CODE_ALPHABET,
  GROUP_EMOJI,
  GROUP_ITEM_KINDS,
  GROUP_LIMITS,
  filterGroupItems,
  groupInputSchema,
  groupInviteSchema,
  groupItemInputSchema,
  groupOwnerSchema,
  groupReason,
  groupUsesSchema,
  type GroupItem,
} from './groups';

const group = { name: 'Родина Коваленків', emoji: '👪', description: '' };
const photo = `/uploads/${'a1'.repeat(16)}.jpg`;
const item = {
  kind: 'story',
  text: 'Як тато заблукав у лісі по гриби',
  about: [
    { kind: 'member', userId: 'u-petro' },
    { kind: 'name', name: 'бабуся Ніна' },
  ],
  answer: 'Тато',
  year: 1998,
  photo,
  surprise: true,
};

function reasonOf(result: { success: boolean; error?: unknown }): string | null {
  expect(result.success).toBe(false);
  return groupReason(result.error as Parameters<typeof groupReason>[0]);
}

function view(id: string, over: Partial<GroupItem>): GroupItem {
  return {
    id,
    kind: 'fact',
    text: '',
    about: [],
    answer: null,
    year: null,
    photo: null,
    surprise: false,
    author: null,
    mine: false,
    canDelete: false,
    uses: [],
    createdAt: '2026-11-14T10:00:00.000Z',
    updatedAt: '2026-11-14T10:00:00.000Z',
    ...over,
  };
}

describe('groups (12k)', () => {
  it('has 24 different badges and the agreed limits', () => {
    expect(GROUP_EMOJI).toHaveLength(24);
    expect(new Set(GROUP_EMOJI).size).toBe(24);
    expect(GROUP_EMOJI[0]).toBe('👪');
    expect(GROUP_LIMITS).toEqual({
      nameMax: 40,
      descriptionMax: 200,
      membersMax: 30,
      groupsPerUser: 10,
      itemsMax: 500,
      invitesMax: 30,
      textMax: 1000,
      answerMax: 80,
      aboutMax: 5,
      aboutNameMax: 40,
      yearMin: 1800,
      yearMax: 2100,
    });
    expect([...GROUP_ITEM_KINDS]).toEqual(['fact', 'story', 'quote', 'date']);
    expect(GROUP_CODE_ALPHABET).not.toMatch(/[01ilo]/);
    expect(GROUP_CODE.test('abcdefghjk')).toBe(true);
    expect(GROUP_CODE.test('abcdefghj1')).toBe(false);
    expect(GROUP_CODE.test('abcdefghj')).toBe(false);
  });

  it('cleans and checks a group', () => {
    expect(groupInputSchema.parse({ ...group, name: '  Родина   Коваленків ' }).name).toBe('Родина Коваленків');
    expect(groupInputSchema.safeParse({ ...group, name: 'а'.repeat(40) }).success).toBe(true);
    expect(reasonOf(groupInputSchema.safeParse({ ...group, name: 'а'.repeat(41) }))).toBe('group_name');
    expect(reasonOf(groupInputSchema.safeParse({ ...group, name: '   ' }))).toBe('group_name');
    expect(groupInputSchema.safeParse({ ...group, emoji: '🦄' }).success).toBe(false);
    expect(groupInputSchema.safeParse({ ...group, description: 'а'.repeat(200) }).success).toBe(true);
    expect(groupInputSchema.safeParse({ ...group, description: 'а'.repeat(201) }).success).toBe(false);
    expect(groupInputSchema.safeParse({ ...group, owner: 'x' }).success).toBe(false);
  });

  it('accepts a full record and keeps line breaks', () => {
    const parsed = groupItemInputSchema.parse(item);
    expect(parsed.about).toEqual(item.about);
    expect(parsed.answer).toBe('Тато');
    const multi = groupItemInputSchema.parse({ ...item, text: '  Перший рядок\r\nдругий рядок  ' });
    expect(multi.text).toBe('Перший рядок\nдругий рядок');
  });

  it('rejects bad records with clear reasons', () => {
    expect(groupItemInputSchema.safeParse({ ...item, text: 'а'.repeat(1000) }).success).toBe(true);
    expect(reasonOf(groupItemInputSchema.safeParse({ ...item, text: 'а'.repeat(1001) }))).toBe('item_text');
    expect(reasonOf(groupItemInputSchema.safeParse({ ...item, text: '  ' }))).toBe('item_text');
    const six = ['а', 'б', 'в', 'г', 'ґ', 'д'].map((name) => ({ kind: 'name', name }));
    expect(reasonOf(groupItemInputSchema.safeParse({ ...item, about: six }))).toBe('item_about');
    const twiceMember = [
      { kind: 'member', userId: 'u-petro' },
      { kind: 'member', userId: 'u-petro' },
    ];
    expect(reasonOf(groupItemInputSchema.safeParse({ ...item, about: twiceMember }))).toBe('item_about');
    const twiceName = [
      { kind: 'member', userId: 'u-petro' },
      { kind: 'name', name: 'Бабуся Ніна' },
      { kind: 'name', name: 'бабуся ніна' },
    ];
    expect(reasonOf(groupItemInputSchema.safeParse({ ...item, about: twiceName }))).toBe('item_about');
    expect(groupItemInputSchema.parse({ ...item, answer: '  ' }).answer).toBeNull();
    expect(groupItemInputSchema.safeParse({ ...item, answer: 'а'.repeat(81) }).success).toBe(false);
    expect(groupItemInputSchema.safeParse({ ...item, year: 1799 }).success).toBe(false);
    expect(groupItemInputSchema.safeParse({ ...item, year: 2101 }).success).toBe(false);
    expect(groupItemInputSchema.safeParse({ ...item, year: 1999.5 }).success).toBe(false);
    expect(groupItemInputSchema.safeParse({ ...item, photo: 'https://example.com/a.jpg' }).success).toBe(false);
    expect(groupItemInputSchema.safeParse({ ...item, kind: 'poem' }).success).toBe(false);
    expect(groupItemInputSchema.safeParse({ ...item, extra: true }).success).toBe(false);
    const onlyName = { ...item, about: [{ kind: 'name', name: 'бабуся Ніна' }] };
    expect(reasonOf(groupItemInputSchema.safeParse(onlyName))).toBe('surprise_needs_member');
    expect(groupItemInputSchema.safeParse({ ...onlyName, surprise: false }).success).toBe(true);
  });

  it('checks invites and ownership', () => {
    expect(groupInviteSchema.safeParse({ userIds: ['u1'] }).success).toBe(true);
    expect(groupInviteSchema.safeParse({ userIds: [] }).success).toBe(false);
    expect(groupInviteSchema.safeParse({ userIds: Array.from({ length: 31 }, (_, i) => `u${i}`) }).success).toBe(false);
    expect(groupOwnerSchema.safeParse({ userId: 'u1' }).success).toBe(true);
    expect(groupOwnerSchema.safeParse({ userId: '' }).success).toBe(false);
  });

  it('filters records without changing the order', () => {
    const items = [
      view('1', { kind: 'story', text: 'Як тато заблукав у лісі по гриби', about: [{ kind: 'name', name: 'тато' }] }),
      view('2', { kind: 'quote', text: '„Хто рано встає, тому кава гаряча“ — дідусь Іван' }),
      view('3', {
        kind: 'fact',
        text: 'Що Оля найбільше любить збирати восени?',
        answer: 'Гриби',
        about: [{ kind: 'member', userId: 'u-olia', name: 'Оля', former: false }],
      }),
    ];
    const none = { query: '', kind: null, about: null };
    expect(filterGroupItems(items, none).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(filterGroupItems(items, { ...none, query: 'гриб' }).map((i) => i.id)).toEqual(['1', '3']);
    expect(filterGroupItems(items, { ...none, query: 'ГРИБ' }).map((i) => i.id)).toEqual(['1', '3']);
    expect(filterGroupItems(items, { ...none, kind: 'quote' }).map((i) => i.id)).toEqual(['2']);
    expect(filterGroupItems(items, { ...none, about: 'u-olia' }).map((i) => i.id)).toEqual(['3']);
    expect(filterGroupItems(items, { ...none, about: 'тато' }).map((i) => i.id)).toEqual(['1']);
  });
});

describe('group record uses (12l)', () => {
  const quizId = '0b0e4f4e-9a59-4f43-8f43-3c1f8c1e2a01';
  const a = '1b0e4f4e-9a59-4f43-8f43-3c1f8c1e2a02';
  const b = '2b0e4f4e-9a59-4f43-8f43-3c1f8c1e2a03';
  const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

  it('checks the marking payload', () => {
    expect(groupUsesSchema.safeParse({ quizId, itemIds: [a, b] }).success).toBe(true);
    expect(groupUsesSchema.safeParse({ quizId, itemIds: [] }).success).toBe(false);
    expect(groupUsesSchema.safeParse({ quizId, itemIds: Array.from({ length: 201 }, (_, i) => uuid(i)) }).success).toBe(false);
    expect(groupUsesSchema.safeParse({ quizId, itemIds: Array.from({ length: 200 }, (_, i) => uuid(i)) }).success).toBe(true);
    expect(groupUsesSchema.safeParse({ quizId, itemIds: [a, a] }).success).toBe(false);
    expect(groupUsesSchema.safeParse({ quizId: 'q1', itemIds: [a] }).success).toBe(false);
    expect(groupUsesSchema.safeParse({ quizId, itemIds: ['i1'] }).success).toBe(false);
    expect(groupUsesSchema.safeParse({ quizId, itemIds: [a], extra: 1 }).success).toBe(false);
  });

  it('keeps only unused records when asked', () => {
    const items = [
      view('1', {
        text: 'Як тато заблукав у лісі по гриби',
        uses: [{ quizId, title: 'Вікторина: Родина Квіткових', mine: true, at: '2026-11-14T10:00:00.000Z' }],
      }),
      view('2', { text: 'Бабуся Ніна збирає гриби швидше за всіх' }),
      view('3', { text: 'Бабуся Ніна свистить двома пальцями' }),
    ];
    const none = { query: '', kind: null, about: null };
    expect(filterGroupItems(items, { ...none, unused: true }).map((i) => i.id)).toEqual(['2', '3']);
    expect(filterGroupItems(items, { ...none, unused: false }).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(filterGroupItems(items, none).map((i) => i.id)).toEqual(['1', '2', '3']);
    expect(filterGroupItems(items, { ...none, query: 'гриб', unused: true }).map((i) => i.id)).toEqual(['2']);
  });
});
