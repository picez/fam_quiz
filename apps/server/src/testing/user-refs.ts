import { eq, or, sql } from 'drizzle-orm';
import type { Db } from '../db/client';
import {
  account, achievementBlock, activityDay, adminAction, announcement, botPlan, calendarEvent, calendarRequest, challenge, challengeAttempt,
  feedEvent, follow, game, gameEvent, groupInvite, groupItem, groupMember, inboxItem, leagueChampion, leaguePoint, libraryCopy, libraryEntry,
  liveRoom, mergedEmail, participant, prize, prizeAward, problemReport, profile, pushBroadcast, pushSubscription, quiz, quizFolder, savedGame,
  serverError, session, showcasePin, user, userAchievement, userBan, userLike, userReport, userTitle, verification, xpEntry,
} from '../db/schema';

/** Кожна таблиця з посиланням на user (58, 66): скільки рядків ще посилаються на userId. */
export async function referencing(db: Db, userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  const add = async (name: string, rows: Promise<unknown[]>) => {
    counts[name] = (await rows).length;
  };
  await add('user', db.select().from(user).where(eq(user.id, userId)));
  await add('session', db.select().from(session).where(eq(session.userId, userId)));
  await add('account', db.select().from(account).where(eq(account.userId, userId)));
  await add('verification', db.select().from(verification).where(eq(verification.value, userId)));
  await add('quiz', db.select().from(quiz).where(eq(quiz.ownerId, userId)));
  await add('quiz_folder', db.select().from(quizFolder).where(eq(quizFolder.ownerId, userId)));
  await add('game', db.select().from(game).where(eq(game.hostId, userId)));
  await add('participant', db.select().from(participant).where(eq(participant.userId, userId)));
  await add('game_event', db.select().from(gameEvent).where(eq(gameEvent.userId, userId)));
  await add('profile', db.select().from(profile).where(eq(profile.userId, userId)));
  await add('follow', db.select().from(follow).where(or(eq(follow.followerId, userId), eq(follow.followeeId, userId))));
  await add('user_achievement', db.select().from(userAchievement).where(eq(userAchievement.userId, userId)));
  await add('achievement_block', db.select().from(achievementBlock).where(eq(achievementBlock.userId, userId)));
  await add('prize', db.select().from(prize).where(eq(prize.ownerId, userId)));
  await add('prize_award', db.select().from(prizeAward).where(eq(prizeAward.userId, userId)));
  await add('user_title', db.select().from(userTitle).where(eq(userTitle.userId, userId)));
  await add('showcase_pin', db.select().from(showcasePin).where(eq(showcasePin.userId, userId)));
  await add('xp_entry', db.select().from(xpEntry).where(eq(xpEntry.userId, userId)));
  await add('user_like', db.select().from(userLike).where(or(eq(userLike.userId, userId), eq(userLike.targetUserId, userId))));
  await add('feed_event', db.select().from(feedEvent).where(eq(feedEvent.userId, userId)));
  await add('calendar_event', db.select().from(calendarEvent).where(eq(calendarEvent.hostId, userId)));
  await add('calendar_request', db.select().from(calendarRequest).where(eq(calendarRequest.userId, userId)));
  await add('merged_email', db.select().from(mergedEmail).where(eq(mergedEmail.userId, userId)));
  await add('activity_day', db.select().from(activityDay).where(eq(activityDay.userId, userId)));
  await add('inbox_item', db.select().from(inboxItem).where(eq(inboxItem.userId, userId)));
  await add('push_subscription', db.select().from(pushSubscription).where(eq(pushSubscription.userId, userId)));
  await add('user_ban', db.select().from(userBan).where(or(eq(userBan.userId, userId), eq(userBan.bannedBy, userId))));
  await add('admin_action.admin_id', db.select().from(adminAction).where(eq(adminAction.adminId, userId)));
  await add('group_member', db.select().from(groupMember).where(eq(groupMember.userId, userId)));
  await add('group_invite', db.select().from(groupInvite).where(or(eq(groupInvite.userId, userId), eq(groupInvite.invitedBy, userId))));
  await add('group_item', db.select().from(groupItem).where(eq(groupItem.authorId, userId)));
  await add('challenge', db.select().from(challenge).where(eq(challenge.ownerId, userId)));
  await add('challenge_attempt', db.select().from(challengeAttempt).where(eq(challengeAttempt.userId, userId)));
  await add('league_point', db.select().from(leaguePoint).where(eq(leaguePoint.userId, userId)));
  await add('league_champion', db.select().from(leagueChampion).where(eq(leagueChampion.userId, userId)));
  await add('library_entry', db.select().from(libraryEntry).where(eq(libraryEntry.ownerId, userId)));
  await add('library_copy', db.select().from(libraryCopy).where(eq(libraryCopy.userId, userId)));
  await add('user_report', db.select().from(userReport).where(or(eq(userReport.reporterId, userId), eq(userReport.targetUserId, userId))));
  await add('announcement', db.select().from(announcement).where(eq(announcement.createdBy, userId)));
  await add('bot_plan', db.select().from(botPlan).where(eq(botPlan.createdBy, userId)));
  await add('push_broadcast', db.select().from(pushBroadcast).where(eq(pushBroadcast.createdBy, userId)));
  await add('problem_report.user_id', db.select().from(problemReport).where(eq(problemReport.userId, userId)));
  await add('problem_report.resolved_by', db.select().from(problemReport).where(eq(problemReport.resolvedBy, userId)));
  await add('server_error.resolved_by', db.select().from(serverError).where(eq(serverError.resolvedBy, userId)));
  await add('push_broadcast.people', db.select().from(pushBroadcast).where(sql`${pushBroadcast.people} ? ${userId}::text`));
  await add('saved_game.data', db.select().from(savedGame).where(sql`${savedGame.data}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text))`));
  await add('live_room.data', db.select().from(liveRoom).where(sql`${liveRoom.data}->'playerUsers' @> jsonb_build_array(jsonb_build_array(${userId}::text)) or ${liveRoom.data}->>'hostUserId' = ${userId}`));
  return counts;
}
