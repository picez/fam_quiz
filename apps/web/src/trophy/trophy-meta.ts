import type { PrizeContent, PrizePlace, PrizeShown, PrizesView, TrophyKind, TrophyLook, TrophyMaterial } from '@quiz/shared';
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
  lovingcup: '🏆',
  vase: '🏺',
  plate: '🏆',
  goblet: '🥂',
  starmedal: '🏅',
  cross: '🏅',
  octagon: '🏅',
  ribbon: '🎗️',
  diadem: '👑',
  laurel: '🌿',
  olive: '🫒',
  figure: '🏆',
  flame: '🔥',
  wings: '🕊️',
  fist: '✊',
};

/** Групи форм у редакторі: кожна форма рівно в одній. */
export const TROPHY_GROUPS: readonly { id: 'cups' | 'medals' | 'crowns' | 'statuettes'; kinds: readonly TrophyKind[] }[] = [
  { id: 'cups', kinds: ['cup', 'grail', 'lovingcup', 'vase', 'plate', 'goblet'] },
  { id: 'medals', kinds: ['medal', 'starmedal', 'cross', 'octagon', 'ribbon'] },
  { id: 'crowns', kinds: ['crown', 'diadem', 'laurel', 'olive'] },
  { id: 'statuettes', kinds: ['star', 'statuette', 'figure', 'flame', 'wings', 'fist'] },
];

/** Групи матеріалів у редакторі. */
export const MATERIAL_GROUPS: readonly { id: 'metals' | 'stones' | 'other'; materials: readonly TrophyMaterial[] }[] = [
  { id: 'metals', materials: ['bronze', 'silver', 'gold', 'rosegold', 'platinum', 'copper'] },
  { id: 'stones', materials: ['diamond', 'ruby', 'sapphire', 'jade', 'obsidian', 'pearl', 'marble'] },
  { id: 'other', materials: ['neon', 'wood'] },
];

/** Вигляд матеріалу: колір, металевість і шорсткість для рушія трофеїв, колір — і для значка та рамки диплома; решта — для особливих матеріалів. */
export interface MaterialLook {
  color: string;
  metallic: number;
  roughness: number;
  emissive?: string;
  emissiveIntensity?: number;
  iridescence?: number;
  pattern?: { kind: 'marble' | 'wood'; color: string };
}

export const MATERIAL_LOOK: Record<TrophyMaterial, MaterialLook> = {
  bronze: { color: '#B0703A', metallic: 1, roughness: 0.35 },
  silver: { color: '#C9CED6', metallic: 1, roughness: 0.25 },
  gold: { color: '#E8B84A', metallic: 1, roughness: 0.2 },
  diamond: { color: '#CFEFFF', metallic: 0, roughness: 0.02 },
  rosegold: { color: '#E0A48C', metallic: 1, roughness: 0.22 },
  platinum: { color: '#E5E4E2', metallic: 1, roughness: 0.15 },
  copper: { color: '#C46A3C', metallic: 1, roughness: 0.3 },
  obsidian: { color: '#1E1A24', metallic: 0.1, roughness: 0.08 },
  jade: { color: '#3E9E6E', metallic: 0, roughness: 0.25 },
  pearl: { color: '#F2EBE0', metallic: 0.1, roughness: 0.3, iridescence: 1 },
  ruby: { color: '#B0122E', metallic: 0, roughness: 0.05 },
  sapphire: { color: '#1F4FB8', metallic: 0, roughness: 0.05 },
  neon: { color: '#FF2E63', metallic: 0, roughness: 0.4, emissive: '#FF2E63', emissiveIntensity: 1.4 },
  marble: { color: '#EDEAE4', metallic: 0, roughness: 0.35, pattern: { kind: 'marble', color: '#8C8A86' } },
  wood: { color: '#8A5A33', metallic: 0, roughness: 0.65, pattern: { kind: 'wood', color: '#5E3A1E' } },
};

export type { TrophyLook } from '@quiz/shared';

/** Тимчасово (до задачі 12): грааль без decor — запечений сімейний. */
export function modelUrl(trophy: TrophyLook): string {
  if (trophy.kind === 'grail' && trophy.decor == null) return '/models/grail-family.glb';
  return `/models/${trophy.kind}.glb`;
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
