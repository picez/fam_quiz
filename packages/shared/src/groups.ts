import { z } from 'zod';
import type { ProfileCard } from './profile';
import { IMAGE_URL, LIMITS, answerKey } from './quiz';
import { UNSTORABLE, isStorable } from './text';

/** Межі груп (12k, розділ 15 специфікації). */
export const GROUP_LIMITS = {
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
} as const;

/** 24 значки групи; перший — типовий. */
export const GROUP_EMOJI = [
  '👪', '🏡', '🌻', '🎄', '🧺', '🍲', '🎂', '🐈', '🐕', '⚽', '🎸', '📚',
  '🏕️', '🚲', '🎲', '🧩', '☕', '🍎', '🌊', '⛰️', '🎓', '💼', '🎭', '⭐',
] as const;
export type GroupEmoji = (typeof GROUP_EMOJI)[number];

export const GROUP_ITEM_KINDS = ['fact', 'story', 'quote', 'date'] as const;
export type GroupItemKind = (typeof GROUP_ITEM_KINDS)[number];
export type GroupRole = 'owner' | 'member';

/** Код посилання: 10 символів без схожих (0/o, 1/l/i). */
export const GROUP_CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
export const GROUP_CODE = /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;

/** Краї обрізано, пробіли (і перенесення) стиснуто в один пробіл. */
const squeeze = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** Рядок: краї обрізано, пробіли стиснуто (крім text запису, де перенесення лишаються). */
export const groupInputSchema = z
  .object({
    name: z
      .string()
      .max(200, 'group_name')
      .transform(squeeze)
      .pipe(
        z
          .string()
          .min(1, 'group_name')
          .max(GROUP_LIMITS.nameMax, 'group_name')
          .refine(isStorable, UNSTORABLE),
      ),
    emoji: z.enum(GROUP_EMOJI),
    description: z
      .string()
      .max(1000)
      .transform(squeeze)
      .pipe(z.string().max(GROUP_LIMITS.descriptionMax).refine(isStorable, UNSTORABLE)),
  })
  .strict();
export type GroupInput = z.infer<typeof groupInputSchema>;

export const groupAboutSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('member'), userId: z.string().min(1).max(64) }).strict(),
  z
    .object({
      kind: z.literal('name'),
      name: z
        .string()
        .max(200, 'item_about')
        .transform(squeeze)
        .pipe(
          z
            .string()
            .min(1, 'item_about')
            .max(GROUP_LIMITS.aboutNameMax, 'item_about')
            .refine(isStorable, UNSTORABLE),
        ),
    })
    .strict(),
]);
export type GroupAboutInput = z.infer<typeof groupAboutSchema>;
/** Як лежить у group_item.about: учасник ще й з ніком на мить запису. */
export type GroupAboutStored = { kind: 'member'; userId: string; name: string } | { kind: 'name'; name: string };

/** Без повторів: той самий учасник чи те саме ім'я (за answerKey). */
function aboutUnique(about: readonly GroupAboutInput[]): boolean {
  const seen = new Set<string>();
  for (const entry of about) {
    const key = entry.kind === 'member' ? `m:${entry.userId}` : `n:${answerKey(entry.name)}`;
    if (seen.has(key)) return false;
    seen.add(key);
  }
  return true;
}

export const groupItemInputSchema = z
  .object({
    kind: z.enum(GROUP_ITEM_KINDS),
    text: z
      .string()
      .max(4000, 'item_text')
      .transform((value) => value.replace(/\r\n?/g, '\n').trim())
      .pipe(
        z
          .string()
          .min(1, 'item_text')
          .max(GROUP_LIMITS.textMax, 'item_text')
          .refine(isStorable, UNSTORABLE),
      ),
    about: z
      .array(groupAboutSchema)
      .max(GROUP_LIMITS.aboutMax, 'item_about')
      .refine(aboutUnique, 'item_about'),
    answer: z
      .string()
      .max(200)
      .nullable()
      .transform((value) => (value === null ? null : squeeze(value) || null))
      .pipe(z.string().max(GROUP_LIMITS.answerMax).refine(isStorable, UNSTORABLE).nullable()),
    year: z.number().int().min(GROUP_LIMITS.yearMin).max(GROUP_LIMITS.yearMax).nullable(),
    photo: z.string().regex(IMAGE_URL).nullable(),
    surprise: z.boolean(),
  })
  .strict()
  .superRefine((item, ctx) => {
    if (item.surprise && !item.about.some((entry) => entry.kind === 'member')) {
      ctx.addIssue({ code: 'custom', path: ['about'], message: 'surprise_needs_member' });
    }
  });
export type GroupItemInput = z.infer<typeof groupItemInputSchema>;

export const groupInviteSchema = z
  .object({ userIds: z.array(z.string().min(1).max(64)).min(1).max(GROUP_LIMITS.invitesMax) })
  .strict();
export const groupOwnerSchema = z.object({ userId: z.string().min(1).max(64) }).strict();

/** Причина 400 з першого issue, якщо вона з цього списку (інакше без reason). */
export const GROUP_REASONS = ['group_name', 'item_text', 'item_about', 'surprise_needs_member', 'about_not_member'] as const;
export type GroupReason = (typeof GROUP_REASONS)[number];

export function groupReason(error: z.ZodError): GroupReason | null {
  const message = error.issues[0]?.message;
  return (GROUP_REASONS as readonly string[]).includes(message ?? '') ? (message as GroupReason) : null;
}

export interface GroupCard {
  id: string;
  name: string;
  emoji: GroupEmoji;
  description: string;
  role: GroupRole;
  people: number;
  /** видимі мені */
  items: number;
  joinedAt: string;
}
export interface GroupMember extends ProfileCard {
  role: GroupRole;
  joinedAt: string;
  you: boolean;
}
export interface GroupPendingInvite {
  user: ProfileCard;
  at: string;
}
export interface GroupDetail extends GroupCard {
  /** власник першим, далі за joinedAt */
  members: GroupMember[];
  /** Лише власнику. */
  inviteCode?: string;
  /** Лише власнику. */
  pending?: GroupPendingInvite[];
}
export interface GroupInviteCard {
  group: { id: string; name: string; emoji: GroupEmoji; people: number };
  from: ProfileCard | null;
  at: string;
}
export interface GroupsPage {
  groups: GroupCard[];
  invites: GroupInviteCard[];
}
export interface GroupJoinPreview {
  id: string;
  name: string;
  emoji: GroupEmoji;
  description: string;
  people: number;
  owner: ProfileCard | null;
  member: boolean;
}
export type GroupAboutView =
  | { kind: 'member'; userId: string; name: string; former: boolean }
  | { kind: 'name'; name: string };
export interface GroupItem {
  id: string;
  kind: GroupItemKind;
  text: string;
  about: GroupAboutView[];
  answer: string | null;
  year: number | null;
  photo: string | null;
  surprise: boolean;
  /** null — уже не в групі чи акаунта немає. */
  author: ProfileCard | null;
  mine: boolean;
  canDelete: boolean;
  /** Вікторини, у яких запис використано (12l), від найстарішої. */
  uses: GroupItemUse[];
  createdAt: string;
  updatedAt: string;
}

/** Позначка «використано у «…»» (12l): title — поточна назва вікторини. */
export interface GroupItemUse {
  quizId: string;
  title: string;
  /** вікторина глядача */
  mine: boolean;
  at: string;
}

/** Позначити записи групи використаними у своїй вікторині (12l). */
export const groupUsesSchema = z
  .object({
    quizId: z.string().uuid(),
    itemIds: z
      .array(z.string().uuid())
      .min(1)
      .max(LIMITS.maxQuizQuestions)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
export type GroupUsesInput = z.infer<typeof groupUsesSchema>;

export interface GroupItemFilter {
  query: string;
  kind: GroupItemKind | null;
  /** userId учасника чи answerKey(імені) */
  about: string | null;
  /** true — лише записи без позначок «використано» (12l). */
  unused?: boolean;
}

/** Пошук (answerKey у тексті й відповіді, підрядок) і фільтри; порядок не змінює. */
export function filterGroupItems(items: readonly GroupItem[], filter: GroupItemFilter): GroupItem[] {
  const query = answerKey(filter.query);
  return items.filter((item) => {
    if (filter.kind !== null && item.kind !== filter.kind) return false;
    if (filter.unused === true && item.uses.length > 0) return false;
    if (
      filter.about !== null &&
      !item.about.some((entry) =>
        entry.kind === 'member' ? entry.userId === filter.about : answerKey(entry.name) === filter.about,
      )
    ) {
      return false;
    }
    if (query === '') return true;
    return answerKey(item.text).includes(query) || (item.answer !== null && answerKey(item.answer).includes(query));
  });
}
