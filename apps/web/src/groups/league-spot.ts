import type { GroupCard } from '@quiz/shared';
import { t } from '../i18n';

/** 79: «Ліга: місце 2 · бали місяця: 17» або «Ліга: цього місяця ще без балів» (GroupCard.league). */
export function leagueSpotText(spot: NonNullable<GroupCard['league']>): string {
  return spot.place === null ? t('groupLeagueNoPoints') : t('groupLeagueSpot', { place: spot.place, points: spot.points });
}
