import type { PrizeContent, PrizePlace, PrizeShown, PrizesView, TrophyKind, TrophyMaterial } from '@quiz/shared';
import { t, type TextKey } from '../i18n';
import { trophyGender, trophyPhrase } from '../locales/grammar';

/** Значок трофея: запасний вигляд без WebGL, «Граємо за», диплом. */
export const TROPHY_EMOJI: Record<TrophyKind, string> = {
  cup: '🏆',
  medal: '🏅',
  crown: '👑',
  star: '🌟',
  statuette: '🎖️',
  grail: '🍷',
};

/** Вигляд матеріалу: колір, металевість і шорсткість для model-viewer, колір — і для значка та рамки диплома. */
export const MATERIAL_LOOK: Record<TrophyMaterial, { color: string; metallic: number; roughness: number }> = {
  bronze: { color: '#B0703A', metallic: 1, roughness: 0.35 },
  silver: { color: '#C9CED6', metallic: 1, roughness: 0.25 },
  gold: { color: '#E8B84A', metallic: 1, roughness: 0.2 },
  diamond: { color: '#CFEFFF', metallic: 0, roughness: 0.02 },
};

export interface TrophyLook {
  kind: TrophyKind;
  material: TrophyMaterial;
}

/** «Золотий кубок», «Срібна медаль», … (es «Copa de oro»). */
export function trophyLabel(trophy: TrophyLook): string {
  const adjective = t(`material_${trophy.material}_${trophyGender(trophy.kind)}` as TextKey);
  return trophyPhrase(adjective, t(`trophy_${trophy.kind}` as TextKey));
}

/** Рядок «Граємо за»: трофей, справжній приз, титул, диплом; гравіювання — лише коли більше нічого немає. */
export function prizeSummary(content: Omit<PrizeContent, 'name'>): string {
  const parts: string[] = [];
  if (content.trophy) parts.push(`${TROPHY_EMOJI[content.trophy.kind]} ${trophyLabel(content.trophy)}`);
  if (content.real) parts.push(t('prizeSummaryReal', { text: content.real.text }));
  if (content.title) parts.push(t('prizeSummaryTitle', { title: content.title }));
  if (content.diploma) parts.push(t('prizeSummaryDiploma'));
  if (parts.length === 0 && content.engraving) parts.push(t('prizeSummaryEngraving', { text: content.engraving }));
  return parts.join(' · ');
}

/** Місця церемонії: лише з переможцем, у порядку показу 3 → 2 → 1; порожньо — церемонії немає. */
export function ceremonyOrder(prizes: PrizesView | undefined): (PrizeShown & { winner: NonNullable<PrizeShown['winner']> })[] {
  if (prizes === undefined) return [];
  return prizes.places
    .filter((shown): shown is PrizeShown & { winner: NonNullable<PrizeShown['winner']> } => shown.winner !== null)
    .sort((a, b) => b.place - a.place);
}

/** Титул зі значком: 👑 попереду, лише якщо титул сам не починається з емодзі («👑 Король» не стане «👑 👑 Король»). */
export function titleBadge(text: string): string {
  return /^\p{Extended_Pictographic}/u.test(text) ? text : `👑 ${text}`;
}

/** Порядок стовпців подіуму зліва направо: 2 — 1 — 3, лише місця, що є в черзі церемонії. */
export function podiumColumns(order: readonly { place: PrizePlace }[]): PrizePlace[] {
  return ([2, 1, 3] as const).filter((place) => order.some((item) => item.place === place));
}
