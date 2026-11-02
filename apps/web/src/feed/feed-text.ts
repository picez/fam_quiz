import type { FeedData } from '@quiz/shared';
import { ACHIEVEMENT_ICONS } from '../achievement-meta';
import { viewerZone, dayHeading, timeText } from '../calendar/calendar-time';
import { countText, t, type TextKey } from '../i18n';

function joinParts(parts: string[]): string {
  if (parts.length < 2) return parts.join('');
  return `${parts.slice(0, -1).join(', ')}${t('feedAnd')}${parts[parts.length - 1]}`;
}

/** Текст картки без ніку (нік — посиланням перед ним): «зіграв(-ла) «Писанки» — 2 місце з 5». */
export function feedText(data: FeedData, zone: string = viewerZone()): string {
  switch (data.kind) {
    case 'game': {
      const team = data.team === null ? '' : t('feedTeam', { team: data.team });
      if (data.place === null) return t('feedGameNoPlace', { title: data.title }) + team;
      if (data.place === 1) return t('feedWin', { title: data.title }) + team;
      return t('feedGame', { title: data.title, place: data.place, of: data.of }) + team;
    }
    case 'achievement':
      return t('feedAchievement', { name: t(`achievement_${data.achievementId}` as TextKey) });
    case 'level':
      return t('feedLevel', { level: data.level });
    case 'prize':
      return (
        t('feedPrize', { name: data.name, place: data.place, title: data.title }) +
        (data.nickTitle === null ? '' : t('feedPrizeTitle', { nickTitle: data.nickTitle }))
      );
    case 'planned':
      return t('feedPlanned', { title: data.title, when: `${dayHeading(data.startsAt, zone)}, ${timeText(data.startsAt, zone)}` });
    case 'like': {
      const parts: string[] = [];
      if (data.questions > 0) parts.push(countText('feedLikeQuestions', data.questions, { count: data.questions }));
      if (data.quiz) parts.push(t('feedLikeQuiz'));
      if (data.host) parts.push(t('feedLikeHost'));
      if (data.player) parts.push(t('feedLikePlayer'));
      return t('feedLike', { what: joinParts(parts) }) + (data.title === null ? '' : t('feedLikeIn', { title: data.title }));
    }
  }
}

/** Іконка картки: game — 🎲, перемога — 🏆, achievement — ACHIEVEMENT_ICONS[id], level — ⭐, prize — 🎁, like — ❤️. */
export function feedIcon(data: FeedData): string {
  switch (data.kind) {
    case 'game':
      return data.place === 1 ? '🏆' : '🎲';
    case 'achievement':
      return ACHIEVEMENT_ICONS[data.achievementId];
    case 'level':
      return '⭐';
    case 'prize':
      return '🎁';
    case 'like':
      return '❤️';
    case 'planned':
      return '📅';
  }
}
