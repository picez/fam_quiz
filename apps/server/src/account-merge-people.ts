import { MERGE_LOGINS, SHOWCASE_PIN_KINDS, SHOWCASE_PIN_LIMITS, type MergeLogin } from '@quiz/shared';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { MergeRule, Tx } from './account-merge-rules';
import { EDITOR_DAY_MAX_SEC, EDITOR_DAY_MAX_SESSIONS } from './activity';
import {
  account,
  achievementBlock,
  calendarEvent,
  calendarRequest,
  challenge,
  challengeAttempt,
  follow,
  groupInvite,
  groupItem,
  groupMember,
  inboxItem,
  prize,
  prizeAward,
  session,
  showcasePin,
  userAchievement,
  userBan,
  userReport,
  userTitle,
} from './db/schema';

/**
 * 66: правила «люди й вміст» (9–22 плану) — дружба, групи, запрошення, записи груп, титули, заборони, призи, вітрина,
 * календар, виклики, прості перенесення, скарги, бани, сесії й способи входу. Конфлікт — спершу delete рядків S за exists (…),
 * потім update; без on conflict на update. P — головний (лишається), S — другорядний (зникне).
 */

/** 9. Обидва напрямки; конфлікт PK — рядок S геть; їхня дружба між собою (стала б P → P) — геть. */
const followRule: MergeRule = {
  keys: ['follow.follower_id', 'follow.followee_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    await tx.delete(follow).where(
      or(and(eq(follow.followerId, S), inArray(follow.followeeId, [P, S])), and(eq(follow.followerId, P), eq(follow.followeeId, S))),
    );
    const sameOut = await tx
      .delete(follow)
      .where(and(eq(follow.followerId, S), sql`exists (select 1 from "follow" f where f.follower_id = ${P} and f.followee_id = ${follow.followeeId})`))
      .returning();
    const sameIn = await tx
      .delete(follow)
      .where(and(eq(follow.followeeId, S), sql`exists (select 1 from "follow" f where f.follower_id = ${follow.followerId} and f.followee_id = ${P})`))
      .returning();
    const out = await tx.update(follow).set({ followerId: P }).where(eq(follow.followerId, S)).returning();
    const into = await tx.update(follow).set({ followeeId: P }).where(eq(follow.followeeId, S)).returning();
    summary.friends += out.length + into.length;
    summary.sameFriends += sameOut.length + sameIn.length;
  },
};

/** 10. Не в тій самій групі — перенести; та сама — один рядок P: раніший joined_at, owner, якщо власником був будь-хто з двох. */
const groupMemberRule: MergeRule = {
  keys: ['group_member.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const mine = await tx.select().from(groupMember).where(eq(groupMember.userId, P));
    const byGroup = new Map(mine.map((row) => [row.groupId, row]));
    const theirs = await tx.select().from(groupMember).where(eq(groupMember.userId, S));
    for (const row of theirs) {
      const kept = byGroup.get(row.groupId);
      if (kept === undefined) continue;
      // Спершу рядок S геть: частковий унікальний індекс не допускає двох власників навіть на мить.
      await tx.delete(groupMember).where(and(eq(groupMember.groupId, row.groupId), eq(groupMember.userId, S)));
      await tx
        .update(groupMember)
        .set({ joinedAt: row.joinedAt < kept.joinedAt ? row.joinedAt : kept.joinedAt, role: row.role === 'owner' ? 'owner' : kept.role })
        .where(and(eq(groupMember.groupId, row.groupId), eq(groupMember.userId, P)));
      summary.sameGroups += 1;
    }
    const moved = await tx.update(groupMember).set({ userId: P }).where(eq(groupMember.userId, S)).returning();
    summary.groups += moved.length;
  },
};

/** 11. Запрошення S — геть, якщо P уже член групи чи вже запрошений; хто запросив — P; після — жодних запрошень P до його груп. */
const groupInviteRule: MergeRule = {
  keys: ['group_invite.user_id', 'group_invite.invited_by'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.delete(groupInvite).where(
      and(
        eq(groupInvite.userId, S),
        sql`(exists (select 1 from "group_member" m where m.group_id = ${groupInvite.groupId} and m.user_id = ${P})
          or exists (select 1 from "group_invite" i where i.group_id = ${groupInvite.groupId} and i.user_id = ${P}))`,
      ),
    );
    await tx.update(groupInvite).set({ userId: P }).where(eq(groupInvite.userId, S));
    await tx.update(groupInvite).set({ invitedBy: P }).where(eq(groupInvite.invitedBy, S));
    // Членство вже злите (правило 10 раніше): запрошення P до груп, де P тепер член (через S), — геть, хоч від кого.
    await tx
      .delete(groupInvite)
      .where(and(eq(groupInvite.userId, P), sql`exists (select 1 from "group_member" m where m.group_id = ${groupInvite.groupId} and m.user_id = ${P})`));
  },
};

/** 12. Автор записів групи (JSON about — MERGE_JSON_RULES). */
const groupItemRule: MergeRule = {
  keys: ['group_item.author_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.update(groupItem).set({ authorId: P }).where(eq(groupItem.authorId, S));
  },
};

/** 13. Один титул на акаунт: лишається той, що діє довше. */
const titleRule: MergeRule = {
  keys: ['user_title.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const [theirs] = await tx.select().from(userTitle).where(eq(userTitle.userId, S));
    if (theirs === undefined) return;
    const [mine] = await tx.select().from(userTitle).where(eq(userTitle.userId, P));
    if (mine !== undefined && mine.expiresAt >= theirs.expiresAt) {
      await tx.delete(userTitle).where(eq(userTitle.userId, S));
      return;
    }
    await tx.delete(userTitle).where(eq(userTitle.userId, P));
    await tx.update(userTitle).set({ userId: P }).where(eq(userTitle.userId, S));
  },
};

/** 14. Заборона S — геть, якщо P (після правила досягнень) володіє цим досягненням чи вже має таку заборону. */
const blockRule: MergeRule = {
  keys: ['achievement_block.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.delete(achievementBlock).where(
      and(
        eq(achievementBlock.userId, S),
        sql`(exists (select 1 from "user_achievement" a where a.user_id = ${P} and a.achievement_id = ${achievementBlock.achievementId})
          or exists (select 1 from "achievement_block" b where b.user_id = ${P} and b.achievement_id = ${achievementBlock.achievementId}))`,
      ),
    );
    await tx.update(achievementBlock).set({ userId: P }).where(eq(achievementBlock.userId, S));
  },
};

/** 15. Склад призів і нагороди; та сама нагорода (гра, місце) в обох — лишається P, рядок S і його закріплення — геть. */
const prizeRule: MergeRule = {
  keys: ['prize.owner_id', 'prize_award.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const prizes = await tx.update(prize).set({ ownerId: P }).where(eq(prize.ownerId, S)).returning({ id: prize.id });
    const dropped = await tx
      .delete(prizeAward)
      .where(
        and(
          eq(prizeAward.userId, S),
          sql`exists (select 1 from "prize_award" a where a.user_id = ${P} and a.game_id = ${prizeAward.gameId} and a.place = ${prizeAward.place})`,
        ),
      )
      .returning({ id: prizeAward.id });
    if (dropped.length > 0) {
      await tx.delete(showcasePin).where(
        and(
          eq(showcasePin.userId, S),
          eq(showcasePin.kind, 'prize'),
          inArray(
            showcasePin.itemId,
            dropped.map((row) => row.id),
          ),
        ),
      );
    }
    const awards = await tx.update(prizeAward).set({ userId: P }).where(eq(prizeAward.userId, S)).returning({ id: prizeAward.id });
    summary.prizes += prizes.length + awards.length;
  },
};

/**
 * 16. Закріплення P — на своїх місцях; закріплення S (без уже закріпленого в P і без предметів, яких у P немає) — у вільні slot
 * за pinned_at до SHOWCASE_PIN_LIMITS[kind]; решта — геть.
 */
const showcaseRule: MergeRule = {
  keys: ['showcase_pin.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const theirs = await tx.select().from(showcasePin).where(eq(showcasePin.userId, S));
    if (theirs.length === 0) return;
    await tx.delete(showcasePin).where(eq(showcasePin.userId, S));
    const mine = await tx.select().from(showcasePin).where(eq(showcasePin.userId, P));
    const owned = {
      prize: new Set((await tx.select({ id: prizeAward.id }).from(prizeAward).where(eq(prizeAward.userId, P))).map((row) => row.id)),
      achievement: new Set<string>((await tx.select({ id: userAchievement.achievementId }).from(userAchievement).where(eq(userAchievement.userId, P))).map((row) => row.id)),
    };
    const added: (typeof showcasePin.$inferInsert)[] = [];
    for (const kind of SHOWCASE_PIN_KINDS) {
      const kept = mine.filter((row) => row.kind === kind);
      const pinned = new Set(kept.map((row) => row.itemId));
      const used = new Set(kept.map((row) => row.slot));
      const free = Array.from({ length: SHOWCASE_PIN_LIMITS[kind] }, (_, slot) => slot).filter((slot) => !used.has(slot));
      const candidates = theirs
        .filter((row) => row.kind === kind && !pinned.has(row.itemId) && owned[kind].has(row.itemId))
        .sort((a, b) => a.pinnedAt.getTime() - b.pinnedAt.getTime() || a.slot - b.slot);
      candidates.slice(0, free.length).forEach((row, index) => added.push({ ...row, userId: P, slot: free[index] }));
    }
    if (added.length > 0) await tx.insert(showcasePin).values(added);
  },
};

/** 17. Події й запити; запит на подію, яку тепер веде P, — геть; той самий запит в обох — лишається P. */
const calendarRule: MergeRule = {
  keys: ['calendar_event.host_id', 'calendar_request.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const events = await tx.update(calendarEvent).set({ hostId: P }).where(eq(calendarEvent.hostId, S)).returning({ id: calendarEvent.id });
    await tx
      .delete(calendarRequest)
      .where(and(inArray(calendarRequest.userId, [P, S]), sql`exists (select 1 from "calendar_event" e where e.id = ${calendarRequest.eventId} and e.host_id = ${P})`));
    await tx
      .delete(calendarRequest)
      .where(and(eq(calendarRequest.userId, S), sql`exists (select 1 from "calendar_request" r where r.event_id = ${calendarRequest.eventId} and r.user_id = ${P})`));
    const requests = await tx.update(calendarRequest).set({ userId: P }).where(eq(calendarRequest.userId, S)).returning({ id: calendarRequest.eventId });
    summary.calendar += events.length + requests.length;
  },
};

/** 18. Виклики й спроби; спроба того самого виклику в обох — лишається раніша (рівно — P). */
const challengeRule: MergeRule = {
  keys: ['challenge.owner_id', 'challenge_attempt.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const challenges = await tx.update(challenge).set({ ownerId: P }).where(eq(challenge.ownerId, S)).returning({ id: challenge.id });
    await tx
      .delete(challengeAttempt)
      .where(
        and(
          eq(challengeAttempt.userId, P),
          sql`exists (select 1 from "challenge_attempt" a where a.challenge_id = ${challengeAttempt.challengeId} and a.user_id = ${S} and a.started_at < ${challengeAttempt.startedAt})`,
        ),
      );
    await tx
      .delete(challengeAttempt)
      .where(and(eq(challengeAttempt.userId, S), sql`exists (select 1 from "challenge_attempt" a where a.challenge_id = ${challengeAttempt.challengeId} and a.user_id = ${P})`));
    const attempts = await tx.update(challengeAttempt).set({ userId: P }).where(eq(challengeAttempt.userId, S)).returning({ id: challengeAttempt.gameId });
    summary.challenges += challenges.length + attempts.length;
  },
};

/**
 * 73. Категорії вікторин: однакова назва (без регістру) — вікторини S у категорію P, категорія S геть; решта — до P після
 * категорій P у своєму порядку (позиції без дірок). Межу 30 тут можна перевищити: нічого не губимо. updated_at вікторин не чіпаємо.
 */
const quizFolderRule: MergeRule = {
  keys: ['quiz_folder.owner_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.execute(sql`update "quiz" set folder_id = p.id from "quiz_folder" s join "quiz_folder" p on p.owner_id = ${P} and lower(p.name) = lower(s.name)
      where s.owner_id = ${S} and "quiz".folder_id = s.id`);
    await tx.execute(sql`delete from "quiz_folder" s where s.owner_id = ${S}
      and exists (select 1 from "quiz_folder" p where p.owner_id = ${P} and lower(p.name) = lower(s.name))`);
    await tx.execute(sql`update "quiz_folder" f set owner_id = ${P},
      position = (select coalesce(max(position), -1) from "quiz_folder" where owner_id = ${P}) + r.n
      from (select id, row_number() over (order by position, created_at, id) as n from "quiz_folder" where owner_id = ${S}) r
      where f.id = r.id`);
  },
};

/** 19. Просто перенести: конфліктів немає. */
const PLAIN_KEYS = [
  'quiz.owner_id',
  'game.host_id',
  'library_entry.owner_id',
  'library_copy.user_id',
  'push_subscription.user_id',
  'announcement.created_by',
  'bot_plan.created_by',
  'push_broadcast.created_by',
  'problem_report.user_id',
  'problem_report.resolved_by',
  'server_error.resolved_by',
  'admin_action.admin_id',
  'user_ban.banned_by',
  'merged_email.user_id',
] as const;

async function moveColumn(tx: Tx, key: string, from: string, to: string): Promise<number> {
  const [table, column] = key.split('.');
  // Обидва драйвери (pg і pglite) повертають rows.
  const result = (await tx.execute(sql`update ${sql.identifier(table)} set ${sql.identifier(column)} = ${to} where ${sql.identifier(column)} = ${from} returning 1`)) as { rows: unknown[] };
  return result.rows.length;
}

const plainRule: MergeRule = {
  keys: PLAIN_KEYS,
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    for (const key of PLAIN_KEYS) {
      const moved = await moveColumn(tx, key, S, P);
      if (key === 'quiz.owner_id') summary.quizzes += moved;
      if (key === 'game.host_id') summary.hosted += moved;
    }
  },
};

/** 70. «Вхідні»: розсилка, що вже є в P, — рядок P лишається (прочитана в будь-кому — прочитана), рядок S геть; решта — до P. */
const inboxRule: MergeRule = {
  keys: ['inbox_item.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.execute(sql`update "inbox_item" p set read_at = coalesce(p.read_at, s.read_at) from "inbox_item" s
      where p.user_id = ${P} and s.user_id = ${S} and p.broadcast_id = s.broadcast_id and p.broadcast_id is not null`);
    await tx
      .delete(inboxItem)
      .where(
        and(
          eq(inboxItem.userId, S),
          sql`${inboxItem.broadcastId} in (select i.broadcast_id from "inbox_item" i where i.user_id = ${P} and i.broadcast_id is not null)`,
        ),
      );
    await tx.update(inboxItem).set({ userId: P }).where(eq(inboxItem.userId, S));
  },
};

/** 71. Дні активності: рядки S вливаються в P з підсумовуванням (стелі дня — секунд і сесій — ті самі), далі геть. */
const activityDayRule: MergeRule = {
  keys: ['activity_day.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.execute(sql`insert into "activity_day" (user_id, day, editor_sec, editor_sessions)
      select ${P}, day, editor_sec, editor_sessions from "activity_day" where user_id = ${S}
      on conflict (user_id, day) do update set
        editor_sec = least(${EDITOR_DAY_MAX_SEC}, "activity_day".editor_sec + excluded.editor_sec),
        editor_sessions = least(${EDITOR_DAY_MAX_SESSIONS}, "activity_day".editor_sessions + excluded.editor_sessions)`);
    await tx.execute(sql`delete from "activity_day" where user_id = ${S}`);
  },
};

/** 20. Скарги: P на самого себе — геть; відкрита скарга, що повторила б відкриту скаргу P (чи на P), — рядок S геть. */
const reportRule: MergeRule = {
  keys: ['user_report.reporter_id', 'user_report.target_user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    await tx.delete(userReport).where(and(inArray(userReport.reporterId, [P, S]), inArray(userReport.targetUserId, [P, S])));
    await tx.delete(userReport).where(
      and(
        eq(userReport.reporterId, S),
        eq(userReport.status, 'open'),
        sql`exists (select 1 from "user_report" r where r.reporter_id = ${P} and r.status = 'open' and r.target_kind = ${userReport.targetKind}
          and ((r.target_kind = 'quiz' and r.entry_id = ${userReport.entryId}) or (r.target_kind = 'profile' and r.target_user_id = ${userReport.targetUserId})))`,
      ),
    );
    await tx.delete(userReport).where(
      and(
        eq(userReport.targetUserId, S),
        eq(userReport.status, 'open'),
        eq(userReport.targetKind, 'profile'),
        sql`exists (select 1 from "user_report" r where r.reporter_id = ${userReport.reporterId} and r.target_user_id = ${P} and r.status = 'open' and r.target_kind = 'profile')`,
      ),
    );
    await tx.update(userReport).set({ reporterId: P }).where(eq(userReport.reporterId, S));
    await tx.update(userReport).set({ targetUserId: P }).where(eq(userReport.targetUserId, S));
  },
};

/** 21. Бан будь-кого з двох — відмова до транзакції; тут лише перевірка (кидає — транзакція відкочується). */
const banRule: MergeRule = {
  keys: ['user_ban.user_id'],
  async run(tx, { primaryId: P, secondaryId: S }) {
    const banned = await tx.select({ userId: userBan.userId }).from(userBan).where(inArray(userBan.userId, [P, S])).limit(1);
    if (banned.length > 0) throw new Error('merge_banned');
  },
};

/** 22a. Сесії S — геть; сесії P не чіпаються. */
const sessionRule: MergeRule = {
  keys: ['session.user_id'],
  async run(tx, { secondaryId: S }) {
    await tx.delete(session).where(eq(session.userId, S));
  },
};

/** Спосіб входу рядка account (провайдер Better Auth). */
export const loginOf = (providerId: string): MergeLogin => (providerId === 'google' ? 'google' : providerId === 'credential' ? 'credential' : 'other');

/**
 * 22b. Способи входу. Google тощо — user_id = P (Better Auth шукає власника за (provider_id, account_id)); такий самий рядок у P — рядок S геть.
 * Пароль S: у P пароля немає — user_id = P і account_id = P (вхід паролем вимагає account_id = user.id); є — рядок S геть, passwordDropped.
 */
const accountRule: MergeRule = {
  keys: ['account.user_id'],
  async run(tx, { primaryId: P, secondaryId: S, summary }) {
    const theirs = await tx.select().from(account).where(eq(account.userId, S));
    const logins = new Set(summary.logins);
    for (const row of theirs) {
      if (row.providerId === 'credential') {
        const [own] = await tx.select({ id: account.id }).from(account).where(and(eq(account.userId, P), eq(account.providerId, 'credential'))).limit(1);
        if (own !== undefined) {
          await tx.delete(account).where(eq(account.id, row.id));
          summary.passwordDropped = true;
          continue;
        }
        await tx.update(account).set({ userId: P, accountId: P }).where(eq(account.id, row.id));
      } else {
        const [same] = await tx
          .select({ id: account.id })
          .from(account)
          .where(and(eq(account.userId, P), eq(account.providerId, row.providerId), eq(account.accountId, row.accountId)))
          .limit(1);
        if (same !== undefined) {
          await tx.delete(account).where(eq(account.id, row.id));
          continue;
        }
        await tx.update(account).set({ userId: P }).where(eq(account.id, row.id));
      }
      logins.add(loginOf(row.providerId));
    }
    summary.logins = MERGE_LOGINS.filter((login) => logins.has(login));
  },
};

/** Правила 9–22 плану по порядку: групи до запрошень, призи до вітрини. */
export const PEOPLE_RULES: readonly MergeRule[] = [
  followRule,
  groupMemberRule,
  groupInviteRule,
  groupItemRule,
  titleRule,
  blockRule,
  prizeRule,
  showcaseRule,
  calendarRule,
  challengeRule,
  quizFolderRule,
  plainRule,
  inboxRule,
  activityDayRule,
  reportRule,
  banRule,
  sessionRule,
  accountRule,
];
